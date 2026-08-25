import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useActivityTones } from "../design/activity";
import { space } from "../design/tokens";
import { Text, Emoji } from "./ui";
import type { LogEntry } from "../api/logs";
import type { ActiveStarts } from "./Snapshot";

interface Props {
  logs: LogEntry[];
  /** In-progress sessions — freezes each label the same way Snapshot does. */
  activeStarts?: ActiveStarts;
  /** Tapping the strip scrolls Home back to the full snapshot. */
  onPress: () => void;
}

function latestOfType(logs: LogEntry[], type: string): LogEntry | null {
  for (const log of logs) {
    if (log.type === type) return log; // newest first
  }
  return null;
}

/**
 * "27m", "3h", "2d" — the snapshot's relative label squeezed down to one
 * token. Minutes are dropped once hours arrive: four items share one row,
 * and "3h 15m" times four overruns a small phone for precision nobody needs
 * at a glance — the full card is one tap away.
 */
function compactAgo(iso: string | null | undefined, asOfMs?: number): string {
  if (!iso) return "—";
  const mins = Math.floor(
    ((asOfMs ?? Date.now()) - new Date(iso).getTime()) / 60000
  );
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * The snapshot at a glance, one line tall: each activity's emoji and how
 * long ago it last happened. Pinned over Home once the full snapshot has
 * scrolled away — see the hero note in HomeScreen for why it fades in over
 * the scroll rather than the hero shrinking in place.
 */
export default function SnapshotMiniBar({ logs, activeStarts, onPress }: Props) {
  const tones = useActivityTones();

  // Same cadence as Snapshot's own tick — relative labels round to the
  // minute, so this only needs to stay honest, not smooth.
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const lastFeed = latestOfType(logs, "feed");
  const lastSleep = latestOfType(logs, "sleep");
  const lastDiaper = latestOfType(logs, "diaper");
  const lastPump = latestOfType(logs, "pump");

  const items = [
    {
      key: "feed",
      emoji: tones.feed.emoji,
      label: "feed",
      value: compactAgo(lastFeed?.startTime, activeStarts?.feed?.getTime()),
    },
    {
      key: "sleep",
      emoji: tones.sleep.emoji,
      label: "sleep",
      // Counted from when it ended, matching the full card.
      value: compactAgo(
        lastSleep ? lastSleep.endTime ?? lastSleep.startTime : null,
        activeStarts?.sleep?.getTime()
      ),
    },
    {
      key: "diaper",
      emoji: tones.diaper.emoji,
      label: "diaper",
      value: compactAgo(lastDiaper?.startTime),
    },
    {
      key: "pump",
      emoji: tones.pump.emoji,
      label: "pump",
      value: compactAgo(lastPump?.startTime, activeStarts?.pump?.getTime()),
    },
  ];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Summary: ${items
        .map((i) => `${i.label} ${i.value === "—" ? "none yet" : `${i.value} ago`}`)
        .join(", ")}. Scrolls back to the full snapshot.`}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      {items.map((item) => (
        <View key={item.key} style={styles.item}>
          <Emoji size={14}>{item.emoji}</Emoji>
          <Text variant="subheadStrong" tabular numberOfLines={1} style={styles.value}>
            {item.value}
          </Text>
        </View>
      ))}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    // Every item shares the row evenly, so the strip reads as four fixed
    // slots rather than a sentence that reflows as the numbers change width.
    flex: 1,
    justifyContent: "center",
  },
  value: { color: "#ffffff" },
});
