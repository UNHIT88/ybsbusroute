import { isStaticDataHost, YBS_API_BASE } from "@/constants/api";
import type {
  ApiPlanResponse,
  ApiRouteDetail,
  ApiRoutesResponse,
  ApiStopsResponse,
  RemoteDataset,
} from "@/types/ybsApi";
import type { BusRoute, BusStop, RouteStop } from "@/types/bus";
import type { TripPlan } from "@/services/routePlanner";

const FETCH_TIMEOUT_MS = 20_000;

function withTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

function apiPath(path: string, baseUrl = YBS_API_BASE): string {
  const clean = baseUrl.replace(/\/$/, "");
  if (isStaticDataHost(clean)) {
    return `${clean}/data${path.replace(/^\/api/, "")}`;
  }
  return `${clean}${path}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await withTimeout(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json() as Promise<T>;
}

export function apiStopToBusStop(stop: {
  id: number;
  name_en: string;
  name_mm: string;
  road_en: string;
  road_mm: string;
  township_en: string;
  township_mm: string;
  location: { lat: number; lng: number };
  routes: string[];
}): BusStop {
  return {
    id: stop.id,
    name_en: stop.name_en,
    name_mm: stop.name_mm,
    road_en: stop.road_en,
    road_mm: stop.road_mm,
    township_en: stop.township_en,
    township_mm: stop.township_mm,
    lat: stop.location.lat,
    lng: stop.location.lng,
    routes: stop.routes ?? [],
  };
}

function apiRouteStopToRouteStop(stop: ApiRouteDetail["stops"][number]): RouteStop {
  return {
    sequence: stop.sequence,
    stop_id: stop.stop_id,
    name_en: stop.name_en,
    name_mm: stop.name_mm,
    road_en: stop.road_en,
    road_mm: stop.road_mm,
    township_en: stop.township_en,
    township_mm: stop.township_mm,
    lat: stop.location.lat,
    lng: stop.location.lng,
  };
}

export function apiRouteDetailToBusRoute(route: ApiRouteDetail): BusRoute {
  return {
    route_number: route.route_number,
    display_number: route.display_number,
    name: route.name,
    color: route.color,
    operator: route.operator,
    description: route.description,
    stop_count: route.stop_count,
    stops: route.stops.map(apiRouteStopToRouteStop),
  };
}

/** GET /api/routes or data/routes.json */
export async function fetchAllRouteSummaries(baseUrl = YBS_API_BASE) {
  const path = isStaticDataHost(baseUrl) ? "/api/routes.json" : "/api/routes";
  return fetchJson<ApiRoutesResponse>(apiPath(path, baseUrl));
}

/** GET /api/routes/:id or data/routes/:id.json */
export async function fetchRouteDetail(
  routeId: string,
  baseUrl = YBS_API_BASE
): Promise<ApiRouteDetail> {
  const path = isStaticDataHost(baseUrl)
    ? `/api/routes/${routeId}.json`
    : `/api/routes/${routeId}`;
  return fetchJson<ApiRouteDetail>(apiPath(path, baseUrl));
}

/** GET /api/stops?q=... */
export async function searchStopsRemote(
  query: string,
  baseUrl = YBS_API_BASE
): Promise<ApiStopsResponse> {
  if (isStaticDataHost(baseUrl)) {
    const all = await fetchJson<ApiStopsResponse>(apiPath("/api/stops.json", baseUrl));
    const term = query.trim().toLowerCase();
    if (!term) return { total: 0, stops: [] };
    const stops = all.stops.filter(
      (stop) =>
        stop.name_en.toLowerCase().includes(term) ||
        stop.name_mm.includes(query.trim()) ||
        stop.road_en.toLowerCase().includes(term) ||
        stop.township_en.toLowerCase().includes(term)
    );
    return { total: stops.length, stops: stops.slice(0, 50) };
  }

  const url = `${apiPath("/api/stops", baseUrl)}?q=${encodeURIComponent(query)}`;
  return fetchJson<ApiStopsResponse>(url);
}

/** GET /api/plan?from=&to= */
export async function fetchTripPlansRemote(
  fromStopId: number,
  toStopId: number,
  baseUrl = YBS_API_BASE
): Promise<TripPlan[]> {
  if (isStaticDataHost(baseUrl)) {
    return [];
  }

  const url = `${apiPath("/api/plan", baseUrl)}?from=${fromStopId}&to=${toStopId}`;
  const data = await fetchJson<ApiPlanResponse>(url);

  return data.plans.map((plan) => ({
    legs: plan.legs.map((leg) => ({
      routeNumber: leg.route_number,
      displayNumber: leg.display_number,
      routeName: leg.route_name,
      color: leg.color,
      fromStopId: leg.from_stop_id,
      toStopId: leg.to_stop_id,
      stopCount: leg.stop_count,
    })),
    transferCount: plan.transfer_count,
    totalStops: plan.total_stops,
    totalCost: plan.total_stops + plan.transfer_count * 18,
  }));
}

/** Download full route + stop dataset from API/static host. */
export async function fetchRemoteDataset(baseUrl = YBS_API_BASE): Promise<RemoteDataset | null> {
  try {
    const clean = baseUrl.replace(/\/$/, "");

    if (isStaticDataHost(clean)) {
      const [routes, stops] = await Promise.all([
        fetchJson<BusRoute[]>(`${clean}/data/bus_routes_list.json`),
        fetchJson<BusStop[]>(`${clean}/data/bus_stops_list.json`),
      ]);
      return { routes, stops, source: "ybsbusroute (GitHub)" };
    }

    const summary = await fetchAllRouteSummaries(baseUrl);
    const routeDetails = await Promise.all(
      summary.routes.map((route) => fetchRouteDetail(route.route_number, baseUrl))
    );
    const routes = routeDetails.map(apiRouteDetailToBusRoute);

    const stopsResponse = await fetchJson<ApiStopsResponse>(
      apiPath("/api/stops.json", baseUrl)
    );
    const stops = stopsResponse.stops.map(apiStopToBusStop);

    return {
      routes,
      stops,
      source: "ybsbusroute API",
    };
  } catch {
    return null;
  }
}

export async function isApiReachable(baseUrl = YBS_API_BASE): Promise<boolean> {
  try {
    if (isStaticDataHost(baseUrl)) {
      await fetchAllRouteSummaries(baseUrl);
      return true;
    }
    const response = await withTimeout(`${baseUrl.replace(/\/$/, "")}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
