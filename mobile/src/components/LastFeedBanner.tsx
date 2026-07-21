import React, { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import type { LogEntry } from "../api/logs";
import { useTheme } from "../theme";

const DIAPER_STATUS_META: Record<string, { icon: string; label: string }> = {
  empty: { icon: "✅", label: "Empty" },
  wet: { icon: "💧", label: "Wet" },
  dirty: { icon: "💩", label: "Dirty" },
  wet_and_dirty: { icon: "💧💩", label: "Wet & Dirty" },
};

interface Props {
  logs: LogEntry[];
}

function formatElapsed(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 1) return "just now";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m ago`;
  if (h > 0) return `${h}h ago`;
  return `${m}m ago`;
}

function latestOfType(logs: LogEntry[], type: string): LogEntry | null {
  let latest: LogEntry | null = null;
  for (const log of logs) {
    if (log.type !== type) continue;
    if (
      !latest ||
      new Date(log.startTime).getTime() > new Date(latest.startTime).getTime()
    ) {
      latest = log;
    }
  }
  return latest;
}

export default function LastFeedBanner({ logs }: Props) {
  const theme = useTheme();
  const [now, setNow] = useState(Date.now());

  // A minute is the finest granularity the labels show — ticking faster only
  // burns renders.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const lastFeed = useMemo(() => latestOfType(logs, "feed"), [logs]);
  const lastDiaper = useMemo(() => latestOfType(logs, "diaper"), [logs]);

  if (!lastFeed && !lastDiaper) return null;

  const feedSide =
    lastFeed?.side === "left" ? "L" : lastFeed?.side === "right" ? "R" : null;
  const diaperMeta =
    lastDiaper?.diaperStatus != null
      ? DIAPER_STATUS_META[lastDiaper.diaperStatus] ?? null
      : null;

  return (
    <View style={styles.wrap}>
      {lastFeed && (
        <View style={[styles.banner, { backgroundColor: theme.primaryLight }]}>
          <Text style={styles.emoji}>🤱</Text>
          <Text style={[styles.text, { color: theme.pillText }]}>
            Last feed{feedSide ? ` (${feedSide})` : ""} started{" "}
            <Text style={styles.bold}>
              {formatElapsed(now - new Date(lastFeed.startTime).getTime())}
            </Text>
          </Text>
        </View>
      )}
      {lastDiaper && (
        <View style={[styles.banner, styles.diaperBanner]}>
          <Text style={styles.emoji}>🩲</Text>
          <Text style={[styles.text, { color: "#b45309" }]}>
            Last diaper change was{" "}
            <Text style={styles.bold}>
              {formatElapsed(now - new Date(lastDiaper.startTime).getTime())}
            </Text>
            {diaperMeta ? (
              <Text style={styles.bold}>
                {" "}
                ({diaperMeta.icon} {diaperMeta.label})
              </Text>
            ) : null}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginBottom: 16 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  diaperBanner: { backgroundColor: "#fffbeb" },
  emoji: { fontSize: 18 },
  text: { fontSize: 13, flexShrink: 1 },
  bold: { fontWeight: "700" },
});
