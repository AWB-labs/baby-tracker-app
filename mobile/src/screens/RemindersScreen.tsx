import React, { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Switch, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../design/ThemeProvider";
import { space, radius, PRESSED_OPACITY } from "../design/tokens";
import { REMINDER_EMOJI } from "../design/activity";
import {
  Screen,
  ScreenHeader,
  Card,
  Text,
  Emoji,
  Button,
  IconButton,
  Input,
  Field,
  EmptyState,
  Chip,
  ChipWrap,
  Sheet,
  SkeletonList,
  FadeInUp,
  ConfirmDialog,
} from "../components/ui";
import { useBaby } from "../context/BabyContext";
import { useSettings } from "../context/SettingsContext";
import { useToast } from "../components/Toast";
import { usePushRegistration } from "../hooks/usePushRegistration";
import {
  getReminders,
  createReminder,
  updateReminder,
  deleteReminder,
  formatTimeOfDay,
  timeOfDayToDate,
  dateToTimeOfDay,
  DEFAULT_TIME_OF_DAY,
  formatDays,
  WEEKDAYS,
  REMINDER_TYPES,
  REMINDER_META,
  type Reminder,
  type ReminderType,
} from "../api/reminders";

/** One-tap picks for the times parents actually choose. */
const QUICK_TIMES: { label: string; minutes: number }[] = [
  { label: "7 AM", minutes: 7 * 60 },
  { label: "9 AM", minutes: 9 * 60 },
  { label: "12 PM", minutes: 12 * 60 },
  { label: "3 PM", minutes: 15 * 60 },
  { label: "7 PM", minutes: 19 * 60 },
  { label: "9 PM", minutes: 21 * 60 },
];

interface Draft {
  /** null while adding; the reminder being edited otherwise. */
  editing: Reminder | null;
  type: ReminderType;
  label: string;
  timeOfDay: number;
  days: number[];
}

const FRESH_DRAFT: Draft = {
  editing: null,
  type: "feed",
  label: "",
  timeOfDay: DEFAULT_TIME_OF_DAY,
  days: [],
};

/**
 * Reminders, on their own screen.
 *
 * The old design inlined the whole editor into the Account page — a permanent
 * wall of inputs under the list. Here the screen is the list (what will nudge
 * you, at what time, on which days, each with its own switch), and creating or
 * editing happens in a sheet: pick what → pick when (one tap for the common
 * times, or the wheel for exact) → optionally narrow the days.
 */
export default function RemindersScreen() {
  const t = useTheme();
  const toast = useToast();
  const navigation = useNavigation();
  const { activeBaby } = useBaby();
  const { notificationsEnabled, save } = useSettings();
  const push = usePushRegistration();

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [showWheel, setShowWheel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Reminder | null>(null);

  const load = useCallback(async () => {
    if (!activeBaby) {
      setLoading(false);
      return;
    }
    try {
      setReminders(await getReminders(activeBaby.id));
    } catch (err) {
      toast.showError(err);
    } finally {
      setLoading(false);
    }
  }, [activeBaby, toast]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleNotificationsToggle = async (value: boolean) => {
    try {
      await save({ notificationsEnabled: value });
      toast.success(value ? "Reminders switched on." : "All reminders paused.");
    } catch (err) {
      toast.showError(err);
    }
  };

  const openAdd = () => {
    setShowWheel(false);
    setDraft({ ...FRESH_DRAFT });
  };

  const openEdit = (r: Reminder) => {
    setShowWheel(false);
    setDraft({
      editing: r,
      type: r.type,
      label: r.label ?? "",
      timeOfDay: r.timeOfDay,
      days: r.daysOfWeek ?? [],
    });
  };

  const handleSave = async () => {
    if (!draft || !activeBaby) return;
    if (draft.type === "custom" && !draft.label.trim()) {
      toast.error("Give your custom reminder a name.");
      return;
    }
    setSaving(true);
    try {
      if (draft.editing) {
        const updated = await updateReminder(draft.editing.id, {
          label: draft.label.trim() || null,
          timeOfDay: draft.timeOfDay,
          daysOfWeek: draft.days.length > 0 ? draft.days : null,
        });
        setReminders((prev) =>
          prev.map((r) => (r.id === updated.id ? updated : r))
        );
        toast.success("Reminder updated.");
      } else {
        const created = await createReminder({
          babyId: activeBaby.id,
          type: draft.type,
          label: draft.label.trim() || null,
          timeOfDay: draft.timeOfDay,
          daysOfWeek: draft.days.length > 0 ? draft.days : null,
        });
        setReminders((prev) => [...prev, created]);
        toast.success(
          `You'll be reminded at ${formatTimeOfDay(created.timeOfDay)}${
            created.daysOfWeek
              ? ` on ${formatDays(created.daysOfWeek).toLowerCase()}`
              : " every day"
          }.`
        );
      }
      setDraft(null);
    } catch (err) {
      toast.showError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (reminder: Reminder) => {
    const next = !reminder.enabled;
    setReminders((prev) =>
      prev.map((r) => (r.id === reminder.id ? { ...r, enabled: next } : r))
    );
    try {
      await updateReminder(reminder.id, { enabled: next });
    } catch (err) {
      setReminders((prev) =>
        prev.map((r) =>
          r.id === reminder.id ? { ...r, enabled: reminder.enabled } : r
        )
      );
      toast.showError(err);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    setDraft(null);
    const previous = reminders;
    setReminders((prev) => prev.filter((r) => r.id !== target.id));
    try {
      await deleteReminder(target.id);
      toast.success("Reminder removed.");
    } catch (err) {
      setReminders(previous);
      toast.showError(err);
    }
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <View style={styles.headerRow}>
        <IconButton
          icon="chevronLeft"
          label="Back to Account"
          variant="surface"
          onPress={() => navigation.goBack()}
        />
        <ScreenHeader
          title="Reminders"
          subtitle={activeBaby ? `Nudges for ${activeBaby.name}` : undefined}
          style={styles.headerText}
        />
      </View>

      {/* Master switch — everything below obeys it. */}
      <Card>
        <View style={styles.switchRow}>
          <View style={[styles.bellChip, { backgroundColor: t.accentSoft }]}>
            <Emoji size={18}>{notificationsEnabled ? "🔔" : "🔕"}</Emoji>
          </View>
          <View style={styles.rowBody}>
            <Text variant="subheadStrong">Notifications</Text>
            <Text variant="caption" tone="subtle">
              {push && push.status !== "granted"
                ? push.message
                : "Reminders are sent to this device."}
            </Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={handleNotificationsToggle}
            trackColor={{ true: t.accent, false: t.border }}
            thumbColor={t.surface}
            ios_backgroundColor={t.border}
            accessibilityLabel="Notifications"
          />
        </View>
      </Card>

      {loading ? (
        <SkeletonList rows={3} />
      ) : reminders.length === 0 ? (
        <EmptyState
          icon="bell"
          title="No reminders yet"
          body="Add one and we'll nudge you at the time you pick — a 9 AM vitamin, a 7 PM bath, whatever fits."
        />
      ) : (
        <View style={styles.list}>
          {reminders.map((r, index) => {
            const meta = REMINDER_META.get(r.type);
            const name = r.label || meta?.label || r.type;
            return (
              <FadeInUp key={r.id} index={index}>
                <Pressable
                  onPress={() => openEdit(r)}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit the ${name} reminder — at ${formatTimeOfDay(
                    r.timeOfDay
                  )}, ${formatDays(r.daysOfWeek)}`}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      backgroundColor: t.surface,
                      borderColor: t.border,
                      opacity: pressed ? PRESSED_OPACITY : 1,
                    },
                  ]}
                >
                  <View
                    style={[styles.avatar, { backgroundColor: t.accentSofter }]}
                  >
                    <Emoji size={18}>
                      {REMINDER_EMOJI[r.type] ?? REMINDER_EMOJI.custom}
                    </Emoji>
                  </View>
                  <View style={styles.rowBody}>
                    <Text variant="subheadStrong" numberOfLines={1}>
                      {name}
                    </Text>
                    <Text variant="caption" tone="subtle" tabular>
                      {formatTimeOfDay(r.timeOfDay)} · {formatDays(r.daysOfWeek)}
                    </Text>
                  </View>
                  <Switch
                    value={r.enabled}
                    onValueChange={() => handleToggle(r)}
                    trackColor={{ true: t.accent, false: t.border }}
                    thumbColor={t.surface}
                    ios_backgroundColor={t.border}
                    accessibilityLabel={`${name} reminder on or off`}
                  />
                </Pressable>
              </FadeInUp>
            );
          })}
        </View>
      )}

      <Button
        label="Add reminder"
        icon="plus"
        variant="primary"
        fullWidth
        onPress={openAdd}
      />

      {/* ------------------------------------------------- add / edit sheet */}
      <Sheet
        visible={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.editing ? "Edit reminder" : "New reminder"}
        subtitle={
          draft?.editing ? undefined : "What, at what time, on which days."
        }
        footer={
          <View style={styles.sheetFooter}>
            {draft?.editing ? (
              <Button
                label="Delete"
                variant="danger"
                onPress={() => setPendingDelete(draft.editing)}
                style={styles.flex}
              />
            ) : (
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => setDraft(null)}
                style={styles.flex}
              />
            )}
            <Button
              label={draft?.editing ? "Save" : "Add"}
              variant="primary"
              loading={saving}
              onPress={handleSave}
              style={styles.flex}
            />
          </View>
        }
      >
        {draft ? (
          <View style={styles.form}>
            {/* What — locked while editing; the type is the reminder. */}
            {draft.editing ? null : (
              <Field label="Remind me about">
                <ChipWrap>
                  {REMINDER_TYPES.map((option) => (
                    <Chip
                      key={option.value}
                      label={option.label}
                      emoji={REMINDER_EMOJI[option.value] ?? REMINDER_EMOJI.custom}
                      selected={draft.type === option.value}
                      onPress={() => setDraft({ ...draft, type: option.value })}
                    />
                  ))}
                </ChipWrap>
              </Field>
            )}

            {(draft.type === "custom" || draft.editing) && (
              <Input
                label={draft.type === "custom" ? "Call it" : "Name (optional)"}
                value={draft.label}
                onChangeText={(label) => setDraft({ ...draft, label })}
                placeholder={
                  draft.type === "custom" ? "Tummy time, water, …" : undefined
                }
              />
            )}

            {/* When — one tap for the usual times, the wheel for exact. */}
            <Field label="At what time">
              <ChipWrap>
                {QUICK_TIMES.map((q) => (
                  <Chip
                    key={q.label}
                    label={q.label}
                    selected={draft.timeOfDay === q.minutes}
                    onPress={() =>
                      setDraft({ ...draft, timeOfDay: q.minutes })
                    }
                  />
                ))}
              </ChipWrap>
            </Field>

            <Pressable
              onPress={() => setShowWheel((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={`Reminder time: ${formatTimeOfDay(draft.timeOfDay)}. Opens the exact time picker.`}
              style={({ pressed }) => [
                styles.timeRow,
                {
                  backgroundColor: t.accentSofter,
                  borderColor: t.borderStrong,
                  opacity: pressed ? PRESSED_OPACITY : 1,
                },
              ]}
            >
              <Emoji size={16}>⏰</Emoji>
              <Text variant="bodyStrong" tabular style={{ color: t.accentText }}>
                {formatTimeOfDay(draft.timeOfDay)}
              </Text>
              <Text variant="caption" tone="subtle">
                tap for exact time
              </Text>
            </Pressable>

            {showWheel && (
              <DateTimePicker
                value={timeOfDayToDate(draft.timeOfDay)}
                mode="time"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_e, date) => {
                  if (Platform.OS !== "ios") setShowWheel(false);
                  if (date)
                    setDraft((d) =>
                      d ? { ...d, timeOfDay: dateToTimeOfDay(date) } : d
                    );
                }}
              />
            )}

            {/* Which days — nothing selected means every day. */}
            <Field
              label="On these days"
              helper={
                draft.days.length === 0
                  ? "Every day. Tap days to narrow it."
                  : formatDays(draft.days)
              }
            >
              <View style={styles.dayRow}>
                {WEEKDAYS.map((day) => {
                  const selected = draft.days.includes(day.value);
                  return (
                    <Pressable
                      key={day.value}
                      onPress={() =>
                        setDraft({
                          ...draft,
                          days: selected
                            ? draft.days.filter((d) => d !== day.value)
                            : [...draft.days, day.value].sort((a, b) => a - b),
                        })
                      }
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={day.long}
                      style={({ pressed }) => [
                        styles.dayTile,
                        {
                          backgroundColor: selected ? t.accent : t.accentSofter,
                          borderColor: selected ? t.accent : "transparent",
                          opacity: pressed ? PRESSED_OPACITY : 1,
                        },
                      ]}
                    >
                      <Text
                        variant="caption"
                        style={{ color: selected ? t.onAccent : t.accentText }}
                      >
                        {day.short}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Field>
          </View>
        ) : null}
      </Sheet>

      <ConfirmDialog
        visible={pendingDelete !== null}
        icon="bell"
        title="Delete this reminder?"
        message="It stops nudging every caregiver of this baby."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
  },
  headerText: { flex: 1 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  bellChip: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, minWidth: 0, gap: 1 },
  list: { gap: space.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  form: { gap: space.lg },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  dayRow: { flexDirection: "row", gap: space.xs },
  dayTile: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  sheetFooter: { flexDirection: "row", gap: space.sm },
});
