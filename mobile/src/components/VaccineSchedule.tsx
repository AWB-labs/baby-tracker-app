import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTheme } from "../design/ThemeProvider";
import { space, radius, PRESSED_OPACITY } from "../design/tokens";
import {
  Card,
  Text,
  Emoji,
  Button,
  Input,
  Field,
  Sheet,
  SectionHeader,
  SkeletonList,
} from "./ui";
import { useToast } from "./Toast";
import {
  getVaccines,
  saveVaccine,
  buildSchedule,
  type VaccineMonth,
  type VaccineRecord,
} from "../api/vaccines";

interface Props {
  babyId: number;
  babyName: string;
  /** Drives the overdue flag; without it no month is ever called late. */
  dob: string | null | undefined;
}

function formatGivenDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * The first year's immunisation schedule: one tile per month of age.
 *
 * Odd months are mandatory and even months optional. That split is the app's
 * own simplification rather than a medical standard — national programmes
 * differ — so the wording stays soft ("required" / "optional") and the screen
 * never tells anyone they have missed something a clinic didn't ask for.
 */
export default function VaccineSchedule({ babyId, babyName, dob }: Props) {
  const t = useTheme();
  const toast = useToast();

  const [records, setRecords] = useState<VaccineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<VaccineMonth | null>(null);

  // Sheet state for the month being edited.
  const [given, setGiven] = useState(false);
  const [givenDate, setGivenDate] = useState(new Date());
  const [notes, setNotes] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setRecords(await getVaccines(babyId));
    } catch {
      // A failed read leaves the schedule showing nothing recorded, which is
      // recoverable by pulling to refresh — better than an error wall over a
      // list that is mostly static anyway.
    } finally {
      setLoading(false);
    }
  }, [babyId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const schedule = useMemo(() => buildSchedule(records, dob), [records, dob]);

  const summary = useMemo(() => {
    const required = schedule.filter((m) => m.mandatory);
    return {
      requiredDone: required.filter((m) => m.given).length,
      requiredTotal: required.length,
      overdue: schedule.filter((m) => m.overdue && m.mandatory).length,
    };
  }, [schedule]);

  const openMonth = (month: VaccineMonth) => {
    setSelected(month);
    setGiven(month.given);
    setGivenDate(month.givenAt ? new Date(month.givenAt) : new Date());
    setNotes(month.notes ?? "");
    setShowDatePicker(false);
  };

  const closeSheet = () => {
    setSelected(null);
    setShowDatePicker(false);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const saved = await saveVaccine({
        babyId,
        monthNumber: selected.month,
        givenAt: given ? givenDate.toISOString() : null,
        notes: notes.trim() || null,
      });
      setRecords((prev) => {
        const rest = prev.filter((r) => r.monthNumber !== saved.monthNumber);
        return [...rest, saved].sort((a, b) => a.monthNumber - b.monthNumber);
      });
      closeSheet();
    } catch (err) {
      toast.showError(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.section}>
        <SectionHeader title="Vaccines" />
        <SkeletonList rows={3} />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <SectionHeader title="Vaccines" />

      {/* The headline answers the only question most visits start with: are we
          up to date on the ones that aren't optional? */}
      <Card style={styles.summary}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text variant="title2" tone="accent" tabular>
              {summary.requiredDone}/{summary.requiredTotal}
            </Text>
            <Text variant="caption" tone="muted">
              required done
            </Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: t.border }]} />
          <View style={styles.summaryItem}>
            <Text
              variant="title2"
              tabular
              style={{ color: summary.overdue > 0 ? t.warning : t.textSubtle }}
            >
              {summary.overdue}
            </Text>
            <Text variant="caption" tone="muted">
              overdue
            </Text>
          </View>
        </View>
        <Text variant="footnote" tone="subtle">
          Odd months are the required visits; even months are optional. Always
          follow the card your clinic gives you.
        </Text>
      </Card>

      <View style={styles.grid}>
        {schedule.map((m) => {
          // Three states, each with its own colour so the grid can be read at a
          // glance: done, overdue, and not yet due.
          const bg = m.given
            ? t.successSoft
            : m.overdue
            ? t.warningSoft
            : t.accentSofter;
          const fg = m.given ? t.success : m.overdue ? t.warning : t.accentText;
          const label = m.given
            ? "done"
            : m.overdue
            ? "overdue"
            : m.mandatory
            ? "required"
            : "optional";

          return (
            <Pressable
              key={m.month}
              onPress={() => openMonth(m)}
              accessibilityRole="button"
              accessibilityLabel={`Month ${m.month}, ${
                m.mandatory ? "required" : "optional"
              }, ${m.given ? `given ${formatGivenDate(m.givenAt!)}` : label}`}
              style={({ pressed }) => [
                styles.tile,
                {
                  backgroundColor: bg,
                  borderColor: m.given ? t.success : t.borderStrong,
                  // A required month gets a heavier edge, so the ones that
                  // matter stand out without relying on colour alone.
                  borderWidth: m.mandatory ? 2 : StyleSheet.hairlineWidth,
                  opacity: pressed ? PRESSED_OPACITY : 1,
                },
              ]}
            >
              <Text variant="caption" tone="muted">
                Month
              </Text>
              <Text variant="title3" tabular style={{ color: fg }}>
                {m.month}
              </Text>
              <View style={styles.tileFoot}>
                {m.given ? <Emoji size={12}>✅</Emoji> : null}
                <Text variant="caption" style={{ color: fg }} numberOfLines={1}>
                  {label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Sheet
        visible={selected !== null}
        onClose={closeSheet}
        title={selected ? `Month ${selected.month}` : ""}
        subtitle={
          selected
            ? `${selected.mandatory ? "Required" : "Optional"} · ${babyName}`
            : ""
        }
        footer={
          <View style={styles.actions}>
            <Button
              label="Cancel"
              variant="ghost"
              onPress={closeSheet}
              style={styles.flex}
            />
            <Button
              label="Save"
              variant="primary"
              loading={saving}
              onPress={handleSave}
              style={styles.flex}
            />
          </View>
        }
      >
        <Field label="Status">
          <View style={styles.statusRow}>
            {[
              { value: false, label: "Not taken", emoji: "⭕" },
              { value: true, label: "Taken", emoji: "✅" },
            ].map((opt) => {
              const active = given === opt.value;
              return (
                <Pressable
                  key={String(opt.value)}
                  onPress={() => setGiven(opt.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={opt.label}
                  style={({ pressed }) => [
                    styles.statusBtn,
                    {
                      backgroundColor: active ? t.accent : t.accentSofter,
                      borderColor: active ? t.accent : t.borderStrong,
                      opacity: pressed ? PRESSED_OPACITY : 1,
                    },
                  ]}
                >
                  <Emoji size={16}>{opt.emoji}</Emoji>
                  <Text
                    variant="subheadStrong"
                    style={{ color: active ? t.onAccent : t.accentText }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        {/* Only a dose that was actually given has a date to record. */}
        {given && (
          <>
            <Field label="Date given">
              <Pressable
                onPress={() => setShowDatePicker(true)}
                accessibilityRole="button"
                accessibilityLabel={`Date given: ${formatGivenDate(
                  givenDate.toISOString()
                )}`}
                style={({ pressed }) => [
                  styles.pickerBtn,
                  {
                    backgroundColor: t.accentSofter,
                    borderColor: t.borderStrong,
                    opacity: pressed ? PRESSED_OPACITY : 1,
                  },
                ]}
              >
                <Text variant="body">
                  {formatGivenDate(givenDate.toISOString())}
                </Text>
              </Pressable>
            </Field>
            {showDatePicker && (
              <DateTimePicker
                value={givenDate}
                mode="date"
                maximumDate={new Date()}
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_, d) => {
                  setShowDatePicker(Platform.OS === "ios");
                  if (d) setGivenDate(d);
                }}
              />
            )}
          </>
        )}

        <Input
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Clinic, vaccine name, any reaction…"
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { gap: space.sm },
  summary: { gap: space.sm },
  summaryRow: { flexDirection: "row", alignItems: "center" },
  summaryItem: { flex: 1, alignItems: "center", gap: space.xxs },
  summaryDivider: { width: StyleSheet.hairlineWidth, alignSelf: "stretch" },
  // Three across on a narrow phone, so all twelve months are two thumb-scrolls
  // at most and the year reads as one block.
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  tile: {
    flexGrow: 1,
    flexBasis: "30%",
    borderRadius: radius.lg,
    paddingVertical: space.md,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  tileFoot: { flexDirection: "row", alignItems: "center", gap: space.xxs },
  actions: { flexDirection: "row", gap: space.sm },
  statusRow: { flexDirection: "row", gap: space.sm },
  statusBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 2,
  },
  pickerBtn: {
    borderRadius: radius.md,
    borderWidth: 2,
    paddingHorizontal: space.md,
    minHeight: 48,
    justifyContent: "center",
  },
});
