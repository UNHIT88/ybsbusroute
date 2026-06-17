# Connect Expo app to the YBS API

Copy this into your Expo project root as `.env`:

```env
# Local API (pick one based on where you run the app)
EXPO_PUBLIC_YBS_API_BASE=http://localhost:8000

# Android emulator
# EXPO_PUBLIC_YBS_API_BASE=http://10.0.2.2:8000

# Physical phone on same Wi-Fi (replace with your PC IP)
# EXPO_PUBLIC_YBS_API_BASE=http://192.168.1.100:8000

# GitHub static files (offline-style, no trip planning API)
# EXPO_PUBLIC_YBS_API_BASE=https://raw.githubusercontent.com/UNHIT88/ybsbusroute/main
```

After changing `.env`, restart Expo:

```bash
npx expo start -c
```

## Start the API server

In a separate terminal, from the repo root:

```bash
pip install -r requirements.txt
uvicorn api.main:app --host 0.0.0.0 --port 8000
```

## How the app connects

Your app already has the integration layer:

| File | Role |
|------|------|
| `constants/api.ts` | Reads `EXPO_PUBLIC_YBS_API_BASE` |
| `services/ybsRouteApi.ts` | Fetches routes, stops, trip plans |
| `services/busData.ts` | Loads remote data on startup via `fetchRemoteDataset()` |
| `contexts/BusDataContext.tsx` | Calls `reloadBusDataset()` when app opens |

On launch, the app:
1. Tries to fetch from `EXPO_PUBLIC_YBS_API_BASE`
2. Falls back to bundled `assets/data/*.json` if API is unreachable

## API endpoints your app uses

| App function | API endpoint |
|--------------|--------------|
| `fetchAllRouteSummaries()` | `GET /api/routes` |
| `fetchRouteDetail(id)` | `GET /api/routes/{route_number}` |
| `searchStopsRemote(q)` | `GET /api/stops?q=...` |
| `fetchTripPlansRemote(fromId, toId)` | `GET /api/plan?from={id}&to={id}` |
| `fetchRemoteDataset()` | `/api/routes` + `/api/stops.json` |
| Static mode | `/data/bus_routes_list.json` + `/data/bus_stops_list.json` |

## Refresh data pipeline

```bash
# 1. Scrape latest routes from yangonbusroute.com
python scripts/scrape_yangonbusroute.py

# 2. Add GPS coordinates from YRTA data
python scripts/enrich_coordinates.py

# 3. Export app-compatible JSON (updates assets/data/ too)
python scripts/export_app_dataset.py

# 4. Restart API server
uvicorn api.main:app --host 0.0.0.0 --port 8000

# 5. In Expo app, pull to refresh or restart app
```

## Cursor prompt to update your app

Paste this in Cursor chat when working on your Expo app:

```
My Expo app is in this repo. It uses:
- constants/api.ts for EXPO_PUBLIC_YBS_API_BASE
- services/ybsRouteApi.ts to call the API
- services/busData.ts for local + remote data

The API server is api/main.py (FastAPI). Start with:
  uvicorn api.main:app --host 0.0.0.0 --port 8000

Set .env:
  EXPO_PUBLIC_YBS_API_BASE=http://localhost:8000

Do not change the API response types in types/ybsApi.ts — the server
already returns that format via api/app_adapter.py.
```

## Verify connection

Settings tab should show:
- **API source:** `ybsbusroute API` (not offline)
- **URL:** your `EXPO_PUBLIC_YBS_API_BASE` value

Or test in terminal:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/api/routes | head -c 200
```
