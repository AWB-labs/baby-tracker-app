import { useState, useEffect, useCallback } from "react";
import { fetchLogs, deleteLog, LogEntry } from "../api/logs";
import { useBaby } from "../context/BabyContext";

export function useLogs(limit: number | "all" = 200) {
  const { activeBaby } = useBaby();
  /**
   * Keyed on the id, not on the baby object.
   *
   * BabyContext sets activeBaby twice on a cold start — once from its cached
   * list, then again from /me — and those are two different objects describing
   * the same baby. Depending on the object made `refresh` a new function each
   * time, which re-ran the effect below and fetched the whole log a second time
   * for no new data. The id only changes when the baby actually does.
   */
  const babyId = activeBaby?.id;
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!babyId) {
      setLogs([]);
      setLoading(false);
      return;
    }
    try {
      const data = await fetchLogs(babyId, limit);
      setLogs(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [babyId, limit]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  const handleDelete = useCallback(
    async (id: number) => {
      // Optimistic remove
      setLogs((prev) => prev.filter((l) => l.id !== id));
      try {
        await deleteLog(id);
      } catch {
        // Revert on error
        refresh();
      }
    },
    [refresh]
  );

  return { logs, loading, refresh, handleDelete };
}
