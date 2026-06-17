import { sharedStyles } from "@/constants/styles";
import { colors, spacing } from "@/constants/theme";
import { useBusData } from "@/contexts/BusDataContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  getNearestStop,
  getNearbyStops,
  getStopServingRoutes,
  searchStops,
  type StopServingRoute,
} from "@/services/busData";
import { formatStopLine, getStopName } from "@/services/stopLabels";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { BusStop } from "@/types/bus";

type Props = {
  onStopChange?: (stop: BusStop | null) => void;
};

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const LOCATION_TIMEOUT_MS = 12_000;

async function getLocationWithFallback() {
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

function formatDistance(meters: number, locale: "en" | "mm"): string {
  if (meters < 1000) {
    const m = Math.round(meters);
    return locale === "mm" ? `${m} မီတာ` : `${m} m`;
  }
  const km = (meters / 1000).toFixed(1);
  return locale === "mm" ? `${km} ကီလိုမီတာ` : `${km} km`;
}

export function CurrentStopBuses({ onStopChange }: Props) {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { dataVersion } = useBusData();
  const [selectedStop, setSelectedStop] = useState<BusStop | null>(null);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [detecting, setDetecting] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  const selectStop = useCallback(
    (stop: BusStop, distance: number | null = null) => {
      setSelectedStop(stop);
      setDistanceM(distance);
      setPickerOpen(false);
      setQuery("");
      Keyboard.dismiss();
      onStopChange?.(stop);
    },
    [onStopChange]
  );

  const detectNearestStop = useCallback(async () => {
    setDetecting(true);
    setPermissionDenied(false);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setPermissionDenied(true);
        setPickerOpen(true);
        return;
      }

      const location = await getLocationWithFallback();
      const { latitude, longitude } = location.coords;
      setUserCoords({ lat: latitude, lng: longitude });

      const nearest = getNearestStop(latitude, longitude, 1.5);
      if (nearest) {
        const dist = haversineM(latitude, longitude, nearest.lat, nearest.lng);
        selectStop(nearest, dist);
      } else {
        setPickerOpen(true);
      }
    } catch {
      setPickerOpen(true);
    } finally {
      setDetecting(false);
    }
  }, [selectStop]);

  useEffect(() => {
    detectNearestStop();
  }, [detectNearestStop]);

  const servingRoutes = useMemo(
    () => (selectedStop ? getStopServingRoutes(selectedStop) : []),
    [selectedStop, dataVersion]
  );

  const nearbyStops = useMemo(() => {
    if (!userCoords) return [];
    return getNearbyStops(userCoords.lat, userCoords.lng, 1.5, 12);
  }, [userCoords, dataVersion]);

  const searchResults = useMemo(() => searchStops(query), [query]);

  const pickerStops = query.trim() ? searchResults : nearbyStops;

  function renderBusChip(route: StopServingRoute) {
    return (
      <Pressable
        key={route.routeNumber}
        style={({ pressed }) => [
          styles.busTile,
          { borderColor: route.color },
          pressed && styles.pressed,
        ]}
        onPress={() => router.push(`/route/${route.routeNumber}`)}
      >
        <Text style={styles.busTileNumber}>{route.displayNumber}</Text>
        <Text style={styles.busTileLabel}>YBS</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      {detecting && !selectedStop ? (
        <View style={styles.detectingBanner}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.detectingText}>{t("currentStop", "detecting")}</Text>
          <Pressable
            style={styles.skipDetectButton}
            onPress={() => {
              setDetecting(false);
              setPickerOpen(true);
            }}
          >
            <Text style={styles.skipDetectText}>{t("currentStop", "pickManually")}</Text>
          </Pressable>
        </View>
      ) : null}
      {permissionDenied ? (
        <View style={styles.warningBanner}>
          <Ionicons name="location-outline" size={18} color={colors.warning} />
          <Text style={styles.warningText}>{t("currentStop", "locationDenied")}</Text>
        </View>
      ) : null}

      <View style={styles.stopHeader}>
        <View style={styles.stopHeaderTop}>
          <View style={styles.stopBadge}>
            <Ionicons name="bus" size={14} color={colors.primary} />
            <Text style={styles.stopBadgeText}>{t("currentStop", "yourStop")}</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              onPress={() => {
                setDetecting(true);
                detectNearestStop();
              }}
              disabled={detecting}
            >
              {detecting ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="locate" size={18} color={colors.primary} />
              )}
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.changeButton,
                pickerOpen && styles.changeButtonActive,
                pressed && styles.pressed,
              ]}
              onPress={() => {
                setPickerOpen((open) => !open);
                if (pickerOpen) {
                  setQuery("");
                  Keyboard.dismiss();
                }
              }}
            >
              <Text style={styles.changeButtonText}>
                {pickerOpen ? t("currentStop", "done") : t("currentStop", "changeStop")}
              </Text>
            </Pressable>
          </View>
        </View>

        {selectedStop ? (
          <>
            <Text style={styles.stopName}>{getStopName(selectedStop, locale)}</Text>
            <Text style={styles.stopMeta}>{formatStopLine(selectedStop, locale)}</Text>
            {distanceM != null ? (
              <Text style={styles.stopDistance}>
                {formatDistance(distanceM, locale)} {t("currentStop", "away")}
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.noStopText}>{t("currentStop", "noStopSelected")}</Text>
        )}
      </View>

      {pickerOpen ? (
        <View style={styles.picker}>
          <TextInput
            style={sharedStyles.searchInput}
            placeholder={t("currentStop", "searchPlaceholder")}
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
          />
          <Text style={styles.pickerSection}>
            {query.trim()
              ? t("currentStop", "searchResults")
              : t("currentStop", "nearbyStops")}
          </Text>
          <FlatList
            data={pickerStops}
            keyExtractor={(item) => String(item.id)}
            keyboardShouldPersistTaps="handled"
            style={styles.pickerList}
            renderItem={({ item }) => {
              const dist =
                userCoords != null
                  ? haversineM(userCoords.lat, userCoords.lng, item.lat, item.lng)
                  : null;
              return (
                <Pressable
                  style={({ pressed }) => [
                    styles.pickerItem,
                    selectedStop?.id === item.id && styles.pickerItemSelected,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => selectStop(item, dist)}
                >
                  <Text style={styles.pickerItemTitle} numberOfLines={2}>
                    {getStopName(item, locale)}
                  </Text>
                  <Text style={styles.pickerItemMeta} numberOfLines={1}>
                    {formatStopLine(item, locale)}
                    {dist != null ? ` · ${formatDistance(dist, locale)}` : ""}
                  </Text>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={sharedStyles.emptyText}>
                {query.trim() ? t("search", "noStops") : t("map", "noStops")}
              </Text>
            }
          />
        </View>
      ) : (
        <ScrollView
          style={styles.busSection}
          contentContainerStyle={styles.busSectionContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.busSectionHeader}>
            <Text style={styles.busSectionTitle}>{t("currentStop", "busesTitle")}</Text>
            {selectedStop ? (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>
                  {servingRoutes.length} {t("currentStop", "busLines")}
                </Text>
              </View>
            ) : null}
          </View>

          {!selectedStop ? (
            <Text style={sharedStyles.emptyText}>{t("currentStop", "noStopSelected")}</Text>
          ) : servingRoutes.length === 0 ? (
            <Text style={sharedStyles.emptyText}>{t("currentStop", "noBuses")}</Text>
          ) : (
            <View style={styles.busGrid}>{servingRoutes.map(renderBusChip)}</View>
          )}

          {selectedStop && servingRoutes.length > 0 ? (
            <Pressable
              style={({ pressed }) => [styles.detailLink, pressed && styles.pressed]}
              onPress={() => router.push(`/stop/${selectedStop.id}`)}
            >
              <Text style={styles.detailLinkText}>{t("currentStop", "viewStopDetail")}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.primary} />
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },
  detectingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  detectingText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 13,
  },
  skipDetectButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  skipDetectText: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 13,
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.warning,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  warningText: {
    flex: 1,
    color: colors.warning,
    fontSize: 13,
  },
  stopHeader: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  stopHeaderTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  stopBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  stopBadgeText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  changeButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surfaceAlt,
  },
  changeButtonActive: {
    backgroundColor: colors.primaryDark,
  },
  changeButtonText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 13,
  },
  stopName: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  stopMeta: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 4,
  },
  stopDistance: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 6,
  },
  noStopText: {
    color: colors.textMuted,
    fontSize: 15,
  },
  picker: {
    flex: 1,
    minHeight: 0,
    gap: spacing.sm,
  },
  pickerSection: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  pickerList: {
    flex: 1,
  },
  pickerItem: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: 8,
  },
  pickerItemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceAlt,
  },
  pickerItemTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  pickerItemMeta: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  busSection: {
    flex: 1,
  },
  busSectionContent: {
    paddingBottom: spacing.lg,
  },
  busSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  busSectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  countBadge: {
    backgroundColor: colors.primaryDark,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  countBadgeText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  busGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  busTile: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 64,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: colors.surfaceAlt,
    gap: 2,
  },
  busTileNumber: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  busTileLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  detailLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  detailLinkText: {
    color: colors.primary,
    fontWeight: "600",
    fontSize: 14,
  },
  pressed: {
    opacity: 0.85,
  },
});
