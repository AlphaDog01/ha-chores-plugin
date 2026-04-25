"""Hades Auth - JumpCloud OIDC Authentication for Home Assistant."""
import logging
import secrets
import hashlib
import base64
from typing import Any
import aiohttp

from homeassistant.core import HomeAssistant, callback
from homeassistant.config_entries import ConfigEntry
from homeassistant.components.http import HomeAssistantView
from homeassistant.helpers.network import get_url
from homeassistant.auth.providers import AuthProvider, LoginFlow
from homeassistant.auth.models import Credentials, UserMeta

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

PLATFORMS = []

async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up Hades Auth."""
    hass.data.setdefault(DOMAIN, {})
    return True

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Hades Auth from config entry."""
    hass.data[DOMAIN] = entry.data

    # Register the callback view
    hass.http.register_view(HadesAuthCallbackView(hass, entry.data))

    _LOGGER.info("Hades Auth initialized with JumpCloud OIDC")
    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload Hades Auth config entry."""
    return True


class HadesAuthCallbackView(HomeAssistantView):
    """Handle the OIDC callback from JumpCloud."""

    url = "/auth/hades/callback"
    name = "auth:hades:callback"
    requires_auth = False

    def __init__(self, hass: HomeAssistant, config: dict):
        self.hass = hass
        self.config = config

    async def get(self, request):
        """Handle GET callback from JumpCloud."""
        from aiohttp.web import HTTPFound, Response

        code = request.query.get("code")
        state = request.query.get("state")

        if not code:
            return Response(text="Missing code", status=400)

        try:
            # Exchange code for tokens
            token_data = await self._exchange_code(code, request)
            userinfo = await self._get_userinfo(token_data["access_token"])

            email = userinfo.get("email")
            name = userinfo.get("name") or f"{userinfo.get('given_name', '')} {userinfo.get('family_name', '')}".strip()

            if not email:
                return Response(text="No email in token", status=400)

            # Find or create HA user
            users = await self.hass.auth.async_get_users()
            ha_user = next((u for u in users if u.name == email or (u.credentials and any(c.data.get("email") == email for c in u.credentials))), None)

            if ha_user is None:
                ha_user = await self.hass.auth.async_create_user(name or email, group_ids=["system-users"])
                _LOGGER.info("Created new HA user for %s", email)

            # Create a short-lived auth code to pass back
            refresh_token = await self.hass.auth.async_create_refresh_token(ha_user, client_name="Hades Auth")
            access_token = self.hass.auth.async_create_access_token(refresh_token)

            redirect_url = f"/?auth_callback=1&token={access_token}"
            raise HTTPFound(redirect_url)

        except Exception as e:
            _LOGGER.error("Hades Auth callback error: %s", e)
            return Response(text=f"Auth error: {e}", status=500)

    async def _exchange_code(self, code: str, request) -> dict:
        """Exchange authorization code for tokens."""
        base_url = get_url(self.hass)
        redirect_uri = self.config.get("redirect_uri") or f"{base_url}/auth/hades/callback"

        async with aiohttp.ClientSession() as session:
            async with session.post(
                self.config["token_endpoint"],
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "client_id": self.config["client_id"],
                    "client_secret": self.config["client_secret"],
                },
            ) as resp:
                return await resp.json()

    async def _get_userinfo(self, access_token: str) -> dict:
        """Get user info from OIDC provider."""
        async with aiohttp.ClientSession() as session:
            async with session.get(
                self.config["userinfo_endpoint"],
                headers={"Authorization": f"Bearer {access_token}"},
            ) as resp:
                return await resp.json()


class HadesLoginView(HomeAssistantView):
    """Redirect user to JumpCloud login."""

    url = "/auth/hades/login"
    name = "auth:hades:login"
    requires_auth = False

    def __init__(self, hass: HomeAssistant, config: dict):
        self.hass = hass
        self.config = config

    async def get(self, request):
        """Redirect to JumpCloud authorization endpoint."""
        from aiohttp.web import HTTPFound

        base_url = get_url(self.hass)
        redirect_uri = self.config.get("redirect_uri") or f"{base_url}/auth/hades/callback"

        state = secrets.token_urlsafe(16)

        params = {
            "response_type": "code",
            "client_id": self.config["client_id"],
            "redirect_uri": redirect_uri,
            "scope": "openid email profile",
            "state": state,
        }

        from urllib.parse import urlencode
        auth_url = f"{self.config['authorization_endpoint']}?{urlencode(params)}"
        raise HTTPFound(auth_url)
