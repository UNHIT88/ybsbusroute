import { createRequire } from "module";
import { pathToFileURL } from "url";

const require = createRequire(import.meta.url);

// Minimal shim for @/ path alias used by planner modules
const moduleAlias = (specifier, parent) => {
  if (specifier.startsWith("@/")) {
    return pathToFileURL(
      new URL(specifier.replace("@/", "../"), import.meta.url).pathname
    ).href;
  }
  return specifier;
};

// Load bundled data directly and run planner logic via dynamic import after patching
const routes = require("../assets/data/bus_routes_list.json");
const stops = require("../assets/data/bus_stops_list.json");

const fromId = 1209994; // နတ်စင်
const toId = 6044318; // စံပြဈေး

function normalizeStop(raw) {
  const lat = raw.lat ?? raw.location?.lat ?? 0;
  const lng = raw.lng ?? raw.location?.lng ?? 0;
  return { ...raw, lat, lng };
}

const STOPS = stops.map(normalizeStop);
const ROUTES = routes;

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hasValidCoords(s) {
  return s.lat !== 0 || s.lng !== 0;
}

function buildClusters() {
  const visited = new Set();
  const clusters = [];
  for (const stop of STOPS) {
    if (visited.has(stop.id) || !hasValidCoords(stop)) continue;
    const cluster = [stop.id];
    visited.add(stop.id);
    for (const other of STOPS) {
      if (visited.has(other.id) || !hasValidCoords(other)) continue;
      if (haversineKm(stop.lat, stop.lng, other.lat, other.lng) <= 0.12) {
        cluster.push(other.id);
        visited.add(other.id);
      }
    }
    clusters.push(cluster);
  }
  const map = new Map();
  for (const c of clusters) for (const id of c) map.set(id, c);
  return map;
}

const clusterMap = buildClusters();
const equiv = (id) => new Set(clusterMap.get(id) ?? [id]);

function findSpan(route, fromStopId, toStopId) {
  const fromIds = equiv(fromStopId);
  const toIds = equiv(toStopId);
  let best = null;
  for (let fi = 0; fi < route.stops.length; fi++) {
    if (!fromIds.has(route.stops[fi].stop_id)) continue;
    for (let ti = fi + 1; ti < route.stops.length; ti++) {
      if (!toIds.has(route.stops[ti].stop_id)) continue;
      const stopCount = ti - fi;
      if (!best || stopCount < best.stopCount) best = { fromIdx: fi, toIdx: ti, stopCount };
    }
  }
  return best;
}

let direct = 0;
for (const route of ROUTES) {
  const span = findSpan(route, fromId, toId);
  if (span) {
    direct++;
    console.log(`direct route ${route.route_number}: ${span.stopCount} stops`);
  }
}
console.log("total direct:", direct);
