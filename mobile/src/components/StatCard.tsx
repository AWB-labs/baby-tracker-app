import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../design/ThemeProvider";
import { space, radius } from "../design/tokens";
import { useActivityTone, ACTIVITY_LABEL } from "../design/activity";
import { Card, Text, Emoji } from "./ui";

interface Props {
  icon: string;
  label: string;
  today: string;
  avg: string;
  total: string;
  /** How many times the activity happened all-time, shown under the total. */
  totalCount?: number;
  /**
   * Activity key used for the card's tint. Callers that track something without
   * an activity of its own can omit it and keep the brand accent.
   */
  type?: string;
}

export default function StatCard({
  icon,
  label,
  today,
  avg,
  total,
  totalCount,
  type,
}: Props) {
  const t = useTheme();
  const tone = useActivityTone(type ?? "");
  // The neutral tone is a grey placeholder, which would drain a card that has
  // no activity behind it; those keep the accent they had before.
  const known = type != null && type in ACTIVITY_LABEL;
  const hue = known ? tone.text : t.accentText;
  const soft = known ? tone.soft : t.accentSoft;

  return (
    <Card>
      <View style={styles.headerRow}>
        <View style={[styles.iconChip, { backgroundColor: soft }]}>
          <Emoji size={18}>{icon}</Emoji>
        </View>
        <Text variant="subheadStrong">{label}</Text>
      </View>

      <View style={styles.statsRow}>
        {/* Today is the figure you came for, so it carries the activity's hue;
            the other two recede rather than compete with it. */}
        <Stat value={today} caption="Today" color={hue} />
        <Stat value={avg} caption="Daily avg" color={t.textMuted} />
        <Stat value={total} caption="All time" color={t.textSubtle}>
          {totalCount !== undefined && totalCount > 0 && (
            <Text variant="caption" style={{ color: hue }} tabular>
              {totalCount} time{totalCount !== 1 ? "s" : ""}
            </Text>
          )}
        </Stat>
      </View>
    </Card>
  );
}

/** One figure and its caption. Tabular digits keep the three columns aligned. */
function Stat({
  value,
  caption,
  color,
  children,
}: {
  value: string;
  caption: string;
  color: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.statCell}>
      <Text variant="title3" tabular center style={{ color }}>
        {value}
      </Text>
      <Text variant="overline" tone="subtle" center>
        {caption}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginBottom: space.md,
  },
  iconChip: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  statsRow: { flexDirection: "row", gap: space.xs },
  statCell: { flex: 1, alignItems: "center", gap: space.xxs },
});
