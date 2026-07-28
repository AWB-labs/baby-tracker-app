import React, { useCallback, useState } from "react";
import { Pressable } from "react-native";
import { useFocusEffect, useRoute, type RouteProp } from "@react-navigation/native";
import {
  Screen,
  ScreenHeader,
  Text,
  EmptyState,
  SkeletonList,
} from "../components/ui";
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
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
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

      {loading ? (
        <SkeletonList rows={5} />
      ) : logs.length === 0 ? (
        <EmptyState
          icon="history"
          title="Nothing logged yet"
          body="Once a feed, nap or diaper is logged on Today it lands here, newest first."
        />
      ) : (
        <LogsList
          logs={logs}
          onDelete={handleDelete}
          onEdit={refresh}
          initialFilter={filter}
        />
      )}

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
