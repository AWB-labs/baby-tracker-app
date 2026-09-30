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
import { useNavigation, type CompositeNavigationProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
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
  SectionHeader,
  Text,
  EmptyState,
} from "../components/ui";
import Snapshot, { type ActiveStarts } from "../components/Snapshot";
import SnapshotMiniBar from "../components/SnapshotMiniBar";
import StockSection from "../components/StockSection";
import FoodRow from "../components/FoodRow";
import TrackRow, { type TrackType } from "../components/TrackRow";
import Habits from "../components/Habits";
import BabySwitcher from "../components/BabySwitcher";
import ManualEntryModal from "../components/ManualEntryModal";
import MilkSupplyModal from "../components/MilkSupplyModal";
import DiaperStockModal from "../components/DiaperStockModal";
import RatePromptSheet from "../components/RatePromptSheet";
import { greetingFor, formatBabyAge } from "../lib/greeting";
import type { LogEntry } from "../api/logs";
import type { TabParamList, TodayStackParamList } from "../navigation/AppTabs";

/** Home sits in the Today stack (for Foods) inside the tab bar (for Activity). */
type HomeNavigation = CompositeNavigationProp<
  NativeStackNavigationProp<TodayStackParamList, "TodayHome">,
  BottomTabNavigationProp<TabParamList>
>;

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

/** The hero gradient. */
const HERO_COLORS = ["#f3437e", "#993758"] as const;

/** title1 (28pt) shrinks to roughly title3 (18pt) in the condensed header. */
const TITLE_COMPACT_SCALE = 0.64;
/** title1's line height — the title's measured height until layout reports. */
const TITLE_LINE_HEIGHT = 34;
/** How far the snapshot cards shrink as they condense into the strip. */
const CARDS_COMPACT_SCALE = 0.5;
/** The strip's height until its own layout reports (one subhead line). */
const CHIPS_FALLBACK_H = 22;
/** Pink above the hero for iOS rubber-banding to pull into view. */
const OVERSCROLL_BLEED = 600;

function latestOfType(logs: LogEntry[], type: string): LogEntry | null {
  for (const log of logs) {
    if (log.type === type) return log; // logs arrive newest-first
  }
  return null;
}

export default function HomeScreen() {
  const { account } = useAuth();
  const { activeBaby } = useBaby();
  const { logs, loading, refresh, error: logsError } = useLogs(HOME_FETCH_LIMIT);
  const [showManual, setShowManual] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [habitsRefreshKey, setHabitsRefreshKey] = useState(0);
  const navigation = useNavigation<HomeNavigation>();
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
    error: activeTimersError,
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
  /** Where the title and the snapshot cards sit inside the hero at rest. */
  const [titleY, setTitleY] = useState(0);
  const [titleH, setTitleH] = useState(TITLE_LINE_HEIGHT);
  const [cardsY, setCardsY] = useState(0);
  const [chipsH, setChipsH] = useState(CHIPS_FALLBACK_H);

  /*
   * The condensed header's geometry: the title docked just under the status
   * bar, the four-chip strip under that, a beat of padding below. Nothing
   * here is measured from a second layout — it's the same title and the
   * same strip, so the compact layout is arithmetic on their rest sizes.
   */
  const compactTitleY = insets.top + space.xs;
  const chipsY = compactTitleY + titleH * TITLE_COMPACT_SCALE + space.xs;
  const compactH = chipsY + chipsH + space.md;
  /** How much scroll turns the hero into the condensed header — exactly the
   *  height it loses, so the pink's bottom edge tracks the finger 1:1. */
  const collapseAt = Math.max(1, heroH - compactH);
  const titleTravel = titleY - compactTitleY;
  const cardsTravel = chipsY - cardsY;

  /*
   * Whether the hero is more than half condensed — the ONLY thing on this
   * screen that reads the offset from JS, and all it drives is which of the
   * two snapshot forms is tappable (pointerEvents can't be interpolated). It
   * sets state solely when the threshold is crossed, so per-frame it's a
   * comparison and nothing more; a delayed frame here can delay a tap
   * becoming live, but can never make anything visibly stutter.
   */
  const [condensed, setCondensed] = useState(false);
  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      const next = value >= collapseAt * 0.5;
      setCondensed((prev) => (prev === next ? prev : next));
    });
    return () => scrollY.removeListener(id);
  }, [scrollY, collapseAt]);

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  /*
   * One motion, one input. Every part of the hero is driven by the same
   * scroll offset over the same distance (`collapseAt`), so the whole thing
   * condenses together rather than one piece handing off to another:
   *
   *  - the hero itself is pinned (translated by the scroll offset), and its
   *    pink background slides up underneath at slope 1 — the bottom edge
   *    tracks the finger exactly, ending at the condensed header's height;
   *  - the title glides from its hero spot to the docked spot while shrinking
   *    about its top-left corner — same text, same node the whole way;
   *  - greeting and age line fade out over the first stretch;
   *  - the four snapshot cards shrink and drift towards where the strip
   *    lands, fading out as the strip fades in along the same path, so the
   *    cards read as condensing into the chips rather than being replaced.
   *
   * All transform and opacity on the native driver; nothing lays out.
   * Memoized so the per-second re-renders a running timer causes don't
   * rebuild the native animated-node graph every tick.
   */
  const anim = useMemo(() => {
    const over = (from: number, to: number, outputRange: [number, number]) =>
      scrollY.interpolate({
        inputRange: [collapseAt * from, collapseAt * to],
        outputRange,
        extrapolate: "clamp",
      });
    return {
      // Pinned for any scroll ≥ 0; below zero it rides the bounce with the
      // content rather than staying behind.
      heroPin: scrollY.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
        extrapolateLeft: "clamp",
        extrapolateRight: "extend",
      }),
      bgShift: over(0, 1, [0, -collapseAt]),
      // The content settles a little ahead of the pink's edge, so it's never
      // left rattling around in a header that's still shrinking around it.
      textFade: over(0, 0.25, [1, 0]),
      titleShift: over(0, 0.7, [0, -titleTravel]),
      titleScale: over(0, 0.7, [1, TITLE_COMPACT_SCALE]),
      cardsShift: over(0, 0.7, [0, cardsTravel]),
      cardsScale: over(0, 0.7, [1, CARDS_COMPACT_SCALE]),
      // Cards and chips overlap mid-flight — the crossfade is what makes the
      // four cards read as becoming the four chips.
      cardsFade: over(0.25, 0.55, [1, 0]),
      chipsShift: over(0, 0.7, [-cardsTravel, 0]),
      chipsScale: over(0, 0.7, [1.15, 1]),
      chipsFade: over(0.4, 0.65, [0, 1]),
    };
  }, [scrollY, collapseAt, titleTravel, cardsTravel]);

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
  const titleText = `${activeBaby.name}${
    activeBaby.avatarEmoji ? ` ${activeBaby.avatarEmoji}` : ""
  }`;

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      {/*
       * The pink hero condenses into a header as you scroll — see the note
       * above `anim` for the motion. Getting here matters, because three
       * earlier attempts at "minimize on scroll" each animated the hero's
       * LAYOUT — a height Animated.Value driven per-frame from JS (janked
       * behind the native scroll: the "electrocuted" flicker; this screen's
       * JS thread ticks timers every second and is never idle), a manually
       * measured height (shipped with the summary silently unrendered), and
       * a discrete LayoutAnimation fired mid-drag (a layout transition
       * fighting a live scroll gesture — flicker again).
       *
       * This version animates no layout at all. The hero keeps its rest
       * height in the scroll content; it's pinned by a translate and every
       * visible change is a transform or opacity interpolated from the
       * natively-driven scroll offset — the JS thread never touches a frame
       * of it. It's the LAST thing to paint among its siblings (zIndex), so
       * the content below scrolls underneath it, and it's box-none so the
       * transparent part under the condensed header still scrolls and taps
       * through to that content.
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
      <Animated.View
        pointerEvents="box-none"
        style={[styles.hero, { transform: [{ translateY: anim.heroPin }] }]}
        onLayout={(e) => setHeroH(e.nativeEvent.layout.height)}
      >
        {/* The pink, sliding up under the pinned content so its bottom edge
            tracks the scroll. The bleed above it is what iOS rubber-banding
            pulls into view; without it the root's blush shows mid-pull. Its
            frame IS the pink, so taps on the condensed header stop here
            rather than reaching the cards scrolled under it. */}
        <Animated.View
          style={[styles.heroBg, { transform: [{ translateY: anim.bgShift }] }]}
        >
          <View style={styles.overscrollBleed} />
          <LinearGradient
            colors={[...HERO_COLORS]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.heroGradient}
          />
        </Animated.View>

        {/* The greeting stays the overline rather than being promoted into the
            title slot — title1 truncates a phrase this long to one line,
            which is exactly what put it here in the first place. The baby's
            name (short enough to never hit that truncation) plus their emoji
            is the actual title, with age/gender underneath in the subtitle.
            The switcher itself moved to Account, so there's nothing trailing
            to compete with it. */}
        <View
          pointerEvents="box-none"
          style={[styles.heroHeader, { paddingTop: insets.top + space.md }]}
        >
          <Animated.View
            style={{ opacity: anim.textFade, transform: [{ translateY: anim.titleShift }] }}
          >
            <Text variant="title3" style={styles.heroText} numberOfLines={1}>
              {`${greetingFor()}${firstName ? `, ${firstName}` : ""}`}
            </Text>
          </Animated.View>
          <Animated.Text
            numberOfLines={1}
            accessibilityRole="header"
            onLayout={(e) => {
              setTitleY(e.nativeEvent.layout.y);
              setTitleH(e.nativeEvent.layout.height);
            }}
            style={[
              styles.heroTitle,
              { transform: [{ translateY: anim.titleShift }, { scale: anim.titleScale }] },
            ]}
          >
            {titleText}
          </Animated.Text>
          <Animated.View
            style={{ opacity: anim.textFade, transform: [{ translateY: anim.titleShift }] }}
          >
            <Text variant="subhead" style={styles.heroText} numberOfLines={2}>
              {babyLine}
            </Text>
          </Animated.View>
        </View>

        {/* What's happening right now — four doors, not banners. Rendered
            from the first frame, placeholders and all: withholding it until
            data arrived used to change the hero's height the moment it
            landed, throwing everything below it down the screen. */}
        <Animated.View
          pointerEvents={condensed ? "none" : "box-none"}
          onLayout={(e) => setCardsY(e.nativeEvent.layout.y)}
          style={[
            styles.snapshot,
            {
              opacity: anim.cardsFade,
              transform: [{ translateY: anim.cardsShift }, { scale: anim.cardsScale }],
            },
          ]}
        >
          <Snapshot
            logs={logs}
            loading={loading}
            onOpenLog={(filter) => navigation.navigate("Activity", { filter })}
            activeStarts={activeStarts}
          />
        </Animated.View>

        {/* The same four numbers as one line — where the cards end up. */}
        <Animated.View
          pointerEvents={condensed ? "box-none" : "none"}
          onLayout={(e) => setChipsH(e.nativeEvent.layout.height)}
          style={[
            styles.chips,
            {
              top: chipsY,
              opacity: anim.chipsFade,
              transform: [{ translateY: anim.chipsShift }, { scale: anim.chipsScale }],
            },
          ]}
        >
          <SnapshotMiniBar
            logs={logs}
            activeStarts={activeStarts}
            onPress={scrollToTop}
          />
        </Animated.View>
      </Animated.View>

      <View style={styles.body}>
      {/*
        * Everything below is still the last data that arrived — which is the
        * right thing to show, and the wrong thing to show silently. Both hooks
        * hold their rows through a failed fetch rather than blanking a screen
        * someone is reading, so without this line a server that is refusing
        * requests is indistinguishable from one that simply has nothing new,
        * and the only feedback is that the app feels slow.
        *
        * Deliberately a line, not a dialog: nothing here is broken from the
        * parent's point of view, and the timers, the tallies and the last-fed
        * time are all still usable. It says what it knows and offers the one
        * action that helps.
        */}
      {!loading && (logsError || activeTimersError) && (
        <Pressable
          onPress={onRefresh}
          accessibilityRole="button"
          accessibilityLabel="Couldn't refresh. Tap to try again."
          style={[styles.staleNotice, { backgroundColor: t.surface, borderColor: t.danger }]}
        >
          <Text variant="footnote" tone="danger" style={styles.staleNoticeText}>
            {logsError ?? activeTimersError}
          </Text>
          <Text variant="subheadStrong" tone="accent">
            Retry
          </Text>
        </Pressable>
      )}
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
          {/* Food is tracked like the rest: what she last ate, and a Log.
              The catalogue and reaction history are behind the row. */}
          <FoodRow
            key={`food-${activeBaby.id}`}
            babyId={activeBaby.id}
            enteredByName={enteredByName}
            refreshKey={habitsRefreshKey}
            onOpenFoods={() => navigation.navigate("Foods")}
          />
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
  staleNotice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: space.sm,
  },
  // Takes the free space so a long message wraps instead of squeezing Retry
  // off the end of the row.
  staleNoticeText: { flex: 1 },
  center: { alignItems: "center" },
  trackList: { gap: space.sm },
  // Full-width at the top of the scroll and painted over the content that
  // follows it (zIndex) — see the hero note. Its own padding is only the
  // bottom; the header and snapshot carry the sides, and the background is
  // a separate absolutely positioned layer so it can move independently.
  hero: {
    zIndex: 1,
    paddingBottom: space.xl,
  },
  heroBg: {
    position: "absolute",
    top: -OVERSCROLL_BLEED,
    bottom: 0,
    left: 0,
    right: 0,
  },
  // The bottom corners round into the blush content that follows.
  heroGradient: {
    flex: 1,
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
  },
  snapshot: {
    marginTop: space.lg,
    paddingHorizontal: space.lg,
    // Shrinks towards its top edge, the direction it travels.
    transformOrigin: "top",
  },
  chips: {
    position: "absolute",
    left: space.lg,
    right: space.lg,
    transformOrigin: "top",
  },
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
  heroHeader: { paddingHorizontal: space.lg, gap: space.xxs },
  // Opaque white rather than 85% — the pink is mid-tone, and translucent
  // white on it fell below the AA contrast floor for 14pt text.
  heroText: { color: "#ffffff" },
  // title1 metrics. Shrinks about its top-left corner, so the left edge and
  // the top stay put while it condenses.
  heroTitle: {
    color: "#ffffff",
    alignSelf: "flex-start",
    transformOrigin: "left top",
    fontSize: 28,
    lineHeight: TITLE_LINE_HEIGHT,
    fontWeight: "800",
  },
  overscrollBleed: {
    height: OVERSCROLL_BLEED,
    // The hero gradient's top color, so the stretch reads as the hero
    // continuing rather than a seam.
    backgroundColor: "#f3437e",
  },
});
