export type BusStop = {
  id: number;
  name_en: string;
  name_mm: string;
  road_en: string;
  road_mm: string;
  township_en: string;
  township_mm: string;
  lat: number;
  lng: number;
  routes: string[];
};

export type RouteStop = {
  sequence: number;
  stop_id: number;
  name_en: string;
  name_mm: string;
  road_en: string;
  road_mm: string;
  township_en: string;
  township_mm: string;
  lat: number;
  lng: number;
};

export type RouteDirection = "up" | "down";

export type BusRoute = {
  route_number: string;
  display_number?: string;
  name: string;
  color: string;
  operator?: string | null;
  ybr_id?: string | null;
  description?: string;
  stop_count: number;
  stops: RouteStop[];
};

export type RouteDirectionView = {
  direction: RouteDirection;
  fromLabel: string;
  toLabel: string;
  stops: RouteStop[];
};

export type Metadata = {
  source: string;
  city: string;
  country: string;
  agency: string;
  generated_at: string;
  ybr_fetched_at?: string;
  total_routes: number;
  total_stops: number;
  unique_bus_numbers?: number;
};

export type LatLng = {
  latitude: number;
  longitude: number;
};

export type CrowdsourcedStopRecord = {
  localId: string;
  name: string;
  lat: number;
  lng: number;
  capturedAt: string;
  stopId: number;
};

export type CrowdsourcedRouteRecord = {
  id: string;
  busNumberLabel: string;
  createdAt: string;
  updatedAt: string;
  stops: CrowdsourcedStopRecord[];
};

export const CUSTOM_ROUTE_PREFIX = "crowd:";
export const CUSTOM_STOP_ID_BASE = 9_000_000;
