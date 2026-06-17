import { BusMap } from "@/components/BusMap";
import { StopCard } from "@/components/BusCards";
import { sharedStyles } from "@/constants/styles";
import { colors, spacing, YANGON_REGION } from "@/constants/theme";
import { useLocale } from "@/contexts/LocaleContext";
import {
  getDisplayRouteNumber,
  getRoute,
  getRouteDirectionView,
} from "@/services/busData";
import {
  formatDistanceM,
  getRouteProgress,
  getStopProgressStatus,
} from "@/services/routeProgress";
import { formatStopLine, getStopName } from "@/services/stopLabels";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { fetchRoadPolyline } from "@/services/osrmApi";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { Region } from "react-native-maps";
import type { LatLng, RouteDirection, RouteStop } from "@/types/bus";

function regionForStops(stops: RouteStop[]): Region {
  if (!stops.length) return YANGON_REGION;

  const lats = stops.map((stop) => stop.lat);
  const lngs = stops.map((stop) => stop.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.03, (maxLat - minLat) * 1.5 + 0.02),
    longitudeDelta: Math.max(0.03, (maxLng - minLng) * 1.5 + 0.02),
  };
}

export default function RouteDetailScreen() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { id } = useLocalSearchParams<{ id: string }>();
  const route = getRoute(id ?? "");
  const [direction, setDirection] = useState<RouteDirection>("up");
  const [roadPolyline, setRoadPolyline] = useState<LatLng[]>([]);
  const [tracking, setTracking] = useState(false);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const listRef = useRef<FlatList<RouteStop>>(null);

  const directionView = useMemo(
    () => (route ? getRouteDirectionView(route, direction) : null),
    [route, direction]
  );

  const progress = useMemo(() => {
    if (!tracking || !userLocation || !directionView?.stops.length) return null;
    return getRouteProgress(
      userLocation.latitude,
      userLocation.longitude,
      directionView.stops
    );
  }, [tracking, userLocation, directionView?.stops]);

  const region = useMemo(() => {
    if (tracking && userLocation) {
      return {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }
    return regionForStops(directionView?.stops ?? []);
  }, [tracking, userLocation, directionView?.stops]);

  useEffect(() => {
    if (!directionView?.stops.length) {
      setRoadPolyline([]);
      return;
    }

    let active = true;
    fetchRoadPolyline(directionView.stops).then((line) => {
      if (active) setRoadPolyline(line);
    });

    return () => {
      active = false;
    };
  }, [directionView?.stops]);

  useEffect(() => {
    if (!tracking) {
      setUserLocation(null);
      return;
    }

    let subscription: Location.LocationSubscription | null = null;
    let active = true;

    async function startTracking() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!active) return;

      if (status !== "granted") {
        setTracking(false);
        return;
      }

      const initial = await Location.getCurrentPositionAsync({});
      if (!active) return;
      setUserLocation({
        latitude: initial.coords.latitude,
        longitude: initial.coords.longitude,
      });

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 15,
          timeInterval: 5000,
        },
        (location) => {
          if (!active) return;
          setUserLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
        }
      );
    }

    startTracking();

    return () => {
      active = false;
      subscription?.remove();
    };
  }, [tracking]);

  useEffect(() => {
    if (!tracking || !progress || !directionView?.stops.length) return;
    const targetIndex = Math.max(0, progress.currentIndex);
    listRef.current?.scrollToIndex({
      index: targetIndex,
      animated: true,
      viewPosition: 0.35,
    });
  }, [tracking, progress?.currentIndex, directionView?.stops.length]);

  if (!route || !directionView) {
    return (
      <View style={[sharedStyles.screen, sharedStyles.content]}>
        <Text style={sharedStyles.emptyText}>{t("detail", "routeNotFound")}</Text>
      </View>
    );
  }

  const mapStops = directionView.stops.map((stop, index) => ({
    id: stop.stop_id,
    latitude: stop.lat,
    longitude: stop.lng,
    title: getStopName(stop, locale),
    description: `#${stop.sequence}`,
    color: route.color,
    sequence: stop.sequence,
    status: progress ? getStopProgressStatus(index, progress) : undefined,
  }));

  const nextStop =
    progress && progress.nextIndex >= 0
      ? directionView.stops[progress.nextIndex]
      : null;
  const passedCount = progress ? Math.max(0, progress.passedIndex + 1) : 0;
  const remainingCount = progress
    ? directionView.stops.length - passedCount
    : directionView.stops.length;

  return (
    <View style={sharedStyles.screen}>
      <View style={[styles.mapContainer, tracking && styles.mapContainerTracking]}>
        <BusMap
          region={region}
          stops={mapStops}
          roadPolyline={roadPolyline}
          showRouteLine
          followUser={tracking}
          onStopPress={(stopId) => router.push(`/stop/${stopId}`)}
        />
        {tracking && nextStop ? (
          <View style={styles.nextStopBanner}>
            <Text style={styles.nextStopLabel}>{t("detail", "nextStop")}</Text>
            <Text style={styles.nextStopName} numberOfLines={1}>
              {nextStop.sequence}. {getStopName(nextStop, locale)}
            </Text>
            {progress?.distanceToNextM != null ? (
              <Text style={styles.nextStopDistance}>
                {formatDistanceM(progress.distanceToNextM, locale)}{" "}
                {t("detail", "away")}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.panel}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.routeTitle}>
              YBS {getDisplayRouteNumber(route)}
              {route.operator ? ` · ${route.operator}` : ""}
            </Text>
            <Text style={sharedStyles.subtitle}>{route.name}</Text>
          </View>
          <Pressable
            style={[styles.trackButton, tracking && styles.trackButtonActive]}
            onPress={() => setTracking((value) => !value)}
          >
            <Text
              style={[
                styles.trackButtonText,
                tracking && styles.trackButtonTextActive,
              ]}
            >
              {tracking ? t("detail", "stopTracking") : t("detail", "trackRide")}
            </Text>
          </Pressable>
        </View>

        <View style={styles.directionTabs}>
          {(["up", "down"] as RouteDirection[]).map((value) => (
            <Pressable
              key={value}
              style={[styles.directionTab, direction === value && styles.directionTabActive]}
              onPress={() => setDirection(value)}
            >
              <Text
                style={[
                  styles.directionTabText,
                  direction === value && styles.directionTabTextActive,
                ]}
              >
                {value === "up" ? t("detail", "directionUp") : t("detail", "directionDown")}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.directionPath} numberOfLines={2}>
          {directionView.fromLabel} → {directionView.toLabel}
        </Text>

        {tracking && progress ? (
          <View style={styles.progressMeta}>
            <Text style={styles.progressText}>
              {passedCount} {t("detail", "stopsPassed")} · {remainingCount}{" "}
              {t("detail", "stopsRemaining")}
            </Text>
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.textMuted }]} />
                <Text style={styles.legendLabel}>{t("detail", "legendPassed")}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
                <Text style={styles.legendLabel}>{t("detail", "legendCurrent")}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                <Text style={styles.legendLabel}>{t("detail", "legendNext")}</Text>
              </View>
            </View>
          </View>
        ) : (
          <Text style={styles.meta}>
            {directionView.stops.length} {t("routes", "stops")} · {t("detail", "tapStop")}
          </Text>
        )}

        <FlatList
          ref={listRef}
          data={directionView.stops}
          keyExtractor={(item) => `${direction}-${item.stop_id}-${item.sequence}`}
          onScrollToIndexFailed={() => undefined}
          renderItem={({ item, index }) => {
            const status = progress ? getStopProgressStatus(index, progress) : undefined;
            return (
              <StopCard
                title={`${item.sequence}. ${getStopName(item, locale)}`}
                subtitle={formatStopLine(item, locale)}
                status={status}
                onPress={() => router.push(`/stop/${item.stop_id}`)}
              />
            );
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mapContainer: {
    height: "35%",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  mapContainerTracking: {
    height: "42%",
  },
  nextStopBanner: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.success,
    padding: spacing.sm,
  },
  nextStopLabel: {
    color: colors.success,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  nextStopName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 2,
  },
  nextStopDistance: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  panel: {
    flex: 1,
    padding: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  headerText: {
    flex: 1,
  },
  routeTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  trackButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  trackButtonActive: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primary,
  },
  trackButtonText: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 13,
  },
  trackButtonTextActive: {
    color: colors.text,
  },
  directionTabs: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  directionTab: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 10,
    alignItems: "center",
  },
  directionTabActive: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primary,
  },
  directionTabText: {
    color: colors.textMuted,
    fontWeight: "700",
    fontSize: 14,
  },
  directionTabTextActive: {
    color: colors.text,
  },
  directionPath: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  meta: {
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  progressMeta: {
    marginBottom: spacing.sm,
  },
  progressText: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.xs,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    color: colors.textMuted,
    fontSize: 11,
  },
});
