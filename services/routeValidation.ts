import type { BusRoute } from "@/types/bus";
import { getRoute } from "@/services/busData";
import { fetchLegRoadDistanceMeters } from "@/services/osrmApi";
import type { TripLeg, TripPlan } from "@/services/routePlanner";
import { getEquivalentStopIds } from "@/services/stopClusters";

const MAX_SINGLE_HOP_KM = 12;
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
  const fromIds = getEquivalentStopIds(fromStopId);
  const toIds = getEquivalentStopIds(toStopId);
  const stopIds = route.stops.map((stop) => stop.stop_id);

  let best: { fromIdx: number; toIdx: number; stopCount: number } | null = null;

  for (let fromIdx = 0; fromIdx < stopIds.length; fromIdx++) {
    if (!fromIds.has(stopIds[fromIdx])) continue;

    for (let toIdx = fromIdx + 1; toIdx < stopIds.length; toIdx++) {
      if (!toIds.has(stopIds[toIdx])) continue;

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

  const fromId = route.stops[span.fromIdx]?.stop_id;
  const toId = route.stops[span.toIdx]?.stop_id;
  if (fromId == null || toId == null) return false;

  return (
    span.fromIdx < span.toIdx &&
    span.stopCount === leg.stopCount &&
    getEquivalentStopIds(leg.fromStopId).has(fromId) &&
    getEquivalentStopIds(leg.toStopId).has(toId)
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

  for (let i = 0; i < stops.length - 1; i++) {
    const hop = haversineKm(
      stops[i].lat,
      stops[i].lng,
      stops[i + 1].lat,
      stops[i + 1].lng
    );
    if (hop > MAX_SINGLE_HOP_KM) return false;
  }

  const airKm = legAirDistanceKm(leg);
  if (airKm <= 0.2) return true;

  const roadMeters = await fetchLegRoadDistanceMeters(stops);
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
  const checked: Array<{ plan: TripPlan; roadScore: number; coherent: boolean }> = [];

  for (const plan of valid) {
    const coherentChecks = await Promise.all(
      plan.legs.map((leg) => legLooksGeographicallyCoherent(leg))
    );
    const coherent = coherentChecks.every(Boolean);
    const roadScore = coherent ? await scorePlanWithRoadDistance(plan) : Number.POSITIVE_INFINITY;
    checked.push({ plan, roadScore, coherent });
  }

  return checked
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
}
