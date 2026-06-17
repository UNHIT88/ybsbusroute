# React Native Expo — YBS Data Integration

Use the YBS bus route API from a React Native Expo app.

## Quick setup

### 1. Start the API (in the ybsbusroute repo)

```bash
cd /path/to/ybsbusroute
pip install -r requirements.txt
uvicorn api.main:app --host 0.0.0.0 --port 8000
```

`--host 0.0.0.0` is required so your phone/emulator can reach the API.

### 2. Create or open your Expo app

```bash
npx create-expo-app@latest YbsRouteApp
cd YbsRouteApp
```

### 3. Copy these files into your Expo project

```
your-expo-app/
  api/ybsClient.ts       ← from examples/expo/api/
  hooks/useYbsData.ts    ← from examples/expo/hooks/
  App.tsx                ← adapt from App.example.tsx
  .env                   ← from .env.example
```

### 4. Configure API URL

Copy `.env.example` to `.env` and set the right URL:

| Where you run the app | API URL |
|-----------------------|---------|
| iOS Simulator | `http://localhost:8000` |
| Android Emulator | `http://10.0.2.2:8000` |
| Physical device | `http://YOUR_COMPUTER_IP:8000` |
| Production | `https://your-app.onrender.com` |

Find your computer IP: `ip addr` (Linux) or `ipconfig` (Windows).

Restart Expo after changing `.env`:

```bash
npx expo start -c
```

## Files in this example

| File | Purpose |
|------|---------|
| `api/ybsClient.ts` | Typed fetch wrapper for all API endpoints |
| `hooks/useYbsData.ts` | React hooks: routes, search, trip planner |
| `App.example.tsx` | Full demo UI (routes list + trip planner) |

## API usage in your app

```typescript
import { ybsApi } from "./api/ybsClient";

// List all routes
const { routes } = await ybsApi.getRoutes();

// Route detail with stops
const route = await ybsApi.getRoute("1");

// Search stops
const { stops } = await ybsApi.searchStops("နတ်စင်");

// Plan a trip
const { plans } = await ybsApi.planTrip("နတ်စင်", "စံပြဈေး");
```

## Option: use JSON without running the API

Bundle static data (larger app size) or fetch from GitHub:

```typescript
const ROUTES_URL =
  "https://raw.githubusercontent.com/UNHIT88/ybsbusroute/main/data/routes.json";

export async function loadRoutes() {
  const res = await fetch(ROUTES_URL);
  const data = await res.json();
  return data.routes;
}
```

Trip planning (`/api/plan`) requires the API server — it is not in the static JSON files.

## Maps (optional)

Stops with GPS can be shown on a map using `react-native-maps`:

```bash
npx expo install react-native-maps
```

```typescript
import MapView, { Marker } from "react-native-maps";

{stop.location && (
  <Marker
    coordinate={{ latitude: stop.location.lat, longitude: stop.location.lng }}
    title={stop.name}
  />
)}
```

## Expo Router (file-based navigation)

If you use Expo Router, split the example into screens:

```
app/
  (tabs)/
    index.tsx      → routes list (from App.example.tsx routes tab)
    plan.tsx       → trip planner tab
  route/[id].tsx   → route detail screen
```

Pass `routeId` from the list: `router.push(`/route/${item.id}`)`.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Network request failed | Wrong API URL in `.env`; use `10.0.2.2` on Android emulator |
| CORS error | Should not happen in React Native (only in web); API has CORS enabled anyway |
| Myanmar text not showing | Use a font that supports Myanmar script, e.g. `expo-font` + Noto Sans Myanmar |
| Plan returns 404 | Stop names must match exactly; use search suggestions |
