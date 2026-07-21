import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../design/ThemeProvider";
import { space, radius } from "../design/tokens";
import { Text } from "./ui/primitives";

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

/** Only worth showing when the timer was actually paused at least once. */
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
  const t = useTheme();
  const events = parsePauseTimelineJson(pauseTimelineJson);
  if (!events?.length || !shouldShowPauseTimeline(events)) return null;

  return (
    <View style={[styles.box, { backgroundColor: t.surfaceAlt }]}>
      <Text variant="caption" tone="muted">
        {events
          .map((e) => `${LABELS[e.event] ?? e.event} ${formatTimeLabel(e.at)}`)
          .join("  ·  ")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: space.xs,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    alignSelf: "flex-start",
  },
});
