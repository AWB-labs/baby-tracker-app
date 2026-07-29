import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { useFocusEffect, useRoute, type RouteProp } from "@react-navigation/native";
import { Screen, ScreenHeader, Text } from "../components/ui";
import { useLogs } from "../hooks/useLogs";
import { useBaby } from "../context/BabyContext";
import { useAuth } from "../context/AuthContext";
import BabySwitcher from "../components/BabySwitcher";
import LogsList from "../components/LogsList";
import ManualEntryModal from "../components/ManualEntryModal";
import type { TabParamList } from "../navigation/AppTabs";

/**
 * The entry timeline — every log, newest first, filterable by activity.
 *
 * This tab answers "what happened"; Insights answers "how are things
 * trending". The two used to blur together, so the split is deliberate:
 * no charts here, no entry rows there. Snapshot cards on Today deep-link
 * here with a filter already applied.
 */
export default function LogScreen() {
  const { activeBaby } = useBaby();
  const { account } = useAuth();
  const { logs, loading, refresh, handleDelete } = useLogs("all");
  const [refreshing, setRefreshing] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const route = useRoute<RouteProp<TabParamList, "Log">>();
  const filter = route.params?.filter ?? null;
  const enteredByName = account?.name || "Unknown";

  // Each screen owns its own useLogs, and the tab stays mounted, so without
  // this the Log tab keeps whatever it fetched on first mount — a feed just
  // logged on Today wouldn't appear here until a manual pull. Refetch on every
  // focus so opening Log (or deep-linking into it) always shows the latest.
  //
  // Two things keep it from firing redundantly, and both matter because this
  // screen pulls the account's entire history rather than a page of it:
  //
  //   - the first focus is skipped, since useLogs has already fetched on mount
  //   - `refresh` is read through a ref instead of being a dependency, so a new
  //     `refresh` identity (a baby switch) isn't mistaken for a focus — useLogs
  //     is already refetching for that
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedBefore.current) {
        focusedBefore.current = true;
        return;
      }
      refreshRef.current();
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const header = (
    <ScreenHeader
      title="Log"
      subtitle={`Everything, newest first${activeBaby ? ` · ${activeBaby.name}` : ""}`}
      actions={
        <>
          {activeBaby ? (
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
          ) : null}
          <BabySwitcher />
        </>
      }
    />
  );

  return (
    // The list is virtualized, so it — not Screen — owns the scrolling: a
    // FlatList nested in a ScrollView renders every row anyway and windows
    // nothing. Screen keeps the safe area and background, and hands its padding
    // to the list's content container so the chrome is unchanged.
    <Screen scroll={false} contentStyle={styles.flush}>
      <LogsList
        logs={logs}
        loading={loading}
        onDelete={handleDelete}
        onEdit={refresh}
        initialFilter={filter}
        header={header}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />

      {activeBaby ? (
        <ManualEntryModal
          visible={showManual}
          babyId={activeBaby.id}
          babyName={activeBaby.name}
          enteredByName={enteredByName}
          onSaved={refresh}
          onClose={() => setShowManual(false)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Screen's padding moves to the list's content container, so rows keep
  // scrolling under the floating tab bar instead of stopping above it.
  flush: {
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    gap: 0,
  },
});
