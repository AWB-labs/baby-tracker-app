import React from "react";
import { StyleSheet, View } from "react-native";
import { formatMinutes } from "../utils/formatDuration";
import { useUnits } from "../context/SettingsContext";
import { useActivityTones, type ActivityKey } from "../design/activity";
import { space, radius } from "../design/tokens";
import { Text, Emoji } from "./ui";

export interface DayStats {
  feedTime: number;
  /** Pumped volume for the day, in ml. */
  pumpMl: number;
  pumpTime: number;
  sleepTime: number;
  diaperCount: number;
  showerCount: number;
  vitaminCount: number;
  nailcutCount: number;
  healthCount: number;
}

interface Props {
  stats: DayStats;
}

interface Item {
  key: string;
  /** Which tone (and emoji) the chip borrows — two chips can share one. */
  activity: ActivityKey;
  /** Spoken name; the emoji alone would say nothing to a screen reader. */
  name: string;
  /**
   * Overrides the tone's emoji when two chips share a tone and would otherwise
   * be indistinguishable at a glance (pumped volume vs. pumping time).
   */
  emoji?: string;
  value: string;
  show: boolean;
}

export default function DayStatsBar({ stats }: Props) {
  const units = useUnits();
  const tones = useActivityTones();
  const items = ([
    { key: "feed", activity: "feed", name: "Feeding time", value: formatMinutes(stats.feedTime), show: stats.feedTime > 0 },
    { key: "pumpMl", activity: "pump", name: "Pumped", value: units.formatVolume(stats.pumpMl), show: stats.pumpMl > 0 },
    { key: "pumpTime", activity: "pump", name: "Pumping time", emoji: "⏱", value: formatMinutes(stats.pumpTime), show: stats.pumpTime > 0 },
    { key: "sleep", activity: "sleep", name: "Sleep", value: formatMinutes(stats.sleepTime), show: stats.sleepTime > 0 },
    { key: "diaper", activity: "diaper", name: "Diapers", value: `${stats.diaperCount}×`, show: stats.diaperCount > 0 },
    { key: "shower", activity: "shower", name: "Showers", value: `${stats.showerCount}×`, show: stats.showerCount > 0 },
    { key: "vitamin", activity: "vitamin", name: "Vitamins", value: `${stats.vitaminCount}×`, show: stats.vitaminCount > 0 },
    { key: "nailcut", activity: "nailcut", name: "Nail cuts", value: `${stats.nailcutCount}×`, show: stats.nailcutCount > 0 },
    { key: "health", activity: "health", name: "Health entries", value: `${stats.healthCount}×`, show: stats.healthCount > 0 },
  ] satisfies Item[]).filter((i) => i.show);

  if (items.length === 0) return null;

  return (
    <View style={styles.row}>
      {items.map((item) => {
        const tone = tones[item.activity];
        return (
          <View
            key={item.key}
            // Read as one phrase — "Pumped, 120 ml" — rather than as a loose
            // emoji and a number the listener has to reassemble.
            accessible
            accessibilityLabel={`${item.name}: ${item.value}`}
            style={[
              styles.chip,
              { backgroundColor: tone.soft, borderColor: tone.border },
            ]}
          >
            <Emoji size={13}>{item.emoji ?? tone.emoji}</Emoji>
            <Text variant="caption" tabular style={{ color: tone.text }}>
              {item.value}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
