import stopsList from "@/assets/data/bus_stops_list.json";
import type { BusStop } from "@/types/bus";

const STOPS = stopsList as BusStop[];

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

function buildTransferClusters(stops: BusStop[], thresholdKm = 0.12): number[][] {
  const visited = new Set<number>();
  const clusters: number[][] = [];

  for (const stop of stops) {
    if (visited.has(stop.id)) continue;

    const cluster = [stop.id];
    visited.add(stop.id);

    for (const other of stops) {
      if (visited.has(other.id)) continue;
      if (haversineKm(stop.lat, stop.lng, other.lat, other.lng) <= thresholdKm) {
        cluster.push(other.id);
        visited.add(other.id);
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

const clusterByStopId = new Map<number, number[]>();
for (const cluster of buildTransferClusters(STOPS)) {
  for (const stopId of cluster) {
    clusterByStopId.set(stopId, cluster);
  }
}

export function getEquivalentStopIds(stopId: number): Set<number> {
  return new Set(clusterByStopId.get(stopId) ?? [stopId]);
}
