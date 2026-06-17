import type { Locale } from "@/constants/i18n";
import type { BusStop, RouteStop } from "@/types/bus";

type NamedStop = Pick<
  BusStop,
  "name_en" | "name_mm" | "road_en" | "road_mm" | "township_en" | "township_mm"
>;

export function getStopName(stop: NamedStop, locale: Locale): string {
  if (locale === "mm" && stop.name_mm) return stop.name_mm;
  return stop.name_en || stop.name_mm;
}

export function getRoadName(stop: NamedStop, locale: Locale): string {
  if (locale === "mm" && stop.road_mm) return stop.road_mm;
  return stop.road_en || stop.road_mm;
}

export function getTownshipName(stop: NamedStop, locale: Locale): string {
  if (locale === "mm" && stop.township_mm) return stop.township_mm;
  return stop.township_en || stop.township_mm;
}

export function formatStopLine(stop: NamedStop | RouteStop, locale: Locale): string {
  return `${getTownshipName(stop, locale)} · ${getRoadName(stop, locale)}`;
}
