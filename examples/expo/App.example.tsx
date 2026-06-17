/**
 * Minimal Expo demo — copy into your App.tsx or adapt as screens.
 *
 * Setup:
 *   1. Copy examples/expo/api and examples/expo/hooks into your Expo project
 *   2. Create .env with EXPO_PUBLIC_YBS_API_URL=http://YOUR_IP:8000
 *   3. Start API: uvicorn api.main:app --host 0.0.0.0 --port 8000
 *   4. npx expo start
 */

import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouteDetail, useRoutes, useStopSearch, useTripPlanner } from "./hooks/useYbsData";

export default function App() {
  const [tab, setTab] = useState<"routes" | "plan">("routes");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [fromStop, setFromStop] = useState("");
  const [toStop, setToStop] = useState("");

  const { routes, loading: routesLoading } = useRoutes();
  const { route: routeDetail, loading: detailLoading } = useRouteDetail(selectedRouteId);
  const { stops: fromSuggestions } = useStopSearch(fromStop);
  const { stops: toSuggestions } = useStopSearch(toStop);
  const { plan, loading: planLoading, error: planError, planTrip } = useTripPlanner();

  if (selectedRouteId && routeDetail) {
    return (
      <SafeAreaView style={styles.container}>
        <Pressable onPress={() => setSelectedRouteId(null)} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>
          Route {routeDetail.number}
          {routeDetail.prefix ? ` (${routeDetail.prefix})` : ""}
        </Text>
        <Text style={styles.subtitle}>
          {routeDetail.origin} → {routeDetail.destination}
        </Text>
        {detailLoading ? (
          <ActivityIndicator />
        ) : (
          <FlatList
            data={routeDetail.stops}
            keyExtractor={(item) => `${item.sequence}-${item.name}`}
            renderItem={({ item }) => (
              <View style={styles.stopRow}>
                <View style={[styles.badge, { backgroundColor: routeDetail.color ?? "#2563eb" }]}>
                  <Text style={styles.badgeText}>{item.sequence}</Text>
                </View>
                <View style={styles.stopInfo}>
                  <Text style={styles.stopName}>{item.name}</Text>
                  {item.location && (
                    <Text style={styles.coords}>
                      {item.location.lat.toFixed(5)}, {item.location.lng.toFixed(5)}
                    </Text>
                  )}
                </View>
              </View>
            )}
          />
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>YBS Bus Routes</Text>

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, tab === "routes" && styles.tabActive]}
          onPress={() => setTab("routes")}
        >
          <Text style={tab === "routes" ? styles.tabTextActive : styles.tabText}>Routes</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === "plan" && styles.tabActive]}
          onPress={() => setTab("plan")}
        >
          <Text style={tab === "plan" ? styles.tabTextActive : styles.tabText}>Plan Trip</Text>
        </Pressable>
      </View>

      {tab === "routes" ? (
        routesLoading ? (
          <ActivityIndicator size="large" />
        ) : (
          <FlatList
            data={routes}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable style={styles.routeCard} onPress={() => setSelectedRouteId(item.id)}>
                <View style={[styles.routeBadge, { backgroundColor: item.color ?? "#2563eb" }]}>
                  <Text style={styles.routeNumber}>{item.number}</Text>
                  {item.prefix && <Text style={styles.prefix}>{item.prefix}</Text>}
                </View>
                <View style={styles.routeInfo}>
                  <Text style={styles.routeSummary} numberOfLines={2}>
                    {item.summary}
                  </Text>
                  <Text style={styles.stopCount}>{item.stop_count} stops</Text>
                </View>
              </Pressable>
            )}
          />
        )
      ) : (
        <View style={styles.planForm}>
          <Text style={styles.label}>From</Text>
          <TextInput
            style={styles.input}
            value={fromStop}
            onChangeText={setFromStop}
            placeholder="နတ်စင်"
            placeholderTextColor="#9ca3af"
          />
          {fromSuggestions.slice(0, 3).map((stop) => (
            <Pressable key={stop.name} onPress={() => setFromStop(stop.name)}>
              <Text style={styles.suggestion}>{stop.name}</Text>
            </Pressable>
          ))}

          <Text style={styles.label}>To</Text>
          <TextInput
            style={styles.input}
            value={toStop}
            onChangeText={setToStop}
            placeholder="စံပြဈေး"
            placeholderTextColor="#9ca3af"
          />
          {toSuggestions.slice(0, 3).map((stop) => (
            <Pressable key={stop.name} onPress={() => setToStop(stop.name)}>
              <Text style={styles.suggestion}>{stop.name}</Text>
            </Pressable>
          ))}

          <Pressable
            style={styles.planButton}
            onPress={() => planTrip(fromStop.trim(), toStop.trim())}
            disabled={planLoading}
          >
            {planLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.planButtonText}>Find Route</Text>
            )}
          </Pressable>

          {planError && <Text style={styles.error}>{planError}</Text>}

          {plan && (
            <View style={styles.planResult}>
              <Text style={styles.planTitle}>
                {plan.type === "direct" ? "Direct route" : `${plan.transfer_count} transfer(s)`}
              </Text>
              {plan.segments.map((segment, index) => (
                <View key={`${segment.route_id}-${index}`} style={styles.segment}>
                  <Text style={styles.segmentHeader}>
                    Bus {segment.route_number}
                    {segment.prefix ? ` (${segment.prefix})` : ""}: {segment.from_stop} →{" "}
                    {segment.to_stop}
                  </Text>
                  <Text style={styles.segmentStops}>{segment.stops.join(" → ")}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc", padding: 16 },
  header: { fontSize: 24, fontWeight: "700", marginBottom: 12, color: "#111827" },
  tabs: { flexDirection: "row", marginBottom: 16, gap: 8 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
  },
  tabActive: { backgroundColor: "#2563eb" },
  tabText: { color: "#374151", fontWeight: "600" },
  tabTextActive: { color: "#fff", fontWeight: "600" },
  routeCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 10,
    overflow: "hidden",
    elevation: 2,
  },
  routeBadge: {
    width: 72,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },
  routeNumber: { color: "#fff", fontSize: 22, fontWeight: "700" },
  prefix: { color: "#fef08a", fontSize: 10, fontWeight: "700", marginTop: 4 },
  routeInfo: { flex: 1, padding: 12 },
  routeSummary: { color: "#374151", fontSize: 14, lineHeight: 20 },
  stopCount: { color: "#6b7280", fontSize: 12, marginTop: 4 },
  back: { marginBottom: 12 },
  backText: { color: "#2563eb", fontSize: 16 },
  title: { fontSize: 22, fontWeight: "700", color: "#111827" },
  subtitle: { color: "#6b7280", marginBottom: 12 },
  stopRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  badgeText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  stopInfo: { flex: 1 },
  stopName: { color: "#111827", fontSize: 15 },
  coords: { color: "#9ca3af", fontSize: 11, marginTop: 2 },
  planForm: { flex: 1 },
  label: { fontWeight: "600", color: "#374151", marginTop: 8, marginBottom: 4 },
  input: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    color: "#111827",
  },
  suggestion: { color: "#2563eb", paddingVertical: 6, paddingLeft: 4 },
  planButton: {
    backgroundColor: "#2563eb",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 16,
  },
  planButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: "#dc2626", marginTop: 12 },
  planResult: { marginTop: 16, backgroundColor: "#fff", borderRadius: 12, padding: 12 },
  planTitle: { fontWeight: "700", fontSize: 16, marginBottom: 8, color: "#111827" },
  segment: { marginBottom: 12 },
  segmentHeader: { fontWeight: "600", color: "#1f2937", marginBottom: 4 },
  segmentStops: { color: "#6b7280", fontSize: 13, lineHeight: 18 },
});
