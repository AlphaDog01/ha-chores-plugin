"""Config flow for Hades Auth."""
import voluptuous as vol
import aiohttp
from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from .const import DOMAIN

STEP_USER_DATA_SCHEMA = vol.Schema({
    vol.Required("discovery_url"): str,
    vol.Required("client_id"): str,
    vol.Required("client_secret"): str,
    vol.Optional("redirect_uri", default=""): str,
})

async def validate_oidc(discovery_url: str, client_id: str, client_secret: str) -> dict:
    """Validate the OIDC provider by fetching discovery document."""
    async with aiohttp.ClientSession() as session:
        async with session.get(discovery_url) as resp:
            if resp.status != 200:
                raise ValueError("cannot_connect")
            return await resp.json()

class HadesAuthConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Hades Auth."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        errors = {}

        if user_input is not None:
            try:
                oidc_config = await validate_oidc(
                    user_input["discovery_url"],
                    user_input["client_id"],
                    user_input["client_secret"],
                )
                return self.async_create_entry(
                    title="Hades Auth (JumpCloud SSO)",
                    data={
                        **user_input,
                        "authorization_endpoint": oidc_config.get("authorization_endpoint"),
                        "token_endpoint": oidc_config.get("token_endpoint"),
                        "userinfo_endpoint": oidc_config.get("userinfo_endpoint"),
                        "jwks_uri": oidc_config.get("jwks_uri"),
                    },
                )
            except ValueError as e:
                errors["base"] = str(e)
            except Exception:
                errors["base"] = "unknown"

        return self.async_show_form(
            step_id="user",
            data_schema=STEP_USER_DATA_SCHEMA,
            errors=errors,
        )
