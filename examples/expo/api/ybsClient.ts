/**
 * YBS API client for React Native Expo.
 *
 * Set EXPO_PUBLIC_YBS_API_URL in .env:
 *   - Local: http://localhost:8000
 *   - Android emulator: http://10.0.2.2:8000
 *   - Physical device: http://192.168.x.x:8000 (your computer IP)
 *   - Production: https://your-app.onrender.com
 */

const API_BASE =
  process.env.EXPO_PUBLIC_YBS_API_URL ?? "http://localhost:8000";

export type RouteSummary = {
  id: string;
  number: string;
  prefix: string | null;
  color: string | null;
  url: string;
  summary: string;
  major_stops: string[];
  origin: string | null;
  destination: string | null;
  stop_count: number;
};

export type RouteStop = {
  sequence: number;
  name: string;
  type: "start" | "end" | null;
  location?: { lat: number; lng: number };
  road?: string;
  township?: string;
};

export type RouteDetail = RouteSummary & {
  stops: RouteStop[];
};

export type StopEntry = {
  name: string;
  routes: Array<{
    route_id: string;
    route_number: string;
    prefix: string | null;
    sequence: number;
  }>;
  location?: { lat: number; lng: number };
};

export type PlanSegment = {
  route_id: string;
  route_number: string;
  prefix: string | null;
  from_stop: string;
  to_stop: string;
  stop_count: number;
  stops: string[];
  is_transfer: boolean;
};

export type TripPlan = {
  type: "direct" | "transfer";
  transfer_count: number;
  total_stops: number;
  segments: PlanSegment[];
};

async function request<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, API_BASE);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
    });
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail ?? `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const ybsApi = {
  getRoutes: () =>
    request<{ routes: RouteSummary[]; count: number }>("/api/routes"),

  getRoute: (id: string) => request<RouteDetail>(`/api/routes/${id}`),

  searchStops: (q: string, limit = 20) =>
    request<{ stops: StopEntry[]; count: number }>("/api/stops", {
      q,
      limit: String(limit),
    }),

  search: (q: string) =>
    request<{ routes: RouteSummary[]; stops: StopEntry[] }>("/api/search", {
      q,
    }),

  planTrip: (from: string, to: string, maxTransfers = "2") =>
    request<{ plans: TripPlan[]; from: string; to: string }>("/api/plan", {
      from,
      to,
      max_transfers: maxTransfers,
    }),
};
