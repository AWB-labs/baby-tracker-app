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
 * the fact. Same rules as live tracking: a feed or pump is either a timed side
 * session or a measured amount; moments save with a single time.
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

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

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

  // A feed or pump needs either a side or a valid amount; one is enough.
  const sidedValid = !takesMl || !!side || amountValid;
  const canSave = !!activityType && sidedValid && (!isDiaper || !!diaperStatus);

  const combine = (d: Date, tm: Date): Date => {
    const result = new Date(d);
    result.setHours(tm.getHours(), tm.getMinutes(), 0, 0);
    return result;
  };

  const handleClose = () => {
    setActivityType(null);
    setSide(null);
    setAmount("");
    setDiaperStatus(null);
    setDate(new Date());
    setStartTime(new Date());
    setEndTime(new Date());
    setComments("");
    setShowDatePicker(false);
    setShowStartPicker(false);
    setShowEndPicker(false);
    onClose();
  };

  const handleSave = async () => {
    if (!canSave || !activityType) return;
    setSaving(true);

    const start = combine(date, startTime);
    let end = isInstant ? start : combine(date, endTime);
    // An end before the start means it crossed midnight — roll it forward.
    if (!isInstant && end.getTime() < start.getTime()) {
      end = new Date(end);
      end.setDate(end.getDate() + 1);
    }

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

  const pickerField = (label: string, value: string, onPress: () => void) => (
    <Field label={label} style={styles.flex}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        style={({ pressed }) => [
          styles.pickerBtn,
          {
            backgroundColor: t.accentSofter,
            borderColor: t.borderStrong,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Text variant="body">{value}</Text>
      </Pressable>
    </Field>
  );

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
            label="Side (timed session)"
            helper="Pick a side, or enter an amount below instead."
          >
            <View style={styles.sideRow}>
              {(["left", "right"] as const).map((s) => {
                const selected = side === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => {
                      const next = selected ? null : s;
                      setSide(next);
                      if (next) setAmount("");
                    }}
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
            suffix={units.volume}
            value={amount}
            onChangeText={(v) => {
              setAmount(v);
              // Entering an amount switches to an instant, measured log.
              if (v) setSide(null);
            }}
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

      {pickerField("Date", formatDateDisplay(date), () => setShowDatePicker(true))}
      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_, d) => {
            setShowDatePicker(Platform.OS === "ios");
            if (d) setDate(d);
          }}
        />
      )}

      {isInstant ? (
        pickerField("Time", formatTimeDisplay(startTime), () =>
          setShowStartPicker(true)
        )
      ) : (
        <View style={styles.rowGap}>
          {pickerField("Start time", formatTimeDisplay(startTime), () =>
            setShowStartPicker(true)
          )}
          {pickerField("End time", formatTimeDisplay(endTime), () =>
            setShowEndPicker(true)
          )}
        </View>
      )}
      {showStartPicker && (
        <DateTimePicker
          value={startTime}
          mode="time"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_, tm) => {
            setShowStartPicker(Platform.OS === "ios");
            if (tm) {
              setStartTime(tm);
              if (isInstant) setEndTime(tm);
            }
          }}
        />
      )}
      {showEndPicker && (
        <DateTimePicker
          value={endTime}
          mode="time"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_, tm) => {
            setShowEndPicker(Platform.OS === "ios");
            if (tm) setEndTime(tm);
          }}
        />
      )}

      <Input
        label="Notes"
        value={comments}
        onChangeText={setComments}
        placeholder="Optional"
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  actions: { flexDirection: "row", gap: space.sm },
  rowGap: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
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
