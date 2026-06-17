import { colors } from "@/constants/theme";
import type { StopProgressStatus } from "@/services/routeProgress";
import { Platform, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from "react-native-maps";
import type { LatLng } from "@/types/bus";

type StopMarker = LatLng & {
  id: string | number;
  title: string;
  description?: string;
  color?: string;
  sequence?: number;
  status?: StopProgressStatus;
};

type Props = {
  region: Region;
  stops?: StopMarker[];
  roadPolyline?: LatLng[];
  selectedStopId?: string | number;
  showRouteLine?: boolean;
  followUser?: boolean;
  onRegionChange?: (region: Region) => void;
  onStopPress?: (stopId: string | number) => void;
};

function statusColor(status?: StopProgressStatus, fallback?: string): string {
  switch (status) {
    case "passed":
      return colors.textMuted;
    case "current":
      return colors.warning;
    case "next":
      return colors.success;
    case "upcoming":
      return fallback ?? colors.primary;
    default:
      return fallback ?? colors.primary;
  }
}

export function BusMap({
  region,
  stops = [],
  roadPolyline,
  selectedStopId,
  showRouteLine = false,
  followUser = false,
  onRegionChange,
  onStopPress,
}: Props) {
  const lineCoordinates =
    roadPolyline && roadPolyline.length > 1
      ? roadPolyline
      : stops.map((stop) => ({
          latitude: stop.latitude,
          longitude: stop.longitude,
        }));

  const hasProgress = stops.some((stop) => stop.status != null);
  const passedStops = stops.filter((stop) => stop.status === "passed");
  const activeStops = stops.filter((stop) => stop.status !== "passed");
  const routeColor = stops.find((s) => s.status !== "passed")?.color ?? stops[0]?.color ?? colors.primary;

  const passedLine =
    hasProgress && passedStops.length > 1
      ? passedStops.map((stop) => ({
          latitude: stop.latitude,
          longitude: stop.longitude,
        }))
      : [];

  const upcomingLine =
    hasProgress && activeStops.length > 1
      ? activeStops.map((stop) => ({
          latitude: stop.latitude,
          longitude: stop.longitude,
        }))
      : lineCoordinates;

  return (
    <MapView
      provider={Platform.OS === "android" ? undefined : PROVIDER_GOOGLE}
      style={styles.map}
      initialRegion={region}
      region={followUser ? undefined : region}
      onRegionChangeComplete={onRegionChange}
      showsUserLocation
      showsMyLocationButton
      followsUserLocation={followUser}
      customMapStyle={Platform.OS === "android" ? undefined : darkMapStyle}
    >
      {showRouteLine && hasProgress ? (
        <>
          {passedLine.length > 1 ? (
            <Polyline
              coordinates={passedLine}
              strokeColor={colors.textMuted}
              strokeWidth={3}
              lineDashPattern={[6, 4]}
            />
          ) : null}
          {upcomingLine.length > 1 ? (
            <Polyline
              coordinates={upcomingLine}
              strokeColor={routeColor}
              strokeWidth={4}
            />
          ) : null}
        </>
      ) : showRouteLine && lineCoordinates.length > 1 ? (
        <Polyline
          coordinates={lineCoordinates}
          strokeColor={routeColor}
          strokeWidth={4}
        />
      ) : null}
      {stops.map((stop) => {
        const markerColor = statusColor(
          stop.status,
          String(stop.id) === String(selectedStopId) ? colors.warning : stop.color
        );
        const showLabel = stop.sequence != null;

        if (showLabel) {
          return (
            <Marker
              key={String(stop.id)}
              coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
              title={stop.title}
              description={stop.description}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={() => onStopPress?.(stop.id)}
              tracksViewChanges={false}
            >
              <View
                style={[
                  styles.stopMarker,
                  { backgroundColor: markerColor },
                  stop.status === "current" && styles.stopMarkerCurrent,
                  stop.status === "next" && styles.stopMarkerNext,
                ]}
              >
                <Text style={styles.stopMarkerText}>{stop.sequence}</Text>
              </View>
            </Marker>
          );
        }

        return (
          <Marker
            key={String(stop.id)}
            coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
            title={stop.title}
            description={stop.description}
            pinColor={markerColor}
            onPress={() => onStopPress?.(stop.id)}
          />
        );
      })}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
  stopMarker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.text,
  },
  stopMarkerCurrent: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: colors.warning,
  },
  stopMarkerNext: {
    borderWidth: 3,
    borderColor: colors.success,
  },
  stopMarkerText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "800",
  },
});

const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#304a7d" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
];
