import React from "react";
import { View, Text, StyleSheet } from "react-native";

export type PauseTimelineEvent = { event: string; at: string };

const LABELS: Record<string, string> = {
  started: "Started",
  paused: "Paused",
  resumed: "Resumed",
  stopped: "Stopped",
};

function formatTimeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function parsePauseTimelineJson(
  json: string | null | undefined
): PauseTimelineEvent[] | null {
  if (!json) return null;
  try {
    const arr = JSON.parse(json) as unknown;
    if (!Array.isArray(arr)) return null;
    return arr.filter(
      (e): e is PauseTimelineEvent =>
        !!e &&
        typeof e === "object" &&
        typeof (e as PauseTimelineEvent).at === "string" &&
        typeof (e as PauseTimelineEvent).event === "string"
    );
  } catch {
    return null;
  }
}

/** Show the timeline only when there was at least one pause or resume. */
export function shouldShowPauseTimeline(
  events: PauseTimelineEvent[] | null
): boolean {
  return !!events?.some((e) => e.event === "paused" || e.event === "resumed");
}

export default function PauseTimelineIndicator({
  pauseTimelineJson,
}: {
  pauseTimelineJson: string | null | undefined;
}) {
  const events = parsePauseTimelineJson(pauseTimelineJson);
  if (!events?.length || !shouldShowPauseTimeline(events)) return null;

  return (
    <View style={styles.box}>
      <Text style={styles.line}>
        {events.map((e, i) => (
          <Text key={`${e.event}-${e.at}-${i}`}>
            {i > 0 ? <Text style={styles.sep}> · </Text> : null}
            <Text style={styles.label}>{LABELS[e.event] ?? e.event}</Text>{" "}
            {formatTimeLabel(e.at)}
          </Text>
        ))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  line: { fontSize: 10, lineHeight: 15, color: "#475569" },
  sep: { color: "#cbd5e1" },
  label: { fontWeight: "700", color: "#334155" },
});
