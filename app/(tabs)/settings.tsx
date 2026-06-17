import { sharedStyles } from "@/constants/styles";
import { colors, spacing } from "@/constants/theme";
import type { Locale } from "@/constants/i18n";
import { useBusData } from "@/contexts/BusDataContext";
import { useLocale } from "@/contexts/LocaleContext";
import { getDatasetCounts, getMetadata } from "@/services/busData";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function SettingsScreen() {
  const router = useRouter();
  const { locale, setLocale, t } = useLocale();
  const { customRouteCount, remoteLoaded, remoteSource, apiBaseUrl } = useBusData();
  const metadata = getMetadata();
  const counts = getDatasetCounts();

  function LanguageOption({ value, label }: { value: Locale; label: string }) {
    const active = locale === value;
    return (
      <Pressable
        style={[styles.option, active && styles.optionActive]}
        onPress={() => setLocale(value)}
      >
        <Text style={[styles.optionText, active && styles.optionTextActive]}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <View style={[sharedStyles.screen, sharedStyles.content]}>
      <Text style={sharedStyles.title}>{t("settings", "title")}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings", "language")}</Text>
        <View style={styles.row}>
          <LanguageOption value="en" label={t("settings", "english")} />
          <LanguageOption value="mm" label={t("settings", "myanmar")} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings", "contribute")}</Text>
        <Pressable style={styles.contributeCard} onPress={() => router.push("/contribute")}>
          <Text style={styles.contributeTitle}>{t("contribute", "title")}</Text>
          <Text style={styles.contributeSubtitle}>{t("contribute", "settingsHint")}</Text>
          {customRouteCount > 0 ? (
            <Text style={styles.contributeMeta}>
              {customRouteCount} {t("settings", "customRoutesSaved")}
            </Text>
          ) : null}
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings", "about")}</Text>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t("settings", "dataSource")}</Text>
          <Text style={styles.cardValue}>{metadata.agency}</Text>
          <Text style={styles.cardLabel}>{t("settings", "apiSource")}</Text>
          <Text style={styles.cardValue}>
            {remoteLoaded
              ? (remoteSource ?? t("settings", "apiOnline"))
              : t("settings", "apiOffline")}
          </Text>
          <Text style={styles.cardMeta}>{apiBaseUrl}</Text>
          <Text style={styles.cardLabel}>{metadata.city}, {metadata.country}</Text>
          <Text style={styles.cardValue}>
            {counts.routes} {t("settings", "routes")} · {counts.stops} {t("settings", "stops")}
            {counts.customRoutes > 0
              ? ` · ${counts.customRoutes} ${t("settings", "custom")}`
              : ""}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  option: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionActive: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primary,
  },
  optionText: {
    color: colors.textMuted,
    fontWeight: "600",
  },
  optionTextActive: {
    color: colors.text,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  cardLabel: {
    color: colors.textMuted,
    fontSize: 13,
  },
  cardValue: {
    color: colors.text,
    fontSize: 15,
    marginBottom: spacing.sm,
  },
  cardMeta: {
    color: colors.textMuted,
    fontSize: 11,
    marginBottom: spacing.sm,
  },
  contributeCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  contributeTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  contributeSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 6,
  },
  contributeMeta: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 8,
  },
});
