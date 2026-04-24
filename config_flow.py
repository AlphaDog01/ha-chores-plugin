"""Config flow for Hades Chores integration."""
from __future__ import annotations

import logging
from typing import Any

import aiohttp
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
import homeassistant.helpers.config_validation as cv

from .const import (
    DOMAIN,
    CONF_HOST,
    CONF_API_KEY,
    CONF_SCAN_INTERVAL,
    CONF_TRACKED_PEOPLE,
    CONF_ENABLE_TODAY,
    CONF_ENABLE_LEADERBOARD,
    CONF_ENABLE_UPCOMING,
    CONF_ENABLE_COMPLETION_RATE,
    DEFAULT_SCAN_INTERVAL,
    DEFAULT_ENABLE_TODAY,
    DEFAULT_ENABLE_LEADERBOARD,
    DEFAULT_ENABLE_UPCOMING,
    DEFAULT_ENABLE_COMPLETION_RATE,
)

_LOGGER = logging.getLogger(__name__)


async def _fetch_people(hass, host: str, api_key: str) -> list[dict]:
    """Fetch people list from the Hades API."""
    session = async_get_clientsession(hass)
    headers = {}
    if api_key:
        headers["X-API-Key"] = api_key
    url = f"{host.rstrip('/')}/api/people"
    async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
        resp.raise_for_status()
        data = await resp.json()
        return data.get("data", data) if isinstance(data, dict) else data


class HadesChoresConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle the config flow for Hades Chores."""

    VERSION = 1

    def __init__(self) -> None:
        self._host: str = ""
        self._api_key: str = ""
        self._scan_interval: int = DEFAULT_SCAN_INTERVAL
        self._people: list[dict] = []

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        """Step 1: Ask for host + API key."""
        errors: dict[str, str] = {}

        if user_input is not None:
            host = user_input[CONF_HOST].rstrip("/")
            api_key = user_input.get(CONF_API_KEY, "")
            scan_interval = user_input.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)

            try:
                people = await _fetch_people(self.hass, host, api_key)
                if not people:
                    errors["base"] = "no_people"
                else:
                    self._host = host
                    self._api_key = api_key
                    self._scan_interval = scan_interval
                    self._people = people
                    return await self.async_step_people()
            except aiohttp.ClientConnectorError:
                errors["base"] = "cannot_connect"
            except aiohttp.ClientResponseError as err:
                if err.status in (401, 403):
                    errors["base"] = "invalid_auth"
                else:
                    errors["base"] = "cannot_connect"
            except Exception:
                _LOGGER.exception("Unexpected error connecting to Hades API")
                errors["base"] = "unknown"

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_HOST, default="http://10.72.16.21:33911"): str,
                    vol.Optional(CONF_API_KEY, default=""): str,
                    vol.Optional(CONF_SCAN_INTERVAL, default=DEFAULT_SCAN_INTERVAL): vol.All(
                        vol.Coerce(int), vol.Range(min=30, max=3600)
                    ),
                }
            ),
            errors=errors,
        )

    async def async_step_people(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        """Step 2: Choose which people to track."""
        errors: dict[str, str] = {}

        people_options = {
            str(p["id"]): p.get("display_name") or p["name"]
            for p in self._people
        }

        if user_input is not None:
            tracked = user_input.get(CONF_TRACKED_PEOPLE, [])
            if not tracked:
                errors["base"] = "no_people"
            else:
                return await self.async_step_sensors(tracked_people=tracked)

        return self.async_show_form(
            step_id="people",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_TRACKED_PEOPLE, default=list(people_options.keys())): cv.multi_select(
                        people_options
                    ),
                }
            ),
            errors=errors,
        )

    async def async_step_sensors(
        self,
        user_input: dict[str, Any] | None = None,
        tracked_people: list[str] | None = None,
    ) -> config_entries.FlowResult:
        """Step 3: Choose sensor types."""
        if tracked_people is not None:
            self._tracked_people = tracked_people

        if user_input is not None:
            await self.async_set_unique_id(self._host)
            self._abort_if_unique_id_configured()

            return self.async_create_entry(
                title=f"Hades Chores ({self._host})",
                data={
                    CONF_HOST: self._host,
                    CONF_API_KEY: self._api_key,
                    CONF_SCAN_INTERVAL: self._scan_interval,
                    CONF_TRACKED_PEOPLE: self._tracked_people,
                    CONF_ENABLE_TODAY: user_input.get(CONF_ENABLE_TODAY, DEFAULT_ENABLE_TODAY),
                    CONF_ENABLE_LEADERBOARD: user_input.get(CONF_ENABLE_LEADERBOARD, DEFAULT_ENABLE_LEADERBOARD),
                    CONF_ENABLE_UPCOMING: user_input.get(CONF_ENABLE_UPCOMING, DEFAULT_ENABLE_UPCOMING),
                    CONF_ENABLE_COMPLETION_RATE: user_input.get(CONF_ENABLE_COMPLETION_RATE, DEFAULT_ENABLE_COMPLETION_RATE),
                },
            )

        return self.async_show_form(
            step_id="sensors",
            data_schema=vol.Schema(
                {
                    vol.Optional(CONF_ENABLE_TODAY, default=DEFAULT_ENABLE_TODAY): bool,
                    vol.Optional(CONF_ENABLE_LEADERBOARD, default=DEFAULT_ENABLE_LEADERBOARD): bool,
                    vol.Optional(CONF_ENABLE_UPCOMING, default=DEFAULT_ENABLE_UPCOMING): bool,
                    vol.Optional(CONF_ENABLE_COMPLETION_RATE, default=DEFAULT_ENABLE_COMPLETION_RATE): bool,
                }
            ),
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: config_entries.ConfigEntry):
        return HadesChoresOptionsFlow(config_entry)


class HadesChoresOptionsFlow(config_entries.OptionsFlow):
    """Handle options (the Configure button after setup)."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        self.config_entry = config_entry
        self._people: list[dict] = []

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        """Show the options form."""
        errors: dict[str, str] = {}
        data = self.config_entry.data
        options = self.config_entry.options

        if user_input is not None:
            # Fetch fresh people list before showing people selector
            try:
                self._people = await _fetch_people(
                    self.hass,
                    data[CONF_HOST],
                    data.get(CONF_API_KEY, ""),
                )
                self._pending_options = user_input
                return await self.async_step_people()
            except Exception:
                errors["base"] = "cannot_connect"

        current_interval = options.get(
            CONF_SCAN_INTERVAL, data.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)
        )

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Optional(CONF_SCAN_INTERVAL, default=current_interval): vol.All(
                        vol.Coerce(int), vol.Range(min=30, max=3600)
                    ),
                    vol.Optional(
                        CONF_ENABLE_TODAY,
                        default=options.get(CONF_ENABLE_TODAY, data.get(CONF_ENABLE_TODAY, DEFAULT_ENABLE_TODAY)),
                    ): bool,
                    vol.Optional(
                        CONF_ENABLE_LEADERBOARD,
                        default=options.get(CONF_ENABLE_LEADERBOARD, data.get(CONF_ENABLE_LEADERBOARD, DEFAULT_ENABLE_LEADERBOARD)),
                    ): bool,
                    vol.Optional(
                        CONF_ENABLE_UPCOMING,
                        default=options.get(CONF_ENABLE_UPCOMING, data.get(CONF_ENABLE_UPCOMING, DEFAULT_ENABLE_UPCOMING)),
                    ): bool,
                    vol.Optional(
                        CONF_ENABLE_COMPLETION_RATE,
                        default=options.get(CONF_ENABLE_COMPLETION_RATE, data.get(CONF_ENABLE_COMPLETION_RATE, DEFAULT_ENABLE_COMPLETION_RATE)),
                    ): bool,
                }
            ),
            errors=errors,
        )

    async def async_step_people(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        """Let user update which people are tracked."""
        data = self.config_entry.data
        options = self.config_entry.options

        people_options = {
            str(p["id"]): p.get("display_name") or p["name"]
            for p in self._people
        }

        current_tracked = options.get(
            CONF_TRACKED_PEOPLE, data.get(CONF_TRACKED_PEOPLE, list(people_options.keys()))
        )

        if user_input is not None:
            return self.async_create_entry(
                title="",
                data={
                    **self._pending_options,
                    CONF_TRACKED_PEOPLE: user_input.get(CONF_TRACKED_PEOPLE, current_tracked),
                },
            )

        return self.async_show_form(
            step_id="people",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        CONF_TRACKED_PEOPLE, default=current_tracked
                    ): cv.multi_select(people_options),
                }
            ),
        )
