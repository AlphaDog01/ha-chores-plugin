"""Hades Household Integration."""
from __future__ import annotations

import logging
from datetime import timedelta, datetime, date, timezone
from typing import Any

import aiohttp
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import (
    DOMAIN,
    CONF_CHORES_HOST,
    CONF_CHORES_API_KEY,
    CONF_TRACKED_PEOPLE,
    CONF_CALENDARS,
    CHORES_UPDATE_INTERVAL,
    CALENDAR_UPDATE_INTERVAL,
    COORDINATOR_CHORES,
    COORDINATOR_CALENDARS,
)

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor"]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Hades Household from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    # ── Chores coordinator ────────────────────────────────────────────────────
    chores_coordinator = HadesChoresCoordinator(hass, entry)
    await chores_coordinator.async_config_entry_first_refresh()

    # ── Calendar coordinator ──────────────────────────────────────────────────
    calendar_coordinator = HadesCalendarCoordinator(hass, entry)
    await calendar_coordinator.async_config_entry_first_refresh()

    hass.data[DOMAIN][entry.entry_id] = {
        COORDINATOR_CHORES: chores_coordinator,
        COORDINATOR_CALENDARS: calendar_coordinator,
    }

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    entry.async_on_unload(entry.add_update_listener(async_reload_entry))

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
    return unload_ok


async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload entry when options change."""
    await hass.config_entries.async_reload(entry.entry_id)


# ── Chores Coordinator ────────────────────────────────────────────────────────

class HadesChoresCoordinator(DataUpdateCoordinator):
    """Coordinator for Hades Chores API."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.host = entry.data[CONF_CHORES_HOST].rstrip("/")
        self.api_key = entry.data.get(CONF_CHORES_API_KEY, "")
        self.tracked_people = entry.data.get(CONF_TRACKED_PEOPLE, [])
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN}_chores",
            update_interval=timedelta(minutes=CHORES_UPDATE_INTERVAL),
        )

    async def _fetch(self, path: str) -> Any:
        """Fetch from Hades API and unwrap {success, data} envelope."""
        url = f"{self.host}{path}"
        headers = {}
        if self.api_key:
            headers["x-api-key"] = self.api_key
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                resp.raise_for_status()
                json_data = await resp.json()
                if isinstance(json_data, dict) and "data" in json_data:
                    return json_data["data"]
                return json_data

    async def _async_update_data(self) -> dict:
        """Fetch all chores data from real API routes."""
        try:
            # GET /api/instances/today — all of today's instances for everyone
            all_instances = await self._fetch("/api/instances/today")

            # GET /api/dashboard/leaderboard — points leaderboard
            leaderboard = await self._fetch("/api/dashboard/leaderboard")

            # GET /api/people — all people with points_total
            all_people = await self._fetch("/api/people")

            data: dict = {}

            # Build a points lookup from /api/people
            points_lookup: dict = {}
            if isinstance(all_people, list):
                for p in all_people:
                    points_lookup[p["name"].lower()] = p.get("points_total", 0)

            # Slice instances per tracked person
            for person in self.tracked_people:
                slug = person.lower()
                completed = []
                pending = []
                skipped = []

                if isinstance(all_instances, list):
                    for inst in all_instances:
                        if inst.get("person_name", "").lower() != slug:
                            continue
                        obj = {
                            "id": inst.get("id"),
                            "name": inst.get("chore_name", ""),
                            "points": inst.get("points", 0),
                            "completed_at": inst.get("completed_at"),
                        }
                        status = inst.get("status", "pending")
                        if status == "completed":
                            completed.append(obj)
                        elif status == "skipped":
                            skipped.append(obj)
                        else:
                            pending.append(obj)

                data[slug] = {
                    "completed": completed,
                    "pending": pending,
                    "skipped": skipped,
                    "points_total": points_lookup.get(slug, 0),
                }

            # Summary — computed from all instances
            if isinstance(all_instances, list):
                total     = len(all_instances)
                completed = sum(1 for i in all_instances if i.get("status") == "completed")
                skipped   = sum(1 for i in all_instances if i.get("status") == "skipped")
                pending   = total - completed - skipped
                pct       = round((completed / total) * 100) if total > 0 else 0
                data["summary"] = {
                    "total": total,
                    "completed": completed,
                    "pending": pending,
                    "skipped": skipped,
                    "completion_percent": pct,
                    "all_done": pending == 0 and total > 0,
                }
            else:
                data["summary"] = {
                    "total": 0, "completed": 0, "pending": 0,
                    "skipped": 0, "completion_percent": 0, "all_done": False,
                }

            data["leaderboard"] = leaderboard

            return data
        except aiohttp.ClientError as err:
            raise UpdateFailed(f"Chores API error: {err}") from err


# ── Calendar Coordinator ──────────────────────────────────────────────────────

class HadesCalendarCoordinator(DataUpdateCoordinator):
    """Coordinator for iCal calendar feeds."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.calendars: list[dict] = entry.options.get(
            CONF_CALENDARS, entry.data.get(CONF_CALENDARS, [])
        )
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN}_calendars",
            update_interval=timedelta(minutes=CALENDAR_UPDATE_INTERVAL),
        )

    async def _fetch_ical(self, url: str) -> bytes:
        """Fetch raw iCal data from URL."""
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                resp.raise_for_status()
                return await resp.read()

    def _parse_today_events(self, ical_bytes: bytes) -> list[dict]:
        """Parse iCal bytes and return today's events only."""
        try:
            from icalendar import Calendar
        except ImportError:
            _LOGGER.error("icalendar library not available")
            return []

        today = date.today()
        events = []

        try:
            cal = Calendar.from_ical(ical_bytes)
        except Exception as err:
            _LOGGER.error("Failed to parse iCal data: %s", err)
            return []

        for component in cal.walk():
            if component.name != "VEVENT":
                continue

            try:
                dtstart = component.get("DTSTART")
                dtend = component.get("DTEND")
                summary = str(component.get("SUMMARY", "Untitled"))
                location = str(component.get("LOCATION", ""))

                if dtstart is None:
                    continue

                start_val = dtstart.dt
                end_val = dtend.dt if dtend else None

                # Handle all-day events (date) vs timed events (datetime)
                if isinstance(start_val, datetime):
                    # Convert to local date for comparison
                    if start_val.tzinfo is not None:
                        start_date = start_val.astimezone().date()
                    else:
                        start_date = start_val.date()
                    all_day = False
                    start_str = start_val.strftime("%I:%M %p").lstrip("0")
                    end_str = ""
                    if isinstance(end_val, datetime):
                        if end_val.tzinfo is not None:
                            end_val = end_val.astimezone()
                        end_str = end_val.strftime("%I:%M %p").lstrip("0")
                elif isinstance(start_val, date):
                    start_date = start_val
                    all_day = True
                    start_str = "All Day"
                    end_str = ""
                else:
                    continue

                if start_date != today:
                    continue

                event = {
                    "title": summary,
                    "start": start_str,
                    "end": end_str,
                    "all_day": all_day,
                    "location": location,
                }
                events.append(event)

            except Exception as err:
                _LOGGER.debug("Skipping event due to parse error: %s", err)
                continue

        # Sort by all-day last, then by start time
        events.sort(key=lambda e: (not e["all_day"], e["start"]))
        return events

    async def _async_update_data(self) -> dict:
        """Fetch and parse all calendars."""
        result: dict = {}
        for cal in self.calendars:
            name = cal.get("name", "unknown")
            url = cal.get("url", "")
            try:
                raw = await self._fetch_ical(url)
                events = await self.hass.async_add_executor_job(
                    self._parse_today_events, raw
                )
                result[name] = {
                    "events": events,
                    "event_count": len(events),
                    "url": url,
                }
            except Exception as err:
                _LOGGER.warning("Failed to fetch calendar '%s': %s", name, err)
                result[name] = {
                    "events": [],
                    "event_count": 0,
                    "url": url,
                    "error": str(err),
                }
        return result
