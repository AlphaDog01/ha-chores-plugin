"""Hades Chores custom integration for Home Assistant."""
from __future__ import annotations

import logging
from datetime import timedelta

import aiohttp

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import (
    DOMAIN,
    CONF_HOST,
    CONF_API_KEY,
    CONF_SCAN_INTERVAL,
    DEFAULT_SCAN_INTERVAL,
)

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[Platform] = [Platform.SENSOR]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Hades Chores from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    coordinator = HadesChoresCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()

    hass.data[DOMAIN][entry.entry_id] = coordinator

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
    """Reload the config entry when options change."""
    await hass.config_entries.async_reload(entry.entry_id)


class HadesChoresCoordinator(DataUpdateCoordinator):
    """Coordinator to fetch all Hades data in one poll."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.entry = entry
        self.host = entry.data[CONF_HOST].rstrip("/")
        self.api_key = entry.data.get(CONF_KEY := CONF_API_KEY, "")
        interval = entry.options.get(
            CONF_SCAN_INTERVAL,
            entry.data.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL),
        )

        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=interval),
        )

    def _headers(self) -> dict:
        headers = {}
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        return headers

    async def _fetch(self, session: aiohttp.ClientSession, path: str):
        url = f"{self.host}{path}"
        async with session.get(url, headers=self._headers(), timeout=aiohttp.ClientTimeout(total=10)) as resp:
            resp.raise_for_status()
            data = await resp.json()
return data.get("data", data) if isinstance(data, dict) else data

    async def _async_update_data(self) -> dict:
        """Fetch all data from Hades API."""
        session = async_get_clientsession(self.hass)
        try:
            people = await self._fetch(session, "/api/people")
            today = await self._fetch(session, "/api/instances/today")
            leaderboard = await self._fetch(session, "/api/dashboard/leaderboard")

            upcoming = []
            try:
                upcoming = await self._fetch(session, "/api/instances/upcoming?days=7")
            except Exception:
                pass  # optional endpoint

            # Build per-person today chore lists
            today_by_person: dict[int, list] = {}
            for instance in today:
                pid = instance.get("person_id")
                if pid not in today_by_person:
                    today_by_person[pid] = []
                today_by_person[pid].append(instance)

            # Build per-person upcoming lists
            upcoming_by_person: dict[int, list] = {}
            for instance in upcoming:
                pid = instance.get("person_id")
                if pid not in upcoming_by_person:
                    upcoming_by_person[pid] = []
                upcoming_by_person[pid].append(instance)

            # Completion rates per person
            completion_rates: dict[int, float] = {}
            for person in people:
                pid = person["id"]
                person_today = today_by_person.get(pid, [])
                if person_today:
                    done = sum(1 for c in person_today if c.get("status") == "completed")
                    completion_rates[pid] = round((done / len(person_today)) * 100, 1)
                else:
                    completion_rates[pid] = 0.0

            return {
                "people": people,
                "today": today,
                "today_by_person": today_by_person,
                "leaderboard": leaderboard,
                "upcoming_by_person": upcoming_by_person,
                "completion_rates": completion_rates,
            }

        except aiohttp.ClientConnectorError as err:
            raise UpdateFailed(f"Cannot connect to Hades API: {err}") from err
        except aiohttp.ClientResponseError as err:
            raise UpdateFailed(f"Hades API error {err.status}: {err.message}") from err
        except Exception as err:
            raise UpdateFailed(f"Unexpected error: {err}") from err
