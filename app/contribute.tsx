import { BusMap } from "@/components/BusMap";
import { sharedStyles } from "@/constants/styles";
import { colors, spacing, YANGON_REGION } from "@/constants/theme";
import { useBusData } from "@/contexts/BusDataContext";
import { useLocale } from "@/contexts/LocaleContext";
import { saveCustomRouteRecord } from "@/services/customRouteStorage";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Region } from "react-native-maps";

type DraftStop = {
  localId: string;
  name: string;
  lat: number;
  lng: number;
  capturedAt: string;
};

const LOCATION_TIMEOUT_MS = 12_000;

async function getCurrentCoords(): Promise<{ lat: number; lng: number }> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error("permission-denied");
  }

  try {
    const location = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<Location.LocationObject>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), LOCATION_TIMEOUT_MS)
      ),
    ]);
    return { lat: location.coords.latitude, lng: location.coords.longitude };
  } catch {
    const lastKnown = await Location.getLastKnownPositionAsync();
    if (!lastKnown) throw new Error("unavailable");
    return { lat: lastKnown.coords.latitude, lng: lastKnown.coords.longitude };
  }
}

export default function ContributeScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const { refreshBusData } = useBusData();
  const [busNumber, setBusNumber] = useState("");
  const [recording, setRecording] = useState(false);
  const [stops, setStops] = useState<DraftStop[]>([]);
  const [stopNameInput, setStopNameInput] = useState("");
  const [addingStop, setAddingStop] = useState(false);
  const [saving, setSaving] = useState(false);

  const mapStops = useMemo(
    () =>
      stops.map((stop, index) => ({
        id: stop.localId,
        latitude: stop.lat,
        longitude: stop.lng,
        title: stop.name,
        description: `#${index + 1}`,
        sequence: index + 1,
        color: colors.success,
      })),
    [stops]
  );

  const region: Region = useMemo(() => {
    if (!stops.length) return YANGON_REGION;
    const lats = stops.map((s) => s.lat);
    const lngs = stops.map((s) => s.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(0.02, (maxLat - minLat) * 1.6 + 0.01),
      longitudeDelta: Math.max(0.02, (maxLng - minLng) * 1.6 + 0.01),
    };
  }, [stops]);

  function startTrip() {
    const label = busNumber.trim();
    if (!label) {
      Alert.alert(t("contribute", "title"), t("contribute", "busNumberRequired"));
      return;
    }
    setRecording(true);
    setStops([]);
    setStopNameInput("");
  }

  function cancelTrip() {
    setRecording(false);
    setStops([]);
    setStopNameInput("");
  }

  async function addCurrentStop() {
    setAddingStop(true);
    try {
      const coords = await getCurrentCoords();
      const defaultName = `${t("contribute", "stopDefault")} ${stops.length + 1}`;
      const name = stopNameInput.trim() || defaultName;

      setStops((prev) => [
        ...prev,
        {
          localId: `${Date.now()}-${prev.length}`,
          name,
          lat: coords.lat,
          lng: coords.lng,
          capturedAt: new Date().toISOString(),
        },
      ]);
      setStopNameInput("");
    } catch (error) {
      const message =
        error instanceof Error && error.message === "permission-denied"
          ? t("contribute", "locationDenied")
          : t("contribute", "locationFailed");
      Alert.alert(t("contribute", "title"), message);
    } finally {
      setAddingStop(false);
    }
  }

  async function saveRoute() {
    if (stops.length < 2) {
      Alert.alert(t("contribute", "title"), t("contribute", "minStops"));
      return;
    }

    setSaving(true);
    try {
      await saveCustomRouteRecord({
        busNumberLabel: busNumber.trim(),
        stops,
      });
      await refreshBusData();
      Alert.alert(t("contribute", "savedTitle"), t("contribute", "savedMessage"));
      setRecording(false);
      setStops([]);
      setBusNumber("");
      setStopNameInput("");
    } catch {
      Alert.alert(t("contribute", "title"), t("contribute", "saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={sharedStyles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.mapWrap}>
        <BusMap region={region} stops={mapStops} showRouteLine={stops.length > 1} />
      </View>

      <View style={styles.panel}>
        <Text style={sharedStyles.title}>{t("contribute", "title")}</Text>
        <Text style={sharedStyles.subtitle}>{t("contribute", "subtitle")}</Text>

        {!recording ? (
          <View style={styles.form}>
            <Text style={styles.label}>{t("contribute", "busNumberLabel")}</Text>
            <TextInput
              style={sharedStyles.searchInput}
              placeholder={t("contribute", "busNumberPlaceholder")}
              placeholderTextColor={colors.textMuted}
              value={busNumber}
              onChangeText={setBusNumber}
              autoCapitalize="characters"
            />
            <Pressable style={styles.primaryButton} onPress={startTrip}>
              <Ionicons name="play" size={18} color={colors.text} />
              <Text style={styles.primaryButtonText}>{t("contribute", "startTrip")}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.recording}>
            <View style={styles.recordingHeader}>
              <View>
                <Text style={styles.recordingLabel}>{t("contribute", "recording")}</Text>
                <Text style={styles.recordingBus}>{busNumber.trim()}</Text>
              </View>
              <Pressable style={styles.cancelChip} onPress={cancelTrip}>
                <Text style={styles.cancelChipText}>{t("contribute", "cancel")}</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>{t("contribute", "stopNameLabel")}</Text>
            <TextInput
              style={sharedStyles.searchInput}
              placeholder={t("contribute", "stopNamePlaceholder")}
              placeholderTextColor={colors.textMuted}
              value={stopNameInput}
              onChangeText={setStopNameInput}
            />

            <Pressable
              style={[styles.addButton, addingStop && styles.buttonDisabled]}
              onPress={addCurrentStop}
              disabled={addingStop}
            >
              {addingStop ? (
                <ActivityIndicator color={colors.text} size="small" />
              ) : (
                <Ionicons name="add-circle" size={22} color={colors.text} />
              )}
              <Text style={styles.addButtonText}>{t("contribute", "addStop")}</Text>
            </Pressable>

            <Text style={styles.stopsTitle}>
              {t("contribute", "stopsAdded")} ({stops.length})
            </Text>
            <FlatList
              data={stops}
              keyExtractor={(item) => item.localId}
              style={styles.stopList}
              ListEmptyComponent={
                <Text style={styles.emptyStops}>{t("contribute", "noStopsYet")}</Text>
              }
              renderItem={({ item, index }) => (
                <View style={styles.stopRow}>
                  <View style={styles.stopIndex}>
                    <Text style={styles.stopIndexText}>{index + 1}</Text>
                  </View>
                  <View style={styles.stopBody}>
                    <Text style={styles.stopName}>{item.name}</Text>
                    <Text style={styles.stopCoords}>
                      {item.lat.toFixed(5)}, {item.lng.toFixed(5)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() =>
                      setStops((prev) => prev.filter((stop) => stop.localId !== item.localId))
                    }
                  >
                    <Ionicons name="trash-outline" size={20} color={colors.warning} />
                  </Pressable>
                </View>
              )}
            />

            <Pressable
              style={[styles.saveButton, saving && styles.buttonDisabled]}
              onPress={saveRoute}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={colors.text} size="small" />
              ) : (
                <Ionicons name="save-outline" size={20} color={colors.text} />
              )}
              <Text style={styles.saveButtonText}>{t("contribute", "saveRoute")}</Text>
            </Pressable>
          </View>
        )}

        <Pressable style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>{t("contribute", "back")}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  mapWrap: {
    height: 220,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  panel: {
    flex: 1,
    padding: spacing.md,
    minHeight: 0,
  },
  form: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    marginTop: spacing.sm,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primaryDark,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: spacing.sm,
  },
  primaryButtonText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 16,
  },
  recording: {
    flex: 1,
    minHeight: 0,
  },
  recordingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.sm,
  },
  recordingLabel: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  recordingBus: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 2,
  },
  cancelChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  cancelChipText: {
    color: colors.textMuted,
    fontWeight: "600",
    fontSize: 13,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.success,
    paddingVertical: 14,
    marginTop: spacing.sm,
  },
  addButtonText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 15,
  },
  stopsTitle: {
    color: colors.text,
    fontWeight: "700",
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  stopList: {
    flex: 1,
    marginBottom: spacing.sm,
  },
  emptyStops: {
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.md,
  },
  stopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginBottom: 8,
  },
  stopIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  stopIndexText: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 12,
  },
  stopBody: {
    flex: 1,
  },
  stopName: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 15,
  },
  stopCoords: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primaryDark,
    borderRadius: 12,
    paddingVertical: 14,
  },
  saveButtonText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  backLink: {
    alignItems: "center",
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  backLinkText: {
    color: colors.primary,
    fontWeight: "600",
  },
});
