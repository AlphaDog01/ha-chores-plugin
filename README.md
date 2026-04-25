# Hades HA Plugins

Monorepo for all Hades Home Assistant custom integrations and cards.

## Structure

```
ha-plugins/
├── install.sh          — unified install script
├── ha-household/       — Hades Household Integration (chores + calendars)
├── ha-auth/            — Hades Auth (JumpCloud OIDC SSO)
└── ha-cards/           — Custom Lovelace cards (hades-card.js)
```

## Install

Copy `install.sh` to your HA SSH home (`~`), set your GitHub token, then:

```bash
# Install everything
./install.sh

# Install specific plugins only
./install.sh household
./install.sh auth
./install.sh cards
./install.sh household cards
```

## HA Box

| Thing | Value |
|-------|-------|
| HA box IP | `10.72.16.61` |
| SSH port | `2309` |
| SSH user | `root` |
| SSH command | `ssh root@10.72.16.61 -p 2309` |

## Plugins

### ha-household
Chore tracking + CalDAV/iCal calendars. Exposes sensors and calendar entities.
- Domain: `hades_household`
- Installed to: `/config/custom_components/hades_household/`

### ha-auth
JumpCloud OIDC SSO authentication for Home Assistant.
- Domain: `hades_auth`
- Installed to: `/config/custom_components/hades_auth/`

### ha-cards
Custom Lovelace cards.
- Installed to: `/config/www/`
- Register in HA: Settings → Dashboards → Resources → `/local/hades-card.js`

## Rules
- Always modify files in GitHub and repull — never edit directly on server
- Repull: `./install.sh` then restart HA
- JS card changes: bump resource URL version + hard refresh browser
