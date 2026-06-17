import type { BusRoute } from "@/types/bus";
import { getRoute, getStop, routeStopMatchesBusStop } from "@/services/busData";
import { fetchLegRoadDistanceMeters } from "@/services/osrmApi";
import type { TripLeg, TripPlan } from "@/services/routePlanner";
import { getEquivalentStopIds } from "@/services/stopClusters";
import { sortPlansByQuality } from "@/services/tripPlanUtils";
import { hasValidCoords } from "@/services/busDataNormalize";

const MAX_SINGLE_HOP_KM = 30;
const MAX_ROAD_TO_AIR_RATIO = 5.5;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function findLegSpanOnRoute(
  route: BusRoute,
  fromStopId: number,
  toStopId: number
): { fromIdx: number; toIdx: number; stopCount: number } | null {
  const fromStop = getStop(fromStopId);
  const toStop = getStop(toStopId);
  const fromIds = getEquivalentStopIds(fromStopId);
  const toIds = getEquivalentStopIds(toStopId);

  const matchesFrom = (routeStop: BusRoute["stops"][number], index: number) =>
    fromIds.has(routeStop.stop_id) ||
    (fromStop != null && routeStopMatchesBusStop(fromStop, routeStop));

  const matchesTo = (routeStop: BusRoute["stops"][number]) =>
    toIds.has(routeStop.stop_id) ||
    (toStop != null && routeStopMatchesBusStop(toStop, routeStop));

  let best: { fromIdx: number; toIdx: number; stopCount: number } | null = null;

  for (let fromIdx = 0; fromIdx < route.stops.length; fromIdx++) {
    if (!matchesFrom(route.stops[fromIdx], fromIdx)) continue;

    for (let toIdx = fromIdx + 1; toIdx < route.stops.length; toIdx++) {
      if (!matchesTo(route.stops[toIdx])) continue;

      const stopCount = toIdx - fromIdx;
      if (!best || stopCount < best.stopCount) {
        best = { fromIdx, toIdx, stopCount };
      }
    }
  }

  return best;
}

export function isLegValidOnRoute(leg: TripLeg): boolean {
  const route = getRoute(leg.routeNumber);
  if (!route) return false;

  const span = findLegSpanOnRoute(route, leg.fromStopId, leg.toStopId);
  if (!span) return false;

  const fromRouteStop = route.stops[span.fromIdx];
  const toRouteStop = route.stops[span.toIdx];
  if (fromRouteStop == null || toRouteStop == null) return false;

  const fromStop = getStop(leg.fromStopId);
  const toStop = getStop(leg.toStopId);
  const fromMatches =
    getEquivalentStopIds(leg.fromStopId).has(fromRouteStop.stop_id) ||
    (fromStop != null && routeStopMatchesBusStop(fromStop, fromRouteStop));
  const toMatches =
    getEquivalentStopIds(leg.toStopId).has(toRouteStop.stop_id) ||
    (toStop != null && routeStopMatchesBusStop(toStop, toRouteStop));

  return (
    span.fromIdx < span.toIdx &&
    span.stopCount === leg.stopCount &&
    fromMatches &&
    toMatches
  );
}

export function isPlanTopologicallyValid(plan: TripPlan): boolean {
  return plan.legs.every((leg) => isLegValidOnRoute(leg));
}

function legStops(leg: TripLeg): Array<{ lat: number; lng: number }> {
  const route = getRoute(leg.routeNumber);
  if (!route) return [];

  const span = findLegSpanOnRoute(route, leg.fromStopId, leg.toStopId);
  if (!span) return [];

  return route.stops.slice(span.fromIdx, span.toIdx + 1).map((stop) => ({
    lat: stop.lat,
    lng: stop.lng,
  }));
}

function legAirDistanceKm(leg: TripLeg): number {
  const stops = legStops(leg);
  if (stops.length < 2) return 0;

  let total = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    total += haversineKm(stops[i].lat, stops[i].lng, stops[i + 1].lat, stops[i + 1].lng);
  }
  return total;
}

async function legLooksGeographicallyCoherent(leg: TripLeg): Promise<boolean> {
  const stops = legStops(leg);
  if (stops.length < 2) return true;

  const validStops = stops.filter((stop) => hasValidCoords(stop));
  if (validStops.length < 2) return true;

  for (let i = 0; i < validStops.length - 1; i++) {
    const hop = haversineKm(
      validStops[i].lat,
      validStops[i].lng,
      validStops[i + 1].lat,
      validStops[i + 1].lng
    );
    if (hop > MAX_SINGLE_HOP_KM) return false;
  }

  const airKm = validStops.reduce((total, stop, index) => {
    if (index === 0) return 0;
    return (
      total +
      haversineKm(
        validStops[index - 1].lat,
        validStops[index - 1].lng,
        stop.lat,
        stop.lng
      )
    );
  }, 0);

  if (airKm <= 0.2) return true;

  const roadMeters = await fetchLegRoadDistanceMeters(validStops);
  if (!Number.isFinite(roadMeters)) return true;

  const roadKm = roadMeters / 1000;
  return roadKm / airKm <= MAX_ROAD_TO_AIR_RATIO;
}

export async function scorePlanWithRoadDistance(plan: TripPlan): Promise<number> {
  let totalMeters = 0;

  for (const leg of plan.legs) {
    const stops = legStops(leg);
    if (stops.length < 2) continue;
    totalMeters += await fetchLegRoadDistanceMeters(stops);
  }

  return totalMeters;
}

export async function refineTripPlans(plans: TripPlan[]): Promise<TripPlan[]> {
  const valid = plans.filter((plan) => isPlanTopologicallyValid(plan));
  if (valid.length === 0) return [];

  const checked: Array<{ plan: TripPlan; roadScore: number; coherent: boolean }> = [];

  for (const plan of valid) {
    const coherentChecks = await Promise.all(
      plan.legs.map((leg) => legLooksGeographicallyCoherent(leg))
    );
    const coherent = coherentChecks.every(Boolean);
    const roadScore = coherent ? await scorePlanWithRoadDistance(plan) : Number.POSITIVE_INFINITY;
    checked.push({ plan, roadScore, coherent });
  }

  const ranked = checked
    .filter((item) => item.coherent)
    .sort((a, b) => {
      if (a.plan.transferCount !== b.plan.transferCount) {
        return a.plan.transferCount - b.plan.transferCount;
      }
      if (a.plan.totalStops !== b.plan.totalStops) {
        return a.plan.totalStops - b.plan.totalStops;
      }
      return a.roadScore - b.roadScore;
    })
    .map((item) => item.plan);

  return ranked.length > 0 ? ranked : valid;
}

/** Refine each boarding-bus plan independently so one direct route does not hide transfer options. */
export async function refineTripPlansPerBoardingBus(plans: TripPlan[]): Promise<TripPlan[]> {
  const refined: TripPlan[] = [];

  for (const plan of plans) {
    if (!isPlanTopologicallyValid(plan)) continue;

    const ranked = await refineTripPlans([plan]);
    refined.push(ranked[0] ?? plan);
  }

  return sortPlansByQuality(refined);
}
