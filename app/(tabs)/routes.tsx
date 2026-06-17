import { ListCard } from "@/components/BusCards";
import { sharedStyles } from "@/constants/styles";
import { useBusData } from "@/contexts/BusDataContext";
import { useLocale } from "@/contexts/LocaleContext";
import { getAllRoutes, getDatasetCounts, getDisplayRouteNumber } from "@/services/busData";
import { isCustomRoute } from "@/services/customRouteStorage";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Text, TextInput, View } from "react-native";

export default function RoutesScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const { dataVersion } = useBusData();
  const counts = getDatasetCounts();
  const [query, setQuery] = useState("");
  const routes = useMemo(() => getAllRoutes(), [dataVersion]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return routes;
    return routes.filter((route) => {
      const displayNumber = getDisplayRouteNumber(route);
      return (
        route.route_number.includes(term) ||
        displayNumber.includes(term) ||
        route.name.toLowerCase().includes(term) ||
        (route.description ?? "").toLowerCase().includes(term)
      );
    });
  }, [query, routes]);

  return (
    <View style={[sharedStyles.screen, sharedStyles.content]}>
      <Text style={sharedStyles.title}>{t("routes", "title")}</Text>
      <Text style={sharedStyles.subtitle}>
        {counts.routes} {t("routes", "routesCount")}
        {counts.customRoutes > 0 ? ` · ${counts.customRoutes} ${t("routes", "community")}` : ""}
      </Text>
      <TextInput
        style={sharedStyles.searchInput}
        placeholder={t("routes", "searchPlaceholder")}
        placeholderTextColor="#64748b"
        value={query}
        onChangeText={setQuery}
      />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.route_number}
        renderItem={({ item }) => (
          <ListCard
            label={getDisplayRouteNumber(item)}
            color={item.color}
            subtitle={item.name}
            meta={`${item.operator ? `${item.operator} · ` : ""}${item.stop_count} ${t("routes", "stops")}${
              isCustomRoute(item) ? ` · ${t("routes", "community")}` : ""
            }`}
            onPress={() => router.push(`/route/${item.route_number}`)}
          />
        )}
        ListEmptyComponent={
          <Text style={sharedStyles.emptyText}>{t("routes", "empty")}</Text>
        }
      />
    </View>
  );
}
