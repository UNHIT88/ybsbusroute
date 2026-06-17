import type {
  BusRoute,
  BusStop,
  CrowdsourcedRouteRecord,
  CrowdsourcedStopRecord,
  RouteStop,
} from "@/types/bus";
import { CUSTOM_ROUTE_PREFIX, CUSTOM_STOP_ID_BASE } from "@/types/bus";
import AsyncStorage from "@react-native-async-storage/async-storage";

const ROUTES_STORAGE_KEY = "ybs-crowdsourced-routes";
const STOP_COUNTER_KEY = "ybs-custom-stop-counter";

const CUSTOM_ROUTE_COLORS = [
  "#a78bfa",
  "#f472b6",
  "#34d399",
  "#fb923c",
  "#38bdf8",
  "#facc15",
];

function parseDisplayNumber(label: string): string {
  return label.replace(/^ybs\s*/i, "").trim() || label.trim();
}

async function getNextStopIds(count: number): Promise<number[]> {
  const raw = await AsyncStorage.getItem(STOP_COUNTER_KEY);
  let counter = raw ? Number(raw) : 0;
  const ids: number[] = [];

  for (let i = 0; i < count; i += 1) {
    counter += 1;
    ids.push(CUSTOM_STOP_ID_BASE + counter);
  }

  await AsyncStorage.setItem(STOP_COUNTER_KEY, String(counter));
  return ids;
}

export async function loadCustomRouteRecords(): Promise<CrowdsourcedRouteRecord[]> {
  const raw = await AsyncStorage.getItem(ROUTES_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as CrowdsourcedRouteRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveCustomRouteRecord(
  input: Omit<CrowdsourcedRouteRecord, "id" | "createdAt" | "updatedAt" | "stops"> & {
    stops: Array<Omit<CrowdsourcedStopRecord, "stopId">>;
  }
): Promise<CrowdsourcedRouteRecord> {
  const existing = await loadCustomRouteRecords();
  const stopIds = await getNextStopIds(input.stops.length);
  const now = new Date().toISOString();

  const record: CrowdsourcedRouteRecord = {
    id: `${Date.now()}`,
    busNumberLabel: input.busNumberLabel.trim(),
    createdAt: now,
    updatedAt: now,
    stops: input.stops.map((stop, index) => ({
      ...stop,
      stopId: stopIds[index],
    })),
  };

  await AsyncStorage.setItem(ROUTES_STORAGE_KEY, JSON.stringify([...existing, record]));
  return record;
}

export function isCustomRoute(route: BusRoute): boolean {
  return route.route_number.startsWith(CUSTOM_ROUTE_PREFIX);
}

export function crowdRecordsToBusData(records: CrowdsourcedRouteRecord[]): {
  routes: BusRoute[];
  stops: BusStop[];
} {
  const routes: BusRoute[] = [];
  const stopMap = new Map<number, BusStop>();

  records.forEach((record, recordIndex) => {
    if (record.stops.length === 0) return;

    const routeKey = `${CUSTOM_ROUTE_PREFIX}${record.id}`;
    const displayNumber = parseDisplayNumber(record.busNumberLabel);
    const color = CUSTOM_ROUTE_COLORS[recordIndex % CUSTOM_ROUTE_COLORS.length];

    const routeStops: RouteStop[] = record.stops.map((stop, index) => ({
      sequence: index + 1,
      stop_id: stop.stopId,
      name_en: stop.name,
      name_mm: stop.name,
      road_en: "Community mapped",
      road_mm: "အသိုင်းအဝိုင်းမှ မှတ်သား",
      township_en: "Yangon",
      township_mm: "ရန်ကုန်",
      lat: stop.lat,
      lng: stop.lng,
    }));

    const first = record.stops[0];
    const last = record.stops[record.stops.length - 1];
    const routeName =
      record.stops.length > 1
        ? `${first.name} ↔ ${last.name}`
        : `${displayNumber} route`;

    routes.push({
      route_number: routeKey,
      display_number: displayNumber,
      name: routeName,
      color,
      operator: "Community",
      description: "Crowdsourced route · local contribution",
      stop_count: routeStops.length,
      stops: routeStops,
    });

    for (const stop of record.stops) {
      if (stopMap.has(stop.stopId)) {
        const existing = stopMap.get(stop.stopId)!;
        if (!existing.routes.includes(routeKey)) {
          existing.routes.push(routeKey);
        }
        continue;
      }

      stopMap.set(stop.stopId, {
        id: stop.stopId,
        name_en: stop.name,
        name_mm: stop.name,
        road_en: "Community mapped",
        road_mm: "အသိုင်းအဝိုင်းမှ မှတ်သား",
        township_en: "Yangon",
        township_mm: "ရန်ကုန်",
        lat: stop.lat,
        lng: stop.lng,
        routes: [routeKey],
      });
    }
  });

  return { routes, stops: [...stopMap.values()] };
}

export function getCustomRouteCount(): Promise<number> {
  return loadCustomRouteRecords().then((records) => records.length);
}
