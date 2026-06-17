import { colors } from "@/constants/theme";
import type { StopServingRoute } from "@/services/busData";
import type { StopProgressStatus } from "@/services/routeProgress";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  label: string;
  color?: string;
  subtitle?: string;
  meta?: string;
  onPress?: () => void;
};

export function RouteBadge({ label, color = colors.primary }: { label: string; color?: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>YBS {label}</Text>
    </View>
  );
}

export function BusNumberChip({
  label,
  color = colors.primary,
}: {
  label: string;
  color?: string;
}) {
  return (
    <View style={[styles.busChip, { borderColor: color, backgroundColor: colors.surfaceAlt }]}>
      <Text style={styles.busChipText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function NearbyStopCard({
  title,
  subtitle,
  routes,
  emptyLabel,
  onPress,
}: {
  title: string;
  subtitle: string;
  routes: StopServingRoute[];
  emptyLabel: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.nearbyCard, pressed && styles.pressed]}
    >
      <View style={styles.nearbyRow}>
        <View style={styles.stopColumn}>
          <Text style={styles.title} numberOfLines={3}>
            {title}
          </Text>
          <Text style={styles.meta} numberOfLines={2}>
            {subtitle}
          </Text>
        </View>

        <View style={styles.columnDivider} />

        <View style={styles.busColumn}>
          {routes.length > 0 ? (
            <View style={styles.busChipWrap}>
              {routes.map((route) => (
                <BusNumberChip
                  key={route.routeNumber}
                  label={route.displayNumber}
                  color={route.color}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.busEmpty}>{emptyLabel}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export function ListCard({ label, color, subtitle, meta, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <RouteBadge label={label} color={color} />
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={2}>
            {subtitle}
          </Text>
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

function statusBorderColor(status?: StopProgressStatus): string | undefined {
  switch (status) {
    case "passed":
      return colors.border;
    case "current":
      return colors.warning;
    case "next":
      return colors.success;
    default:
      return undefined;
  }
}

export function StopCard({
  title,
  subtitle,
  meta,
  status,
  onPress,
}: {
  title: string;
  subtitle: string;
  meta?: string;
  status?: StopProgressStatus;
  onPress?: () => void;
}) {
  const borderColor = statusBorderColor(status);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        status === "passed" && styles.cardPassed,
        borderColor ? { borderColor } : null,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[styles.title, status === "passed" && styles.titlePassed]}
        numberOfLines={3}
      >
        {title}
      </Text>
      <Text style={styles.meta} numberOfLines={2}>
        {subtitle}
      </Text>
      {meta ? <Text style={styles.metaSmall}>{meta}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  cardPassed: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.85,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 72,
    alignItems: "center",
  },
  badgeText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 12,
  },
  body: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  titlePassed: {
    color: colors.textMuted,
    textDecorationLine: "line-through",
  },
  meta: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  metaSmall: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 6,
  },
  nearbyCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  nearbyRow: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 56,
  },
  stopColumn: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
    justifyContent: "center",
  },
  columnDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginVertical: 2,
  },
  busColumn: {
    width: "42%",
    maxWidth: "42%",
    paddingLeft: 10,
    justifyContent: "center",
  },
  busChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  busChip: {
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 3,
    minWidth: 28,
    alignItems: "center",
  },
  busChipText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "700",
  },
  busEmpty: {
    color: colors.textMuted,
    fontSize: 12,
    fontStyle: "italic",
  },
});
