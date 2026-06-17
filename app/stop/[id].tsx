import { BusMap } from "@/components/BusMap";
import { ListCard } from "@/components/BusCards";
import { sharedStyles } from "@/constants/styles";
import { colors, spacing } from "@/constants/theme";
import { useLocale } from "@/contexts/LocaleContext";
import { getDisplayRouteNumber, getRoute, getStop, getStopServingRoutes } from "@/services/busData";
import { formatStopLine, getStopName } from "@/services/stopLabels";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FlatList, StyleSheet, Text, View } from "react-native";

export default function StopDetailScreen() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { id } = useLocalSearchParams<{ id: string }>();
  const stop = getStop(id ?? "");

  if (!stop) {
    return (
      <View style={[sharedStyles.screen, sharedStyles.content]}>
        <Text style={sharedStyles.emptyText}>{t("detail", "stopNotFound")}</Text>
      </View>
    );
  }

  const region = {
    latitude: stop.lat,
    longitude: stop.lng,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  };

  const servingRoutes = getStopServingRoutes(stop)
    .map((entry) => getRoute(entry.routeNumber))
    .filter(Boolean);

  const altName =
    locale === "en" ? stop.name_mm : stop.name_en;

  return (
    <View style={sharedStyles.screen}>
      <View style={styles.mapContainer}>
        <BusMap
          region={region}
          stops={[
            {
              id: stop.id,
              latitude: stop.lat,
              longitude: stop.lng,
              title: getStopName(stop, locale),
              description: formatStopLine(stop, locale),
            },
          ]}
          selectedStopId={stop.id}
        />
      </View>
      <View style={styles.panel}>
        <Text style={styles.title}>{getStopName(stop, locale)}</Text>
        {altName ? <Text style={styles.mmName}>{altName}</Text> : null}
        <Text style={sharedStyles.subtitle}>{formatStopLine(stop, locale)}</Text>
        <Text style={styles.meta}>
          {stop.lat.toFixed(5)}, {stop.lng.toFixed(5)}
        </Text>
        <Text style={styles.sectionTitle}>{t("detail", "routesThrough")}</Text>
        <FlatList
          data={servingRoutes}
          keyExtractor={(item) => item!.route_number}
          renderItem={({ item }) =>
            item ? (
              <ListCard
                label={getDisplayRouteNumber(item)}
                color={item.color}
                subtitle={item.name}
                meta={`${item.stop_count} ${t("routes", "stops")}`}
                onPress={() => router.push(`/route/${item.route_number}`)}
              />
            ) : null
          }
          ListEmptyComponent={
            <Text style={sharedStyles.emptyText}>{t("detail", "noRoutes")}</Text>
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mapContainer: {
    height: "38%",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  panel: {
    flex: 1,
    padding: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  mmName: {
    color: colors.primary,
    fontSize: 18,
    marginTop: 4,
  },
  meta: {
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
});
