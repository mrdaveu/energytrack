# EnergyTrack Architecture

## Overview

EnergyTrack is a personal energy/activity logging app with a timeline-based UI. Users log entries with optional descriptions and energy levels (1-10), which are displayed on a scrollable vertical timeline.

## Tech Stack

- **Backend**: FastAPI (Python)
- **Database**: PostgreSQL (production) / SQLite (local dev)
- **Frontend**: Vanilla JS, CSS
- **Deployment**: Railway (auto-deploy from GitHub)

## Project Structure

```
energytrack/
├── backend/
│   ├── main.py          # FastAPI app, routes, endpoints
│   ├── database.py      # SQLAlchemy engine, session config
│   ├── models.py        # User, Entry ORM models
│   └── requirements.txt
├── frontend/
│   ├── index.html       # Single page app shell
│   ├── app.js           # All client-side logic
│   └── style.css        # Styling with mobile responsive
├── requirements.txt     # Top-level deps (used by Railway)
├── railway.toml         # Railway deployment config
└── Procfile            # Process definition
```

## Backend

### Database Models (`models.py`)

- **User**: `id`, `secret_key` (10-char random string for URL)
- **Entry**: `id`, `user_id`, `timestamp`, `description` (nullable), `energy` (1-10, nullable)

### API Endpoints (`main.py`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Redirect to `/new` |
| GET | `/new` | Create new user, redirect to `/u/{secret}` |
| GET | `/u/{secret}` | Serve frontend HTML |
| GET | `/api/u/{secret}/entries` | Get all entries for user |
| POST | `/api/u/{secret}/entries` | Create new entry |
| GET | `/demo` | Create demo user with sample data |

### Database Connection (`database.py`)

- Uses `DATABASE_URL` env var (defaults to SQLite for local dev)
- Auto-converts `postgres://` to `postgresql://` for Railway compatibility
- SQLAlchemy with session management via FastAPI dependency injection

## Frontend

### State Management (`app.js`)

```javascript
const state = {
    entries: [],           // All user entries
    draft: {               // Current input state
        text: '',
        energy: null,
        timestamp: Date.now()
    },
    isDraftMode: false,    // Whether user is composing
    isEnergyDragging: false
};
```

### Timeline Y-Axis: Entry-Centric Spacing

Instead of linear time-to-pixel mapping, spacing is based on gaps between entries:

```javascript
function allocateGapSpace(gapMinutes) {
    if (gapMinutes <= 5) return 110;      // 0-5 min
    if (gapMinutes <= 30) return 145;     // 5-30 min
    if (gapMinutes <= 60) return 180;     // 30-60 min
    if (gapMinutes <= 120) return 220;    // 1-2 hours
    if (gapMinutes <= 360) return 280;    // 2-6 hours
    if (gapMinutes <= 720) return 350;    // 6-12 hours
    return 420;                           // 12+ hours
}
```

**Anchor Map**: Each entry becomes an "anchor" with cumulative Y position. "Now" is at Y=0, older entries have higher Y values.

**Positioning**: Entries are absolutely positioned. "Now" is at the bottom (near input area), older entries scroll upward.

### Key Functions

| Function | Purpose |
|----------|---------|
| `buildAnchorMap(entries, now)` | Create Y-position anchors for all entries |
| `timeToY_entryCentric(timestamp, anchors)` | Convert timestamp to Y coordinate |
| `yToTime_entryCentric(y, anchors)` | Convert Y (scroll position) to timestamp |
| `renderTimeline()` | Render all entries, day separators |
| `updateTimestampFromScroll()` | Update draft timestamp based on scroll |
| `saveEntry()` | POST to API, update local state |

### Input Area

- Fixed at bottom of viewport
- Gradient fade (`::before` pseudo-element) blends timeline into input
- Energy selector: vertical drag to set 1-10
- Scroll to backdate entries (up to 12 hours)

### Day Separators

Rendered between entries when the day changes. Placed at midpoint between the two entries.

### Mobile Responsive

Media query at 768px breakpoint scales down all text and spacing for mobile devices.

## Deployment

### Railway Config (`railway.toml`)

```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "uvicorn backend.main:app --host 0.0.0.0 --port $PORT"
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (auto-injected by Railway when DB is linked) |
| `PORT` | Server port (auto-injected by Railway) |

### Persistence

- PostgreSQL addon must be **linked** to the web service in Railway dashboard
- This injects `DATABASE_URL` into the environment
- Tables are auto-created on first run via `Base.metadata.create_all()`

## Data Flow

1. User visits `/` → redirected to `/new`
2. `/new` creates User with random `secret_key`, redirects to `/u/{secret}`
3. Frontend loads, fetches entries via `GET /api/u/{secret}/entries`
4. User types/drags energy → `state.draft` updated
5. User saves → `POST /api/u/{secret}/entries`
6. New entry added to `state.entries`, timeline re-renders

## CSS Architecture

- CSS variables for theming (`:root`)
- Absolute positioning for timeline entries
- Fixed positioning for input area
- Mobile styles in single `@media` block at top

## Known Considerations

- Timestamps stored in UTC, displayed in local time
- `parseTimestamp()` ensures UTC interpretation of server timestamps
- Energy is optional (can log just description or just energy)
- 12-hour scroll limit for backdating entries
