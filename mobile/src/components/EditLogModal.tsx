import React, { useCallback, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTheme, useThemeContext } from "../design/ThemeProvider";
import {
  useActivityTone,
  ACTIVITY_LABEL,
  DIAPER_META,
  CONDITION_META,
  SLEEP_KIND_META,
} from "../design/activity";
import { space, radius } from "../design/tokens";
import { useUnits } from "../context/SettingsContext";
import { updateLog, deleteLog, type LogEntry, type UpdateLogInput } from "../api/logs";
import { isInstantLog } from "../lib/activities";
import { HEALTH_CONDITIONS, type HealthCondition } from "../lib/health";
import { getErrorMessage } from "../lib/errors";
import { Text, Emoji, Button, IconButton, Input, Field, Sheet, ConfirmDialog } from "./ui";
import TimeField from "./TimeField";

function formatDateDisplay(d: Date): string {
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

const SLEEP_KIND_OPTIONS = (
  Object.entries(SLEEP_KIND_META) as ["nap" | "night", { emoji: string; label: string }][]
).map(([value, meta]) => ({ value, ...meta }));

/** Combine a calendar day from `d` with the clock time from `t`. */
function combine(d: Date, t: Date): Date {
  const result = new Date(d);
  result.setHours(t.getHours(), t.getMinutes(), 0, 0);
  return result;
}

interface Props {
  log: LogEntry;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

export default function EditLogModal({ log, onClose, onSaved }: Props) {
  const t = useTheme();
  const { isDark } = useThemeContext();
  const tone = useActivityTone(log.type);
  const units = useUnits();
  const label = ACTIVITY_LABEL[log.type] ?? log.type;

  // An instant log is a moment, not a range: it edits as a single time field.
  const usesSingleTime = isInstantLog(log.type, {
    side: log.side,
    amountMl: log.amountMl,
  });
  // A pump or bottle feed can record how much — whether or not this
  // particular entry had an amount when it was first logged. A timed session
  // (side, no amount) can have one added here; one with an amount can have it
  // cleared, as long as the side is still there to anchor the entry.
  const editsAmountMl = log.type === "pump" || log.type === "feed";

  const [date, setDate] = useState(() => new Date(log.startTime));
  const [startTime, setStartTime] = useState(() => new Date(log.startTime));
  const [endTime, setEndTime] = useState(() =>
    log.endTime ? new Date(log.endTime) : new Date(log.startTime)
  );
  const [comments, setComments] = useState(log.comments ?? "");
  const [diaperStatus, setDiaperStatus] = useState<string | null>(log.diaperStatus);
  // Sleeps recorded before the distinction existed carry no sleepKind; "nap" is
  // a starting position for the toggle, never a fact asserted on their behalf.
  const [sleepKind, setSleepKind] = useState<"nap" | "night">(
    log.sleepKind === "night" ? "night" : "nap"
  );
  const [amountMl, setAmountMl] = useState(
    log.amountMl !== null ? units.toDisplayVolume(log.amountMl) : ""
  );
  const [weight, setWeight] = useState(
    log.weightKg !== null ? units.toDisplayWeight(log.weightKg) : ""
  );
  const [height, setHeight] = useState(
    log.heightCm !== null ? units.toDisplayHeight(log.heightCm) : ""
  );
  const [condition, setCondition] = useState<HealthCondition | null>(
    log.healthCondition && log.healthCondition in CONDITION_META
      ? (log.healthCondition as HealthCondition)
      : null
  );
  const [medication, setMedication] = useState(log.medication ?? "");
  const [dose, setDose] = useState(log.dose ?? "");
  const [fever, setFever] = useState(
    log.feverCelsius !== null ? units.toDisplayTemperature(log.feverCelsius) : ""
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setError(null);

    const payload: UpdateLogInput = { comments: comments.trim() || null };

    if (log.type === "diaper") payload.diaperStatus = diaperStatus;
    if (log.type === "sleep") payload.sleepKind = sleepKind;

    if (editsAmountMl) {
      if (amountMl.trim()) {
        const ml = units.parseVolume(amountMl);
        if (isNaN(ml) || ml <= 0) {
          setError(`Enter a valid amount in ${units.volume}.`);
          return;
        }
        payload.amountMl = ml;
      } else if (!log.side) {
        // Side isn't editable here, so it's the only other thing that can
        // anchor a feed/pump entry — without one, the amount can't be blank.
        setError(`Enter an amount in ${units.volume}.`);
        return;
      } else {
        payload.amountMl = null;
      }
    }

    if (log.type === "growth") {
      const w = weight.trim() ? units.parseWeight(weight) : null;
      const h = height.trim() ? units.parseHeight(height) : null;
      if (w == null && h == null) {
        setError("Enter a weight or height.");
        return;
      }
      payload.weightKg = w;
      payload.heightCm = h;
    }

    if (log.type === "health") {
      if (!condition) {
        setError("Pick a condition.");
        return;
      }
      const temperature = fever.trim() ? units.parseTemperature(fever) : NaN;
      if (condition === "fever" && (isNaN(temperature) || temperature <= 0)) {
        setError("Enter a valid temperature for fever.");
        return;
      }
      if (condition === "other" && !comments.trim()) {
        setError("Say what the condition is.");
        return;
      }
      payload.healthCondition = condition;
      payload.medication = medication.trim() || null;
      payload.dose = dose.trim() || null;
      payload.feverCelsius = condition === "fever" ? temperature : null;
    }

    const newStart = combine(date, startTime);
    payload.startTime = newStart.toISOString();

    if (usesSingleTime) {
      payload.endTime = newStart.toISOString();
    } else {
      const newEnd = combine(date, endTime);
      // Only a time-of-day is captured for the end, on the start's date. If it
      // lands before the start (an overnight sleep), it belongs to the next
      // day — roll it forward rather than saving a negative range.
      if (newEnd.getTime() < newStart.getTime()) {
        newEnd.setDate(newEnd.getDate() + 1);
      }
      payload.endTime = newEnd.toISOString();
    }

    setSaving(true);
    try {
      await updateLog(log.id, payload);
      await onSaved();
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }, [
    saving, comments, log, diaperStatus, sleepKind, editsAmountMl, amountMl,
    weight, height, condition, fever, medication, dose, date, startTime,
    endTime, usesSingleTime, units, onSaved, onClose,
  ]);

  const handleDelete = useCallback(async () => {
    setConfirmDelete(false);
    setDeleting(true);
    try {
      await deleteLog(log.id);
      await onSaved();
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
      setDeleting(false);
    }
  }, [log.id, onSaved, onClose]);

  const pickerField = (
    label: string,
    value: string,
    onPress: () => void
  ) => (
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
      visible
      onClose={onClose}
      title={`Edit ${label.toLowerCase()}`}
      subtitle={`${tone.emoji} ${label}`}
      footer={
        <View style={styles.actions}>
          <IconButton
            icon="trash"
            label={`Delete this ${label.toLowerCase()}`}
            variant="danger"
            disabled={deleting}
            onPress={() => setConfirmDelete(true)}
          />
          <Button label="Cancel" variant="ghost" onPress={onClose} style={styles.flex} />
          <Button
            label="Save"
            variant="primary"
            loading={saving}
            disabled={deleting}
            onPress={handleSave}
            style={styles.flex}
          />
        </View>
      }
    >
      {pickerField("Date", formatDateDisplay(date), () =>
        setShowDatePicker((v) => !v)
      )}
      {showDatePicker && (
        <View style={styles.pickerWrap}>
          <DateTimePicker
            value={date}
            mode="date"
            // A calendar grid, not a spinner — Android's own dialog already is
            // one. Unlike the spinner, this has to be closed by hand: it never
            // dismissed itself, so without a Done button it would just stay
            // open, full-size, for the rest of the edit.
            display={Platform.OS === "ios" ? "inline" : "default"}
            accentColor={t.accent}
            themeVariant={isDark ? "dark" : "light"}
            onChange={(_, d) => {
              setShowDatePicker(Platform.OS === "ios");
              if (d) setDate(d);
            }}
          />
          {Platform.OS === "ios" && (
            <Button
              label="Done"
              variant="secondary"
              fullWidth
              onPress={() => setShowDatePicker(false)}
            />
          )}
        </View>
      )}

      {usesSingleTime ? (
        <TimeField
          label="Time"
          value={startTime}
          onChange={(picked) => {
            setStartTime(picked);
            setEndTime(picked);
          }}
        />
      ) : (
        <View style={styles.rowGap}>
          <TimeField
            label="Start time"
            value={startTime}
            onChange={setStartTime}
            style={styles.flex}
          />
          <TimeField
            label="End time"
            value={endTime}
            onChange={setEndTime}
            style={styles.flex}
          />
        </View>
      )}

      {log.type === "sleep" && (
        <Field label="Nap or night?">
          <View style={styles.tileGrid}>
            {SLEEP_KIND_OPTIONS.map((opt) => {
              const selected = sleepKind === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setSleepKind(opt.value)}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
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
                  <Emoji size={18}>{opt.emoji}</Emoji>
                  <Text
                    variant="subheadStrong"
                    style={{ color: selected ? t.onAccent : t.accentText }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>
      )}

      {editsAmountMl && (
        <Input
          label="Amount"
          helper={log.side ? "Optional — leave blank to clear it." : undefined}
          suffix={units.volume}
          value={amountMl}
          onChangeText={setAmountMl}
          keyboardType="decimal-pad"
          placeholder={units.system === "metric" ? "120" : "4"}
        />
      )}

      {log.type === "growth" && (
        <View style={styles.rowGap}>
          <Input
            label="Weight"
            suffix={units.weight}
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
            placeholder={units.system === "metric" ? "4.5" : "9.9"}
            containerStyle={styles.flex}
          />
          <Input
            label="Height"
            suffix={units.height}
            value={height}
            onChangeText={setHeight}
            keyboardType="decimal-pad"
            placeholder={units.system === "metric" ? "52" : "20.5"}
            containerStyle={styles.flex}
          />
        </View>
      )}

      {log.type === "health" && (
        <>
          <Field label="Condition">
            <View style={styles.tileGrid}>
              {HEALTH_CONDITIONS.map((opt) => {
                const meta = CONDITION_META[opt.value];
                const selected = condition === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => {
                      setCondition(opt.value);
                      if (opt.value !== "fever") setFever("");
                    }}
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

          {condition === "fever" && (
            <Input
              label="Temperature"
              suffix={units.temperature}
              value={fever}
              onChangeText={setFever}
              keyboardType="decimal-pad"
              placeholder={units.system === "metric" ? "38.2" : "100.8"}
            />
          )}

          <Input
            label="Medication / treatment"
            value={medication}
            onChangeText={setMedication}
            placeholder="e.g. Paracetamol"
          />
          <Input
            label="Dose"
            value={dose}
            onChangeText={setDose}
            placeholder="e.g. 2.5 ml"
          />
        </>
      )}

      {log.type === "diaper" && (
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

      {/* "Other" reuses this field rather than adding a second one beside it —
          the only free-text field a health entry has, doing double duty the
          same way "Notes" already does for every other condition. */}
      <Input
        label={
          log.type === "health" && condition === "other" ? "What is it?" : "Notes"
        }
        value={comments}
        onChangeText={setComments}
        placeholder={
          log.type === "health" && condition === "other"
            ? "e.g. Ear infection"
            : "Optional"
        }
        required={log.type === "health" && condition === "other"}
        error={error}
      />

      {/* A Modal underneath, not a sibling — it renders through its own native
          layer regardless of where it sits in the tree, so nesting it here
          skips wrapping this whole return in a fragment just to hang a second
          top-level element off it. */}
      <ConfirmDialog
        visible={confirmDelete}
        icon="trash"
        title={`Delete this ${label.toLowerCase()}?`}
        message="This entry will be removed for every caregiver."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  actions: { flexDirection: "row", gap: space.sm },
  rowGap: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  pickerWrap: { gap: space.sm },
  pickerBtn: {
    borderRadius: radius.md,
    borderWidth: 2,
    paddingHorizontal: space.md,
    minHeight: 48,
    justifyContent: "center",
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
