import type { Locale } from "@/constants/i18n";
import { getStop } from "@/services/busData";
import { getStopName } from "@/services/stopLabels";
import { getEquivalentStopIds } from "@/services/stopClusters";
import type { TripLeg, TripPlan } from "@/services/routePlanner";

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function stopsAreTransferEquivalent(aStopId: number, bStopId: number): boolean {
  if (aStopId === bStopId) return true;
  return getEquivalentStopIds(aStopId).has(bStopId);
}

export function stopsShareTransferName(aStopId: number, bStopId: number): boolean {
  if (stopsAreTransferEquivalent(aStopId, bStopId)) return true;

  const a = getStop(aStopId);
  const b = getStop(bStopId);
  if (!a || !b) return false;

  const aEn = normalizeName(a.name_en);
  const aMm = normalizeName(a.name_mm);
  const bEn = normalizeName(b.name_en);
  const bMm = normalizeName(b.name_mm);

  return (
    (aEn.length > 0 && aEn === bEn) ||
    (aMm.length > 0 && aMm === bMm) ||
    (aEn.length > 0 && aEn === bMm) ||
    (aMm.length > 0 && aMm === bEn)
  );
}

export function formatTransferBetween(
  previousLeg: TripLeg,
  nextLeg: TripLeg,
  locale: Locale
): string {
  const off = getStop(previousLeg.toStopId);
  const on = getStop(nextLeg.fromStopId);
  if (!off || !on) return "";

  if (
    stopsAreTransferEquivalent(previousLeg.toStopId, nextLeg.fromStopId) ||
    stopsShareTransferName(previousLeg.toStopId, nextLeg.fromStopId)
  ) {
    return getStopName(off, locale);
  }

  return `${getStopName(off, locale)} → ${getStopName(on, locale)}`;
}

export function planQualityScore(plan: TripPlan): number {
  const routeNums = plan.legs.map((leg) => leg.routeNumber);
  const duplicateRoutes = routeNums.length - new Set(routeNums).size;
  const microLegs = plan.legs.filter((leg) => leg.stopCount <= 1).length;

  let transferFriction = 0;
  for (let i = 0; i < plan.legs.length - 1; i++) {
    const offId = plan.legs[i].toStopId;
    const onId = plan.legs[i + 1].fromStopId;
    if (!stopsAreTransferEquivalent(offId, onId)) transferFriction += 250;
    if (!stopsShareTransferName(offId, onId)) transferFriction += 150;
  }

  return (
    plan.transferCount * 10_000 +
    duplicateRoutes * 5_000 +
    microLegs * 800 +
    transferFriction +
    plan.totalStops
  );
}

export function sortPlansByQuality(plans: TripPlan[]): TripPlan[] {
  return [...plans].sort((a, b) => planQualityScore(a) - planQualityScore(b));
}
