import { getNearestStop } from "@/services/busData";
import {
  formatDistanceMeters,
  haversineMeters,
  requestForegroundLocation,
} from "@/services/location";
import type { BusStop } from "@/types/bus";
import { useCallback, useState } from "react";

type Coords = { lat: number; lng: number };

export function useCurrentLocationStop(radiusKm = 1.5) {
  const [stop, setStop] = useState<BusStop | null>(null);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clear = useCallback(() => {
    setStop(null);
    setDistanceM(null);
    setCoords(null);
    setPermissionDenied(false);
    setError(null);
  }, []);

  const detect = useCallback(async (): Promise<BusStop | null> => {
    setDetecting(true);
    setPermissionDenied(false);
    setError(null);

    try {
      const location = await requestForegroundLocation();
      const { latitude, longitude } = location.coords;
      setCoords({ lat: latitude, lng: longitude });

      const nearest = getNearestStop(latitude, longitude, radiusKm);
      if (!nearest) {
        setError("no-nearby-stop");
        setStop(null);
        setDistanceM(null);
        return null;
      }

      const dist = haversineMeters(latitude, longitude, nearest.lat, nearest.lng);
      setStop(nearest);
      setDistanceM(dist);
      return nearest;
    } catch (err) {
      const message = err instanceof Error ? err.message : "location-unavailable";
      if (message === "location-permission-denied") {
        setPermissionDenied(true);
      }
      setError(message);
      setStop(null);
      setDistanceM(null);
      return null;
    } finally {
      setDetecting(false);
    }
  }, [radiusKm]);

  const selectStop = useCallback((nextStop: BusStop, distance: number | null = null) => {
    setStop(nextStop);
    setDistanceM(distance);
    setPermissionDenied(false);
    setError(null);
  }, []);

  const formatDistance = useCallback(
    (locale: "en" | "mm") =>
      distanceM != null ? formatDistanceMeters(distanceM, locale) : null,
    [distanceM]
  );

  return {
    stop,
    distanceM,
    coords,
    detecting,
    permissionDenied,
    error,
    detect,
    selectStop,
    clear,
    formatDistance,
  };
}
