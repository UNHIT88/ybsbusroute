import { ListCard, StopCard } from "@/components/BusCards";
import { sharedStyles } from "@/constants/styles";
import { colors, spacing } from "@/constants/theme";
import { useBusData } from "@/contexts/BusDataContext";
import { useLocale } from "@/contexts/LocaleContext";
import { getStop, searchStops } from "@/services/busData";
import { refineTripPlans } from "@/services/routeValidation";
import { findTripPlans, type TripPlan } from "@/services/routePlanner";
import { fetchTripPlansRemote } from "@/services/ybsRouteApi";
import { isStaticDataHost, YBS_API_BASE } from "@/constants/api";
import { formatStopLine, getStopName } from "@/services/stopLabels";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
  const [fromStop, setFromStop] = useState<BusStop | null>(null);
  const [toStop, setToStop] = useState<BusStop | null>(null);
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [query, setQuery] = useState("");
  const [plans, setPlans] = useState<TripPlan[]>([]);
  const [searched, setSearched] = useState(false);
  const [refining, setRefining] = useState(false);

  const pickerResults = useMemo(() => searchStops(query), [query, dataVersion]);

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
    if (picker === "from") setFromStop(stop);
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

  const header = (
    <View>
      <Text style={sharedStyles.title}>{t("plan", "title")}</Text>
      <Text style={sharedStyles.subtitle}>{t("plan", "subtitle")}</Text>

      <Pressable style={styles.selector} onPress={() => setPicker("from")}>
        <Text style={styles.selectorLabel}>{t("plan", "from")}</Text>
        <Text style={styles.selectorValue} numberOfLines={3}>
          {fromStop ? getStopName(fromStop, locale) : "—"}
        </Text>
      </Pressable>

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

          <TextInput
            style={styles.searchInput}
            placeholder={t("plan", "searchPlaceholder")}
            placeholderTextColor="#64748b"
            value={query}
            onChangeText={setQuery}
            autoFocus
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
                return (
                  <View key={`${leg.routeNumber}-${legIndex}`} style={styles.legBlock}>
                    <ListCard
                      label={leg.displayNumber}
                      color={leg.color}
                      subtitle={leg.routeName}
                      meta={`${leg.stopCount} ${t("plan", "stops")}`}
                      onPress={() => router.push(`/route/${leg.routeNumber}`)}
                    />
                    {from ? (
                      <Text style={styles.legMeta}>
                        {t("plan", "boardAt")}: {getStopName(from, locale)}
                      </Text>
                    ) : null}
                    {to ? (
                      <Text style={styles.legMeta}>
                        {t("plan", "getOffAt")}: {getStopName(to, locale)}
                      </Text>
                    ) : null}
                    {legIndex < item.legs.length - 1 ? (
                      <Text style={styles.transferHint}>{t("plan", "transferAt")}</Text>
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
