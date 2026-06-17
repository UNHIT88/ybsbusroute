import { ListCard, StopCard } from "@/components/BusCards";
import { sharedStyles } from "@/constants/styles";
import { colors, spacing } from "@/constants/theme";
import { useBusData } from "@/contexts/BusDataContext";
import { useLocale } from "@/contexts/LocaleContext";
import { useCurrentLocationStop } from "@/hooks/useCurrentLocationStop";
import { getStop, getStopServingRoutes, searchStops } from "@/services/busData";
import { refineTripPlans } from "@/services/routeValidation";
import { findTripPlans, type TripPlan } from "@/services/routePlanner";
import { fetchTripPlansRemote } from "@/services/ybsRouteApi";
import { isStaticDataHost, YBS_API_BASE } from "@/constants/api";
import { formatStopLine, getStopName } from "@/services/stopLabels";
import { formatTransferBetween } from "@/services/tripPlanUtils";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BusStop } from "@/types/bus";

type PickerTarget = "from" | "to" | null;

export default function PlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { locale, t } = useLocale();
  const { dataVersion } = useBusData();
  const location = useCurrentLocationStop();
  const [fromStop, setFromStop] = useState<BusStop | null>(null);
  const [fromUsesCurrentLocation, setFromUsesCurrentLocation] = useState(false);
  const [toStop, setToStop] = useState<BusStop | null>(null);
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [query, setQuery] = useState("");
  const [plans, setPlans] = useState<TripPlan[]>([]);
  const [searched, setSearched] = useState(false);
  const [refining, setRefining] = useState(false);

  const pickerResults = useMemo(() => searchStops(query), [query, dataVersion]);

  const fromServingRoutes = useMemo(
    () => (fromStop ? getStopServingRoutes(fromStop) : []),
    [fromStop, dataVersion]
  );

  async function handleUseCurrentLocation() {
    Keyboard.dismiss();
    setFromUsesCurrentLocation(true);
    const nearest = await location.detect();
    if (nearest) {
      setFromStop(nearest);
      setSearched(false);
      setPlans([]);
    }
  }

  async function handleFindRoutes() {
    Keyboard.dismiss();
    if (!fromStop || !toStop) {
      setPlans([]);
      setSearched(true);
      return;
    }

    setSearched(true);
    setRefining(true);

    let initial = findTripPlans(fromStop.id, toStop.id);
    if (initial.length === 0 && !isStaticDataHost(YBS_API_BASE)) {
      try {
        initial = await fetchTripPlansRemote(fromStop.id, toStop.id);
      } catch {
        initial = [];
      }
    }
    setPlans(initial);

    try {
      const refined = await refineTripPlans(initial);
      setPlans(refined.length > 0 ? refined : initial);
    } finally {
      setRefining(false);
    }
  }

  function selectStop(stop: BusStop) {
    if (picker === "from") {
      setFromStop(stop);
      setFromUsesCurrentLocation(false);
      location.clear();
    }
    if (picker === "to") setToStop(stop);
    setPicker(null);
    setQuery("");
    setSearched(false);
    setPlans([]);
    Keyboard.dismiss();
  }

  function closePicker() {
    setPicker(null);
    setQuery("");
    Keyboard.dismiss();
  }

  function renderFromValue() {
    if (location.detecting && fromUsesCurrentLocation) {
      return t("plan", "detectingLocation");
    }
    if (fromStop && fromUsesCurrentLocation) {
      return `${t("plan", "currentLocation")} · ${getStopName(fromStop, locale)}`;
    }
    if (fromStop) {
      return getStopName(fromStop, locale);
    }
    return "—";
  }

  function renderLocationError() {
    if (!fromUsesCurrentLocation) return null;
    if (location.permissionDenied) {
      return t("plan", "locationDenied");
    }
    if (location.error && location.error !== "no-nearby-stop") {
      return t("plan", "locationFailed");
    }
    if (location.error === "no-nearby-stop") {
      return t("map", "noStops");
    }
    return null;
  }

  const locationError = renderLocationError();

  const header = (
    <View>
      <Text style={sharedStyles.title}>{t("plan", "title")}</Text>
      <Text style={sharedStyles.subtitle}>{t("plan", "subtitle")}</Text>

      <Pressable style={styles.selector} onPress={() => setPicker("from")}>
        <Text style={styles.selectorLabel}>{t("plan", "from")}</Text>
        <Text style={styles.selectorValue} numberOfLines={3}>
          {renderFromValue()}
        </Text>
        {fromUsesCurrentLocation && location.formatDistance(locale) ? (
          <Text style={styles.selectorMeta}>
            {location.formatDistance(locale)} {t("currentStop", "away")}
          </Text>
        ) : null}
      </Pressable>

      <Pressable
        style={[styles.locationButton, location.detecting && styles.locationButtonDisabled]}
        onPress={handleUseCurrentLocation}
        disabled={location.detecting}
      >
        {location.detecting ? (
          <ActivityIndicator color={colors.primary} size="small" />
        ) : (
          <Ionicons name="locate" size={18} color={colors.primary} />
        )}
        <Text style={styles.locationButtonText}>{t("plan", "useCurrentLocation")}</Text>
      </Pressable>

      {locationError ? <Text style={styles.locationError}>{locationError}</Text> : null}

      {fromStop && fromServingRoutes.length > 0 ? (
        <View style={styles.busesHereCard}>
          <Text style={styles.busesHereTitle}>{t("plan", "busesHere")}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.busesHereRow}
          >
            {fromServingRoutes.map((route) => (
              <Pressable
                key={route.routeNumber}
                style={[styles.busChip, { borderColor: route.color }]}
                onPress={() => router.push(`/route/${route.routeNumber}`)}
              >
                <Text style={styles.busChipNumber}>{route.displayNumber}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <Pressable style={styles.selector} onPress={() => setPicker("to")}>
        <Text style={styles.selectorLabel}>{t("plan", "to")}</Text>
        <Text style={styles.selectorValue} numberOfLines={3}>
          {toStop ? getStopName(toStop, locale) : "—"}
        </Text>
      </Pressable>

      <Pressable
        style={[styles.findButton, refining && styles.findButtonDisabled]}
        onPress={handleFindRoutes}
        disabled={refining}
      >
        {refining ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={styles.findButtonText}>{t("plan", "findRoutes")}</Text>
        )}
      </Pressable>
      {refining ? (
        <Text style={styles.refiningText}>{t("plan", "refiningRoutes")}</Text>
      ) : null}
    </View>
  );

  if (picker) {
    return (
      <KeyboardAvoidingView
        style={sharedStyles.screen}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 56 : 0}
      >
        <View style={[styles.pickerContainer, { paddingTop: spacing.md }]}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>
              {picker === "from" ? t("plan", "from") : t("plan", "to")}
            </Text>
            <Pressable onPress={closePicker} hitSlop={12}>
              <Text style={styles.cancelText}>{t("plan", "cancel")}</Text>
            </Pressable>
          </View>

          {picker === "from" ? (
            <Pressable
              style={styles.currentLocationPicker}
              onPress={async () => {
                setFromUsesCurrentLocation(true);
                const nearest = await location.detect();
                if (nearest) selectStop(nearest);
              }}
              disabled={location.detecting}
            >
              <Ionicons name="locate" size={20} color={colors.primary} />
              <View style={styles.currentLocationPickerText}>
                <Text style={styles.currentLocationPickerTitle}>
                  {t("plan", "useCurrentLocation")}
                </Text>
                <Text style={styles.currentLocationPickerSubtitle}>
                  {location.detecting
                    ? t("plan", "detectingLocation")
                    : t("currentStop", "nearbyStops")}
                </Text>
              </View>
              {location.detecting ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              )}
            </Pressable>
          ) : null}

          <TextInput
            style={styles.searchInput}
            placeholder={t("plan", "searchPlaceholder")}
            placeholderTextColor="#64748b"
            value={query}
            onChangeText={setQuery}
            autoFocus={picker !== "from"}
            autoCorrect={false}
            returnKeyType="search"
            multiline={false}
            textAlignVertical="center"
          />

          <FlatList
            data={pickerResults}
            keyExtractor={(item) => String(item.id)}
            style={styles.pickerList}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{
              paddingBottom: insets.bottom + spacing.lg,
            }}
            renderItem={({ item }) => (
              <StopCard
                title={getStopName(item, locale)}
                subtitle={formatStopLine(item, locale)}
                meta={`YBS ${item.routes.slice(0, 8).join(", ")}`}
                onPress={() => selectStop(item)}
              />
            )}
            ListEmptyComponent={
              <Text style={sharedStyles.emptyText}>{t("search", "typeStops")}</Text>
            }
          />
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={sharedStyles.screen}>
        <FlatList
          data={plans}
          keyExtractor={(_, index) => `plan-${index}`}
          ListHeaderComponent={header}
          contentContainerStyle={[
            sharedStyles.content,
            { paddingBottom: insets.bottom + spacing.lg },
          ]}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            searched ? (
              <Text style={sharedStyles.emptyText}>
                {!fromStop || !toStop ? t("plan", "selectBoth") : t("plan", "noResults")}
              </Text>
            ) : null
          }
          renderItem={({ item, index }) => (
            <View style={styles.planCard}>
              <Text style={styles.planTitle}>
                {t("plan", "option")} {index + 1} ·{" "}
                {item.transferCount === 0
                  ? t("plan", "direct")
                  : `${item.transferCount} ${t("plan", "transfers")}`}{" "}
                · {item.totalStops} {t("plan", "stops")}
              </Text>
              {item.legs.map((leg, legIndex) => {
                const from = getStop(leg.fromStopId);
                const to = getStop(leg.toStopId);
                const nextLeg =
                  legIndex < item.legs.length - 1 ? item.legs[legIndex + 1] : null;
                const isFirstLeg = legIndex === 0;
                const isLastLeg = legIndex === item.legs.length - 1;
                const transferLabel =
                  nextLeg != null ? formatTransferBetween(leg, nextLeg, locale) : "";
                const stepNumber = legIndex + 1;
                return (
                  <View key={`${leg.routeNumber}-${legIndex}`} style={styles.legBlock}>
                    <Text style={styles.stepLabel}>
                      {t("plan", "step")} {stepNumber} · {t("plan", "takeBus")}{" "}
                      {leg.displayNumber}
                    </Text>
                    <ListCard
                      label={leg.displayNumber}
                      color={leg.color}
                      subtitle={leg.routeName}
                      meta={`${leg.stopCount} ${t("plan", "stops")}`}
                      onPress={() => router.push(`/route/${leg.routeNumber}`)}
                    />
                    {isFirstLeg && from ? (
                      <Text style={styles.legMeta}>
                        {t("plan", "boardAt")}: {getStopName(from, locale)}
                      </Text>
                    ) : null}
                    {isLastLeg && to ? (
                      <Text style={styles.legMeta}>
                        {t("plan", "getOffAt")}: {getStopName(to, locale)}
                      </Text>
                    ) : null}
                    {transferLabel ? (
                      <Text style={styles.transferHint}>
                        {t("plan", "transferAt")}: {transferLabel}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        />
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  selector: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    minHeight: 64,
  },
  selectorLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 6,
  },
  selectorValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
    flexShrink: 1,
  },
  selectorMeta: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
  locationButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: 12,
    marginBottom: spacing.sm,
  },
  locationButtonDisabled: {
    opacity: 0.85,
  },
  locationButtonText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 15,
  },
  locationError: {
    color: colors.warning,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  busesHereCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  busesHereTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  busesHereRow: {
    gap: 8,
    paddingRight: spacing.sm,
  },
  busChip: {
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surfaceAlt,
  },
  busChipNumber: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  findButton: {
    backgroundColor: colors.primaryDark,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: spacing.sm,
    minHeight: 48,
    justifyContent: "center",
  },
  findButtonDisabled: {
    opacity: 0.85,
  },
  findButtonText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 16,
  },
  refiningText: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: spacing.md,
  },
  pickerContainer: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  pickerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  currentLocationPicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  currentLocationPickerText: {
    flex: 1,
  },
  currentLocationPickerTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  currentLocationPickerSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === "android" ? 14 : 12,
    minHeight: 52,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 16,
    lineHeight: 22,
    marginBottom: spacing.sm,
    ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
  },
  pickerList: {
    flex: 1,
  },
  cancelText: {
    color: colors.primary,
    fontWeight: "600",
    fontSize: 15,
  },
  planCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  planTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 15,
    marginBottom: spacing.sm,
  },
  legBlock: {
    marginBottom: spacing.sm,
  },
  stepLabel: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
  },
  legMeta: {
    color: colors.textMuted,
    fontSize: 13,
    marginLeft: 4,
    marginTop: 2,
    lineHeight: 20,
  },
  transferHint: {
    color: colors.warning,
    fontSize: 12,
    marginTop: 4,
    marginBottom: spacing.sm,
    fontWeight: "600",
  },
});
