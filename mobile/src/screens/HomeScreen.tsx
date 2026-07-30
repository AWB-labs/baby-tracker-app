import React, { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { space, radius, tabBar } from "../design/tokens";
import { useTheme } from "../design/ThemeProvider";
import { useAuth } from "../context/AuthContext";
import { useBaby } from "../context/BabyContext";
import { useLogs } from "../hooks/useLogs";
import { usePolling } from "../hooks/usePolling";
import { useTimer } from "../hooks/useTimer";
import {
  Screen,
  ScreenHeader,
  SectionHeader,
  Text,
  EmptyState,
  Card,
  Divider,
} from "../components/ui";
import Snapshot from "../components/Snapshot";
import TrackRow, { type TrackType } from "../components/TrackRow";
import Habits from "../components/Habits";
import BabySwitcher from "../components/BabySwitcher";
import ManualEntryModal from "../components/ManualEntryModal";
import { greetingFor, formatBabyAge } from "../lib/greeting";
import type { LogEntry } from "../api/logs";
import type { TabParamList } from "../navigation/AppTabs";

/**
 * Enough rows to know the latest of every activity and today's tallies.
 * History lives in the Log tab, which fetches the full set when you go
 * looking for it.
 */
const HOME_FETCH_LIMIT = 50;

/**
 * Slow enough to be cheap, fast enough that two caregivers don't visibly
 * diverge. Pull-to-refresh covers the impatient case.
 */
const POLL_INTERVAL_MS = 60_000;

const TRACK_TYPES: TrackType[] = ["feed", "pump", "sleep", "diaper"];

function latestOfType(logs: LogEntry[], type: string): LogEntry | null {
  for (const log of logs) {
    if (log.type === type) return log; // logs arrive newest-first
  }
  return null;
}

export default function HomeScreen() {
  const { account } = useAuth();
  const { activeBaby } = useBaby();
  const { logs, loading, refresh } = useLogs(HOME_FETCH_LIMIT);
  const [showManual, setShowManual] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [habitsRefreshKey, setHabitsRefreshKey] = useState(0);
  const navigation = useNavigation<BottomTabNavigationProp<TabParamList>>();
  const insets = useSafeAreaInsets();
  const t = useTheme();

  // The timers live here, not in the rows: the snapshot needs to read the
  // same running feed/sleep the track rows control.
  const feedTimer = useTimer("feed", activeBaby?.id);
  const sleepTimer = useTimer("sleep", activeBaby?.id);
  const diaperTimer = useTimer("diaper", activeBaby?.id);
  const pumpTimer = useTimer("pump", activeBaby?.id);
  const timers = { feed: feedTimer, sleep: sleepTimer, diaper: diaperTimer, pump: pumpTimer };

  // Another caregiver may be logging at the same time, so poll to stay in
  // sync — but only while this tab is on screen and the app is foregrounded.
  usePolling(refresh, POLL_INTERVAL_MS);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setHabitsRefreshKey((k) => k + 1);
    setRefreshing(false);
  }, [refresh]);

  const lastByType = useMemo(() => {
    const map = new Map<TrackType, LogEntry | null>();
    for (const type of TRACK_TYPES) map.set(type, latestOfType(logs, type));
    return map;
  }, [logs]);

  const enteredByName = account?.name || "Unknown";

  if (!activeBaby) {
    return (
      <Screen scroll={false}>
        <EmptyState
          icon="home"
          title="No baby selected"
          body="Choose a baby to start tracking, or add your first one."
        />
        <View style={styles.center}>
          <BabySwitcher />
        </View>
      </Screen>
    );
  }

  const firstName = account?.name?.split(" ")[0];
  const age = formatBabyAge(activeBaby.dob);
  // "Girl · 3 months, 12 days old", falling back to just the gender until a
  // date of birth is set — the subtitle should never be empty under the name.
  const babyLine =
    [activeBaby.gender === "girl" ? "Girl" : "Boy", age]
      .filter(Boolean)
      .join(" · ") || "Here's today";

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      {/*
       * The pink hero is pinned above the scroll. Its own height has no
       * animation logic at all — it's sized by its content, and shrinks when
       * that content does, which is what the LayoutAnimation call above
       * arranges for.
       *
       * The version before this one drove a height Animated.Value continuously
       * from the raw scroll offset. That forced the whole listener onto the
       * JS thread — a thread that is not idle on this screen (timers ticking
       * every second, polling, the snapshot's own memos) — and the animation
       * fell behind the real, natively-driven scroll and caught up in visible
       * jumps: the "electrocuted" flicker, two clocks running at different,
       * drifting rates. The attempt after that tried to reclaim the space
       * with a manually measured, manually driven height value, and shipped
       * with the summary silently failing to render. A third attempt fired a
       * discrete LayoutAnimation from that same per-frame listener instead of
       * a continuous value, which was closer — but still ran a native layout
       * transition while the ScrollView was actively being dragged, and a
       * layout animation competing with a live scroll gesture produced the
       * same flicker back a third time.
       *
       * Given three attempts at "shrink to match" each found a new way to
       * regress into the exact bug this was meant to fix, the hero is fixed
       * again — no scroll listener, no LayoutAnimation, nothing here reads
       * scroll position at all. The full snapshot is simply always shown.
       */}
      <LinearGradient
        colors={["#f3437e", "#993758"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + space.md }]}
      >
        {/* The baby's name was showing twice — as this header's big title, and
            again on the switcher pill beside it. No replacement title: the
            greeting stays a small overline (title1 truncates a phrase this
            long to one line, which is exactly what put it here in the first
            place), and age/gender stay in the subtitle since that information
            isn't shown anywhere else on this screen. */}
        <ScreenHeader
          light
          overline={`${greetingFor()}${firstName ? `, ${firstName}` : ""}`}
          subtitle={babyLine}
          actions={<BabySwitcher />}
        />

        <View style={styles.snapshotResting}>
          {/* What's happening right now — four doors, not banners. Rendered
              from the first frame, placeholders and all: withholding it until
              data arrived used to change the hero's height the moment it
              landed, throwing everything below it down the screen. */}
          <Snapshot
            logs={logs}
            loading={loading}
            feedTimer={feedTimer}
            sleepTimer={sleepTimer}
            onOpenLog={(filter) => navigation.navigate("Activity", { filter })}
            onOpenInsights={() => navigation.navigate("Analytics")}
          />
        </View>
      </LinearGradient>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={t.accent}
            colors={[t.accent]}
            progressBackgroundColor={t.surface}
          />
        }
      >
      <View style={styles.section}>
        <SectionHeader
          title="Track"
          action={
            <Pressable
              onPress={() => setShowManual(true)}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Add something that already happened"
            >
              <Text variant="subheadStrong" tone="accent">
                ＋ Add
              </Text>
            </Pressable>
          }
        />
        <Card padded={false}>
          {TRACK_TYPES.map((type, index) => (
            <View key={`${type}-${activeBaby.id}`}>
              {index > 0 && <Divider style={styles.divider} />}
              <TrackRow
                type={type}
                babyId={activeBaby.id}
                enteredByName={enteredByName}
                onLogSaved={refresh}
                timer={timers[type]}
                lastLog={lastByType.get(type) ?? null}
              />
            </View>
          ))}
        </Card>
      </View>

      <Habits
        babyId={activeBaby.id}
        enteredByName={enteredByName}
        onLogSaved={refresh}
        refreshKey={habitsRefreshKey}
      />

      </ScrollView>

      <ManualEntryModal
        visible={showManual}
        babyId={activeBaby.id}
        babyName={activeBaby.name}
        enteredByName={enteredByName}
        onSaved={refresh}
        onClose={() => setShowManual(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  section: { gap: space.sm },
  center: { alignItems: "center" },
  divider: { marginHorizontal: space.lg },
  // Pinned full-width pink header; the bottom corners round into the blush
  // content that scrolls beneath it.
  hero: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
    zIndex: 1,
  },
  // The hero's old `gap` between the header and the snapshot, restored as an
  // ordinary margin now that nothing animates it away.
  // position:'relative' is what lets summaryOverlay below anchor to this
  // box rather than to the whole screen.
  // position:'relative' is what lets summaryOverlay below anchor to this
  // box rather than to the whole screen.
  snapshotResting: { marginTop: space.lg },
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    gap: space.lg,
    paddingBottom: tabBar.margin + tabBar.height + space.lg,
  },
});
