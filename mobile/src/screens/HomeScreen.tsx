import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
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
import Snapshot, { type ActiveStarts } from "../components/Snapshot";
import SnapshotMiniBar from "../components/SnapshotMiniBar";
import StockSection from "../components/StockSection";
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

/** How many points of scroll the condensed bar takes to fade in, ending
 *  exactly as the full snapshot's last row leaves the screen. */
const MINI_BAR_FADE_PX = 56;

/** The hero gradient, defined once for the hero and the condensed bar so
 *  the bar can never drift off-brand from the header it stands in for. */
const HERO_COLORS = ["#f3437e", "#993758"] as const;

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
    size: diaperSize,
    refresh: refreshDiaperStock,
    correct: correctDiaperStock,
    adjust: adjustDiaperStockBy,
    changeSize: changeDiaperSize,
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

  /**
   * When each timed activity currently in progress began — this device's
   * timer first (it's the freshest view of its own session, and stays
   * correct through the ±1 min adjustments), else another caregiver's
   * server-side lock. The snapshot freezes its "last … ago" labels at these
   * moments, so "last feed 1h ago" doesn't keep counting through the feed
   * that's happening right now. Cheap enough to recompute per render, which
   * the ticking timers cause anyway.
   */
  const activeStarts: ActiveStarts = {
    feed: feedTimer.startTime
      ? feedTimer.getOriginalStartTime() ?? feedTimer.startTime
      : activeByType.feed
        ? new Date(activeByType.feed.startTime)
        : null,
    sleep: sleepTimer.startTime
      ? sleepTimer.getOriginalStartTime() ?? sleepTimer.startTime
      : activeByType.sleep
        ? new Date(activeByType.sleep.startTime)
        : null,
    pump: pumpTimer.startTime
      ? pumpTimer.getOriginalStartTime() ?? pumpTimer.startTime
      : activeByType.pump
        ? new Date(activeByType.pump.startTime)
        : null,
  };

  const closeManual = useCallback(() => setShowManual(false), []);

  /*
   * The scroll offset, written natively — see the hero note in the JSX below.
   * Everything visual that follows from it (the condensed bar's opacity and
   * slide) is interpolation on this value, which the native driver runs
   * entirely off the JS thread.
   */
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  /** Measured, not assumed: the hero is sized by its content. */
  const [heroH, setHeroH] = useState(0);
  const [miniBarH, setMiniBarH] = useState(0);
  // Where the condensed bar finishes fading in: the moment the hero's last
  // pixel would disappear under it.
  const collapseAt = Math.max(1, heroH - miniBarH);

  /*
   * Whether the scroll is past the hero — the ONLY thing on this screen that
   * reads the offset from JS, and all it drives is the condensed bar's
   * tappability (pointerEvents can't be interpolated). It sets state solely
   * when the threshold is crossed, so per-frame it's a comparison and
   * nothing more; a delayed frame here can delay a tap becoming live, but
   * can never make anything visibly stutter.
   */
  const [pastHero, setPastHero] = useState(false);
  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      const next = value >= collapseAt - 1;
      setPastHero((prev) => (prev === next ? prev : next));
    });
    return () => scrollY.removeListener(id);
  }, [scrollY, collapseAt]);

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  // Memoized so the per-second re-renders a running timer causes don't
  // rebuild the native animated-node graph every tick — the nodes only need
  // recreating when the measured threshold actually moves.
  const { miniBarOpacity, miniBarShift } = useMemo(
    () => ({
      miniBarOpacity: scrollY.interpolate({
        inputRange: [collapseAt - MINI_BAR_FADE_PX, collapseAt],
        outputRange: [0, 1],
        extrapolate: "clamp",
      }),
      miniBarShift: scrollY.interpolate({
        inputRange: [collapseAt - MINI_BAR_FADE_PX, collapseAt],
        outputRange: [-12, 0],
        extrapolate: "clamp",
      }),
    }),
    [scrollY, collapseAt]
  );

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
       * The pink hero scrolls away WITH the content, and a one-line condensed
       * bar (emoji + "last one Xm ago" per activity) fades in pinned where it
       * stood. Getting here matters, because three earlier attempts at
       * "minimize on scroll" each animated the hero's LAYOUT — a height
       * Animated.Value driven per-frame from JS (janked behind the native
       * scroll: the "electrocuted" flicker; this screen's JS thread ticks
       * timers every second and is never idle), a manually measured height
       * (shipped with the summary silently unrendered), and a discrete
       * LayoutAnimation fired mid-drag (a layout transition fighting a live
       * scroll gesture — flicker again).
       *
       * This version animates no layout at all. The hero is ordinary scroll
       * content, so "shrinking" it is just the native scroll moving it
       * off-screen, pixel-locked to the finger by construction. The condensed
       * bar overlays the top and animates only opacity and translateY,
       * interpolated from a natively-driven scroll offset — the JS thread
       * never touches a frame of it. The one JS scroll listener flips a
       * boolean (bar tappability) at a threshold and drives nothing visual.
       */}
      <Animated.ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            // White, because the spinner now draws over the pink hero rather
            // than the blush content area.
            tintColor="#ffffff"
            colors={[t.accent]}
            progressBackgroundColor={t.surface}
          />
        }
      >
      {/* iOS rubber-banding pulls the hero down with the finger; without this
          bleed the root's blush shows in the gap above it mid-pull. */}
      <View style={styles.overscrollBleed} />
      <LinearGradient
        colors={[...HERO_COLORS]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + space.md }]}
        onLayout={(e) => setHeroH(e.nativeEvent.layout.height)}
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
            activeStarts={activeStarts}
          />
        </View>
      </LinearGradient>

      <View style={styles.body}>
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
              // Diaper only — the row ticks "use one from stock" by default
              // and draws the pile down when the change is saved.
              diaperStock={type === "diaper" ? diaperStock : null}
              onDiaperStockChanged={refreshDiaperStock}
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

      {/* What's on hand — under the habits, now that the snapshot's fourth
          card belongs to pumping. */}
      <StockSection
        diaperCount={diaperStock}
        diaperSize={diaperSize}
        onOpenDiaperStock={() => setShowDiaperStock(true)}
        milkBalance={milkBalance}
        onOpenMilkBalance={() => setShowMilkSupply(true)}
      />
      </View>

      </Animated.ScrollView>

      {/* The condensed snapshot, pinned over the top edge. Withheld until the
          hero has reported its height — before that the fade thresholds are
          nonsense and the bar could flash in on the first scroll pixel. */}
      {heroH > 0 && (
        <Animated.View
          pointerEvents={pastHero ? "auto" : "none"}
          onLayout={(e) => setMiniBarH(e.nativeEvent.layout.height)}
          style={[
            styles.miniBar,
            { opacity: miniBarOpacity, transform: [{ translateY: miniBarShift }] },
          ]}
        >
          <LinearGradient
            colors={[...HERO_COLORS]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={[
              styles.miniBarInner,
              { paddingTop: insets.top + space.xs },
            ]}
          >
            <SnapshotMiniBar
              logs={logs}
              activeStarts={activeStarts}
              onPress={scrollToTop}
            />
          </LinearGradient>
        </Animated.View>
      )}

      <ManualEntryModal
        visible={showManual}
        babyId={activeBaby.id}
        babyName={activeBaby.name}
        enteredByName={enteredByName}
        onSaved={refreshAndBump}
        onClose={closeManual}
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
        size={diaperSize}
        onAdjust={adjustDiaperStockBy}
        onCorrect={correctDiaperStock}
        onChangeSize={changeDiaperSize}
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
  // Full-width pink header at the top of the scroll; the bottom corners
  // round into the blush content that follows it.
  hero: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
  },
  // The hero's old `gap` between the header and the snapshot, restored as an
  // ordinary margin now that nothing animates it away.
  snapshotResting: { marginTop: space.lg },
  // The hero is edge-to-edge, so the horizontal padding lives on the body
  // wrapper below it rather than on the scroll container.
  scrollContent: {
    paddingBottom: tabBar.margin + tabBar.height + space.lg,
  },
  body: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    gap: space.lg,
  },
  miniBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  overscrollBleed: {
    position: "absolute",
    top: -600,
    left: 0,
    right: 0,
    height: 600,
    // The hero gradient's top color, so the stretch reads as the hero
    // continuing rather than a seam.
    backgroundColor: "#f3437e",
  },
  // Same corner treatment as the hero it stands in for.
  miniBarInner: {
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
  },
});
