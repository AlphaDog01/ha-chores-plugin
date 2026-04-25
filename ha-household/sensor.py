"""Sensors for Hades Household Integration."""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    DOMAIN,
    CONF_TRACKED_PEOPLE,
    CONF_CALENDARS,
    COORDINATOR_CHORES,
    COORDINATOR_CALENDARS,
)

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up all Hades Household sensors."""
    coordinators = hass.data[DOMAIN][entry.entry_id]
    chores_coord = coordinators[COORDINATOR_CHORES]
    calendar_coord = coordinators[COORDINATOR_CALENDARS]

    entities: list[SensorEntity] = []

    # ── Chores sensors ────────────────────────────────────────────────────────
    tracked_people = entry.data.get(CONF_TRACKED_PEOPLE, [])
    chores_data = chores_coord.data or {}

    for person_id in tracked_people:
        pid = str(person_id)
        # Get display name from coordinator data (populated from /api/people)
        display_name = chores_data.get(pid, {}).get("name", pid).title()
        entities.append(HadesChoresTodaySensor(chores_coord, pid, display_name))
        entities.append(HadesCompletionRateSensor(chores_coord, pid, display_name))

    entities.append(HadesLeaderboardSensor(chores_coord))
    entities.append(HadesTodaySummarySensor(chores_coord))

    # ── Calendar sensors ──────────────────────────────────────────────────────
    calendars = entry.options.get(CONF_CALENDARS, entry.data.get(CONF_CALENDARS, []))
    for cal in calendars:
        entities.append(HadesCalendarTodaySensor(calendar_coord, cal["name"]))

    async_add_entities(entities, True)


# ── Base ──────────────────────────────────────────────────────────────────────

class HadesBaseSensor(CoordinatorEntity, SensorEntity):
    """Base class for Hades sensors."""

    def __init__(self, coordinator, unique_suffix: str, name: str) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"hades_household_{unique_suffix}"
        self._attr_name = name
        self._attr_has_entity_name = False

    @property
    def device_info(self):
        return {
            "identifiers": {(DOMAIN, "hades_household")},
            "name": "Hades Household",
            "manufacturer": "Hades",
            "model": "Household Integration",
        }


# ── Chores Sensors ────────────────────────────────────────────────────────────

class HadesChoresTodaySensor(HadesBaseSensor):
    """Sensor for a person's chores today — state is # pending."""

    def __init__(self, coordinator, person_id: str, display_name: str) -> None:
        slug = display_name.lower().replace(" ", "_")
        super().__init__(coordinator, f"{slug}_chores_today", f"Hades {display_name} Chores Today")
        self._person_id = person_id

    @property
    def state(self) -> int:
        data = self.coordinator.data or {}
        person_data = data.get(self._person_id, {})
        return len(person_data.get("pending", []))

    @property
    def extra_state_attributes(self) -> dict:
        data = self.coordinator.data or {}
        person_data = data.get(self._person_id, {})
        return {
            "pending": person_data.get("pending", []),
            "completed": person_data.get("completed", []),
            "skipped": person_data.get("skipped", []),
            "total_chores": (
                len(person_data.get("pending", [])) +
                len(person_data.get("completed", [])) +
                len(person_data.get("skipped", []))
            ),
        }

    @property
    def icon(self) -> str:
        return "mdi:checkbox-marked-circle-outline"


class HadesCompletionRateSensor(HadesBaseSensor):
    """Sensor for a person's completion rate — state is 0-100."""

    def __init__(self, coordinator, person_id: str, display_name: str) -> None:
        slug = display_name.lower().replace(" ", "_")
        super().__init__(coordinator, f"{slug}_completion_rate", f"Hades {display_name} Completion Rate")
        self._person_id = person_id

    @property
    def state(self) -> float:
        data = self.coordinator.data or {}
        person_data = data.get(self._person_id, {})
        completed = len(person_data.get("completed", []))
        total = completed + len(person_data.get("pending", [])) + len(person_data.get("skipped", []))
        if total == 0:
            return 0
        return round((completed / total) * 100, 1)

    @property
    def extra_state_attributes(self) -> dict:
        data = self.coordinator.data or {}
        person_data = data.get(self._person_id, {})
        return {
            "points_total": person_data.get("points_total", 0),
        }

    @property
    def unit_of_measurement(self) -> str:
        return "%"

    @property
    def icon(self) -> str:
        return "mdi:percent"


class HadesLeaderboardSensor(HadesBaseSensor):
    """Leaderboard sensor — state is the leader's name."""

    def __init__(self, coordinator) -> None:
        super().__init__(coordinator, "points_leaderboard", "Hades Points Leaderboard")

    def _rankings(self) -> list:
        data = self.coordinator.data or {}
        lb = data.get("leaderboard", [])
        # Handle both array response and {rankings:[]} shape
        if isinstance(lb, list):
            return lb
        if isinstance(lb, dict):
            return lb.get("rankings", [])
        return []

    @property
    def state(self) -> str:
        rankings = self._rankings()
        if rankings:
            # API returns people objects with name/display_name/points_total
            first = rankings[0]
            return first.get("display_name") or first.get("name", "Unknown")
        return "Unknown"

    @property
    def extra_state_attributes(self) -> dict:
        rankings = self._rankings()
        # Normalize to {rank, name, points} shape for dashboard card
        normalized = []
        for i, p in enumerate(rankings):
            normalized.append({
                "rank": i + 1,
                "name": p.get("display_name") or p.get("name", ""),
                "points": p.get("points_total", 0),
            })
        return {"rankings": normalized}

    @property
    def icon(self) -> str:
        return "mdi:trophy"


class HadesTodaySummarySensor(HadesBaseSensor):
    """Summary sensor — state is total pending across all people."""

    def __init__(self, coordinator) -> None:
        super().__init__(coordinator, "today_summary", "Hades Today Summary")

    @property
    def state(self) -> int:
        data = self.coordinator.data or {}
        summary = data.get("summary", {})
        return summary.get("pending", 0)

    @property
    def extra_state_attributes(self) -> dict:
        data = self.coordinator.data or {}
        summary = data.get("summary", {})
        return {
            "total": summary.get("total", 0),
            "completed": summary.get("completed", 0),
            "pending": summary.get("pending", 0),
            "skipped": summary.get("skipped", 0),
            "completion_percent": summary.get("completion_percent", 0),
            "all_done": summary.get("all_done", False),
        }

    @property
    def icon(self) -> str:
        return "mdi:clipboard-list"


# ── Calendar Sensors ──────────────────────────────────────────────────────────

class HadesCalendarTodaySensor(HadesBaseSensor):
    """Sensor for a calendar's today events — state is event count."""

    def __init__(self, coordinator, calendar_name: str) -> None:
        slug = calendar_name.lower().replace(" ", "_")
        super().__init__(
            coordinator,
            f"calendar_{slug}_today",
            f"Hades Calendar {calendar_name} Today",
        )
        self._calendar_name = calendar_name

    @property
    def state(self) -> int:
        data = self.coordinator.data or {}
        cal_data = data.get(self._calendar_name, {})
        return cal_data.get("event_count", 0)

    @property
    def extra_state_attributes(self) -> dict:
        data = self.coordinator.data or {}
        cal_data = data.get(self._calendar_name, {})
        attrs = {
            "events":        cal_data.get("events", []),
            "event_count":   cal_data.get("event_count", 0),
            "calendar_name": self._calendar_name,
            "color":         cal_data.get("color", "#3B82F6"),
        }
        if "error" in cal_data:
            attrs["error"] = cal_data["error"]
        return attrs

    @property
    def icon(self) -> str:
        return "mdi:calendar-today"
