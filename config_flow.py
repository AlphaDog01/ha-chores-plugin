"""Config flow for Hades Household Integration."""
from __future__ import annotations

import logging
from typing import Any

import aiohttp
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult

from .const import (
    DOMAIN,
    CONF_CHORES_HOST,
    CONF_CHORES_API_KEY,
    CONF_TRACKED_PEOPLE,
    CONF_CALENDARS,
    CONF_CALENDAR_NAME,
    CONF_CALENDAR_URL,
    CHORES_PEOPLE,
)

_LOGGER = logging.getLogger(__name__)


class HadesHouseholdConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle the config flow for Hades Household Integration."""

    VERSION = 1

    def __init__(self) -> None:
        self._data: dict[str, Any] = {}

    async def async_step_user(self, user_input: dict | None = None) -> FlowResult:
        """Step 1 — Chores API connection."""
        if self._async_current_entries():
            return self.async_abort(reason="already_configured")

        errors: dict = {}

        if user_input is not None:
            host = user_input[CONF_CHORES_HOST].rstrip("/")
            api_key = user_input.get(CONF_CHORES_API_KEY, "")
            ok = await self._test_chores_connection(host, api_key)
            if ok:
                self._data[CONF_CHORES_HOST] = host
                self._data[CONF_CHORES_API_KEY] = api_key
                return await self.async_step_people()
            else:
                errors["base"] = "cannot_connect"

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({
                vol.Required(CONF_CHORES_HOST, default="http://10.72.16.21:33911"): str,
                vol.Optional(CONF_CHORES_API_KEY, default=""): str,
            }),
            errors=errors,
        )

    async def async_step_people(self, user_input: dict | None = None) -> FlowResult:
        """Step 2 — Select tracked people."""
        if user_input is not None:
            self._data[CONF_TRACKED_PEOPLE] = user_input[CONF_TRACKED_PEOPLE]
            return await self.async_step_calendars()

        return self.async_show_form(
            step_id="people",
            data_schema=vol.Schema({
                vol.Required(CONF_TRACKED_PEOPLE, default=CHORES_PEOPLE): vol.In(
                    {p: p for p in CHORES_PEOPLE}
                ),
            }),
        )

    async def async_step_calendars(self, user_input: dict | None = None) -> FlowResult:
        """Step 3 — Optionally add a first calendar."""
        errors: dict = {}

        if user_input is not None:
            name = user_input.get(CONF_CALENDAR_NAME, "").strip()
            url = user_input.get(CONF_CALENDAR_URL, "").strip()

            if name and url:
                ok = await self._test_calendar_url(url)
                if not ok:
                    errors["base"] = "invalid_url"
                else:
                    self._data[CONF_CALENDARS] = [{"name": name, "url": url}]
                    return self._create_entry()
            else:
                # Skip — no calendar added yet
                self._data[CONF_CALENDARS] = []
                return self._create_entry()

        return self.async_show_form(
            step_id="calendars",
            data_schema=vol.Schema({
                vol.Optional(CONF_CALENDAR_NAME, default=""): str,
                vol.Optional(CONF_CALENDAR_URL, default=""): str,
            }),
            errors=errors,
            description_placeholders={},
        )

    def _create_entry(self) -> FlowResult:
        return self.async_create_entry(
            title="Hades Household",
            data=self._data,
        )

    async def _test_chores_connection(self, host: str, api_key: str) -> bool:
        headers = {}
        if api_key:
            headers["x-api-key"] = api_key
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{host}/api/instances/today",
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=8),
                ) as resp:
                    return resp.status < 400
        except Exception:
            return False

    async def _test_calendar_url(self, url: str) -> bool:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url, timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    return resp.status < 400
        except Exception:
            return False

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: config_entries.ConfigEntry):
        return HadesHouseholdOptionsFlow(config_entry)


class HadesHouseholdOptionsFlow(config_entries.OptionsFlow):
    """Handle options (Configure button in HA UI)."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        self.config_entry = config_entry
        self._calendars: list[dict] = list(
            config_entry.options.get(
                CONF_CALENDARS,
                config_entry.data.get(CONF_CALENDARS, [])
            )
        )
        self._people: list[str] = list(
            config_entry.options.get(
                CONF_TRACKED_PEOPLE,
                config_entry.data.get(CONF_TRACKED_PEOPLE, CHORES_PEOPLE)
            )
        )

    async def async_step_init(self, user_input: dict | None = None) -> FlowResult:
        """Show options menu."""
        return self.async_show_menu(
            step_id="init",
            menu_options=["add_calendar", "remove_calendar", "update_people"],
        )

    # ── Add calendar ──────────────────────────────────────────────────────────

    async def async_step_add_calendar(self, user_input: dict | None = None) -> FlowResult:
        errors: dict = {}

        if user_input is not None:
            name = user_input.get(CONF_CALENDAR_NAME, "").strip()
            url = user_input.get(CONF_CALENDAR_URL, "").strip()
            if name and url:
                ok = await self._test_url(url)
                if not ok:
                    errors["base"] = "invalid_url"
                else:
                    # Remove existing with same name if any
                    self._calendars = [c for c in self._calendars if c["name"] != name]
                    self._calendars.append({"name": name, "url": url})
                    return self._save()
            else:
                errors["base"] = "unknown"

        return self.async_show_form(
            step_id="add_calendar",
            data_schema=vol.Schema({
                vol.Required(CONF_CALENDAR_NAME): str,
                vol.Required(CONF_CALENDAR_URL): str,
            }),
            errors=errors,
        )

    # ── Remove calendar ───────────────────────────────────────────────────────

    async def async_step_remove_calendar(self, user_input: dict | None = None) -> FlowResult:
        if not self._calendars:
            return self._save()

        if user_input is not None:
            name = user_input.get(CONF_CALENDAR_NAME)
            self._calendars = [c for c in self._calendars if c["name"] != name]
            return self._save()

        cal_names = {c["name"]: c["name"] for c in self._calendars}
        return self.async_show_form(
            step_id="remove_calendar",
            data_schema=vol.Schema({
                vol.Required(CONF_CALENDAR_NAME): vol.In(cal_names),
            }),
        )

    # ── Update people ─────────────────────────────────────────────────────────

    async def async_step_update_people(self, user_input: dict | None = None) -> FlowResult:
        if user_input is not None:
            self._people = user_input[CONF_TRACKED_PEOPLE]
            return self._save()

        return self.async_show_form(
            step_id="update_people",
            data_schema=vol.Schema({
                vol.Required(CONF_TRACKED_PEOPLE, default=self._people): vol.In(
                    {p: p for p in CHORES_PEOPLE}
                ),
            }),
        )

    def _save(self) -> FlowResult:
        return self.async_create_entry(
            title="",
            data={
                CONF_CALENDARS: self._calendars,
                CONF_TRACKED_PEOPLE: self._people,
            },
        )

    async def _test_url(self, url: str) -> bool:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url, timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    return resp.status < 400
        except Exception:
            return False
