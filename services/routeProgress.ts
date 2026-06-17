import type { RouteStop } from "@/types/bus";

export type StopProgressStatus = "passed" | "current" | "next" | "upcoming";

export type RouteProgress = {
  passedIndex: number;
  currentIndex: number;
  nextIndex: number;
  distanceToNextM: number | null;
};

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function projectOntoSegment(
  lat: number,
  lng: number,
  start: RouteStop,
  end: RouteStop
): number {
  const ax = start.lng;
  const ay = start.lat;
  const bx = end.lng;
  const by = end.lat;
  const px = lng;
  const py = lat;

  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLenSq = abx * abx + aby * aby;

  if (abLenSq === 0) return 0;
  return Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
}

function distanceToSegmentM(
  lat: number,
  lng: number,
  start: RouteStop,
  end: RouteStop
): number {
  const t = projectOntoSegment(lat, lng, start, end);
  const projLat = start.lat + t * (end.lat - start.lat);
  const projLng = start.lng + t * (end.lng - start.lng);
  return haversineM(lat, lng, projLat, projLng);
}

export function getRouteProgress(
  latitude: number,
  longitude: number,
  stops: RouteStop[]
): RouteProgress {
  if (!stops.length) {
    return { passedIndex: -1, currentIndex: -1, nextIndex: -1, distanceToNextM: null };
  }

  if (stops.length === 1) {
    const distanceToNextM = haversineM(latitude, longitude, stops[0].lat, stops[0].lng);
    return {
      passedIndex: -1,
      currentIndex: 0,
      nextIndex: -1,
      distanceToNextM,
    };
  }

  let bestSegment = 0;
  let minDist = Infinity;

  for (let i = 0; i < stops.length - 1; i++) {
    const dist = distanceToSegmentM(latitude, longitude, stops[i], stops[i + 1]);
    if (dist < minDist) {
      minDist = dist;
      bestSegment = i;
    }
  }

  const t = projectOntoSegment(
    latitude,
    longitude,
    stops[bestSegment],
    stops[bestSegment + 1]
  );

  let passedIndex: number;
  let currentIndex: number;
  let nextIndex: number;

  if (t < 0.35) {
    passedIndex = bestSegment - 1;
    currentIndex = bestSegment;
    nextIndex = bestSegment + 1;
  } else if (t > 0.65) {
    passedIndex = bestSegment;
    currentIndex = bestSegment + 1;
    nextIndex = bestSegment + 2;
  } else {
    passedIndex = bestSegment;
    currentIndex = bestSegment;
    nextIndex = bestSegment + 1;
  }

  passedIndex = Math.max(-1, Math.min(passedIndex, stops.length - 1));
  currentIndex = Math.max(0, Math.min(currentIndex, stops.length - 1));
  nextIndex =
    nextIndex >= 0 && nextIndex < stops.length ? nextIndex : -1;

  const distanceToNextM =
    nextIndex >= 0
      ? haversineM(
          latitude,
          longitude,
          stops[nextIndex].lat,
          stops[nextIndex].lng
        )
      : null;

  return { passedIndex, currentIndex, nextIndex, distanceToNextM };
}

export function getStopProgressStatus(
  stopIndex: number,
  progress: RouteProgress
): StopProgressStatus {
  if (stopIndex <= progress.passedIndex) return "passed";
  if (stopIndex === progress.currentIndex) return "current";
  if (stopIndex === progress.nextIndex) return "next";
  return "upcoming";
}

export function formatDistanceM(meters: number | null, locale: "en" | "mm"): string {
  if (meters === null) return "";
  if (meters < 1000) {
    const rounded = Math.round(meters);
    return locale === "mm" ? `${rounded} မီတာ` : `${rounded} m`;
  }
  const km = (meters / 1000).toFixed(1);
  return locale === "mm" ? `${km} ကီလိုမီတာ` : `${km} km`;
}
