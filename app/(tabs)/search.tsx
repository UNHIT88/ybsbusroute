import { ListCard, StopCard } from "@/components/BusCards";
import { sharedStyles } from "@/constants/styles";
import { colors, spacing } from "@/constants/theme";
import { useBusData } from "@/contexts/BusDataContext";
import { useLocale } from "@/contexts/LocaleContext";
import { searchRoutes, searchStops } from "@/services/busData";
import { formatStopLine, getStopName } from "@/services/stopLabels";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";

type Tab = "stops" | "routes";

export default function SearchScreen() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { dataVersion } = useBusData();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("stops");

  const stopResults = useMemo(() => searchStops(query), [query, dataVersion]);
  const routeResults = useMemo(() => searchRoutes(query), [query, dataVersion]);

  return (
    <View style={[sharedStyles.screen, sharedStyles.content]}>
      <Text style={sharedStyles.title}>{t("search", "title")}</Text>
      <Text style={sharedStyles.subtitle}>{t("search", "subtitle")}</Text>

      <TextInput
        style={sharedStyles.searchInput}
        placeholder={t("search", "placeholder")}
        placeholderTextColor="#64748b"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
      />

      <View style={styles.tabs}>
        {(["stops", "routes"] as Tab[]).map((value) => (
          <Pressable
            key={value}
            style={[styles.tab, tab === value && styles.tabActive]}
            onPress={() => setTab(value)}
          >
            <Text style={[styles.tabText, tab === value && styles.tabTextActive]}>
              {value === "stops" ? t("search", "stopsTab") : t("search", "routesTab")}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "stops" ? (
        <FlatList
          data={stopResults}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <StopCard
              title={getStopName(item, locale)}
              subtitle={formatStopLine(item, locale)}
              meta={`YBS ${item.routes.slice(0, 8).join(", ")}`}
              onPress={() => router.push(`/stop/${item.id}`)}
            />
          )}
          ListEmptyComponent={
            <Text style={sharedStyles.emptyText}>
              {query ? t("search", "noStops") : t("search", "typeStops")}
            </Text>
          }
        />
      ) : (
        <FlatList
          data={routeResults}
          keyExtractor={(item) => item.route_number}
          renderItem={({ item }) => (
            <ListCard
              label={item.route_number}
              color={item.color}
              subtitle={item.name}
              meta={`${item.stop_count} ${t("routes", "stops")}`}
              onPress={() => router.push(`/route/${item.route_number}`)}
            />
          )}
          ListEmptyComponent={
            <Text style={sharedStyles.emptyText}>
              {query ? t("search", "noRoutes") : t("search", "typeRoutes")}
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = {
  tabs: {
    flexDirection: "row" as const,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: "center" as const,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primary,
  },
  tabText: {
    color: colors.textMuted,
    fontWeight: "600" as const,
  },
  tabTextActive: {
    color: colors.text,
  },
};
