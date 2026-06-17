import { useCallback, useEffect, useState } from "react";
import {
  RouteDetail,
  RouteSummary,
  StopEntry,
  TripPlan,
  ybsApi,
} from "../api/ybsClient";

export function useRoutes() {
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ybsApi
      .getRoutes()
      .then((data) => setRoutes(data.routes))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return { routes, loading, error };
}

export function useRouteDetail(routeId: string | null) {
  const [route, setRoute] = useState<RouteDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!routeId) return;

    setLoading(true);
    setError(null);
    ybsApi
      .getRoute(routeId)
      .then(setRoute)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [routeId]);

  return { route, loading, error };
}

export function useStopSearch(query: string) {
  const [stops, setStops] = useState<StopEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.trim().length < 1) {
      setStops([]);
      return;
    }

    const timer = setTimeout(() => {
      setLoading(true);
      ybsApi
        .searchStops(query.trim())
        .then((data) => setStops(data.stops))
        .catch(() => setStops([]))
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  return { stops, loading };
}

export function useTripPlanner() {
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planTrip = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setError(null);
    setPlan(null);

    try {
      const data = await ybsApi.planTrip(from, to);
      setPlan(data.plans[0] ?? null);
      if (!data.plans.length) {
        setError("No route found between these stops.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Planning failed");
    } finally {
      setLoading(false);
    }
  }, []);

  return { plan, loading, error, planTrip };
}
