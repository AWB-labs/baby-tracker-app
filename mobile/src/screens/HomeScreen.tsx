import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { space, radius } from "../design/tokens";
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
import Foods from "../components/Foods";
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
    <Screen bleedTop refreshing={refreshing} onRefresh={onRefresh}>
      {/* The dashboard's top — greeting, who, and the live snapshot — sits on a
          pink gradient that bleeds to the screen edges and behind the status
          bar; Track and everything below return to the app's blush surface. */}
      <LinearGradient
        colors={["#f3437e", "#993758"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + space.md }]}
      >
        <ScreenHeader
          light
          overline={`${greetingFor()}${firstName ? `, ${firstName}` : ""}`}
          title={activeBaby.name}
          subtitle={babyLine}
          actions={<BabySwitcher />}
        />

        {/* What's happening right now — four doors, not banners. */}
        {!loading && (
          <Snapshot
            logs={logs}
            feedTimer={feedTimer}
            sleepTimer={sleepTimer}
            onOpenLog={(filter) => navigation.navigate("Log", { filter })}
            onOpenInsights={() => navigation.navigate("Insights")}
          />
        )}
      </LinearGradient>

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

      <Foods babyId={activeBaby.id} />

      <ManualEntryModal
        visible={showManual}
        babyId={activeBaby.id}
        babyName={activeBaby.name}
        enteredByName={enteredByName}
        onSaved={refresh}
        onClose={() => setShowManual(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  center: { alignItems: "center" },
  divider: { marginHorizontal: space.lg },
  // Full-bleed pink header: negative side margins cancel the Screen's padding
  // so it reaches both edges; the bottom corners round into the blush below.
  hero: {
    marginHorizontal: -space.lg,
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
    gap: space.lg,
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
  },
});
