"""Calendar platform for Hades Household Integration."""
from __future__ import annotations

import logging
from datetime import datetime, date, timedelta
from typing import Any

from homeassistant.components.calendar import CalendarEntity, CalendarEvent
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    DOMAIN,
    CONF_CALENDARS,
    COORDINATOR_CALENDARS,
)

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Hades calendar entities."""
    coordinators = hass.data[DOMAIN][entry.entry_id]
    calendar_coord = coordinators[COORDINATOR_CALENDARS]

    calendars = entry.options.get(CONF_CALENDARS, entry.data.get(CONF_CALENDARS, []))

    entities = []
    for cal in calendars:
        entities.append(HadesCalendarEntity(calendar_coord, cal))

    async_add_entities(entities, True)


class HadesCalendarEntity(CoordinatorEntity, CalendarEntity):
    """A calendar entity for a single Hades calendar source."""

    def __init__(self, coordinator, cal_config: dict) -> None:
        super().__init__(coordinator)
        self._cal_config = cal_config
        self._name = cal_config.get("name", "Calendar")
        self._color = cal_config.get("color", "#3B82F6")
        slug = self._name.lower().replace(" ", "_")
        self._attr_unique_id = f"hades_household_calendar_{slug}"
        self._attr_name = f"Hades {self._name} Calendar"

    @property
    def device_info(self):
        return {
            "identifiers": {(DOMAIN, "hades_household")},
            "name": "Hades Household",
            "manufacturer": "Hades",
            "model": "Household Integration",
        }

    @property
    def event(self) -> CalendarEvent | None:
        """Return the next upcoming event today."""
        events = self._get_events()
        if not events:
            return None
        return events[0]

    def _get_events(self) -> list[CalendarEvent]:
        """Get today's events from coordinator data."""
        data = self.coordinator.data or {}
        cal_data = data.get(self._name, {})
        raw_events = cal_data.get("events", [])
        events = []
        today = date.today()

        for e in raw_events:
            try:
                if e.get("all_day"):
                    start = datetime.combine(today, datetime.min.time())
                    end   = datetime.combine(today, datetime.max.time().replace(microsecond=0))
                else:
                    start_str = e.get("start", "")
                    end_str   = e.get("end", "")
                    start = datetime.strptime(
                        f"{today} {start_str}", "%Y-%m-%d %I:%M %p"
                    ) if start_str else datetime.combine(today, datetime.min.time())
                    end = datetime.strptime(
                        f"{today} {end_str}", "%Y-%m-%d %I:%M %p"
                    ) if end_str else start + timedelta(hours=1)

                events.append(CalendarEvent(
                    start=start,
                    end=end,
                    summary=e.get("title", "Untitled"),
                    location=e.get("location", ""),
                ))
            except Exception as err:
                _LOGGER.debug("Skipping event in calendar entity: %s", err)

        return events

    async def async_get_events(
        self,
        hass: HomeAssistant,
        start_date: datetime,
        end_date: datetime,
    ) -> list[CalendarEvent]:
        """Return today's events (coordinator only has today)."""
        return self._get_events()

    @property
    def extra_state_attributes(self) -> dict:
        data = self.coordinator.data or {}
        cal_data = data.get(self._name, {})
        return {
            "color":        self._color,
            "calendar_name": self._name,
            "events":       cal_data.get("events", []),
            "event_count":  cal_data.get("event_count", 0),
        }
