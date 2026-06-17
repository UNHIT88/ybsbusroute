import type { LatLng } from "@/types/bus";

const OSRM_BASE = "https://router.project-osrm.org";
const MAX_WAYPOINTS = 25;

type OsrmRouteResponse = {
  code: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry: {
      coordinates: [number, number][];
    };
  }>;
};

const memoryCache = new Map<string, unknown>();

function cacheKey(prefix: string, value: string): string {
  return `${prefix}:${value}`;
}

function toLatLng(coordinates: [number, number][]): LatLng[] {
  return coordinates.map(([lng, lat]) => ({
    latitude: lat,
    longitude: lng,
  }));
}

function fallbackLine(stops: Array<{ lat: number; lng: number }>): LatLng[] {
  return stops.map((stop) => ({
    latitude: stop.lat,
    longitude: stop.lng,
  }));
}

async function fetchOsrmJson<T>(url: string): Promise<T | null> {
  const cached = memoryCache.get(url);
  if (cached) return cached as T;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "YBS-Navigator/1.0" },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as T;
    memoryCache.set(url, payload);
    return payload;
  } catch {
    return null;
  }
}

export async function fetchRoadPolyline(
  stops: Array<{ lat: number; lng: number }>
): Promise<LatLng[]> {
  if (stops.length < 2) return fallbackLine(stops);

  const chunks: LatLng[] = [];

  for (let start = 0; start < stops.length - 1; start += MAX_WAYPOINTS - 1) {
    const slice = stops.slice(start, start + MAX_WAYPOINTS);
    const coords = slice.map((stop) => `${stop.lng},${stop.lat}`).join(";");
    const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    const data = await fetchOsrmJson<OsrmRouteResponse>(url);

    if (!data?.routes?.[0]?.geometry?.coordinates?.length) {
      chunks.push(...fallbackLine(slice));
      continue;
    }

    const segment = toLatLng(data.routes[0].geometry.coordinates);
    if (chunks.length > 0 && segment.length > 0) {
      segment.shift();
    }
    chunks.push(...segment);
  }

  return chunks.length > 0 ? chunks : fallbackLine(stops);
}

export async function fetchRoadDistanceMeters(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<number | null> {
  const key = cacheKey("dist", `${from.lng},${from.lat};${to.lng},${to.lat}`);
  const cached = memoryCache.get(key);
  if (typeof cached === "number") return cached;

  const url = `${OSRM_BASE}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
  const data = await fetchOsrmJson<OsrmRouteResponse>(url);
  const distance = data?.routes?.[0]?.distance ?? null;
  if (distance != null) memoryCache.set(key, distance);
  return distance;
}

export async function fetchLegRoadDistanceMeters(
  stops: Array<{ lat: number; lng: number }>
): Promise<number> {
  if (stops.length < 2) return 0;

  let total = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    const distance = await fetchRoadDistanceMeters(stops[i], stops[i + 1]);
    if (distance == null) return Number.POSITIVE_INFINITY;
    total += distance;
  }
  return total;
}
