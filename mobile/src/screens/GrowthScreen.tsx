import React, { useState, useMemo, useCallback } from "react";
import { View, Pressable, StyleSheet, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTheme } from "../design/ThemeProvider";
import { space, radius } from "../design/tokens";
import { useActivityTone, MEASURE_EMOJI } from "../design/activity";
import {
  Screen,
  ScreenHeader,
  SectionHeader,
  Card,
  Text,
  Emoji,
  Button,
  Input,
  Field,
  Sheet,
  Segmented,
  EmptyState,
  SkeletonList,
  FadeInUp,
  ConfirmDialog,
} from "../components/ui";
import { useToast } from "../components/Toast";
import { useUnits } from "../context/SettingsContext";
import { useLogs } from "../hooks/useLogs";
import { useBaby } from "../context/BabyContext";
import { useAuth } from "../context/AuthContext";
import BabySwitcher from "../components/BabySwitcher";
import SwipeableRow from "../components/SwipeableRow";
import EditLogModal from "../components/EditLogModal";
import { LogRow } from "../components/LogsList";
import { createLog, type LogEntry } from "../api/logs";
import { formatDateLabel } from "../utils/formatTime";

function formatDateDisplay(d: Date): string {
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** The chosen calendar day, stamped with the current clock time. */
function onDateWithCurrentClock(day: Date): Date {
  const now = new Date();
  const result = new Date(day);
  result.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
  return result;
}

const DATE_OPTIONS = [
  { value: "today" as const, label: "Today" },
  { value: "custom" as const, label: "Another date" },
];

export default function GrowthScreen() {
  const t = useTheme();
  const tone = useActivityTone("growth");
  const toast = useToast();
  const units = useUnits();
  const { activeBaby } = useBaby();
  const { account } = useAuth();
  const { logs, loading, refresh, handleDelete } = useLogs("all");
  const [showForm, setShowForm] = useState(false);
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dateChoice, setDateChoice] = useState<"today" | "custom">("today");
  const [customDate, setCustomDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<LogEntry | null>(null);
  const [editLog, setEditLog] = useState<LogEntry | null>(null);

  const growthLogs = useMemo(
    () => logs.filter((l) => l.type === "growth"),
    [logs]
  );
  const latestWeight = useMemo(
    () => growthLogs.find((l) => l.weightKg !== null) || null,
    [growthLogs]
  );
  const latestHeight = useMemo(
    () => growthLogs.find((l) => l.heightCm !== null) || null,
    [growthLogs]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const resetForm = () => {
    setShowForm(false);
    setWeight("");
    setHeight("");
    setNotes("");
    setDateChoice("today");
    setCustomDate(new Date());
    setShowDatePicker(false);
  };

  const handleSave = async () => {
    if (!weight && !height) {
      toast.error("Enter a weight or a height.");
      return;
    }
    if (!activeBaby) return;
    setSaving(true);
    const at = (
      dateChoice === "today" ? new Date() : onDateWithCurrentClock(customDate)
    ).toISOString();
    try {
      await createLog({
        babyId: activeBaby.id,
        type: "growth",
        weightKg: weight ? units.parseWeight(weight) : null,
        heightCm: height ? units.parseHeight(height) : null,
        startTime: at,
        endTime: at,
        comments: notes.trim() || null,
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

  // Without a baby every control on this screen is a dead end: the stat tiles
  // read "No data" and Save silently no-ops. Offer the switcher instead.
  if (!activeBaby) {
    return (
      <Screen scroll={false}>
        <EmptyState
          icon="growth"
          title="No baby selected"
          body="Choose a baby to track weight and height over time."
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
        title="Growth"
        subtitle={`Track weight & height · ${activeBaby.name}`}
        actions={<BabySwitcher />}
      />

      <View style={styles.statsRow}>
        <StatCard
          emoji={MEASURE_EMOJI.weight}
          soft={tone.soft}
          value={
            latestWeight?.weightKg != null
              ? units.formatWeight(latestWeight.weightKg)
              : "—"
          }
          caption={
            latestWeight
              ? `Last: ${formatDateLabel(latestWeight.startTime)}`
              : "No data"
          }
          name="Weight"
        />
        <StatCard
          emoji={MEASURE_EMOJI.height}
          soft={tone.soft}
          value={
            latestHeight?.heightCm != null
              ? units.formatHeight(latestHeight.heightCm)
              : "—"
          }
          caption={
            latestHeight
              ? `Last: ${formatDateLabel(latestHeight.startTime)}`
              : "No data"
          }
          name="Height"
        />
      </View>

      <Button
        label="Log measurement"
        icon="plus"
        variant="primary"
        fullWidth
        onPress={() => {
          setShowForm(true);
          setDateChoice("today");
          setCustomDate(new Date());
        }}
      />

      <View style={styles.section}>
        <SectionHeader title="Growth history" />
        {loading ? (
          <SkeletonList rows={3} />
        ) : growthLogs.length === 0 ? (
          <EmptyState
            icon="growth"
            title="No measurements yet"
            body="Log a weight or a height after the next check-up and it will show up here."
          />
        ) : (
          growthLogs.map((log, index) => {
            const dateLabel = formatDateLabel(log.startTime);
            const showHeader = dateLabel !== lastDate;
            lastDate = dateLabel;

            return (
              <FadeInUp key={log.id} index={index}>
                {showHeader && (
                  <Text
                    variant="overline"
                    tone="accent"
                    center
                    style={styles.dateHeader}
                    accessibilityRole="header"
                  >
                    {dateLabel}
                  </Text>
                )}
                <SwipeableRow onDelete={() => setPendingDelete(log)}>
                  <LogRow log={log} onEdit={setEditLog} />
                </SwipeableRow>
              </FadeInUp>
            );
          })
        )}
      </View>

      <Sheet
        visible={showForm}
        onClose={resetForm}
        title="New measurement"
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
              disabled={!weight && !height}
              onPress={handleSave}
              style={styles.flex}
            />
          </View>
        }
      >
        <Field
          label="Date"
          helper="Measurements taken earlier keep the current clock time."
        >
          <Segmented
            options={DATE_OPTIONS}
            value={dateChoice}
            onChange={setDateChoice}
          />
        </Field>

        {dateChoice === "custom" && (
          <>
            <Field label="Day">
              <Pressable
                onPress={() => setShowDatePicker(true)}
                accessibilityRole="button"
                accessibilityLabel={`Day: ${formatDateDisplay(customDate)}`}
                style={({ pressed }) => [
                  styles.pickerBtn,
                  {
                    backgroundColor: t.accentSofter,
                    borderColor: t.borderStrong,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text variant="body">{formatDateDisplay(customDate)}</Text>
              </Pressable>
            </Field>
            {showDatePicker && (
              <DateTimePicker
                value={customDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_, d) => {
                  setShowDatePicker(Platform.OS === "ios");
                  if (d) setCustomDate(d);
                }}
              />
            )}
          </>
        )}

        <Input
          label="Weight"
          suffix={units.weight}
          value={weight}
          onChangeText={setWeight}
          placeholder={units.system === "metric" ? "4.5" : "9.9"}
          keyboardType="decimal-pad"
        />

        <Input
          label="Height"
          suffix={units.height}
          value={height}
          onChangeText={setHeight}
          placeholder={units.system === "metric" ? "52" : "20.5"}
          keyboardType="decimal-pad"
        />

        <Input
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional"
        />
      </Sheet>

      <ConfirmDialog
        visible={pendingDelete !== null}
        title="Delete this measurement?"
        message={
          pendingDelete
            ? `The measurement from ${formatDateLabel(
                pendingDelete.startTime
              )} will be removed for every caregiver.`
            : ""
        }
        onConfirm={() => {
          if (pendingDelete !== null) {
            handleDelete(pendingDelete.id);
            setPendingDelete(null);
          }
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

/** One current-measurement tile. Read as a whole so the number has its unit. */
function StatCard({
  emoji,
  soft,
  value,
  caption,
  name,
}: {
  emoji: string;
  soft: string;
  value: string;
  caption: string;
  name: string;
}) {
  return (
    <Card
      style={styles.statCard}
      accessible
      accessibilityLabel={`${name}: ${value}. ${caption}`}
    >
      <View style={[styles.statIcon, { backgroundColor: soft }]}>
        <Emoji size={20}>{emoji}</Emoji>
      </View>
      <Text variant="title2" tabular center>
        {value}
      </Text>
      <Text variant="caption" tone="subtle" center>
        {caption}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: "center" },
  section: { gap: space.sm },
  statsRow: { flexDirection: "row", gap: space.md },
  statCard: { flex: 1, alignItems: "center", gap: space.xs },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  dateHeader: { paddingTop: space.md, paddingBottom: space.xs },
  actions: { flexDirection: "row", gap: space.sm },
  pickerBtn: {
    borderRadius: radius.md,
    borderWidth: 2,
    paddingHorizontal: space.md,
    minHeight: 48,
    justifyContent: "center",
  },
});
