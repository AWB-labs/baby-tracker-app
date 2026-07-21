import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTheme } from "../theme";
import { useUnits } from "../context/SettingsContext";
import { updateLog, type LogEntry, type UpdateLogInput } from "../api/logs";
import { isInstantLog } from "../lib/activities";
import { getErrorMessage } from "../lib/errors";
import {
  HEALTH_CONDITIONS,
  HEALTH_CONDITION_META,
  type HealthCondition,
} from "../lib/health";

const TYPE_META: Record<string, { icon: string; label: string }> = {
  pump: { icon: "🍼", label: "Pump" },
  feed: { icon: "🤱", label: "Feed" },
  sleep: { icon: "😴", label: "Sleep" },
  diaper: { icon: "🩲", label: "Diaper" },
  shower: { icon: "🚿", label: "Shower" },
  vitamin: { icon: "💊", label: "Vitamin" },
  nailcut: { icon: "💅", label: "Nail Cut" },
  growth: { icon: "📏", label: "Growth" },
  health: { icon: "🩺", label: "Health" },
};

const DIAPER_STATUS_META: Record<string, { icon: string; label: string }> = {
  empty: { icon: "✅", label: "Empty" },
  wet: { icon: "💧", label: "Wet" },
  dirty: { icon: "💩", label: "Dirty" },
  wet_and_dirty: { icon: "💧💩", label: "Wet & Dirty" },
};

function formatTimeDisplay(d: Date): string {
  return d.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateDisplay(d: Date): string {
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

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
  const theme = useTheme();
  const units = useUnits();
  const meta = TYPE_META[log.type] ?? { icon: "❓", label: log.type };

  // An instant log is a moment, not a range: it edits as a single time field.
  const usesSingleTime = isInstantLog(log.type, {
    side: log.side,
    amountMl: log.amountMl,
  });
  // A pump or bottle feed records how much, not how long.
  const editsAmountMl =
    (log.type === "pump" || log.type === "feed") && log.amountMl !== null;

  const [date, setDate] = useState(() => new Date(log.startTime));
  const [startTime, setStartTime] = useState(() => new Date(log.startTime));
  const [endTime, setEndTime] = useState(() =>
    log.endTime ? new Date(log.endTime) : new Date(log.startTime)
  );
  const [comments, setComments] = useState(log.comments ?? "");
  const [diaperStatus, setDiaperStatus] = useState<string | null>(
    log.diaperStatus
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
    log.healthCondition && log.healthCondition in HEALTH_CONDITION_META
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

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setError(null);

    const payload: UpdateLogInput = {
      comments: comments.trim() || null,
    };

    if (log.type === "diaper") {
      payload.diaperStatus = diaperStatus;
    }

    if (editsAmountMl) {
      const ml = amountMl.trim() ? units.parseVolume(amountMl) : NaN;
      if (isNaN(ml) || ml <= 0) {
        setError(`Enter a valid amount in ${units.volume}.`);
        return;
      }
      payload.amountMl = ml;
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
      // The editor only captures a time-of-day for the end, on the start's
      // date. If that lands before the start (e.g. an overnight sleep
      // 10:13pm → 10:30am), the end really belongs to the next day — roll it
      // forward so the range stays valid instead of going negative.
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
    saving,
    comments,
    log,
    diaperStatus,
    editsAmountMl,
    amountMl,
    weight,
    height,
    condition,
    fever,
    medication,
    dose,
    date,
    startTime,
    endTime,
    usesSingleTime,
    onSaved,
    onClose,
  ]);

  const s = StyleSheet.create({
    input: {
      borderWidth: 2,
      borderColor: theme.primaryLight,
      backgroundColor: theme.primaryLighter,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontSize: 14,
      color: "#333",
      marginBottom: 16,
    },
    pickerBtn: {
      borderWidth: 2,
      borderColor: theme.primaryLight,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 11,
      marginBottom: 16,
    },
    optionSelected: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    optionIdle: {
      borderColor: theme.primaryLight,
      backgroundColor: theme.primaryLighter,
    },
    saveBtn: {
      flex: 1,
      backgroundColor: theme.primary,
      borderRadius: 14,
      paddingVertical: 13,
      alignItems: "center",
    },
  });

  const optionTextColor = (selected: boolean) =>
    selected ? "#fff" : theme.pillText;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title}>Edit log</Text>
                <Text style={styles.subtitle}>
                  {meta.icon} {meta.label}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose}>
                <Text style={styles.close}>Close</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>DATE</Text>
            <TouchableOpacity
              style={s.pickerBtn}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.pickerText}>{formatDateDisplay(date)}</Text>
            </TouchableOpacity>
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

            {usesSingleTime ? (
              <>
                <Text style={styles.fieldLabel}>TIME</Text>
                <TouchableOpacity
                  style={s.pickerBtn}
                  onPress={() => setShowStartPicker(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.pickerText}>
                    {formatTimeDisplay(startTime)}
                  </Text>
                </TouchableOpacity>
                {showStartPicker && (
                  <DateTimePicker
                    value={startTime}
                    mode="time"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={(_, t) => {
                      setShowStartPicker(Platform.OS === "ios");
                      if (t) {
                        setStartTime(t);
                        setEndTime(t);
                      }
                    }}
                  />
                )}
              </>
            ) : (
              <View style={styles.timeRow}>
                <View style={styles.timeCell}>
                  <Text style={styles.fieldLabel}>START TIME</Text>
                  <TouchableOpacity
                    style={s.pickerBtn}
                    onPress={() => setShowStartPicker(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.pickerText}>
                      {formatTimeDisplay(startTime)}
                    </Text>
                  </TouchableOpacity>
                  {showStartPicker && (
                    <DateTimePicker
                      value={startTime}
                      mode="time"
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      onChange={(_, t) => {
                        setShowStartPicker(Platform.OS === "ios");
                        if (t) setStartTime(t);
                      }}
                    />
                  )}
                </View>
                <View style={styles.timeCell}>
                  <Text style={styles.fieldLabel}>END TIME</Text>
                  <TouchableOpacity
                    style={s.pickerBtn}
                    onPress={() => setShowEndPicker(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.pickerText}>
                      {formatTimeDisplay(endTime)}
                    </Text>
                  </TouchableOpacity>
                  {showEndPicker && (
                    <DateTimePicker
                      value={endTime}
                      mode="time"
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      onChange={(_, t) => {
                        setShowEndPicker(Platform.OS === "ios");
                        if (t) setEndTime(t);
                      }}
                    />
                  )}
                </View>
              </View>
            )}

            {editsAmountMl && (
              <>
                <Text style={styles.fieldLabel}>
                  AMOUNT ({units.volume.toUpperCase()})
                </Text>
                <TextInput
                  style={s.input}
                  value={amountMl}
                  onChangeText={setAmountMl}
                  placeholder="e.g. 120"
                  placeholderTextColor="#ccc"
                  keyboardType="decimal-pad"
                />
              </>
            )}

            {log.type === "growth" && (
              <>
                <Text style={styles.fieldLabel}>
                  WEIGHT ({units.weight.toUpperCase()})
                </Text>
                <TextInput
                  style={s.input}
                  value={weight}
                  onChangeText={setWeight}
                  placeholder="e.g. 4.5"
                  placeholderTextColor="#ccc"
                  keyboardType="decimal-pad"
                />
                <Text style={styles.fieldLabel}>
                  HEIGHT ({units.height.toUpperCase()})
                </Text>
                <TextInput
                  style={s.input}
                  value={height}
                  onChangeText={setHeight}
                  placeholder="e.g. 52"
                  placeholderTextColor="#ccc"
                  keyboardType="decimal-pad"
                />
              </>
            )}

            {log.type === "health" && (
              <>
                <Text style={styles.fieldLabel}>CONDITION</Text>
                <View style={styles.grid}>
                  {HEALTH_CONDITIONS.map((opt) => {
                    const selected = condition === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          styles.gridOption,
                          selected ? s.optionSelected : s.optionIdle,
                        ]}
                        onPress={() => {
                          setCondition(opt.value);
                          if (opt.value !== "fever") setFever("");
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.gridEmoji}>{opt.icon}</Text>
                        <Text
                          style={[
                            styles.gridLabel,
                            { color: optionTextColor(selected) },
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {condition === "fever" && (
                  <>
                    <Text style={styles.fieldLabel}>
                      TEMPERATURE ({units.temperature})
                    </Text>
                    <TextInput
                      style={s.input}
                      value={fever}
                      onChangeText={setFever}
                      placeholder="e.g. 38.2"
                      placeholderTextColor="#ccc"
                      keyboardType="decimal-pad"
                    />
                  </>
                )}

                <Text style={styles.fieldLabel}>MEDICATION / TREATMENT</Text>
                <TextInput
                  style={s.input}
                  value={medication}
                  onChangeText={setMedication}
                  placeholder="e.g. Paracetamol"
                  placeholderTextColor="#ccc"
                />

                <Text style={styles.fieldLabel}>DOSE</Text>
                <TextInput
                  style={s.input}
                  value={dose}
                  onChangeText={setDose}
                  placeholder="e.g. 2.5 ml"
                  placeholderTextColor="#ccc"
                />
              </>
            )}

            {log.type === "diaper" && (
              <>
                <Text style={styles.fieldLabel}>STATUS</Text>
                <View style={styles.grid}>
                  {Object.entries(DIAPER_STATUS_META).map(([value, m]) => {
                    const selected = diaperStatus === value;
                    return (
                      <TouchableOpacity
                        key={value}
                        style={[
                          styles.gridOption,
                          selected ? s.optionSelected : s.optionIdle,
                        ]}
                        onPress={() => setDiaperStatus(value)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.gridEmoji}>{m.icon}</Text>
                        <Text
                          style={[
                            styles.gridLabel,
                            { color: optionTextColor(selected) },
                          ]}
                        >
                          {m.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            <Text style={styles.fieldLabel}>NOTES</Text>
            <TextInput
              style={s.input}
              value={comments}
              onChangeText={setComments}
              placeholder="Optional"
              placeholderTextColor="#ccc"
            />

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.saveBtn, saving && { opacity: 0.5 }]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.8}
              >
                <Text style={styles.saveText}>
                  {saving ? "Saving..." : "Save"}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    maxHeight: "92%",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  headerText: { flex: 1, alignItems: "center" },
  title: { fontSize: 18, fontWeight: "700", color: "#333" },
  subtitle: { fontSize: 12, color: "#aaa", marginTop: 4 },
  close: { fontSize: 12, color: "#aaa" },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#aaa",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 4,
  },
  pickerText: { fontSize: 14, color: "#333" },
  timeRow: { flexDirection: "row", gap: 12 },
  timeCell: { flex: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  gridOption: {
    width: "47%",
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    gap: 4,
  },
  gridEmoji: { fontSize: 20 },
  gridLabel: { fontSize: 12, fontWeight: "700" },
  errorBox: {
    backgroundColor: "#fef2f2",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 12,
    color: "#dc2626",
    fontWeight: "600",
    textAlign: "center",
  },
  actionRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  cancelText: { fontSize: 14, fontWeight: "600", color: "#aaa" },
  saveText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
