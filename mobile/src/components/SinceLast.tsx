import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useActivityTone, DIAPER_META } from "../design/activity";
import { space, radius } from "../design/tokens";
import { Text, Emoji } from "./ui/primitives";
import type { LogEntry } from "../api/logs";

function formatElapsed(ms: number): string {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
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

/**
 * "How long since…" — the question this app exists to answer, so it sits at
 * the top where it reads without interaction. Styled as the website's banner
 * rows: a soft tinted strip per activity, sentence-cased, elapsed time bold.
 */
export default function SinceLast({ logs }: { logs: LogEntry[] }) {
  const feedTone = useActivityTone("feed");
  const diaperTone = useActivityTone("diaper");
  const [now, setNow] = useState(Date.now());

  // The labels round to whole minutes; a faster tick would only burn renders.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const lastFeed = useMemo(() => latestOfType(logs, "feed"), [logs]);
  const lastDiaper = useMemo(() => latestOfType(logs, "diaper"), [logs]);

  if (!lastFeed && !lastDiaper) return null;

  const feedSide =
    lastFeed?.side === "left" ? "L" : lastFeed?.side === "right" ? "R" : null;
  const diaperMeta = lastDiaper?.diaperStatus
    ? DIAPER_META[lastDiaper.diaperStatus]
    : null;

  return (
    <View style={styles.wrap}>
      {lastFeed && (
        <View
          style={[styles.banner, { backgroundColor: feedTone.soft }]}
          accessible
          accessibilityLabel={`Last feed${feedSide ? `, ${lastFeed!.side} side` : ""}, ${formatElapsed(now - new Date(lastFeed.startTime).getTime())}`}
        >
          <Emoji size={16}>🤱</Emoji>
          <Text variant="subhead" tone="muted" style={styles.bannerText}>
            Last feed
            {feedSide ? (
              <Text variant="subheadStrong" style={{ color: feedTone.text }}>
                {" "}({feedSide})
              </Text>
            ) : null}{" "}
            started{" "}
            <Text variant="subheadStrong" style={{ color: feedTone.text }} tabular>
              {formatElapsed(now - new Date(lastFeed.startTime).getTime())}
            </Text>
          </Text>
        </View>
      )}
      {lastDiaper && (
        <View
          style={[styles.banner, { backgroundColor: diaperTone.soft }]}
          accessible
          accessibilityLabel={`Last diaper change, ${formatElapsed(now - new Date(lastDiaper.startTime).getTime())}${diaperMeta ? `, ${diaperMeta.label}` : ""}`}
        >
          <Emoji size={16}>🩲</Emoji>
          <Text variant="subhead" tone="muted" style={styles.bannerText}>
            Last diaper change was{" "}
            <Text variant="subheadStrong" style={{ color: diaperTone.text }} tabular>
              {formatElapsed(now - new Date(lastDiaper.startTime).getTime())}
            </Text>
            {diaperMeta ? (
              <Text variant="subheadStrong" style={{ color: diaperTone.text }}>
                {"  "}{diaperMeta.emoji} {diaperMeta.label}
              </Text>
            ) : null}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  bannerText: { flexShrink: 1, textAlign: "center" },
});
