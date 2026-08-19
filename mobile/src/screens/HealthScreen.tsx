import React, { useState, useMemo, useCallback } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTheme } from "../design/ThemeProvider";
import { space, radius } from "../design/tokens";
import { CONDITION_META } from "../design/activity";
import {
  Screen,
  ScreenHeader,
  SectionHeader,
  Text,
  Emoji,
  Button,
  Input,
  Field,
  Sheet,
  Divider,
  EmptyState,
  SkeletonList,
  FadeInUp,
  ConfirmDialog,
} from "../components/ui";
import { useToast } from "../components/Toast";
import { useUnits } from "../context/SettingsContext";
import { useLogs } from "../hooks/useLogs";
import { DATE_LOCALE, MIN_PICKABLE_DATE, safePickedDate } from "../lib/calendar";
import { useBaby } from "../context/BabyContext";
import { useAuth } from "../context/AuthContext";
import BabySwitcher from "../components/BabySwitcher";
import VaccineSchedule from "../components/VaccineSchedule";
import SwipeableRow from "../components/SwipeableRow";
import EditLogModal from "../components/EditLogModal";
import { LogRow, DateHeader } from "../components/LogsList";
import { formatTime, formatDateLabel } from "../utils/formatTime";
import { createLog, type LogEntry } from "../api/logs";
import { HEALTH_CONDITIONS, type HealthCondition } from "../lib/health";

function formatTimeDisplay(d: Date): string {
  return d.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateDisplay(d: Date): string {
  return d.toLocaleDateString(DATE_LOCALE, {
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
  const t = useTheme();
  const toast = useToast();
  const units = useUnits();
  const { activeBaby } = useBaby();
  const { account } = useAuth();
  // Only health entries, filtered in the query. This screen was downloading
  // every feed, nap and nappy the account had ever recorded in order to throw
  // all of them away and keep the fourteen it wanted.
  const { logs, loading, refresh, handleDelete } = useLogs("all", {
    type: "health",
  });

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
  const [pendingDelete, setPendingDelete] = useState<LogEntry | null>(null);
  const [editLog, setEditLog] = useState<LogEntry | null>(null);

  // The query already restricts this to health entries; the guard stays only
  // so a stale response from before a baby switch can't slip a stray row in.
  const healthLogs = useMemo(
    () => logs.filter((l) => l.type === "health"),
    [logs]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  // A fever entry is meaningless without a reading; "Other" is meaningless
  // without saying what it is — both gate the save the same way.
  const canSave =
    condition !== null &&
    (condition !== "fever" || (fever.trim() !== "" && parseFloat(fever) > 0)) &&
    (condition !== "other" || comments.trim() !== "");

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

  const pickerField = (label: string, value: string, onPress: () => void) => (
    <Field label={label}>
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

  if (!activeBaby) {
    return (
      <Screen scroll={false}>
        <EmptyState
          icon="health"
          title="No baby selected"
          body="Choose a baby to track vaccines, illness and medication."
        />
        <View style={styles.center}>
          <BabySwitcher />
        </View>
      </Screen>
    );
  }

  let lastDate = "";

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <ScreenHeader
        title="Medical"
        subtitle={`Vaccines, illness & medication · ${activeBaby.name}`}
        actions={<BabySwitcher />}
      />

      {/* Vaccines lead the screen: the schedule is the thing with deadlines,
          and it's what a parent opens this tab to check. Illness and medication
          are a history you consult, so they sit below it. */}
      <VaccineSchedule
        babyId={activeBaby.id}
        babyName={activeBaby.name}
        dob={activeBaby.dob}
      />

      <Divider />

      <View style={styles.section}>
        <SectionHeader title="Illness & medication" />
        <Button
          label="Log health entry"
          icon="plus"
          variant="primary"
          fullWidth
          onPress={() => {
            setShowForm(true);
            setDate(new Date());
            setTime(new Date());
          }}
        />
        {loading ? (
          <SkeletonList rows={3} />
        ) : healthLogs.length === 0 ? (
          <EmptyState
            icon="health"
            title="No health entries yet"
            body={`Record a fever, a cold or a dose of medicine and ${activeBaby.name}'s history builds up here.`}
          />
        ) : (
          <View style={styles.list}>
            {healthLogs.map((log, index) => {
              const dateLabel = formatDateLabel(log.startTime);
              const showHeader = dateLabel !== lastDate;
              lastDate = dateLabel;

              return (
                <FadeInUp key={log.id} index={index}>
                  {/* Same DateHeader Activity uses, not a local copy — the two
                      screens used to disagree on how a date label looked
                      (centered and accent-coloured here, left and grey there)
                      for no reason beyond having been written separately. */}
                  {showHeader && <DateHeader label={dateLabel} />}
                  {/* The same row component the Activity tab uses, so shared
                      formatting (times, pills, pause timeline, comments)
                      never drifts between them — emphasizeHealth just leads
                      with the condition instead of repeating "Health" on a
                      screen that's already nothing else. */}
                  <SwipeableRow onDelete={() => setPendingDelete(log)}>
                    <LogRow log={log} onEdit={setEditLog} emphasizeHealth />
                  </SwipeableRow>
                </FadeInUp>
              );
            })}
          </View>
        )}
      </View>

      <Sheet
        visible={showForm}
        onClose={resetForm}
        title="New health entry"
        subtitle={`Logging for ${activeBaby.name}`}
        footer={
          <View style={styles.actions}>
            <Button
              label="Cancel"
              variant="ghost"
              onPress={resetForm}
              style={styles.flex}
            />
            <Button
              label="Save"
              variant="primary"
              loading={saving}
              disabled={!canSave}
              onPress={handleSave}
              style={styles.flex}
            />
          </View>
        }
      >
        {pickerField("Date", formatDateDisplay(date), () =>
          setShowDatePicker(true)
        )}
        {showDatePicker && (
          <DateTimePicker
            value={date}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            locale={DATE_LOCALE}
            minimumDate={MIN_PICKABLE_DATE}
            onChange={(_, d) => {
              setShowDatePicker(Platform.OS === "ios");
              setDate((prev) => safePickedDate(d, prev));
            }}
          />
        )}

        {pickerField("Time", formatTimeDisplay(time), () =>
          setShowTimePicker(true)
        )}
        {showTimePicker && (
          <DateTimePicker
            value={time}
            mode="time"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_, tm) => {
              setShowTimePicker(Platform.OS === "ios");
              if (tm) setTime(tm);
            }}
          />
        )}

        <Field label="Condition" required>
          <View style={styles.tileGrid}>
            {HEALTH_CONDITIONS.map((opt) => {
              // CONDITION_META lives in the design layer while HEALTH_CONDITIONS
              // is the typed source of truth, so fall back to the option itself
              // rather than crashing if the two ever drift apart.
              const meta =
                CONDITION_META[opt.value] ??
                ({ emoji: opt.icon, label: opt.label } as const);
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
                  <Emoji size={20}>{meta.emoji}</Emoji>
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
            // The unit is only a visual suffix, so spell it out for screen
            // readers — the old label read "TEMPERATURE (°C)".
            accessibilityLabel={`Temperature in ${
              units.system === "metric" ? "Celsius" : "Fahrenheit"
            }`}
            required
            value={fever}
            onChangeText={setFever}
            placeholder={units.system === "metric" ? "e.g. 38.2" : "e.g. 100.8"}
            keyboardType="decimal-pad"
            error={
              fever.trim() !== "" && !(parseFloat(fever) > 0)
                ? "Enter a reading greater than zero."
                : null
            }
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

        {/*
         * "Other" reuses the notes field rather than adding a second one next
         * to it: this is the only free-text field a health entry has, and
         * asking twice — once for "what is it" and again for "any notes" —
         * would be two boxes doing what one already can. Required only here,
         * the same way Temperature is required only for Fever.
         */}
        <Input
          label={condition === "other" ? "What is it?" : "Notes"}
          value={comments}
          onChangeText={setComments}
          placeholder={
            condition === "other" ? "e.g. Ear infection" : "Optional"
          }
          required={condition === "other"}
        />
      </Sheet>

      <ConfirmDialog
        visible={pendingDelete !== null}
        title="Delete this entry?"
        message={
          pendingDelete
            ? `The health entry at ${formatTime(
                pendingDelete.startTime
              )} will be removed for every caregiver.`
            : ""
        }
        onConfirm={() => {
          if (pendingDelete) handleDelete(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />

      {editLog && (
        <EditLogModal
          key={editLog.id}
          log={editLog}
          onClose={() => setEditLog(null)}
          onSaved={refresh}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: "center" },
  section: { gap: space.sm },
  list: { gap: space.sm },
  actions: { flexDirection: "row", gap: space.sm },
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
