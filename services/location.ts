import * as Location from "expo-location";

export const LOCATION_TIMEOUT_MS = 12_000;

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistanceMeters(meters: number, locale: "en" | "mm"): string {
  if (meters < 1000) {
    const m = Math.round(meters);
    return locale === "mm" ? `${m} မီတာ` : `${m} m`;
  }
  const km = (meters / 1000).toFixed(1);
  return locale === "mm" ? `${km} ကီလိုမီတာ` : `${km} km`;
}

export async function getLocationWithFallback(): Promise<Location.LocationObject> {
  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    throw new Error("location-services-disabled");
  }

  try {
    return await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      new Promise<Location.LocationObject>((_, reject) =>
        setTimeout(() => reject(new Error("location-timeout")), LOCATION_TIMEOUT_MS)
      ),
    ]);
  } catch {
    const lastKnown = await Location.getLastKnownPositionAsync();
    if (lastKnown) return lastKnown;
    throw new Error("location-unavailable");
  }
}

export async function requestForegroundLocation(): Promise<Location.LocationObject> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error("location-permission-denied");
  }
  return getLocationWithFallback();
}
