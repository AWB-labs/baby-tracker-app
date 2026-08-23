import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../design/ThemeProvider";
import { space, radius } from "../design/tokens";
import {
  Sheet,
  Text,
  IconButton,
  Input,
  Button,
  Chip,
  ChipRow,
  Skeleton,
} from "./ui";
import { fetchLogs } from "../api/logs";
import { useToast } from "./Toast";

/**
 * How far back the burn rate looks. A week smooths over the difference
 * between a quiet day and a bad one without reaching so far back that a
 * newborn's rate is still being averaged with a six-month-old's.
 */
const RATE_WINDOW_DAYS = 7;
/** Enough diaper changes to cover that week for any baby, in one request. */
const RATE_FETCH_LIMIT = 200;
const DAY_MS = 86_400_000;

/** The sizes packs actually come in, so restocking is one tap rather than typing. */
const QUICK_ADDS = [10, 24, 50] as const;

interface Props {
  visible: boolean;
  onClose: () => void;
  babyId: number;
  babyName: string;
  /** Current count — see useDiaperStock. */
  count: number | null;
  /** Move the count relatively, for "used one" and "bought a pack". */
  onAdjust: (delta: number) => Promise<number>;
  /** Set it outright, for a hand recount. */
  onCorrect: (count: number) => Promise<number>;
}

/**
 * What's on hand, and every way of changing it.
 *
 * There is no stock ledger to list — `diaperStockCount` is a single number on
 * the baby, moved by a change logged with "use one from stock" ticked and by
 * restocks — so this sheet shows a *rate* instead of a history: how fast the
 * pile is going down, and therefore how long it lasts. That is the question
 * someone opens this to answer, and unlike a history it can be derived
 * honestly from the diaper logs that already exist.
 */
export default function DiaperStockModal({
  visible,
  onClose,
  babyId,
  babyName,
  count,
  onAdjust,
  onCorrect,
}: Props) {
  const t = useTheme();
  const toast = useToast();

  const [perDay, setPerDay] = useState<number | null>(null);
  const [loadingRate, setLoadingRate] = useState(false);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  /** Guards the ± buttons so a fast double-tap can't queue two writes. */
  const [busy, setBusy] = useState(false);

  const loadRate = useCallback(async () => {
    setLoadingRate(true);
    try {
      const since = Date.now() - RATE_WINDOW_DAYS * DAY_MS;
      const diapers = await fetchLogs(babyId, RATE_FETCH_LIMIT, {
        type: "diaper",
      });
      const recent = diapers.filter(
        (log) => new Date(log.startTime).getTime() >= since
      );
      // No changes logged in the window means no rate to state — not a rate
      // of zero, which would claim the stock lasts forever.
      setPerDay(recent.length > 0 ? recent.length / RATE_WINDOW_DAYS : null);
    } catch {
      // The rate is the nice-to-have on this sheet; the controls above it
      // work without it, so a failed fetch just hides the line.
      setPerDay(null);
    } finally {
      setLoadingRate(false);
    }
  }, [babyId]);

  useEffect(() => {
    if (visible) {
      loadRate();
      setEditing(false);
    }
  }, [visible, loadRate]);

  const current = count ?? 0;

  const step = async (delta: number) => {
    if (busy) return;
    // Nothing to take when the pile is empty, and the server floors at zero
    // anyway — refusing here keeps the button from looking broken.
    if (delta < 0 && current <= 0) return;
    setBusy(true);
    try {
      await onAdjust(delta);
    } catch (err) {
      toast.showError(err);
    } finally {
      setBusy(false);
    }
  };

  const quickAdd = async (n: number) => {
    if (busy) return;
    setBusy(true);
    try {
      await onAdjust(n);
      toast.success(`Added ${n} to the pile.`);
    } catch (err) {
      toast.showError(err);
    } finally {
      setBusy(false);
    }
  };

  const openEdit = () => {
    setDraft(String(current));
    setEditing(true);
  };

  const handleSave = async () => {
    const next = parseInt(draft.trim(), 10);
    if (isNaN(next) || next < 0) {
      toast.error("Enter a whole number, zero or more.");
      return;
    }
    setSaving(true);
    try {
      await onCorrect(next);
      setEditing(false);
    } catch (err) {
      toast.showError(err);
    } finally {
      setSaving(false);
    }
  };

  const daysLeft = perDay && perDay > 0 ? current / perDay : null;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Diaper stock"
      subtitle={
        editing
          ? "Sets the count outright — use this after a recount, not for a single change."
          : `What's left in ${babyName}'s pile.`
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
          {
            backgroundColor: current > 0 ? t.accentSofter : t.warningSoft,
            borderColor: current > 0 ? t.border : t.warningBorder,
          },
        ]}
      >
        {editing ? (
          <View style={styles.flex}>
            <Input
              label="On hand"
              value={draft}
              onChangeText={setDraft}
              keyboardType="number-pad"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
          </View>
        ) : (
          <>
            <IconButton
              icon="minus"
              label="Use one"
              variant="surface"
              disabled={busy || current <= 0}
              onPress={() => step(-1)}
            />
            <View style={styles.currentText}>
              <Text
                variant="title1"
                tabular
                center
                style={{ color: current > 0 ? t.accentText : t.warning }}
              >
                {count == null ? "—" : current}
              </Text>
              <Text variant="caption" tone="muted" center>
                {current === 1 ? "diaper left" : "diapers left"}
              </Text>
            </View>
            <IconButton
              icon="plus"
              label="Add one"
              variant="accent"
              disabled={busy}
              onPress={() => step(1)}
            />
          </>
        )}
      </View>

      {!editing && (
        <>
          <View style={styles.section}>
            <Text variant="subheadStrong">Bought a pack?</Text>
            <ChipRow>
              {QUICK_ADDS.map((n) => (
                <Chip
                  key={n}
                  label={`+${n}`}
                  disabled={busy}
                  onPress={() => quickAdd(n)}
                />
              ))}
              <Chip label="Set exactly…" icon="edit" onPress={openEdit} />
            </ChipRow>
          </View>

          <View style={styles.section}>
            <Text variant="subheadStrong">How fast it's going</Text>
            {loadingRate ? (
              <Skeleton height={18} />
            ) : perDay == null ? (
              <Text variant="footnote" tone="subtle">
                No changes logged in the last {RATE_WINDOW_DAYS} days, so
                there's nothing to base an estimate on yet.
              </Text>
            ) : (
              <Text variant="footnote" tone="subtle">
                About {perDay.toFixed(1)} a day over the last {RATE_WINDOW_DAYS}{" "}
                days
                {daysLeft != null
                  ? current > 0
                    ? ` — that's roughly ${
                        daysLeft < 1
                          ? "less than a day"
                          : `${Math.floor(daysLeft)} day${
                              Math.floor(daysLeft) === 1 ? "" : "s"
                            }`
                      } left.`
                    : " — and you're out."
                  : "."}
              </Text>
            )}
          </View>

          <Text variant="caption" tone="subtle">
            The count goes down on its own only when a change is logged with
            "use one from stock" ticked. Everything else is here.
          </Text>
        </>
      )}
    </Sheet>
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
  section: { gap: space.sm },
});
