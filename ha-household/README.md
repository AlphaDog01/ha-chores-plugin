# Hades Household Integration

A custom Home Assistant integration that combines chore tracking and calendar management for the household.

---

## What It Does

- **Chores** — Connects to the Hades Chore API and exposes sensors for each person's chores today, completion rates, points, and a leaderboard
- **Calendars** — Fetches any iCal (`.ics`) URL and exposes a single clean sensor with today's events as attributes
- **Extensible** — Built to easily add new modules (weather, shopping lists, etc.) without restructuring

---

## Sensors

### Chores (per person)
| Sensor | State | Key Attributes |
|--------|-------|----------------|
| `sensor.hades_caleb_chores_today` | # pending | `pending[]`, `completed[]`, `skipped[]`, `total_chores` |
| `sensor.hades_caleb_completion_rate` | 0-100% | `points_total` |
| *(same pattern for Cameron, Courtney, Dad, Mom)* | | |
| `sensor.hades_points_leaderboard` | leader name | `rankings[]` |
| `sensor.hades_today_summary` | total pending | `total`, `completed`, `pending`, `skipped`, `completion_percent`, `all_done` |

### Calendars (per calendar you add)
| Sensor | State | Key Attributes |
|--------|-------|----------------|
| `sensor.hades_calendar_<name>_today` | # events today | `events[]`, `event_count`, `calendar_name` |

#### Event object shape
```json
{
  "title": "Team Meeting",
  "start": "9:00 AM",
  "end": "10:00 AM",
  "all_day": false,
  "location": "Room 101"
}
```

---

## Installation

1. Create a new GitHub repo: `AlphaDog01/hades-household`
2. Push all files from this folder to the repo root
3. Copy `install_hades_household.sh` to your HA SSH home (`~`)
4. Update `GITHUB_TOKEN` in the script
5. Run `chmod +x ~/install_hades_household.sh && ./install_hades_household.sh`
6. Restart HA: Settings → System → Restart
7. Go to Settings → Integrations → Add → search **Hades Household**
8. Follow the 3-step setup wizard

---

## Adding More Calendars Later

Settings → Integrations → Hades Household → **Configure** → Add a calendar

---

## Adding New Modules (Future)

1. Add a new coordinator class in `__init__.py`
2. Add new sensor classes in `sensor.py`
3. Add config flow steps in `config_flow.py` if needed
4. Add constants to `const.py`

The coordinator pattern means each module polls independently on its own schedule.

---

## Rules

- Always modify files in GitHub and repull — never edit directly on the server
- Repull: `./install_hades_household.sh` then restart HA
- SSH: `ssh root@10.72.16.61 -p 2309`
