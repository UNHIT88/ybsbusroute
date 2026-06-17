import { BusMap } from "@/components/BusMap";
import { CurrentStopBuses } from "@/components/CurrentStopBuses";
import { sharedStyles } from "@/constants/styles";
import { colors, spacing, YANGON_REGION } from "@/constants/theme";
import { useLocale } from "@/contexts/LocaleContext";
import { formatStopLine, getStopName } from "@/services/stopLabels";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Region } from "react-native-maps";
import type { BusStop } from "@/types/bus";

export default function MapScreen() {
  const { locale, t } = useLocale();
  const [selectedStop, setSelectedStop] = useState<BusStop | null>(null);

  const region: Region = useMemo(() => {
    if (selectedStop) {
      return {
        latitude: selectedStop.lat,
        longitude: selectedStop.lng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }
    return YANGON_REGION;
  }, [selectedStop]);

  const mapStops = selectedStop
    ? [
        {
          id: selectedStop.id,
          latitude: selectedStop.lat,
          longitude: selectedStop.lng,
          title: getStopName(selectedStop, locale),
          description: formatStopLine(selectedStop, locale),
        },
      ]
    : [];

  return (
    <View style={sharedStyles.screen}>
      <View style={styles.mapContainer}>
        <BusMap
          region={region}
          stops={mapStops}
          selectedStopId={selectedStop?.id}
        />
      </View>

      <View style={styles.panel}>
        <Text style={sharedStyles.title}>{t("currentStop", "title")}</Text>
        <Text style={sharedStyles.subtitle}>{t("currentStop", "subtitle")}</Text>
        <CurrentStopBuses onStopChange={setSelectedStop} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mapContainer: {
    height: 220,
    minHeight: 220,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  panel: {
    flex: 1,
    padding: spacing.md,
    minHeight: 0,
  },
});
