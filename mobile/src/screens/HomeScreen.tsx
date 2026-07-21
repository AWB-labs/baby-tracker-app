import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { useBaby } from "../context/BabyContext";
import { useLogs } from "../hooks/useLogs";
import { usePolling } from "../hooks/usePolling";
import { useTheme } from "../design/ThemeProvider";
import { space, radius } from "../design/tokens";
import {
  Screen,
  ScreenHeader,
  SectionHeader,
  Button,
  IconButton,
  EmptyState,
  SkeletonList,
  FadeInUp,
  Text,
  Emoji,
} from "../components/ui";
import ActivityCard from "../components/ActivityCard";
import DailyActions from "../components/DailyActions";
import SinceLast from "../components/SinceLast";
import NailCutBanner from "../components/NailCutBanner";
import LogsList from "../components/LogsList";
import BabySwitcher from "../components/BabySwitcher";
import ManualEntryModal from "../components/ManualEntryModal";
import { greetingFor, formatBabyAge, summarise, summaryLine } from "../lib/greeting";
import type { AppStackParamList } from "../navigation/RootNavigator";

/** How many recent entries the home screen shows before deferring to History. */
const RECENT_LIMIT = 12;

/**
 * Home only renders the most recent handful, so fetching 200 rows on every poll
 * was sending ~4x the data it could display. History fetches the full set when
 * you actually go looking for it.
 */
const HOME_FETCH_LIMIT = 50;

/**
 * Slow enough to be cheap, fast enough that two caregivers don't visibly
 * diverge. Pull-to-refresh covers the impatient case.
 */
const POLL_INTERVAL_MS = 60_000;

export default function HomeScreen() {
  const { account } = useAuth();
  const { activeBaby } = useBaby();
  const t = useTheme();
  const { logs, loading, refresh, handleDelete } = useLogs(HOME_FETCH_LIMIT);
  const [showManual, setShowManual] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();

  // Another caregiver may be logging at the same time, so poll to stay in sync —
  // but only while this tab is on screen and the app is in the foreground.
  usePolling(refresh, POLL_INTERVAL_MS);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const recent = useMemo(() => logs.slice(0, RECENT_LIMIT), [logs]);
  const today = useMemo(() => summaryLine(summarise(logs)), [logs]);
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

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <ScreenHeader
        overline={`${greetingFor()}${firstName ? `, ${firstName}` : ""}`}
        title={activeBaby.name}
        subtitle={age ?? "Here's today"}
        actions={
          <>
            <BabySwitcher />
            <IconButton
              icon="settings"
              label="Settings"
              variant="surface"
              onPress={() => navigation.navigate("Settings")}
            />
          </>
        }
      />

      {/* A day already under way gets a one-line tally; a fresh morning gets
          nothing rather than a row of demoralising zeros. */}
      {today && (
        <View style={[styles.todayStrip, { backgroundColor: t.accentSofter }]}>
          <Emoji size={14}>✨</Emoji>
          <Text variant="subhead" style={{ color: t.accentText }} tabular>
            {today}
          </Text>
        </View>
      )}

      <NailCutBanner
        babyId={activeBaby.id}
        logs={logs}
        enteredByName={enteredByName}
        onLogSaved={refresh}
      />

      <SinceLast logs={logs} />

      <View style={styles.section}>
        <SectionHeader title="Track" />
        <View style={styles.cards}>
          {(["feed", "sleep", "diaper", "pump"] as const).map((type, index) => (
            <FadeInUp key={`${type}-${activeBaby.id}`} index={index}>
              <ActivityCard
                type={type}
                babyId={activeBaby.id}
                enteredByName={enteredByName}
                onLogSaved={refresh}
              />
            </FadeInUp>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Once a day" />
        <DailyActions
          babyId={activeBaby.id}
          logs={logs}
          enteredByName={enteredByName}
          onLogSaved={refresh}
        />
      </View>

      <Button
        label="Add something that already happened"
        icon="plus"
        variant="ghost"
        fullWidth
        onPress={() => setShowManual(true)}
      />

      <View style={styles.section}>
        <SectionHeader
          title="Recent"
          action={
            logs.length > RECENT_LIMIT ? (
              <Text variant="caption" tone="subtle">
                {RECENT_LIMIT} of {logs.length}
              </Text>
            ) : undefined
          }
        />
        {loading ? (
          <SkeletonList rows={3} />
        ) : recent.length === 0 ? (
          <EmptyState
            icon="history"
            title="Nothing logged yet"
            body={`Use the buttons above to record ${activeBaby.name}'s first feed, nap or diaper.`}
          />
        ) : (
          <LogsList logs={recent} onDelete={handleDelete} onEdit={refresh} />
        )}
      </View>

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
  cards: { gap: space.md },
  center: { alignItems: "center" },
  todayStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
});
