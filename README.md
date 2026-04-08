[![Netlify Status](https://api.netlify.com/api/v1/badges/64cfd5aa-8502-4753-9f4a-e89a063383b3/deploy-status)](https://app.netlify.com/projects/eichiko-home/deploys)


# Eichiko's Home

A personal real-time dashboard designed to be fully responsive across all devices, styled as an LED dot-matrix departure board. Displays live London transport data, local weather, and upcoming calendar events — all in one place.

---

## Features

### Weather Bar
Shows current conditions for a user-selected location: temperature, probability of rain, and a rotating casual phrase that regularly updates.

### Line Status
Collapsible panel (collapsed by default) showing live service status for all TFL lines and National Rail routes relevant to London. TFL lines are shown on the left; London National Rail operators on the right.
Each line displays a coloured dot using official TFL brand colours.

### Bus Arrivals
User-configurable panels showing live arrivals for selected bus stops. Each row displays the bus route number, destination, and minutes until arrival. Buses arriving imminently show a blinking "DUE" indicator.

### Train Departures
User-selected train station panels showing live departures. Each panel displays the destination, scheduled departure time, platform, and operator for upcoming trains. Supports multiple stations displayed side by side.

### Appointments
Upcoming events from Google Calendar, fetched via a private ICS feed (no OAuth required). Shows up to 10 events with the day/time, event title, and an expandable row revealing location and description. Events are independently expandable by tapping. Refreshes every 30 seconds.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | [SvelteKit](https://kit.svelte.dev) (Svelte 5, runes-based reactivity) |
| Language | TypeScript |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) via `@tailwindcss/vite` |
| Fonts | LED Dot-Matrix (CDN), Share Tech Mono |
| Server routes | SvelteKit `+server.ts` (proxy routes keep API keys off the client) |
| Deployment | [Netlify](https://netlify.com) via `@sveltejs/adapter-netlify` |
| Calendar parsing | [`node-ical`](https://www.npmjs.com/package/node-ical) |

---

## Data Sources

| Source | What it provides |
|--------|-----------------|
| [TFL Unified API](https://api-portal.tfl.gov.uk) | Line status, bus arrivals (requires free API key for higher rate limits) |
| [OpenWeatherMap API](https://openweathermap.org/api) | Current weather + precipitation forecast for Greenwich |
| [Huxley 2](https://huxley2.azurewebsites.net) | National Rail train departures (community-hosted JSON proxy, no API key needed) |
| Google Calendar ICS feed | Personal calendar events via the secret iCal URL (read-only, no OAuth) |

---

## Environment Variables

Set in `.env` locally, or in the Netlify dashboard for production:

```
TFL_APP_KEY=               # from https://api-portal.tfl.gov.uk (optional, higher rate limits)
OPENWEATHER_API_KEY=       # from https://openweathermap.org/api (required)
GOOGLE_CALENDAR_ICS_URL=   # from Google Calendar → Settings → Integrate calendar → "Secret address in iCal format"
```

All variables are server-side only — never exposed to the browser.

---

## Development

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:5173)
npm run dev

# Type-check
npm run check

# Production build
npm run build

# Preview production build
npm run preview
```
