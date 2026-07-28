import React, { useCallback, useState } from "react";
import { useRoute, type RouteProp } from "@react-navigation/native";
import {
  Screen,
  ScreenHeader,
  EmptyState,
  SkeletonList,
} from "../components/ui";
import { useLogs } from "../hooks/useLogs";
import { useBaby } from "../context/BabyContext";
import BabySwitcher from "../components/BabySwitcher";
import LogsList from "../components/LogsList";
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
  const { logs, loading, refresh, handleDelete } = useLogs("all");
  const [refreshing, setRefreshing] = useState(false);
  const route = useRoute<RouteProp<TabParamList, "Log">>();
  const filter = route.params?.filter ?? null;

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
        actions={<BabySwitcher />}
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
    </Screen>
  );
}
