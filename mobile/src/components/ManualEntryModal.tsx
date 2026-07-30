import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTheme } from "../design/ThemeProvider";
import {
  useActivityTones,
  ACTIVITY_LABEL,
  DIAPER_META,
  SIDE_EMOJI,
  type ActivityKey,
} from "../design/activity";
import { space, radius } from "../design/tokens";
import { useUnits } from "../context/SettingsContext";
import { createLog } from "../api/logs";
import { isInstantLog } from "../lib/activities";
import { formatDuration } from "../utils/formatDuration";
import { Text, Emoji, Button, Input, Field, Sheet, Chip, ChipWrap } from "./ui";
import { useToast } from "./Toast";

type ManualType = Extract<
  ActivityKey,
  "feed" | "pump" | "sleep" | "diaper" | "shower" | "vitamin" | "nailcut"
>;

const TYPES: ManualType[] = [
  "feed",
  "pump",
  "sleep",
  "diaper",
  "shower",
  "vitamin",
  "nailcut",
];

function formatTimeDisplay(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatDateDisplay(d: Date): string {
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/** Almost every after-the-fact entry is from the last couple of days. */
const DAY_SHORTCUTS = [
  { label: "Today", resolve: () => new Date() },
  { label: "Yesterday", resolve: () => daysAgo(1) },
  { label: "2 days ago", resolve: () => daysAgo(2) },
];

interface Props {
  visible: boolean;
  babyId: number;
  babyName: string;
  enteredByName: string;
  onSaved: () => void;
  onClose: () => void;
}

/**
 * "Add something that already happened" — the catch-all for entries made after
 * the fact. A feed or pump needs a side, an amount, or both: a side (with or
 * without an amount) is a timed session with a start and end; an amount with
 * no side is a single measured moment, like a bottle. Every other type saves
 * with a single time.
 */
export default function ManualEntryModal({
  visible,
  babyId,
  babyName,
  enteredByName,
  onSaved,
  onClose,
}: Props) {
  const t = useTheme();
  const tones = useActivityTones();
  const units = useUnits();
  const toast = useToast();

  const [activityType, setActivityType] = useState<ManualType | null>(null);
  const [side, setSide] = useState<"left" | "right" | null>(null);
  const [amount, setAmount] = useState("");
  const [diaperStatus, setDiaperStatus] = useState<string | null>(null);
  const [date, setDate] = useState(new Date());
  const [startTime, setStartTime] = useState(new Date());
  const [endTime, setEndTime] = useState(new Date());
  const [comments, setComments] = useState("");
  const [saving, setSaving] = useState(false);

  /**
   * Which picker is open, if any.
   *
   * One value rather than three booleans, because three could all be true at
   * once — and on iOS they were: the spinner is inline and was never closed, so
   * tapping Date then Start left two stacked wheels shoving the form around,
   * with no way to put either away.
   */
  const [openPicker, setOpenPicker] = useState<"date" | "start" | "end" | null>(
    null
  );

  const takesMl = activityType === "feed" || activityType === "pump";
  const isDiaper = activityType === "diaper";

  const amountValue = takesMl ? units.parseVolume(amount) : NaN;
  const amountValid = !isNaN(amountValue) && amountValue > 0;

  const isInstant =
    !!activityType &&
    isInstantLog(activityType, {
      side,
      amountMl: amountValid ? amountValue : null,
    });

  // A feed or pump needs a side or a valid amount — one is enough, and having
  // both is fine too.
  const sidedValid = !takesMl || !!side || amountValid;
  const canSave = !!activityType && sidedValid && (!isDiaper || !!diaperStatus);

  /**
   * Why Save is unavailable, in words.
   *
   * A disabled button that doesn't say what it's waiting for reads as broken —
   * you tap it, nothing happens, and the sheet offers no clue which of the
   * fields above it minds about.
   */
  const blockedReason = !activityType
    ? "Pick an activity to save this entry."
    : takesMl && !sidedValid
      ? "Choose a side, enter an amount, or both."
      : isDiaper && !diaperStatus
        ? "Choose what was in the nappy."
        : null;

  const combine = (d: Date, tm: Date): Date => {
    const result = new Date(d);
    result.setHours(tm.getHours(), tm.getMinutes(), 0, 0);
    return result;
  };

  // Worked out once, for both the readout below the fields and the save itself,
  // so what the sheet promises and what it writes can't drift apart.
  const spanStart = combine(date, startTime);
  const spanEnd = (() => {
    const end = combine(date, endTime);
    // An end before the start means it crossed midnight — roll it forward.
    if (end.getTime() < spanStart.getTime()) {
      const rolled = new Date(end);
      rolled.setDate(rolled.getDate() + 1);
      return rolled;
    }
    return end;
  })();
  const crossesMidnight = spanEnd.getDate() !== spanStart.getDate();
  const spanMinutes = (spanEnd.getTime() - spanStart.getTime()) / 60000;
  /** Long enough to be a slip on the wheel rather than a real session. */
  const implausible = !isInstant && spanMinutes > 16 * 60;

  const handleClose = () => {
    setActivityType(null);
    setSide(null);
    setAmount("");
    setDiaperStatus(null);
    setDate(new Date());
    setStartTime(new Date());
    setEndTime(new Date());
    setComments("");
    setOpenPicker(null);
    onClose();
  };

  const handleSave = async () => {
    if (!canSave || !activityType) return;
    setSaving(true);

    const start = spanStart;
    const end = isInstant ? start : spanEnd;

    try {
      await createLog({
        babyId,
        type: activityType,
        side: takesMl ? side : null,
        amountMl: takesMl && amountValid ? amountValue : null,
        diaperStatus: isDiaper ? diaperStatus : null,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        comments: comments.trim() || null,
        enteredByName,
      });
      onSaved();
      toast.success("Entry saved.");
      handleClose();
    } catch (err) {
      toast.showError(err);
    } finally {
      setSaving(false);
    }
  };

  /** A field that opens its own picker and closes whichever was open. */
  const pickerField = (
    label: string,
    value: string,
    which: "date" | "start" | "end"
  ) => {
    const active = openPicker === which;
    return (
      <Field label={label} style={styles.flex}>
        <Pressable
          onPress={() => setOpenPicker(active ? null : which)}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${value}`}
          accessibilityState={{ expanded: active }}
          style={({ pressed }) => [
            styles.pickerBtn,
            {
              backgroundColor: active ? t.accentSoft : t.accentSofter,
              // The open field is outlined, so it's obvious which one the wheel
              // below is actually editing.
              borderColor: active ? t.accent : t.borderStrong,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text variant="body">{value}</Text>
        </Pressable>
      </Field>
    );
  };

  /**
   * The wheel, plus a way to put it away.
   *
   * iOS renders the spinner inline and never dismisses it on its own, so
   * without an explicit Done there is no way to close one — which is what made
   * this sheet feel stuck. Android's dialog closes itself, so it gets no button.
   */
  const picker = (
    which: "date" | "start" | "end",
    mode: "date" | "time",
    value: Date,
    onPick: (next: Date) => void
  ) =>
    openPicker === which ? (
      <View style={styles.pickerWrap}>
        <DateTimePicker
          value={value}
          mode={mode}
          display={Platform.OS === "ios" ? "spinner" : "default"}
          maximumDate={mode === "date" ? new Date() : undefined}
          onChange={(_, picked) => {
            if (Platform.OS !== "ios") setOpenPicker(null);
            if (picked) onPick(picked);
          }}
        />
        {Platform.OS === "ios" && (
          <Button
            label="Done"
            variant="secondary"
            fullWidth
            onPress={() => setOpenPicker(null)}
          />
        )}
      </View>
    ) : null;

  return (
    <Sheet
      visible={visible}
      onClose={handleClose}
      title="Manual entry"
      subtitle={`Logging for ${babyName}`}
      footer={
        <View style={styles.actions}>
          <Button label="Cancel" variant="ghost" onPress={handleClose} style={styles.flex} />
          <Button
            label="Save entry"
            variant="primary"
            loading={saving}
            disabled={!canSave}
            onPress={handleSave}
            style={styles.flex}
          />
        </View>
      }
    >
      <Field label="Activity">
        <ChipWrap>
          {TYPES.map((type) => (
            <Chip
              key={type}
              label={ACTIVITY_LABEL[type]}
              emoji={tones[type].emoji}
              selected={activityType === type}
              onPress={() => {
                setActivityType(type);
                if (type !== "feed" && type !== "pump") {
                  setSide(null);
                  setAmount("");
                }
                if (type !== "diaper") setDiaperStatus(null);
              }}
            />
          ))}
        </ChipWrap>
      </Field>

      {takesMl && (
        <>
          <Field
            label="Side"
            helper="Optional — add a side to make this a timed session, with or without an amount."
          >
            <View style={styles.sideRow}>
              {(["left", "right"] as const).map((s) => {
                const selected = side === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setSide(selected ? null : s)}
                    accessibilityRole="button"
                    accessibilityLabel={`${s} side`}
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [
                      styles.sideBtn,
                      {
                        backgroundColor: selected ? t.accent : t.accentSofter,
                        borderColor: selected ? t.accent : t.borderStrong,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Emoji size={20}>{SIDE_EMOJI[s]}</Emoji>
                    <Text
                      variant="subheadStrong"
                      style={{ color: selected ? t.onAccent : t.accentText }}
                    >
                      {s === "left" ? "L" : "R"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <Input
            label={activityType === "feed" ? "Bottle amount" : "Amount"}
            helper={
              side
                ? activityType === "feed"
                  ? "Optional — a bottle top-up amount, if there was one."
                  : "Optional — how much came out, if you know it."
                : undefined
            }
            suffix={units.volume}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder={units.system === "metric" ? "120" : "4"}
          />
        </>
      )}

      {isDiaper && (
        <Field label="Status">
          <View style={styles.tileGrid}>
            {Object.entries(DIAPER_META).map(([value, meta]) => {
              const selected = diaperStatus === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setDiaperStatus(value)}
                  accessibilityRole="button"
                  accessibilityLabel={meta.label}
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.tile,
                    {
                      backgroundColor: selected ? t.accent : t.accentSofter,
                      borderColor: selected ? t.accent : t.borderStrong,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Emoji size={18}>{meta.emoji}</Emoji>
                  <Text
                    variant="subheadStrong"
                    style={{ color: selected ? t.onAccent : t.accentText }}
                  >
                    {meta.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>
      )}

      {/* Most entries are for today or yesterday, so those are one tap rather
          than a trip through a calendar wheel. */}
      <Field label="When">
        <ChipWrap>
          {DAY_SHORTCUTS.map((shortcut) => {
            const target = shortcut.resolve();
            const selected = sameDay(date, target);
            return (
              <Chip
                key={shortcut.label}
                label={shortcut.label}
                selected={selected}
                onPress={() => {
                  setDate(target);
                  setOpenPicker(null);
                }}
              />
            );
          })}
        </ChipWrap>
      </Field>

      {pickerField("Date", formatDateDisplay(date), "date")}
      {picker("date", "date", date, setDate)}

      {isInstant ? (
        pickerField("Time", formatTimeDisplay(startTime), "start")
      ) : (
        <View style={styles.rowGap}>
          {pickerField("Start time", formatTimeDisplay(startTime), "start")}
          {pickerField("End time", formatTimeDisplay(endTime), "end")}
        </View>
      )}

      {picker("start", "time", startTime, (picked) => {
        setStartTime(picked);
        if (isInstant) setEndTime(picked);
      })}
      {picker("end", "time", endTime, setEndTime)}

      {/* The resulting length, stated plainly. Picking 2:00 AM to 9:24 PM is
          easy to do by accident on a wheel, and a nineteen-hour nap saved in
          silence is only discovered later, in the averages. */}
      {!isInstant && (
        <View style={styles.durationRow}>
          <Text variant="footnote" tone="subtle">
            That's{" "}
            <Text variant="footnote" style={{ color: t.accentText }}>
              {formatDuration(spanMinutes)}
            </Text>
            {crossesMidnight ? " (ends next day)" : ""}
          </Text>
          {implausible && (
            <Text variant="footnote" style={{ color: t.warning }}>
              That's unusually long — check the start and end.
            </Text>
          )}
        </View>
      )}

      <Input
        label="Notes"
        value={comments}
        onChangeText={setComments}
        placeholder="Optional"
      />

      {blockedReason && (
        <Text variant="footnote" style={{ color: t.warning }}>
          {blockedReason}
        </Text>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  actions: { flexDirection: "row", gap: space.sm },
  rowGap: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  pickerWrap: { gap: space.sm },
  durationRow: { gap: space.xxs },
  pickerBtn: {
    borderRadius: radius.md,
    borderWidth: 2,
    paddingHorizontal: space.md,
    minHeight: 48,
    justifyContent: "center",
  },
  sideRow: { flexDirection: "row", gap: space.sm },
  sideBtn: {
    flex: 1,
    flexDirection: "row",
    height: 52,
    borderRadius: radius.lg,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  tile: {
    flexGrow: 1,
    width: "47%",
    height: 64,
    borderRadius: radius.lg,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xxs,
  },
});
