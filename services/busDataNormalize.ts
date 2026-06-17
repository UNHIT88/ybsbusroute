import type { BusRoute, BusStop, RouteStop } from "@/types/bus";

type StopLike = {
  lat?: number;
  lng?: number;
  location?: { lat?: number; lng?: number };
};

export function readCoords(item: StopLike): { lat: number; lng: number } {
  const lat = item.lat ?? item.location?.lat ?? 0;
  const lng = item.lng ?? item.location?.lng ?? 0;
  return { lat, lng };
}

export function hasValidCoords(item: StopLike): boolean {
  const { lat, lng } = readCoords(item);
  return lat !== 0 || lng !== 0;
}

export function normalizeBusStop(raw: BusStop & StopLike): BusStop {
  const { lat, lng } = readCoords(raw);
  return {
    ...raw,
    lat,
    lng,
  };
}

export function normalizeRouteStop(raw: RouteStop & StopLike): RouteStop {
  const { lat, lng } = readCoords(raw);
  return {
    ...raw,
    lat,
    lng,
  };
}

export function normalizeBusRoute(raw: BusRoute): BusRoute {
  return {
    ...raw,
    stops: raw.stops.map((stop) => normalizeRouteStop(stop as RouteStop & StopLike)),
  };
}

export function normalizeBusStops(rawStops: BusStop[]): BusStop[] {
  return rawStops.map((stop) => normalizeBusStop(stop as BusStop & StopLike));
}

export function normalizeBusRoutes(rawRoutes: BusRoute[]): BusRoute[] {
  return rawRoutes.map(normalizeBusRoute);
}
