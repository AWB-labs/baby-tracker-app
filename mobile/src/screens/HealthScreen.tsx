import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTheme } from "../theme";
import { useToast } from "../components/Toast";
import { useUnits } from "../context/SettingsContext";
import { useLogs } from "../hooks/useLogs";
import { useBaby } from "../context/BabyContext";
import { useAuth } from "../context/AuthContext";
import BabySwitcher from "../components/BabySwitcher";
import SwipeableRow from "../components/SwipeableRow";
import DeleteConfirmModal from "../components/DeleteConfirmModal";
import EditLogModal from "../components/EditLogModal";
import { createLog, type LogEntry } from "../api/logs";
import {
  HEALTH_CONDITIONS,
  HEALTH_CONDITION_META,
  type HealthCondition,
} from "../lib/health";

function formatLoggedAt(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return `Today, ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  const date = d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${date}, ${time}`;
}

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

function combine(d: Date, t: Date): Date {
  const result = new Date(d);
  result.setHours(t.getHours(), t.getMinutes(), 0, 0);
  return result;
}

export default function HealthScreen() {
  const theme = useTheme();
  const toast = useToast();
  const units = useUnits();
  const { activeBaby } = useBaby();
  const { account } = useAuth();
  const { logs, loading, refresh, handleDelete } = useLogs("all");

  const [showForm, setShowForm] = useState(false);
  const [condition, setCondition] = useState<HealthCondition | null>(null);
  const [medication, setMedication] = useState("");
  const [dose, setDose] = useState("");
  const [fever, setFever] = useState("");
  const [comments, setComments] = useState("");
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(new Date());
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [editLog, setEditLog] = useState<LogEntry | null>(null);

  const healthLogs = useMemo(
    () => logs.filter((l) => l.type === "health"),
    [logs]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  // A fever entry is meaningless without a reading, so the form gates on it.
  const canSave =
    condition !== null &&
    (condition !== "fever" || (fever.trim() !== "" && parseFloat(fever) > 0));

  const resetForm = () => {
    setShowForm(false);
    setCondition(null);
    setMedication("");
    setDose("");
    setFever("");
    setComments("");
    setDate(new Date());
    setTime(new Date());
    setShowDatePicker(false);
    setShowTimePicker(false);
  };

  const handleSave = async () => {
    if (!canSave || !condition || !activeBaby) return;
    setSaving(true);
    const at = combine(date, time).toISOString();
    try {
      await createLog({
        babyId: activeBaby.id,
        type: "health",
        healthCondition: condition,
        medication: medication.trim() || null,
        dose: dose.trim() || null,
        feverCelsius:
          condition === "fever" ? units.parseTemperature(fever) : null,
        startTime: at,
        endTime: at,
        comments: comments.trim() || null,
        enteredByName: account?.name || "Unknown",
      });
      await refresh();
      resetForm();
    } catch (err) {
      toast.showError(err);
    } finally {
      setSaving(false);
    }
  };

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
      marginBottom: 12,
    },
    pickerBtn: {
      borderWidth: 2,
      borderColor: theme.primaryLight,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 11,
      marginBottom: 12,
    },
  });

  if (!activeBaby) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <View style={styles.noBaby}>
          <Text style={styles.noBabyEmoji}>👶</Text>
          <Text style={styles.noBabyText}>No baby selected</Text>
          <BabySwitcher />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Health</Text>
            <Text style={styles.subtitle}>
              Track illness &amp; medication · {activeBaby.name}
            </Text>
          </View>
          <BabySwitcher />
        </View>

        {/* Add button */}
        {!showForm && (
          <TouchableOpacity
            style={[styles.addBtn, { borderColor: theme.primary }]}
            onPress={() => {
              setShowForm(true);
              setDate(new Date());
              setTime(new Date());
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.addBtnEmoji}>➕</Text>
            <Text style={[styles.addBtnText, { color: theme.primary }]}>
              Log Health Entry
            </Text>
          </TouchableOpacity>
        )}

        {/* Entry form */}
        {showForm && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>New Health Entry</Text>
            <Text style={[styles.forBaby, { color: theme.primary }]}>
              Logging for: {activeBaby.name}
            </Text>

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

            <Text style={styles.fieldLabel}>TIME</Text>
            <TouchableOpacity
              style={s.pickerBtn}
              onPress={() => setShowTimePicker(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.pickerText}>{formatTimeDisplay(time)}</Text>
            </TouchableOpacity>
            {showTimePicker && (
              <DateTimePicker
                value={time}
                mode="time"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_, t) => {
                  setShowTimePicker(Platform.OS === "ios");
                  if (t) setTime(t);
                }}
              />
            )}

            <Text style={styles.fieldLabel}>CONDITION</Text>
            <View style={styles.grid}>
              {HEALTH_CONDITIONS.map((opt) => {
                const selected = condition === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.gridOption,
                      selected
                        ? { backgroundColor: theme.primary, borderColor: theme.primary }
                        : { borderColor: theme.primaryLight, backgroundColor: theme.primaryLighter },
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
                        { color: selected ? "#fff" : theme.pillText },
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
                  placeholder={
                    units.system === "metric" ? "e.g. 38.2" : "e.g. 100.8"
                  }
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

            <Text style={styles.fieldLabel}>NOTES</Text>
            <TextInput
              style={s.input}
              value={comments}
              onChangeText={setComments}
              placeholder="Optional"
              placeholderTextColor="#ccc"
            />

            <View style={styles.formBtns}>
              <TouchableOpacity
                style={styles.formCancelBtn}
                onPress={resetForm}
                activeOpacity={0.8}
              >
                <Text style={styles.formCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.formSaveBtn,
                  { backgroundColor: theme.primary },
                  (!canSave || saving) && { opacity: 0.4 },
                ]}
                onPress={handleSave}
                disabled={!canSave || saving}
                activeOpacity={0.8}
              >
                <Text style={styles.formSaveText}>
                  {saving ? "Saving..." : "Save"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* History */}
        <Text style={[styles.historyTitle, { color: theme.primary }]}>
          HEALTH HISTORY
        </Text>
        {loading ? (
          <ActivityIndicator color={theme.primary} />
        ) : healthLogs.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🩺</Text>
            <Text style={styles.emptyText}>No health entries logged yet.</Text>
          </View>
        ) : (
          <View style={styles.historyList}>
            {healthLogs.map((log) => {
              const meta =
                log.healthCondition &&
                log.healthCondition in HEALTH_CONDITION_META
                  ? HEALTH_CONDITION_META[log.healthCondition as HealthCondition]
                  : null;
              return (
                <SwipeableRow key={log.id} onDelete={() => setPendingDeleteId(log.id)}>
                  <View style={styles.historyCard}>
                    <View style={styles.historyIconCircle}>
                      <Text style={styles.historyIcon}>🩺</Text>
                    </View>
                    <View style={styles.historyInfo}>
                      <View style={styles.badgeRow}>
                        {meta && (
                          <View style={styles.conditionBadge}>
                            <Text style={styles.conditionText}>
                              {meta.icon} {meta.label}
                            </Text>
                          </View>
                        )}
                        {log.feverCelsius !== null && (
                          <View style={styles.feverBadge}>
                            <Text style={styles.feverText}>
                              🌡️ {units.formatTemperature(log.feverCelsius)}
                            </Text>
                          </View>
                        )}
                      </View>
                      {(log.medication || log.dose) && (
                        <Text style={styles.medication}>
                          {log.medication}
                          {log.medication && log.dose ? " · " : ""}
                          {log.dose ? `Dose: ${log.dose}` : ""}
                        </Text>
                      )}
                      <Text style={styles.historyDate}>
                        {formatLoggedAt(log.startTime)}
                      </Text>
                      {log.comments ? (
                        <Text style={styles.historyComment}>
                          &ldquo;{log.comments}&rdquo;
                        </Text>
                      ) : null}
                      <Text style={styles.historyBy}>by {log.enteredByName}</Text>
                      <View style={styles.editRow}>
                        <TouchableOpacity
                          style={[
                            styles.editBtn,
                            {
                              borderColor: theme.primaryLight,
                              backgroundColor: theme.primaryLighter,
                            },
                          ]}
                          onPress={() => setEditLog(log)}
                          activeOpacity={0.7}
                          accessibilityLabel="Edit health entry"
                        >
                          <Text style={[styles.editText, { color: theme.pillText }]}>
                            ✏️ Edit
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </SwipeableRow>
              );
            })}
          </View>
        )}
      </ScrollView>

      <DeleteConfirmModal
        visible={pendingDeleteId !== null}
        onConfirm={() => {
          if (pendingDeleteId !== null) {
            handleDelete(pendingDeleteId);
            setPendingDeleteId(null);
          }
        }}
        onCancel={() => setPendingDeleteId(null)}
      />

      {editLog && (
        <EditLogModal
          key={editLog.id}
          log={editLog}
          onClose={() => setEditLog(null)}
          onSaved={refresh}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  title: { fontSize: 24, fontWeight: "800", color: "#1a1a1a" },
  subtitle: { fontSize: 13, color: "#aaa", marginTop: 2 },
  noBaby: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  noBabyEmoji: { fontSize: 48 },
  noBabyText: { fontSize: 16, color: "#aaa", marginBottom: 8 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 18,
    paddingVertical: 14,
    marginBottom: 20,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  addBtnEmoji: { fontSize: 18 },
  addBtnText: { fontSize: 14, fontWeight: "700" },
  formCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  formTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#333",
    textAlign: "center",
    marginBottom: 4,
  },
  forBaby: { fontSize: 12, fontWeight: "600", textAlign: "center", marginBottom: 16 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#aaa",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 6,
    marginTop: 2,
  },
  pickerText: { fontSize: 14, color: "#333" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  gridOption: {
    width: "47%",
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: "center",
    gap: 2,
  },
  gridEmoji: { fontSize: 18 },
  gridLabel: { fontSize: 12, fontWeight: "700" },
  formBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  formCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  formCancelText: { fontSize: 14, fontWeight: "600", color: "#aaa" },
  formSaveBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  formSaveText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  historyTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textAlign: "center",
    textTransform: "uppercase",
    marginBottom: 12,
  },
  empty: { alignItems: "center", paddingVertical: 40 },
  emptyIcon: { fontSize: 36, marginBottom: 8 },
  emptyText: { fontSize: 13, color: "#ccc" },
  historyList: { gap: 10 },
  historyCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  historyIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff1f2",
    alignItems: "center",
    justifyContent: "center",
  },
  historyIcon: { fontSize: 20 },
  historyInfo: { flex: 1 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  conditionBadge: {
    backgroundColor: "#fff1f2",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  conditionText: { fontSize: 11, color: "#be123c", fontWeight: "700" },
  feverBadge: {
    backgroundColor: "#fff7ed",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  feverText: { fontSize: 11, color: "#c2410c", fontWeight: "700" },
  medication: { fontSize: 12, color: "#666", marginTop: 4 },
  historyDate: { fontSize: 12, color: "#aaa", marginTop: 4 },
  historyComment: { fontSize: 12, color: "#888", fontStyle: "italic", marginTop: 3 },
  historyBy: { fontSize: 10, color: "#ccc", marginTop: 2 },
  editRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 8 },
  editBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  editText: { fontSize: 12, fontWeight: "700" },
});
