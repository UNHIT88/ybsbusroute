import type { TripLeg, TripPlan } from "@/services/routePlanner";

export type ApiLocation = {
  lat: number;
  lng: number;
};

export type ApiStop = {
  id: number;
  name_en: string;
  name_mm: string;
  road_en: string;
  road_mm: string;
  township_en: string;
  township_mm: string;
  location: ApiLocation;
  routes: string[];
};

export type ApiRouteStop = {
  sequence: number;
  stop_id: number;
  name_en: string;
  name_mm: string;
  road_en: string;
  road_mm: string;
  township_en: string;
  township_mm: string;
  location: ApiLocation;
};

export type ApiRouteSummary = {
  id: string;
  route_number: string;
  display_number: string;
  name: string;
  color: string;
  operator?: string | null;
  stop_count: number;
};

export type ApiRouteDetail = ApiRouteSummary & {
  description?: string;
  stops: ApiRouteStop[];
};

export type ApiRoutesResponse = {
  total: number;
  routes: ApiRouteSummary[];
};

export type ApiStopsResponse = {
  total: number;
  stops: ApiStop[];
};

export type ApiPlanLeg = {
  route_number: string;
  display_number: string;
  route_name: string;
  color: string;
  from_stop_id: number;
  to_stop_id: number;
  stop_count: number;
};

export type ApiPlanResponse = {
  from: number;
  to: number;
  plans: Array<{
    legs: ApiPlanLeg[];
    transfer_count: number;
    total_stops: number;
  }>;
};

export type RemoteDataset = {
  routes: import("@/types/bus").BusRoute[];
  stops: import("@/types/bus").BusStop[];
  source: string;
};

export type ApiTripPlan = TripPlan;
