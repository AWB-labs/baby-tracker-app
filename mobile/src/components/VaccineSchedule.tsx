import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTheme } from "../design/ThemeProvider";
import { space, radius, PRESSED_OPACITY, DISABLED_OPACITY } from "../design/tokens";
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
import { DATE_LOCALE, MIN_PICKABLE_DATE, safePickedDate } from "../lib/calendar";

interface Props {
  babyId: number;
  babyName: string;
  /** Drives the overdue flag; without it no month is ever called late. */
  dob: string | null | undefined;
}

function formatGivenDate(iso: string): string {
  return new Date(iso).toLocaleDateString(DATE_LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "12/03" — short enough to sit inside a tile without crowding the month. */
function formatDayMonth(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(
    d.getMonth() + 1
  ).padStart(2, "0")}`;
}

/**
 * One month of the schedule.
 *
 * Carries its own required/optional mark as well as sitting in a labelled
 * group: the tiles are scanned individually once you're looking for a specific
 * month, and a badge that only exists in a heading two rows up isn't there when
 * you need it.
 */
function MonthTile({
  month,
  onOpen,
}: {
  month: VaccineMonth;
  onOpen: (m: VaccineMonth) => void;
}) {
  const t = useTheme();

  // Four states, each with its own colour so the grid reads at a glance:
  // done, overdue, locked, and not yet due (but reachable).
  const bg = month.given
    ? t.successSoft
    : month.overdue
      ? t.warningSoft
      : t.accentSofter;
  const fg = month.given ? t.success : month.overdue ? t.warning : t.accentText;
  const status = month.given
    ? "done"
    : month.locked
      ? "locked"
      : month.overdue
        ? "overdue"
        : "not yet";

  return (
    <Pressable
      onPress={() => onOpen(month)}
      disabled={month.locked}
      accessibilityRole="button"
      accessibilityState={{ disabled: month.locked }}
      accessibilityLabel={`Month ${month.month}, ${
        month.mandatory ? "mandatory" : "optional"
      }, ${
        month.given
          ? `given ${formatGivenDate(month.givenAt!)}`
          : month.locked
            ? "not due yet"
            : status
      }`}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: bg,
          borderColor: month.given ? t.success : t.borderStrong,
          // A required month carries a heavier edge, so the ones that matter
          // stand out without resting on colour alone.
          borderWidth: month.mandatory ? 2 : StyleSheet.hairlineWidth,
          // Locked wins over pressed — it can't be pressed anyway, but a stale
          // pressed style from just before it locked shouldn't linger.
          opacity: month.locked ? DISABLED_OPACITY : pressed ? PRESSED_OPACITY : 1,
        },
      ]}
    >
      {/* Filled for required, hollow for optional — a shape difference, so it
          survives colour blindness and a greyscale screenshot. */}
      <Text
        variant="caption"
        style={[
          styles.tileMark,
          { color: month.mandatory ? t.accent : t.textSubtle },
        ]}
      >
        {month.mandatory ? "●" : "○"}
      </Text>

      <Text variant="caption" tone="muted">
        Month
      </Text>
      <Text variant="title3" tabular style={{ color: fg }}>
        {month.month}
      </Text>
      {/* Once it's done, the date it was given is the useful thing to show —
          "done" only repeats what the tick and the colour already said. */}
      <View style={styles.tileFoot}>
        {month.given ? (
          <Emoji size={12}>✅</Emoji>
        ) : month.locked ? (
          <Emoji size={12}>🔒</Emoji>
        ) : null}
        <Text variant="caption" tabular style={{ color: fg }} numberOfLines={1}>
          {month.given && month.givenAt ? formatDayMonth(month.givenAt) : status}
        </Text>
      </View>
    </Pressable>
  );
}

/** A labelled run of months — the mandatory ones, or the optional ones. */
function VaccineGroup({
  title,
  mandatory,
  caption,
  months,
  onOpen,
}: {
  title: string;
  mandatory: boolean;
  caption: string;
  months: VaccineMonth[];
  onOpen: (m: VaccineMonth) => void;
}) {
  const t = useTheme();
  return (
    <View style={styles.group}>
      <View style={styles.groupHead}>
        <Text
          variant="caption"
          style={{ color: mandatory ? t.accent : t.textSubtle }}
        >
          {mandatory ? "●" : "○"}
        </Text>
        <Text variant="overline" tone="subtle">
          {title}
        </Text>
        <Text variant="caption" tone="muted">
          · {caption}
        </Text>
      </View>
      <View style={styles.grid}>
        {months.map((m) => (
          <MonthTile key={m.month} month={m} onOpen={onOpen} />
        ))}
      </View>
    </View>
  );
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

  const required = useMemo(() => schedule.filter((m) => m.mandatory), [schedule]);
  const optional = useMemo(() => schedule.filter((m) => !m.mandatory), [schedule]);

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

      {/* Split rather than one run of twelve. Which visits can't be missed is
          the first thing anyone wants from this screen, and reading it off the
          parity of a month number is a puzzle nobody should have to solve. */}
      <VaccineGroup
        title="Mandatory"
        mandatory
        caption="Don't miss these"
        months={required}
        onOpen={openMonth}
      />

      <View style={[styles.groupDivider, { backgroundColor: t.border }]} />

      <VaccineGroup
        title="Optional"
        mandatory={false}
        caption="Check with your clinic"
        months={optional}
        onOpen={openMonth}
      />

      {/* Below the grid, not above it: the tally is a summary *of* the months,
          and reading it first meant being given a score before being shown what
          it counted. */}
      <Card style={styles.summary}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text variant="title2" tone="accent" tabular>
              {summary.requiredDone}/{summary.requiredTotal}
            </Text>
            <Text variant="caption" tone="muted">
              mandatory done
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
          Always follow the card your clinic gives you — schedules differ by
          country.
        </Text>
      </Card>

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
                minimumDate={MIN_PICKABLE_DATE}
                locale={DATE_LOCALE}
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_, d) => {
                  setShowDatePicker(Platform.OS === "ios");
                  setGivenDate((prev) => safePickedDate(d, prev));
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
  group: { gap: space.xs },
  groupHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  groupDivider: { height: StyleSheet.hairlineWidth, marginVertical: space.xs },
  // Top-right of the tile, out of the way of the month number.
  tileMark: { position: "absolute", top: space.xs, right: space.sm },
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
