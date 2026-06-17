import type { BusRoute, BusStop } from "@/types/bus";
import {
  getAllRoutes,
  getAllStops,
  getDisplayRouteNumber,
  getRoute,
  getStopServingRoutes,
  type StopServingRoute,
} from "@/services/busData";
import { hasValidCoords } from "@/services/busDataNormalize";
import { findLegSpanOnRoute, isPlanTopologicallyValid } from "@/services/routeValidation";
import { getEquivalentStopIds } from "@/services/stopClusters";
import {
  filterTransferPlansWithDirectBuses,
  getDirectRouteNumbers,
  planQualityScore,
  sortPlansByQuality,
  stopsAreTransferEquivalent,
} from "@/services/tripPlanUtils";

const TRANSFER_WEIGHT = 55;

type Edge = {
  to: number;
  route: string | null;
  weight: number;
};

export type TripLeg = {
  routeNumber: string;
  displayNumber: string;
  routeName: string;
  color: string;
  fromStopId: number;
  toStopId: number;
  stopCount: number;
};

export type TripPlan = {
  legs: TripLeg[];
  transferCount: number;
  totalStops: number;
  totalCost: number;
};

let graphCache: Map<number, Edge[]> | null = null;

export function invalidateRoutePlannerCache() {
  graphCache = null;
}

function buildTransferClustersFromStops(stops: BusStop[], thresholdKm = 0.12): number[][] {
  const visited = new Set<number>();
  const clusters: number[][] = [];

  for (const stop of stops) {
    if (visited.has(stop.id)) continue;
    if (!hasValidCoords(stop)) continue;
    const cluster = [stop.id];
    visited.add(stop.id);

    for (const other of stops) {
      if (visited.has(other.id)) continue;
      if (!hasValidCoords(other)) continue;
      const toRad = (value: number) => (value * Math.PI) / 180;
      const dLat = toRad(other.lat - stop.lat);
      const dLon = toRad(other.lng - stop.lng);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(stop.lat)) * Math.cos(toRad(other.lat)) * Math.sin(dLon / 2) ** 2;
      const km = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (km <= thresholdKm) {
        cluster.push(other.id);
        visited.add(other.id);
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

function buildGraph(): Map<number, Edge[]> {
  if (graphCache) return graphCache;

  const adj = new Map<number, Edge[]>();
  const addEdge = (from: number, to: number, route: string | null, weight: number) => {
    if (from === to) return;
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push({ to, route, weight });
  };

  const routes = getAllRoutes();
  const stops = getAllStops();

  for (const route of routes) {
    for (let i = 0; i < route.stops.length - 1; i++) {
      const a = route.stops[i].stop_id;
      const b = route.stops[i + 1].stop_id;
      addEdge(a, b, route.route_number, 1);
    }
  }

  for (const cluster of buildTransferClustersFromStops(stops)) {
    if (cluster.length < 2) continue;
    for (const from of cluster) {
      for (const to of cluster) {
        addEdge(from, to, null, TRANSFER_WEIGHT);
      }
    }
  }

  graphCache = adj;
  return adj;
}

function makeLeg(
  routeKey: string,
  fromStopId: number,
  toStopId: number,
  stopCount: number
): TripLeg {
  const route = getRoute(routeKey);
  return {
    routeNumber: routeKey,
    displayNumber: route ? getDisplayRouteNumber(route) : routeKey,
    routeName: route?.name ?? "",
    color: route?.color ?? "#38bdf8",
    fromStopId,
    toStopId,
    stopCount,
  };
}

function findDirectRoutePlans(fromStopId: number, toStopId: number): TripPlan[] {
  const fromIds = getEquivalentStopIds(fromStopId);
  const toIds = getEquivalentStopIds(toStopId);
  const plans: TripPlan[] = [];
  const seen = new Set<string>();

  for (const route of getAllRoutes()) {
    for (const fromId of fromIds) {
      for (const toId of toIds) {
        if (fromId === toId) continue;

        const span = findLegSpanOnRoute(route, fromId, toId);
        if (!span || span.stopCount === 0) continue;

        const actualFrom = route.stops[span.fromIdx].stop_id;
        const actualTo = route.stops[span.toIdx].stop_id;
        const signature = `${route.route_number}:${actualFrom}->${actualTo}`;

        if (seen.has(signature)) continue;
        seen.add(signature);

        plans.push({
          legs: [makeLeg(route.route_number, actualFrom, actualTo, span.stopCount)],
          transferCount: 0,
          totalStops: span.stopCount,
          totalCost: span.stopCount,
        });
      }
    }
  }

  return plans.sort((a, b) => a.totalCost - b.totalCost);
}

function findOneTransferPlans(fromStopId: number, toStopId: number): TripPlan[] {
  const fromIds = getEquivalentStopIds(fromStopId);
  const toIds = getEquivalentStopIds(toStopId);
  const routes = getAllRoutes();
  const plans: TripPlan[] = [];
  const seen = new Set<string>();

  for (const routeA of routes) {
    for (const fromId of fromIds) {
      for (const transferStop of routeA.stops) {
        const spanA = findLegSpanOnRoute(routeA, fromId, transferStop.stop_id);
        if (!spanA || spanA.stopCount === 0) continue;
        if (routeA.stops[spanA.toIdx]?.stop_id !== transferStop.stop_id) continue;

        const legAFrom = routeA.stops[spanA.fromIdx].stop_id;
        const legATo = routeA.stops[spanA.toIdx].stop_id;

        for (const routeB of routes) {
          if (routeB.route_number === routeA.route_number) continue;

          for (const boardStop of routeB.stops) {
            if (!stopsAreTransferEquivalent(legATo, boardStop.stop_id)) continue;

            for (const toId of toIds) {
              const spanB = findLegSpanOnRoute(routeB, boardStop.stop_id, toId);
              if (!spanB || spanB.stopCount === 0) continue;

              const legBFrom = routeB.stops[spanB.fromIdx].stop_id;
              const legBTo = routeB.stops[spanB.toIdx].stop_id;
              const signature = `${routeA.route_number}:${legAFrom}->${legATo}|${routeB.route_number}:${legBFrom}->${legBTo}`;
              if (seen.has(signature)) continue;
              seen.add(signature);

              plans.push(
                simplifyTripPlan({
                  legs: [
                    makeLeg(routeA.route_number, legAFrom, legATo, spanA.stopCount),
                    makeLeg(routeB.route_number, legBFrom, legBTo, spanB.stopCount),
                  ],
                  transferCount: 1,
                  totalStops: spanA.stopCount + spanB.stopCount,
                  totalCost: spanA.stopCount + spanB.stopCount + TRANSFER_WEIGHT,
                })
              );
            }
          }
        }
      }
    }
  }

  return sortPlansByQuality(plans);
}

function isAcceptablePlan(plan: TripPlan): boolean {
  if (plan.legs.length <= 2) return true;
  const microLegs = plan.legs.filter((leg) => leg.stopCount <= 1).length;
  return microLegs <= 1 || microLegs / plan.legs.length < 0.45;
}

type Prev = {
  stopId: number;
  route: string | null;
};

function dijkstra(
  fromIds: Set<number>,
  toIds: Set<number>,
  blockedEdges?: Set<string>
): { cost: number; path: Array<{ stopId: number; route: string | null }> } | null {
  const adj = buildGraph();
  const dist = new Map<number, number>();
  const prev = new Map<number, Prev>();
  const queue: Array<{ stopId: number; cost: number }> = [];

  for (const fromId of fromIds) {
    dist.set(fromId, 0);
    queue.push({ stopId: fromId, cost: 0 });
  }

  let targetStopId: number | null = null;

  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift()!;
    if (current.cost > (dist.get(current.stopId) ?? Infinity)) continue;

    if (toIds.has(current.stopId)) {
      targetStopId = current.stopId;
      break;
    }

    for (const edge of adj.get(current.stopId) ?? []) {
      const edgeKey = `${current.stopId}->${edge.to}:${edge.route ?? "walk"}`;
      if (blockedEdges?.has(edgeKey)) continue;

      const nextCost = current.cost + edge.weight;
      if (nextCost < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, nextCost);
        prev.set(edge.to, { stopId: current.stopId, route: edge.route });
        queue.push({ stopId: edge.to, cost: nextCost });
      }
    }
  }

  if (targetStopId === null || !dist.has(targetStopId)) return null;

  const path: Array<{ stopId: number; route: string | null }> = [];
  let cursor: number | undefined = targetStopId;

  while (cursor !== undefined && !fromIds.has(cursor)) {
    const step = prev.get(cursor);
    if (!step) return null;
    path.unshift({ stopId: cursor, route: step.route });
    cursor = step.stopId;
  }

  if (cursor === undefined) return null;
  path.unshift({ stopId: cursor, route: null });

  return { cost: dist.get(targetStopId)!, path };
}

function mergeConsecutiveSameRouteLegs(legs: TripLeg[]): TripLeg[] {
  if (legs.length <= 1) return legs;

  const merged: TripLeg[] = [];
  let current = { ...legs[0] };

  for (let i = 1; i < legs.length; i++) {
    const next = legs[i];
    if (current.routeNumber !== next.routeNumber) {
      merged.push(current);
      current = { ...next };
      continue;
    }

    const route = getRoute(current.routeNumber);
    if (!route) {
      merged.push(current);
      current = { ...next };
      continue;
    }

    const spanA = findLegSpanOnRoute(route, current.fromStopId, current.toStopId);
    const spanB = findLegSpanOnRoute(route, next.fromStopId, next.toStopId);
    const canMerge =
      spanA != null &&
      spanB != null &&
      spanB.fromIdx <= spanA.toIdx + 1 &&
      spanB.toIdx >= spanA.toIdx;

    if (canMerge) {
      current = {
        ...current,
        toStopId: next.toStopId,
        stopCount: current.stopCount + next.stopCount,
      };
    } else {
      merged.push(current);
      current = { ...next };
    }
  }

  merged.push(current);
  return merged;
}

function simplifyTripLegs(legs: TripLeg[]): TripLeg[] {
  return mergeConsecutiveSameRouteLegs(legs).filter((leg) => leg.stopCount > 0);
}

function simplifyTripPlan(plan: TripPlan): TripPlan {
  const legs = simplifyTripLegs(plan.legs);
  return {
    legs,
    transferCount: Math.max(0, legs.length - 1),
    totalStops: legs.reduce((sum, leg) => sum + leg.stopCount, 0),
    totalCost: plan.totalCost,
  };
}

function pathToLegs(path: Array<{ stopId: number; route: string | null }>): TripLeg[] {
  const legs: TripLeg[] = [];
  let currentRoute: string | null = null;
  let legStart = path[0].stopId;
  let legStops = 0;

  for (let i = 1; i < path.length; i++) {
    const step = path[i];
    if (step.route === null) {
      if (currentRoute) {
        legs.push(makeLeg(currentRoute, legStart, path[i - 1].stopId, legStops));
        currentRoute = null;
        legStops = 0;
      }
      legStart = step.stopId;
      continue;
    }

    if (currentRoute !== step.route) {
      if (currentRoute) {
        legs.push(makeLeg(currentRoute, legStart, path[i - 1].stopId, legStops));
      }
      currentRoute = step.route;
      legStart = path[i - 1].stopId;
      legStops = 0;
    }

    legStops += 1;
  }

  if (currentRoute) {
    legs.push(makeLeg(currentRoute, legStart, path[path.length - 1].stopId, legStops));
  }

  return simplifyTripLegs(legs);
}

function planSignature(plan: TripPlan): string {
  return plan.legs.map((leg) => `${leg.displayNumber}@${leg.routeNumber}`).join(">");
}

function findTransferRoutePlans(
  fromStopId: number,
  toStopId: number,
  limit: number
): TripPlan[] {
  const fromIds = getEquivalentStopIds(fromStopId);
  const toIds = getEquivalentStopIds(toStopId);
  const results: TripPlan[] = [];
  const blocked = new Set<string>();
  let attempts = 0;
  const maxAttempts = Math.max(limit * 4, 12);

  while (results.length < limit && attempts < maxAttempts) {
    attempts += 1;
    const plan = dijkstra(fromIds, toIds, blocked);
    if (!plan) break;

    const legs = pathToLegs(plan.path);
    if (legs.length <= 1) break;

    const trip = simplifyTripPlan({
      legs,
      transferCount: legs.length - 1,
      totalStops: legs.reduce((sum, leg) => sum + leg.stopCount, 0),
      totalCost: plan.cost,
    });

    const signature = planSignature(trip);
    if (results.some((item) => planSignature(item) === signature)) {
      const firstLeg = trip.legs[0];
      if (!firstLeg) break;
      blocked.add(`${firstLeg.fromStopId}->${firstLeg.toStopId}:${firstLeg.routeNumber}`);
      continue;
    }

    results.push(trip);

    for (const leg of trip.legs) {
      blocked.add(`${leg.fromStopId}->${leg.toStopId}:${leg.routeNumber}`);
    }
  }

  return results;
}

export function findTripPlans(fromStopId: number, toStopId: number, limit = 15): TripPlan[] {
  if (fromStopId === toStopId) return [];

  const directPlans = findDirectRoutePlans(fromStopId, toStopId);
  const oneTransferPlans = findOneTransferPlans(fromStopId, toStopId);
  const transferPlans = findTransferRoutePlans(
    fromStopId,
    toStopId,
    Math.max(5, limit - directPlans.length)
  );

  const directRouteNumbers = getDirectRouteNumbers(directPlans);
  const merged: TripPlan[] = [];
  const seen = new Set<string>();
  const candidates = filterTransferPlansWithDirectBuses(
    sortPlansByQuality([...directPlans, ...oneTransferPlans, ...transferPlans]),
    directRouteNumbers
  );
  const acceptable = candidates.filter((plan) => isAcceptablePlan(plan));
  const pool = acceptable.length > 0 ? acceptable : candidates;

  for (const plan of pool) {
    if (!isPlanTopologicallyValid(plan)) continue;

    const signature = planSignature(plan);
    if (seen.has(signature)) continue;
    seen.add(signature);
    merged.push(simplifyTripPlan(plan));
    if (merged.length >= limit) break;
  }

  return merged;
}

export type ReachableBoardingRoute = StopServingRoute & {
  isDirect: boolean;
  transferCount: number;
};

export function getReachableBoardingRoutes(
  fromStop: BusStop,
  toStopId: number
): ReachableBoardingRoute[] {
  const plans = findTripPlans(fromStop.id, toStopId);
  const bestByRoute = new Map<string, TripPlan>();

  for (const plan of plans) {
    const routeNumber = plan.legs[0]?.routeNumber;
    if (!routeNumber) continue;

    const previous = bestByRoute.get(routeNumber);
    if (!previous || planQualityScore(plan) < planQualityScore(previous)) {
      bestByRoute.set(routeNumber, plan);
    }
  }

  return getStopServingRoutes(fromStop)
    .filter((route) => bestByRoute.has(route.routeNumber))
    .map((route) => {
      const plan = bestByRoute.get(route.routeNumber)!;
      return {
        ...route,
        isDirect: plan.transferCount === 0,
        transferCount: plan.transferCount,
      };
    })
    .sort((a, b) => {
      if (a.isDirect !== b.isDirect) return a.isDirect ? -1 : 1;
      if (a.transferCount !== b.transferCount) return a.transferCount - b.transferCount;
      return a.displayNumber.localeCompare(b.displayNumber, undefined, { numeric: true });
    });
}
