import metadata from "@/assets/data/metadata.json";
import routesList from "@/assets/data/bus_routes_list.json";
import stopsList from "@/assets/data/bus_stops_list.json";
import {
  crowdRecordsToBusData,
  loadCustomRouteRecords,
} from "@/services/customRouteStorage";
import { fetchRemoteDataset } from "@/services/ybsRouteApi";
import {
  hasValidCoords,
  normalizeBusRoutes,
  normalizeBusStops,
} from "@/services/busDataNormalize";
import type {
  BusRoute,
  BusStop,
  Metadata,
  RouteDirection,
  RouteDirectionView,
  RouteStop,
} from "@/types/bus";

const BUNDLED_ROUTES = normalizeBusRoutes(routesList as BusRoute[]);
const BUNDLED_STOPS = normalizeBusStops(stopsList as BusStop[]);
const BUNDLED_META = metadata as Metadata;

let ACTIVE_META: Metadata = BUNDLED_META;
let REMOTE_SOURCE: string | null = null;

let ROUTES: BusRoute[] = [...BUNDLED_ROUTES];
let STOPS: BusStop[] = [...BUNDLED_STOPS];

let routeMap = new Map<string, BusRoute>();
let stopMap = new Map<string, BusStop>();
const routesByStopId = new Map<number, Set<string>>();
const routesServingStopCache = new Map<number, BusRoute[]>();
let clusterByStopId = new Map<number, number[]>();

function rebuildStopClusters() {
  clusterByStopId = new Map<number, number[]>();

  for (const stop of STOPS) {
    if (clusterByStopId.has(stop.id)) continue;

    const cluster = [stop.id];
    for (const other of STOPS) {
      if (other.id === stop.id || clusterByStopId.has(other.id)) continue;
      if (haversineKm(stop.lat, stop.lng, other.lat, other.lng) <= 0.12) {
        cluster.push(other.id);
      }
    }

    for (const stopId of cluster) {
      clusterByStopId.set(stopId, cluster);
    }
  }
}

function rebuildIndexes() {
  routesServingStopCache.clear();
  routeMap = new Map(ROUTES.map((route) => [route.route_number, route]));
  stopMap = new Map(STOPS.map((stop) => [String(stop.id), stop]));

  routesByStopId.clear();
  for (const route of ROUTES) {
    for (const routeStop of route.stops) {
      if (!routesByStopId.has(routeStop.stop_id)) {
        routesByStopId.set(routeStop.stop_id, new Set());
      }
      routesByStopId.get(routeStop.stop_id)!.add(route.route_number);
    }
  }

  rebuildStopClusters();
}

function mergeBundledAndCustom(
  bundledRoutes: BusRoute[],
  bundledStops: BusStop[],
  customRoutes: BusRoute[],
  customStops: BusStop[]
) {
  const mergedStops = new Map<number, BusStop>();
  for (const stop of bundledStops) mergedStops.set(stop.id, { ...stop, routes: [...stop.routes] });
  for (const stop of customStops) mergedStops.set(stop.id, stop);

  return {
    routes: [...bundledRoutes, ...customRoutes],
    stops: [...mergedStops.values()],
  };
}

rebuildIndexes();

export type ReloadBusDatasetResult = {
  customCount: number;
  remoteLoaded: boolean;
  remoteSource: string | null;
};

export async function reloadBusDataset(): Promise<ReloadBusDatasetResult> {
  let baseRoutes = BUNDLED_ROUTES;
  let baseStops = BUNDLED_STOPS;
  let baseMeta = BUNDLED_META;
  let remoteLoaded = false;

  const remote = await fetchRemoteDataset();
  if (remote) {
    baseRoutes = remote.routes;
    baseStops = remote.stops;
    REMOTE_SOURCE = remote.source;
    remoteLoaded = true;
  } else {
    REMOTE_SOURCE = null;
  }

  const records = await loadCustomRouteRecords();
  const custom = crowdRecordsToBusData(records);
  const merged = mergeBundledAndCustom(
    baseRoutes,
    baseStops,
    custom.routes,
    custom.stops
  );

  ROUTES = merged.routes;
  STOPS = merged.stops;
  ACTIVE_META = baseMeta;
  rebuildIndexes();

  return {
    customCount: records.length,
    remoteLoaded,
    remoteSource: REMOTE_SOURCE,
  };
}

export function getRemoteDataSource(): string | null {
  return REMOTE_SOURCE;
}

export function getDatasetCounts(): { routes: number; stops: number; customRoutes: number } {
  const customRoutes = ROUTES.filter((route) => route.operator === "Community").length;
  return {
    routes: ROUTES.length,
    stops: STOPS.length,
    customRoutes,
  };
}

function normalizeLabel(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function labelsMatch(a: string, b: string): boolean {
  const left = normalizeLabel(a);
  const right = normalizeLabel(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function stopNamesExactlyMatch(busStop: BusStop, routeStop: RouteStop): boolean {
  if (
    busStop.name_en &&
    routeStop.name_en &&
    normalizeLabel(busStop.name_en) === normalizeLabel(routeStop.name_en)
  ) {
    return true;
  }

  if (
    busStop.name_mm &&
    routeStop.name_mm &&
    normalizeLabel(busStop.name_mm) === normalizeLabel(routeStop.name_mm)
  ) {
    return true;
  }

  return false;
}

/** A route stop matches only by exact stop ID or exact stop name — no road/proximity matching. */
export function routeStopMatchesBusStop(busStop: BusStop, routeStop: RouteStop): boolean {
  if (routeStop.stop_id === busStop.id) return true;
  return stopNamesExactlyMatch(busStop, routeStop);
}

export function routeContainsBusStop(route: BusRoute, busStop: BusStop): boolean {
  return route.stops.some((routeStop) => routeStopMatchesBusStop(busStop, routeStop));
}

function computeRoutesServingStop(stop: BusStop): BusRoute[] {
  return ROUTES.filter((route) => routeContainsBusStop(route, stop));
}

/**
 * Return every bus line whose route stop list contains this exact stop (by ID or name).
 */
export function getRoutesServingStop(stop: BusStop): BusRoute[] {
  const cached = routesServingStopCache.get(stop.id);
  if (cached) return cached;

  const result = computeRoutesServingStop(stop);
  routesServingStopCache.set(stop.id, result);
  return result;
}

/** Fast estimate for ranking nearby stops — uses indexed stop_id links only. */
function quickRouteCount(stop: BusStop): number {
  return routesByStopId.get(stop.id)?.size ?? 0;
}

export function getNearestStop(
  latitude: number,
  longitude: number,
  radiusKm = 1.5
): BusStop | undefined {
  let nearest: BusStop | undefined;
  let nearestDistance = Infinity;

  for (const stop of STOPS) {
    if (!hasValidCoords(stop)) continue;
    const distance = haversineKm(latitude, longitude, stop.lat, stop.lng);
    if (distance <= radiusKm && distance < nearestDistance) {
      nearestDistance = distance;
      nearest = stop;
    }
  }

  return nearest;
}

export function getDisplayRouteNumber(route: BusRoute): string {
  return route.display_number ?? route.route_number;
}

export function parseRouteTermini(route: BusRoute): { from: string; to: string } {
  const parts = route.name.split(/\s*↔\s*/);
  if (parts.length >= 2) {
    return { from: parts[0].trim(), to: parts[1].trim() };
  }

  if (route.stops.length >= 2) {
    const first = route.stops[0];
    const last = route.stops[route.stops.length - 1];
    return {
      from: first.name_mm || first.name_en,
      to: last.name_mm || last.name_en,
    };
  }

  return { from: "", to: "" };
}

export function getRelatedRoutes(route: BusRoute): BusRoute[] {
  const display = getDisplayRouteNumber(route);
  return ROUTES.filter((item) => getDisplayRouteNumber(item) === display);
}

function renumberStops(stops: RouteStop[]): RouteStop[] {
  return stops.map((stop, index) => ({
    ...stop,
    sequence: index + 1,
  }));
}

function pickDownRoute(route: BusRoute, termini: { from: string; to: string }): BusRoute {
  const related = getRelatedRoutes(route).filter(
    (item) => item.route_number !== route.route_number && item.stops.length > 0
  );

  for (const alternate of related) {
    const first = alternate.stops[0];
    const firstLabel = first.name_mm || first.name_en;
    if (labelsMatch(firstLabel, termini.to)) {
      return alternate;
    }
  }

  return route;
}

export function getRouteDirectionView(
  route: BusRoute,
  direction: RouteDirection
): RouteDirectionView {
  const termini = parseRouteTermini(route);

  if (direction === "up") {
    return {
      direction,
      fromLabel: termini.from,
      toLabel: termini.to,
      stops: renumberStops(route.stops),
    };
  }

  const downRoute = pickDownRoute(route, termini);
  const useAlternate =
    downRoute.route_number !== route.route_number && downRoute.stops.length > 0;

  return {
    direction,
    fromLabel: termini.to,
    toLabel: termini.from,
    stops: renumberStops(
      useAlternate ? [...downRoute.stops] : [...route.stops].reverse()
    ),
  };
}

export function getMetadata(): Metadata {
  return ACTIVE_META;
}

export function getAllRoutes(): BusRoute[] {
  return ROUTES;
}

export function getAllStops(): BusStop[] {
  return STOPS;
}

export function getRoute(routeNumber: string): BusRoute | undefined {
  return (
    routeMap.get(routeNumber) ??
    ROUTES.find((route) => getDisplayRouteNumber(route) === routeNumber)
  );
}

export function getStop(stopId: string | number): BusStop | undefined {
  return stopMap.get(String(stopId));
}

export function searchRoutes(query: string): BusRoute[] {
  const term = query.trim().toLowerCase();
  if (!term) return ROUTES;
  return ROUTES.filter((route) => {
    const displayNumber = getDisplayRouteNumber(route);
    return (
      route.route_number.includes(term) ||
      displayNumber.includes(term) ||
      route.name.toLowerCase().includes(term) ||
      (route.description ?? "").toLowerCase().includes(term)
    );
  });
}

export function searchStops(query: string): BusStop[] {
  const term = query.trim().toLowerCase();
  if (!term) return [];
  return STOPS.filter(
    (stop) =>
      stop.name_en.toLowerCase().includes(term) ||
      stop.name_mm.includes(query.trim()) ||
      stop.township_en.toLowerCase().includes(term) ||
      stop.road_en.toLowerCase().includes(term)
  ).slice(0, 50);
}

export type StopServingRoute = {
  routeNumber: string;
  displayNumber: string;
  color: string;
};

export function getStopServingRoutes(stop: BusStop): StopServingRoute[] {
  const servingRoutes = getRoutesServingStop(stop);
  const seen = new Set<string>();

  return servingRoutes
    .map((route) => ({
      routeNumber: route.route_number,
      displayNumber: getDisplayRouteNumber(route),
      color: route.color,
    }))
    .filter((entry) => {
      if (seen.has(entry.displayNumber)) return false;
      seen.add(entry.displayNumber);
      return true;
    })
    .sort((a, b) =>
      a.displayNumber.localeCompare(b.displayNumber, undefined, { numeric: true })
    );
}

export function getNearbyStops(
  latitude: number,
  longitude: number,
  radiusKm = 1.5,
  limit = 20
): BusStop[] {
  const candidates = STOPS.filter(hasValidCoords)
    .map((stop) => ({
      stop,
      distance: haversineKm(latitude, longitude, stop.lat, stop.lng),
    }))
    .filter((item) => item.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance);

  const ranked: Array<{ stop: BusStop; distance: number; routeCount: number }> = [];
  const usedClusterKeys = new Set<string>();

  for (const { stop, distance } of candidates) {
    const clusterKey = String(
      clusterByStopId
        .get(stop.id)
        ?.slice()
        .sort((a, b) => a - b)
        .join(",") ?? stop.id
    );
    if (usedClusterKeys.has(clusterKey)) continue;

    const clusterIds = clusterByStopId.get(stop.id) ?? [stop.id];
    const clusterStops = clusterIds
      .map((id) => stopMap.get(String(id)))
      .filter(Boolean) as BusStop[];

    const representative =
      clusterStops.length > 0
        ? clusterStops.reduce((best, current) =>
            quickRouteCount(current) > quickRouteCount(best) ? current : best
          )
        : stop;

    usedClusterKeys.add(clusterKey);
    ranked.push({
      stop: representative,
      distance,
      routeCount: quickRouteCount(representative),
    });
  }

  ranked.sort((a, b) => {
    if (a.routeCount > 0 && b.routeCount === 0) return -1;
    if (a.routeCount === 0 && b.routeCount > 0) return 1;
    return a.distance - b.distance;
  });

  return ranked.slice(0, limit).map((item) => item.stop);
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
