import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
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
  formatInterval,
  formatDays,
  WEEKDAYS,
  REMINDER_TYPES,
  REMINDER_META,
  type Reminder,
  type ReminderType,
} from "../api/reminders";

/** The frequencies parents actually pick, one tap each. */
const QUICK_INTERVALS: { label: string; hours: number; minutes: number }[] = [
  { label: "1h", hours: 1, minutes: 0 },
  { label: "2h", hours: 2, minutes: 0 },
  { label: "3h", hours: 3, minutes: 0 },
  { label: "4h", hours: 4, minutes: 0 },
  { label: "6h", hours: 6, minutes: 0 },
  { label: "12h", hours: 12, minutes: 0 },
  { label: "24h", hours: 24, minutes: 0 },
];

interface Draft {
  /** null while adding; the reminder being edited otherwise. */
  editing: Reminder | null;
  type: ReminderType;
  label: string;
  hours: string;
  minutes: string;
  days: number[];
}

const FRESH_DRAFT: Draft = {
  editing: null,
  type: "feed",
  label: "",
  hours: "3",
  minutes: "0",
  days: [],
};

/**
 * Reminders, on their own screen.
 *
 * The old design inlined the whole editor into the Account page — a permanent
 * wall of inputs under the list. Here the screen is the list (what will nudge
 * you, when, on which days, each with its own switch), and creating or editing
 * happens in a sheet: pick what → pick how often (one tap for the common
 * frequencies) → optionally narrow the days. Three decisions, in order.
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

  const openAdd = () => setDraft({ ...FRESH_DRAFT });

  const openEdit = (r: Reminder) =>
    setDraft({
      editing: r,
      type: r.type,
      label: r.label ?? "",
      hours: String(Math.floor(r.intervalMinutes / 60)),
      minutes: String(r.intervalMinutes % 60),
      days: r.daysOfWeek ?? [],
    });

  const handleSave = async () => {
    if (!draft || !activeBaby) return;
    const hours = parseInt(draft.hours || "0", 10);
    const minutes = parseInt(draft.minutes || "0", 10);
    if (isNaN(hours) || isNaN(minutes) || hours * 60 + minutes < 5) {
      toast.error("Choose an interval of at least 5 minutes.");
      return;
    }
    if (draft.type === "custom" && !draft.label.trim()) {
      toast.error("Give your custom reminder a name.");
      return;
    }
    setSaving(true);
    try {
      if (draft.editing) {
        const updated = await updateReminder(draft.editing.id, {
          label: draft.label.trim() || null,
          hours,
          minutes,
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
          hours,
          minutes,
          daysOfWeek: draft.days.length > 0 ? draft.days : null,
        });
        setReminders((prev) => [...prev, created]);
        toast.success(
          `You'll be reminded every ${formatInterval(created.intervalMinutes)}${
            created.daysOfWeek
              ? ` on ${formatDays(created.daysOfWeek).toLowerCase()}`
              : ""
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

  const draftMeta = draft ? REMINDER_META.get(draft.type) : null;

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
          body="Add one and we'll nudge you when it's been too long — every few hours for feeds, once a day for vitamins, whatever fits."
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
                  accessibilityLabel={`Edit the ${name} reminder — every ${formatInterval(
                    r.intervalMinutes
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
                    <Text variant="caption" tone="subtle">
                      Every {formatInterval(r.intervalMinutes)}
                      {meta?.watchesActivity ? " since the last one" : ""}
                      {` · ${formatDays(r.daysOfWeek)}`}
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
          draft?.editing
            ? undefined
            : "What, how often, and on which days."
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

            {/* How often — one tap for the usual answers. */}
            <Field
              label="How often"
              helper={
                draftMeta?.watchesActivity
                  ? "Counted from the last time it was logged."
                  : "Repeats on its own schedule."
              }
            >
              <ChipWrap>
                {QUICK_INTERVALS.map((q) => (
                  <Chip
                    key={q.label}
                    label={q.label}
                    selected={
                      parseInt(draft.hours || "0", 10) === q.hours &&
                      parseInt(draft.minutes || "0", 10) === q.minutes
                    }
                    onPress={() =>
                      setDraft({
                        ...draft,
                        hours: String(q.hours),
                        minutes: String(q.minutes),
                      })
                    }
                  />
                ))}
              </ChipWrap>
            </Field>

            <View style={styles.intervalRow}>
              <Input
                containerStyle={styles.flex}
                label="Hours"
                value={draft.hours}
                onChangeText={(hours) => setDraft({ ...draft, hours })}
                keyboardType="number-pad"
                placeholder="0"
              />
              <Input
                containerStyle={styles.flex}
                label="Minutes"
                value={draft.minutes}
                onChangeText={(minutes) => setDraft({ ...draft, minutes })}
                keyboardType="number-pad"
                placeholder="0"
              />
            </View>

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
  intervalRow: { flexDirection: "row", gap: space.md },
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
