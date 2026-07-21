import React, { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../design/ThemeProvider";
import { space, radius, hitSlop, DISABLED_OPACITY } from "../design/tokens";
import { Icon } from "../design/icons";
import {
  useActivityTone,
  ACTIVITY_LABEL,
  DIAPER_META,
  SIDE_EMOJI,
} from "../design/activity";
import { Text, Badge, Emoji } from "./ui/primitives";
import { Card } from "./ui/Card";
import { Button, IconButton } from "./ui/Button";
import { Input } from "./ui/Input";
import { Sheet } from "./ui/Sheet";
import { useToast } from "./Toast";
import { useUnits } from "../context/SettingsContext";
import { useTimer, type ActivityType } from "../hooks/useTimer";
import { createLog } from "../api/logs";
import { formatTimer } from "../utils/formatTime";

const DIAPER_OPTIONS = Object.entries(DIAPER_META).map(([value, meta]) => ({
  value,
  ...meta,
}));

interface Config {
  hasSides: boolean;
  hasTimer: boolean;
  hasAmount: boolean;
  amountLabel?: string;
}

const CONFIG: Record<string, Config> = {
  feed: { hasSides: true, hasTimer: true, hasAmount: true, amountLabel: "Bottle" },
  pump: { hasSides: true, hasTimer: true, hasAmount: true, amountLabel: "Amount" },
  sleep: { hasSides: false, hasTimer: true, hasAmount: false },
  diaper: { hasSides: false, hasTimer: false, hasAmount: false },
};

interface Props {
  type: Extract<ActivityType, "feed" | "pump" | "sleep" | "diaper">;
  babyId: number;
  enteredByName: string;
  onLogSaved: () => void;
}

/**
 * One activity, in one card.
 *
 * Idle it shows only its start controls. Running it becomes the focal point of
 * the screen — timer, adjust, pause, stop. Everything that needs more input
 * (a nappy status, a bottle volume, a note) opens a sheet rather than swapping
 * the card's contents, so the card never becomes a different thing under your
 * thumb and there is always a way back out.
 */
export default function ActivityCard({
  type,
  babyId,
  enteredByName,
  onLogSaved,
}: Props) {
  const t = useTheme();
  const tone = useActivityTone(type);
  const toast = useToast();
  const units = useUnits();
  const timer = useTimer(type, babyId);
  const config = CONFIG[type];
  const label = ACTIVITY_LABEL[type];

  const [note, setNote] = useState("");
  const [diaperStatus, setDiaperStatus] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [showAmount, setShowAmount] = useState(false);
  const [saving, setSaving] = useState(false);

  const amountValue = units.parseVolume(amount);
  const amountValid = !isNaN(amountValue) && amountValue > 0;

  const reset = useCallback(() => {
    setNote("");
    setDiaperStatus(null);
    setAmount("");
    setShowAmount(false);
  }, []);

  const cancelAll = useCallback(() => {
    reset();
    timer.handleCancel();
  }, [reset, timer]);

  /** Save the finished timed session (or the nappy change). */
  const saveSession = useCallback(async () => {
    const start = timer.getOriginalStartTime() ?? timer.startTime;
    if (!start) return;
    const end = timer.getEndTime() ?? new Date();
    const timeline = timer.getTimeline();

    setSaving(true);
    try {
      await createLog({
        babyId,
        type,
        side: timer.activeSide,
        diaperStatus: type === "diaper" ? diaperStatus : null,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        comments: note.trim() || null,
        enteredByName,
        pauseTimeline: timeline.length > 0 ? timeline : null,
      });
      onLogSaved();
      toast.success(`${label} saved.`);
      reset();
      timer.handleCancel();
    } catch (err) {
      toast.showError(err);
    } finally {
      setSaving(false);
    }
  }, [
    babyId, type, timer, diaperStatus, note, enteredByName,
    onLogSaved, toast, label, reset,
  ]);

  const saveAmount = useCallback(async () => {
    if (!amountValid || saving) return;
    const now = new Date();
    setSaving(true);
    try {
      await createLog({
        babyId,
        type,
        side: null,
        amountMl: amountValue,
        startTime: now.toISOString(),
        endTime: now.toISOString(),
        enteredByName,
      });
      onLogSaved();
      toast.success(`${units.formatVolume(amountValue)} logged.`);
      reset();
    } catch (err) {
      toast.showError(err);
    } finally {
      setSaving(false);
    }
  }, [
    amountValid, amountValue, saving, babyId, type,
    enteredByName, onLogSaved, toast, units, reset,
  ]);

  const running = timer.isActive;

  /*
   * Which sheet is asking for input. Picking a nappy status closes one sheet
   * and opens the next in a single commit; if those were two <Modal>s, iOS
   * would drop the incoming present while the outgoing dismiss was still in
   * flight and strand the flow with no Save or Discard on screen. One Modal
   * that swaps its contents can't race with itself.
   */
  const sheet = timer.showDiaperStatus
    ? "status"
    : timer.showComment
      ? "note"
      : showAmount
        ? "amount"
        : null;

  // Hold the last shown kind through the dismiss animation, so the sheet
  // doesn't visibly change into a different form on its way out.
  const lastSheet = useRef<"status" | "note" | "amount">("note");
  if (sheet) lastSheet.current = sheet;
  const shown = sheet ?? lastSheet.current;

  /* ---------------------------------------------------------------- active */

  if (running) {
    return (
      <Card level={2} style={{ borderColor: tone.border, borderWidth: 2 }}>
        <View style={styles.activeHeader}>
          <View style={styles.rowCenter}>
            <Emoji size={18}>{tone.emoji}</Emoji>
            <Text variant="subheadStrong" style={{ color: tone.text }}>
              {label}
              {timer.activeSide ? ` · ${timer.activeSide === "left" ? "Left" : "Right"}` : ""}
            </Text>
          </View>
          <Badge tone={timer.paused ? "warning" : "success"}>
            {timer.paused ? "Paused" : "Running"}
          </Badge>
        </View>

        <Text
          variant="display"
          tabular
          center
          style={styles.clock}
          accessibilityLabel={`Elapsed ${Math.floor(timer.elapsed / 60)} minutes`}
        >
          {formatTimer(timer.elapsed)}
        </Text>

        {/* Backdate a late tap without abandoning the session. */}
        <View style={styles.adjustRow}>
          <IconButton
            icon="minus"
            label="Subtract 5 minutes from elapsed time"
            variant="surface"
            size="sm"
            disabled={timer.elapsed < 300}
            onPress={() => timer.adjustStart(-300)}
          />
          <Text variant="caption" tone="subtle">
            adjust start · 5 min
          </Text>
          <IconButton
            icon="plus"
            label="Add 5 minutes to elapsed time"
            variant="surface"
            size="sm"
            onPress={() => timer.adjustStart(300)}
          />
        </View>

        <View style={styles.controlRow}>
          {timer.paused ? (
            <Button
              label="Resume"
              icon="play"
              variant="success"
              onPress={timer.handleResume}
              style={styles.flex}
            />
          ) : (
            <Button
              label="Pause"
              icon="pause"
              variant="secondary"
              onPress={timer.handlePause}
              style={styles.flex}
            />
          )}
          <Button
            label="Finish"
            icon="stop"
            variant="primary"
            onPress={timer.handleStop}
            style={styles.flex}
          />
        </View>
      </Card>
    );
  }

  /* ------------------------------------------------------------ idle card */

  return (
    <>
      <Card>
        <View style={styles.idleHeader}>
          <View style={styles.rowCenter}>
            <View style={[styles.iconChip, { backgroundColor: tone.soft }]}>
              <Emoji size={20}>{tone.emoji}</Emoji>
            </View>
            <Text variant="bodyStrong">{label}</Text>
          </View>
        </View>

        {type === "diaper" ? (
          <Button
            label="Log a diaper change"
            icon="plus"
            variant="secondary"
            fullWidth
            onPress={timer.openDiaperStatus}
          />
        ) : config.hasSides ? (
          <View style={styles.actions}>
            <View style={styles.sideRow}>
              <SideButton
                side="left"
                onPress={() => timer.handleStart("left")}
                label={`Start ${label.toLowerCase()} on the left`}
              />
              <SideButton
                side="right"
                onPress={() => timer.handleStart("right")}
                label={`Start ${label.toLowerCase()} on the right`}
              />
            </View>
            {config.hasAmount && (
              <Pressable
                onPress={() => setShowAmount(true)}
                accessibilityRole="button"
                accessibilityLabel={`${config.amountLabel} — record ${label.toLowerCase()} by volume instead of timing it`}
                style={({ pressed }) => [
                  styles.bottleBtn,
                  {
                    backgroundColor: t.accentSofter,
                    borderColor: t.borderStrong,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Emoji size={18}>🍼</Emoji>
                <Text variant="subheadStrong" style={{ color: t.accentText }}>
                  {config.amountLabel}
                </Text>
              </Pressable>
            )}
          </View>
        ) : (
          <Button
            label={`Start ${label.toLowerCase()}`}
            icon="play"
            variant="secondary"
            fullWidth
            onPress={() => timer.handleStart()}
          />
        )}
      </Card>

      {/* ------------------------------------------------------------ sheet */}

      <Sheet
        visible={sheet !== null}
        onClose={cancelAll}
        title={
          shown === "status"
            ? "What was it?"
            : shown === "amount"
              ? `${config.amountLabel} ${label.toLowerCase()}`
              : `Save this ${label.toLowerCase()}?`
        }
        subtitle={
          shown === "status"
            ? "Tap one to continue"
            : shown === "amount"
              ? "Logged as a one-off, not timed"
              : type === "diaper"
                ? DIAPER_META[diaperStatus ?? ""]?.label
                : `${formatTimer(timer.elapsed)} elapsed`
        }
        footer={
          // Picking a status is the action itself — nothing left to confirm.
          shown === "status" ? undefined : (
            <View style={styles.controlRow}>
              <Button
                label={shown === "amount" ? "Cancel" : "Discard"}
                variant="ghost"
                onPress={cancelAll}
                style={styles.flex}
              />
              <Button
                label="Save"
                variant="primary"
                loading={saving}
                disabled={shown === "amount" && !amountValid}
                onPress={shown === "amount" ? saveAmount : saveSession}
                style={styles.flex}
              />
            </View>
          )
        }
      >
        {shown === "status" ? (
          <View style={styles.statusGrid}>
            {DIAPER_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => {
                  setDiaperStatus(opt.value);
                  timer.handleDiaperStatusSelect(opt.value);
                }}
                accessibilityRole="button"
                accessibilityLabel={opt.label}
                style={({ pressed }) => [
                  styles.statusTile,
                  {
                    backgroundColor: t.accentSofter,
                    borderColor: t.borderStrong,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Emoji size={22}>{opt.emoji}</Emoji>
                <Text variant="subheadStrong" style={{ color: t.accentText }}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : shown === "amount" ? (
          <Input
            label="How much?"
            suffix={units.volume}
            value={amount}
            onChangeText={setAmount}
            placeholder={units.system === "metric" ? "120" : "4"}
            keyboardType="decimal-pad"
            autoFocus
            error={
              amount.length > 0 && !amountValid
                ? "Enter an amount greater than zero."
                : null
            }
          />
        ) : (
          <Input
            label="Note"
            helper="Optional — anything worth remembering about this one."
            value={note}
            onChangeText={setNote}
            placeholder="Fussy, fell asleep halfway…"
            returnKeyType="done"
          />
        )}
      </Sheet>
    </>
  );
}

/** Left/right selector. Sized generously — it's tapped one-handed. */
function SideButton({
  side,
  onPress,
  label,
}: {
  side: "left" | "right";
  onPress: () => void;
  label: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.sideButton,
        {
          backgroundColor: t.accentSofter,
          borderColor: t.borderStrong,
          opacity: pressed ? DISABLED_OPACITY + 0.3 : 1,
        },
      ]}
    >
      <Emoji size={24}>{SIDE_EMOJI[side]}</Emoji>
      <Text variant="subheadStrong" style={{ color: t.accentText }}>
        {side === "left" ? "L" : "R"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  rowCenter: { flexDirection: "row", alignItems: "center", gap: space.sm },
  idleHeader: { marginBottom: space.md },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: { gap: space.sm },
  sideRow: { flexDirection: "row", gap: space.sm },
  sideButton: {
    flex: 1,
    height: 72,
    borderRadius: radius.lg,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xxs,
  },
  bottleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    height: 48,
    borderRadius: radius.lg,
    borderWidth: 2,
  },
  activeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  clock: { marginVertical: space.sm },
  adjustRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
    marginBottom: space.lg,
  },
  controlRow: { flexDirection: "row", gap: space.sm },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  statusTile: {
    width: "47.5%",
    flexGrow: 1,
    height: 88,
    borderRadius: radius.lg,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
  },
});
