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
import { useMilkBalance } from "../hooks/useMilkBalance";
import { useDiaperStock } from "../hooks/useDiaperStock";
import { useRatePrompt } from "../hooks/useRatePrompt";
import { useActiveTimers } from "../hooks/useActiveTimers";
import {
  Screen,
  ScreenHeader,
  SectionHeader,
  Text,
  EmptyState,
} from "../components/ui";
import Snapshot from "../components/Snapshot";
import TrackRow, { type TrackType } from "../components/TrackRow";
import Habits from "../components/Habits";
import BabySwitcher from "../components/BabySwitcher";
import ManualEntryModal from "../components/ManualEntryModal";
import MilkSupplyModal from "../components/MilkSupplyModal";
import DiaperStockModal from "../components/DiaperStockModal";
import RatePromptSheet from "../components/RatePromptSheet";
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

  // Who — if anyone — has a feed, pump or sleep already running for this baby
  // from another caregiver's device, so a second person can't start the same
  // one on top of it.
  const {
    activeByType,
    syncedAt: activeTimersSyncedAt,
    refresh: refreshActiveTimers,
  } = useActiveTimers(activeBaby?.id);

  /**
   * Bumped alongside every `refresh()` — poll, pull-to-refresh, or a save
   * from any row below — so the milk balance knows to refetch.
   *
   * `logs.length` looked like it would do this for free, but `logs` is
   * capped at HOME_FETCH_LIMIT: once an account has that many entries or
   * more, a new pump just pushes the oldest row out of the fetched window
   * and the array's length never moves, so nothing here changed the milk
   * card is watching.
   */
  const [dataVersion, setDataVersion] = useState(0);
  const refreshAndBump = useCallback(async () => {
    await refresh();
    setDataVersion((v) => v + 1);
  }, [refresh]);

  const { balance: milkBalance, correct: correctMilkBalance } = useMilkBalance(
    activeBaby?.id,
    dataVersion
  );
  const [showMilkSupply, setShowMilkSupply] = useState(false);

  const {
    count: diaperStock,
    refresh: refreshDiaperStock,
    correct: correctDiaperStock,
    adjust: adjustDiaperStockBy,
  } = useDiaperStock(activeBaby?.id, dataVersion);
  const [showDiaperStock, setShowDiaperStock] = useState(false);

  /**
   * Asked from Home rather than mid-task: this screen is where someone lands
   * after logging something, which is the "they just got value out of it"
   * moment the prompt is meant to follow. `logs.length` is Home's already
   * fetched page — see the threshold note in useRatePrompt.
   */
  const ratePrompt = useRatePrompt(logs.length);

  // Another caregiver may be logging at the same time, so poll to stay in
  // sync — but only while this tab is on screen and the app is foregrounded.
  usePolling(refreshAndBump, POLL_INTERVAL_MS);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshAndBump(), refreshActiveTimers()]);
    setHabitsRefreshKey((k) => k + 1);
    setRefreshing(false);
  }, [refreshAndBump, refreshActiveTimers]);

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
        {/* The greeting stays the overline rather than being promoted into the
            title slot — title1 truncates a phrase this long to one line,
            which is exactly what put it here in the first place — but sized
            up with overlineVariant so it still reads as this screen's
            headline rather than a caption. The baby's name (short enough to
            never hit that truncation) plus their emoji is the actual title,
            with age/gender underneath in the subtitle. The switcher itself
            moved to Account, so there's nothing trailing to compete with it. */}
        <ScreenHeader
          light
          overline={`${greetingFor()}${firstName ? `, ${firstName}` : ""}`}
          overlineVariant="title3"
          title={`${activeBaby.name}${activeBaby.avatarEmoji ? ` ${activeBaby.avatarEmoji}` : ""}`}
          subtitle={babyLine}
        />

        <View style={styles.snapshotResting}>
          {/* What's happening right now — four doors, not banners. Rendered
              from the first frame, placeholders and all: withholding it until
              data arrived used to change the hero's height the moment it
              landed, throwing everything below it down the screen. */}
          <Snapshot
            logs={logs}
            loading={loading}
            onOpenLog={(filter) => navigation.navigate("Activity", { filter })}
            onOpenInsights={() => navigation.navigate("Analytics")}
            milkBalance={milkBalance}
            onOpenMilkBalance={() => setShowMilkSupply(true)}
            diaperStock={diaperStock}
            onOpenDiaperStock={() => setShowDiaperStock(true)}
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
        {/* Four separate horizontal cards, not one shared list with hairlines
            between rows — each activity now has real padding and room for a
            properly sized touch target instead of splitting one card's width
            four ways. TrackRow owns its own Card (idle) or bordered box
            (running); this just spaces them apart. */}
        <View style={styles.trackList}>
          {TRACK_TYPES.map((type) => (
            <TrackRow
              key={`${type}-${activeBaby.id}`}
              type={type}
              babyId={activeBaby.id}
              enteredByName={enteredByName}
              onLogSaved={refreshAndBump}
              timer={timers[type]}
              lastLog={lastByType.get(type) ?? null}
              remoteActive={
                type === "diaper" ? null : activeByType[type] ?? null
              }
              // So the row can tell "someone else has this running" (shown
              // read-only) apart from "I have this running, just not on
              // this device" (taken over locally instead — see TrackRow).
              viewerAccountId={account?.id}
              activeTimersSyncedAt={activeTimersSyncedAt}
              onActiveTimersChanged={refreshActiveTimers}
            />
          ))}
        </View>
      </View>

      <Habits
        babyId={activeBaby.id}
        enteredByName={enteredByName}
        onLogSaved={refreshAndBump}
        refreshKey={habitsRefreshKey}
      />

      </ScrollView>

      <ManualEntryModal
        visible={showManual}
        babyId={activeBaby.id}
        babyName={activeBaby.name}
        enteredByName={enteredByName}
        onSaved={refreshAndBump}
        onClose={() => setShowManual(false)}
        diaperStock={diaperStock}
        onDiaperStockChanged={refreshDiaperStock}
      />

      <MilkSupplyModal
        visible={showMilkSupply}
        onClose={() => setShowMilkSupply(false)}
        babyId={activeBaby.id}
        milkBalance={milkBalance}
        onCorrect={correctMilkBalance}
      />

      <DiaperStockModal
        visible={showDiaperStock}
        onClose={() => setShowDiaperStock(false)}
        babyId={activeBaby.id}
        babyName={activeBaby.name}
        count={diaperStock}
        onAdjust={adjustDiaperStockBy}
        onCorrect={correctDiaperStock}
      />

      <RatePromptSheet
        visible={ratePrompt.visible}
        onDismiss={ratePrompt.dismiss}
        onRated={ratePrompt.markRated}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  section: { gap: space.sm },
  center: { alignItems: "center" },
  trackList: { gap: space.sm },
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
  snapshotResting: { marginTop: space.lg },
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    gap: space.lg,
    paddingBottom: tabBar.margin + tabBar.height + space.lg,
  },
});
