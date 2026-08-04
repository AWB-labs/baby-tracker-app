import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../design/ThemeProvider";
import { Icon } from "../design/icons";
import { space, radius } from "../design/tokens";
import { Sheet, Text, IconButton, Input, Button, SkeletonList } from "./ui";
import { fetchLogs, type MilkBalance } from "../api/logs";
import { formatTime, formatRelativeTime } from "../utils/formatTime";
import { useUnits } from "../context/SettingsContext";
import { useToast } from "./Toast";

/**
 * Enough to cover most families' pump/bottle history in one fetch. This is a
 * standalone view of just those two log types, not the capped, mixed-type
 * feed Home already holds — a family that pumps checks this often enough
 * that it's worth its own request rather than reusing Home's 50.
 */
const HISTORY_LIMIT = 100;

interface HistoryEntry {
  id: number;
  /** Positive for a pump (adds to supply), negative for a bottle (draws down). */
  deltaMl: number;
  startTime: string;
  enteredByName: string;
  kind: "pump" | "bottle";
}

interface Props {
  visible: boolean;
  onClose: () => void;
  babyId: number;
  milkBalance: MilkBalance | null;
  /** Hand-correct the balance to an exact amount — see useMilkBalance. */
  onCorrect: (balanceMl: number) => Promise<MilkBalance>;
}

/**
 * What built the current milk supply number, plus a way to hand-correct it.
 *
 * The list is derived from pump and bottle-feed logs rather than a stored
 * ledger — there is no dedicated adjustment history table, so every past
 * pump (a credit) and every bottle with an amount (a debit, nursing sessions
 * carry none) stands in for it. A manual correction itself isn't a row here;
 * it's an offset applied on top (see api/src/routes/logs.ts), so it changes
 * the total without adding an entry to this list.
 */
export default function MilkSupplyModal({
  visible,
  onClose,
  babyId,
  milkBalance,
  onCorrect,
}: Props) {
  const t = useTheme();
  const units = useUnits();
  const toast = useToast();

  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const [pumps, feeds] = await Promise.all([
        fetchLogs(babyId, HISTORY_LIMIT, { type: "pump" }),
        fetchLogs(babyId, HISTORY_LIMIT, { type: "feed" }),
      ]);
      const entries: HistoryEntry[] = [
        ...pumps
          .filter((l) => l.amountMl != null)
          .map((l) => ({
            id: l.id,
            deltaMl: l.amountMl as number,
            startTime: l.startTime,
            enteredByName: l.enteredByName,
            kind: "pump" as const,
          })),
        // A feed only draws down the supply when it's a bottle (has an
        // amount) — a nursing session leaves the pumped total untouched.
        ...feeds
          .filter((l) => l.amountMl != null)
          .map((l) => ({
            id: l.id,
            deltaMl: -(l.amountMl as number),
            startTime: l.startTime,
            enteredByName: l.enteredByName,
            kind: "bottle" as const,
          })),
      ].sort(
        (a, b) =>
          new Date(b.startTime).getTime() - new Date(a.startTime).getTime() ||
          b.id - a.id
      );
      setHistory(entries);
    } catch (err) {
      setHistory([]);
      toast.showError(err);
    } finally {
      setLoadingHistory(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [babyId]);

  useEffect(() => {
    if (visible) {
      loadHistory();
      setEditing(false);
    }
  }, [visible, loadHistory]);

  const availableMl = milkBalance ? Math.max(0, milkBalance.balanceMl) : 0;

  const openEdit = () => {
    setDraft(units.toDisplayVolume(availableMl));
    setEditing(true);
  };

  const handleSave = async () => {
    const ml = units.parseVolume(draft);
    if (isNaN(ml) || ml < 0) {
      toast.error(`Enter an amount in ${units.volume}, zero or more.`);
      return;
    }
    setSaving(true);
    try {
      await onCorrect(ml);
      setEditing(false);
      // The correction itself doesn't add a row, but a fresh open should
      // still reflect it if anything changed underneath in the meantime.
      loadHistory();
    } catch (err) {
      toast.showError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Milk supply"
      subtitle={
        editing
          ? "Overrides the running total — future pumps and bottles still move it from here."
          : "Every pump and bottle behind the current total."
      }
      footer={
        editing ? (
          <View style={styles.editActions}>
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => setEditing(false)}
              style={styles.flex}
            />
            <Button
              label="Save"
              variant="primary"
              loading={saving}
              onPress={handleSave}
              style={styles.flex}
            />
          </View>
        ) : undefined
      }
    >
      <View
        style={[
          styles.current,
          { backgroundColor: t.accentSofter, borderColor: t.border },
        ]}
      >
        <View style={styles.currentText}>
          <Text variant="caption" tone="muted">
            Available now
          </Text>
          {editing ? (
            <Input
              label="Available"
              suffix={units.volume}
              value={draft}
              onChangeText={setDraft}
              keyboardType="decimal-pad"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
          ) : (
            <Text variant="title2" tabular style={{ color: t.accentText }}>
              {units.formatVolume(availableMl)}
            </Text>
          )}
        </View>
        {!editing && (
          <IconButton
            icon="edit"
            label="Correct the amount"
            variant="accent"
            onPress={openEdit}
          />
        )}
      </View>

      <View style={styles.historySection}>
        <Text variant="subheadStrong">History</Text>
        {loadingHistory ? (
          <SkeletonList rows={3} />
        ) : !history || history.length === 0 ? (
          <Text variant="footnote" tone="subtle">
            No pumps or bottles logged yet.
          </Text>
        ) : (
          <View style={styles.historyList}>
            {history.map((entry) => (
              <HistoryRow key={`${entry.kind}-${entry.id}`} entry={entry} />
            ))}
          </View>
        )}
      </View>
    </Sheet>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const t = useTheme();
  const units = useUnits();
  const isCredit = entry.deltaMl > 0;
  const tone = isCredit
    ? { soft: t.successSoft, fg: t.success }
    : { soft: t.dangerSoft, fg: t.danger };

  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: tone.soft }]}>
        <Icon name={isCredit ? "plus" : "minus"} size="sm" color={tone.fg} />
      </View>
      <View style={styles.rowText}>
        <Text variant="subhead">{entry.kind === "pump" ? "Pumped" : "Bottle"}</Text>
        <Text variant="caption" tone="subtle">
          {formatTime(entry.startTime)} · {formatRelativeTime(entry.startTime)} · by{" "}
          {entry.enteredByName}
        </Text>
      </View>
      <Text variant="subheadStrong" tabular style={{ color: tone.fg }}>
        {isCredit ? "+" : "-"}
        {units.formatVolume(Math.abs(entry.deltaMl))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  editActions: { flexDirection: "row", gap: space.sm },
  current: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  currentText: { flex: 1, gap: space.xxs },
  historySection: { gap: space.sm },
  historyList: { gap: space.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1, gap: 1 },
});
