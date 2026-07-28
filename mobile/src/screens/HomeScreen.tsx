import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { space } from "../design/tokens";
import { useAuth } from "../context/AuthContext";
import { useBaby } from "../context/BabyContext";
import { useLogs } from "../hooks/useLogs";
import { usePolling } from "../hooks/usePolling";
import { useTimer } from "../hooks/useTimer";
import {
  Screen,
  ScreenHeader,
  SectionHeader,
  Button,
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

const TRACK_TYPES: TrackType[] = ["feed", "sleep", "diaper", "pump"];

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
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <ScreenHeader
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

      <View style={styles.section}>
        <SectionHeader title="Track" />
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
        <Button
          label="Add something that already happened"
          icon="plus"
          variant="ghost"
          fullWidth
          onPress={() => setShowManual(true)}
        />
      </View>

      <Habits
        babyId={activeBaby.id}
        enteredByName={enteredByName}
        onLogSaved={refresh}
        refreshKey={habitsRefreshKey}
      />

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
});
