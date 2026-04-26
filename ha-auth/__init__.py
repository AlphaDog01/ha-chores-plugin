"""Hades Auth - JumpCloud OIDC Authentication for Home Assistant."""
import logging
import secrets
from urllib.parse import urlencode
from pathlib import Path
import aiohttp

from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.components.http import HomeAssistantView, StaticPathConfig
from homeassistant.helpers.network import get_url

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    hass.data.setdefault(DOMAIN, {})
    return True

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data[DOMAIN] = entry.data

    # Serve the frontend JS file
    www_path = Path(__file__).parent / "www"
    await hass.http.async_register_static_paths([
        StaticPathConfig("/auth/hades/static", str(www_path), False)
    ])

    # Register views
    hass.http.register_view(HadesLoginView(hass, entry.data))
    hass.http.register_view(HadesAuthCallbackView(hass, entry.data))

    _LOGGER.info("Hades Auth initialized")
    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    return True


class HadesLoginView(HomeAssistantView):
    url = "/auth/hades/login"
    name = "auth:hades:login"
    requires_auth = False

    def __init__(self, hass, config):
        self.hass = hass
        self.config = config

    async def get(self, request):
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
        auth_url = f"{self.config['authorization_endpoint']}?{urlencode(params)}"
        raise HTTPFound(auth_url)


class HadesAuthCallbackView(HomeAssistantView):
    url = "/auth/hades/callback"
    name = "auth:hades:callback"
    requires_auth = False

    def __init__(self, hass, config):
        self.hass = hass
        self.config = config

    async def get(self, request):
        from aiohttp.web import Response
        code = request.query.get("code")
        if not code:
            return Response(text="Missing code", status=400)

        try:
            token_data = await self._exchange_code(code)
            userinfo = await self._get_userinfo(token_data["access_token"])

            email = userinfo.get("email")
            given = userinfo.get("given_name", "")
            family = userinfo.get("family_name", "")
            name = userinfo.get("name") or f"{given} {family}".strip() or email

            if not email:
                return Response(text="No email in token", status=400)

            users = await self.hass.auth.async_get_users()
            ha_user = next((u for u in users if u.name == name or u.name == email), None)

            if ha_user is None:
                ha_user = await self.hass.auth.async_create_user(name, group_ids=["system-users"])
                _LOGGER.info("Created new HA user: %s (%s)", name, email)

            # Create refresh token
            refresh_token = await self.hass.auth.async_create_refresh_token(
                ha_user,
                client_id="https://hcontrol.cnyhades.com/",
                client_name="Hades Auth",
                token_type="normal",
            )
            access_token = self.hass.auth.async_create_access_token(refresh_token)

        except Exception as e:
            _LOGGER.error("Hades Auth error: %s", e)
            return Response(text=f"Auth error: {e}", status=500)

        # Use HA's proper hassTokens format with refresh token included
        return Response(
            text=f"""<!DOCTYPE html>
            <html><body>
            <script>
                var tokens = {{
                    access_token: '{access_token}',
                    token_type: 'Bearer',
                    expires_in: 1800,
                    refresh_token: '{refresh_token.token}',
                    hassUrl: window.location.origin,
                    clientId: 'https://hcontrol.cnyhades.com/',
                    expires: new Date(new Date().getTime() + 1800000).toISOString()
                }};
                localStorage.setItem('hassTokens', JSON.stringify(tokens));
                window.location = '/';
            </script>
            </body></html>""",
            content_type='text/html'
        )

    async def _exchange_code(self, code):
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

    async def _get_userinfo(self, access_token):
        async with aiohttp.ClientSession() as session:
            async with session.get(
                self.config["userinfo_endpoint"],
                headers={"Authorization": f"Bearer {access_token}"},
            ) as resp:
                return await resp.json()
