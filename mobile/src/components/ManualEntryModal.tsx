import React, { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTheme, useThemeContext } from "../design/ThemeProvider";
import {
  useActivityTones,
  ACTIVITY_LABEL,
  DIAPER_META,
  SIDE_EMOJI,
  type ActivityKey,
} from "../design/activity";
import { space, radius } from "../design/tokens";
import { Icon } from "../design/icons";
import { useUnits } from "../context/SettingsContext";
import { createLog } from "../api/logs";
import { adjustDiaperStock } from "../api/diaperStock";
import { isInstantLog } from "../lib/activities";
import { formatDuration } from "../utils/formatDuration";
import { Text, Emoji, Button, Input, Field, Sheet, Chip, ChipWrap } from "./ui";
import { useToast } from "./Toast";
import TimeField from "./TimeField";
import { DATE_LOCALE, MIN_PICKABLE_DATE, safePickedDate } from "../lib/calendar";

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
  return d.toLocaleDateString(DATE_LOCALE, { month: "short", day: "numeric", year: "numeric" });
}

interface Props {
  visible: boolean;
  babyId: number;
  babyName: string;
  enteredByName: string;
  onSaved: () => void;
  onClose: () => void;
  /** Nappies on hand right now, for the stock line below the diaper fields. */
  diaperStock?: number | null;
  /** A restock or a use changed the count — refetch it. */
  onDiaperStockChanged?: () => void;
}

/**
 * "Add something that already happened" — the catch-all for entries made after
 * the fact. A feed or pump needs a side, an amount, or both: a side (with or
 * without an amount) is a timed session with a start and end; an amount with
 * no side is a single measured moment, like a bottle. Every other type saves
 * with a single time.
 */
function ManualEntryModal({
  visible,
  babyId,
  babyName,
  enteredByName,
  onSaved,
  onClose,
  diaperStock,
  onDiaperStockChanged,
}: Props) {
  const t = useTheme();
  const { isDark } = useThemeContext();
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

  // Whether saving this diaper change also draws one from stock. Reseeded
  // whenever diaper is (re)selected, so it always starts matching what stock
  // actually allows rather than remembering a stale choice from last time.
  const [useFromStock, setUseFromStock] = useState(false);
  const [restockAmount, setRestockAmount] = useState("");
  const [restocking, setRestocking] = useState(false);

  /**
   * Whether the date calendar is open. Time no longer lives here — see
   * TimeField — so this is just the one field now rather than a value shared
   * across three.
   */
  const [openPicker, setOpenPicker] = useState<"date" | null>(null);

  /**
   * Re-seed the date and times every time the sheet OPENS, not only when it
   * closes. The initial values are captured when this component mounts —
   * which for a night-owl household is routinely a 2 AM cold start — and the
   * close-time reset never runs before the first open, so the first manual
   * entry of the day used to greet people with the small hours of the last
   * one: the widely-reported "time keeps reverting to 2 AM".
   */
  useEffect(() => {
    if (!visible) return;
    const now = new Date();
    setDate(now);
    setStartTime(now);
    setEndTime(now);
  }, [visible]);

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

  // A feed or pump needs a side or a valid amount — one is enough, and having
  // both is fine too.
  const sidedValid = !takesMl || !!side || amountValid;
  const canSave = !!activityType && sidedValid && (!isDiaper || !!diaperStatus);

  /**
   * Why Save is unavailable, in words.
   *
   * A disabled button that doesn't say what it's waiting for reads as broken —
   * you tap it, nothing happens, and the sheet offers no clue which of the
   * fields above it minds about.
   */
  const blockedReason = !activityType
    ? "Pick an activity to save this entry."
    : takesMl && !sidedValid
      ? "Choose a side, enter an amount, or both."
      : isDiaper && !diaperStatus
        ? "Choose what was in the nappy."
        : null;

  const combine = (d: Date, tm: Date): Date => {
    const result = new Date(d);
    result.setHours(tm.getHours(), tm.getMinutes(), 0, 0);
    return result;
  };

  // Worked out once, for both the readout below the fields and the save itself,
  // so what the sheet promises and what it writes can't drift apart.
  const spanStart = combine(date, startTime);
  const spanEnd = (() => {
    const end = combine(date, endTime);
    // An end before the start means it crossed midnight — roll it forward.
    if (end.getTime() < spanStart.getTime()) {
      const rolled = new Date(end);
      rolled.setDate(rolled.getDate() + 1);
      return rolled;
    }
    return end;
  })();
  const crossesMidnight = spanEnd.getDate() !== spanStart.getDate();
  const spanMinutes = (spanEnd.getTime() - spanStart.getTime()) / 60000;
  /** Long enough to be a slip on the wheel rather than a real session. */
  const implausible = !isInstant && spanMinutes > 16 * 60;

  const handleClose = () => {
    setActivityType(null);
    setSide(null);
    setAmount("");
    setDiaperStatus(null);
    setDate(new Date());
    setStartTime(new Date());
    setEndTime(new Date());
    setComments("");
    setOpenPicker(null);
    setUseFromStock(false);
    setRestockAmount("");
    onClose();
  };

  const handleSave = async () => {
    if (!canSave || !activityType) return;
    setSaving(true);

    const start = spanStart;
    const end = isInstant ? start : spanEnd;

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
      // Best-effort: the change itself is already saved either way, so a
      // failed stock update shouldn't read as the entry having failed too.
      if (isDiaper && useFromStock) {
        try {
          await adjustDiaperStock(babyId, -1);
          onDiaperStockChanged?.();
        } catch {
          // The count just won't reflect this one until corrected by hand.
        }
      }
      toast.success("Entry saved.");
      handleClose();
    } catch (err) {
      toast.showError(err);
    } finally {
      setSaving(false);
    }
  };

  const restockValue = parseInt(restockAmount, 10);
  const restockValid = !isNaN(restockValue) && restockValue > 0;

  /** Add to stock right away — this is inventory, not a thing that happened
   *  to the baby, so it doesn't wait on the rest of the form or create a log. */
  const handleRestock = async () => {
    if (!restockValid || restocking) return;
    setRestocking(true);
    try {
      await adjustDiaperStock(babyId, restockValue);
      onDiaperStockChanged?.();
      toast.success(`Added ${restockValue} to diaper stock.`);
      setRestockAmount("");
    } catch (err) {
      toast.showError(err);
    } finally {
      setRestocking(false);
    }
  };

  /** The date field that opens its own calendar below it. */
  const dateField = (label: string, value: string) => {
    const active = openPicker === "date";
    return (
      <Field label={label} style={styles.flex}>
        <Pressable
          onPress={() => setOpenPicker(active ? null : "date")}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${value}`}
          accessibilityState={{ expanded: active }}
          style={({ pressed }) => [
            styles.pickerBtn,
            {
              backgroundColor: active ? t.accentSoft : t.accentSofter,
              // The open field is outlined, so it's obvious the calendar
              // below belongs to it.
              borderColor: active ? t.accent : t.borderStrong,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text variant="body">{value}</Text>
        </Pressable>
      </Field>
    );
  };

  /**
   * The calendar, plus a way to put it away.
   *
   * iOS renders it inline and never dismisses on its own, so without an
   * explicit Done there'd be no way to close it. Android's dialog closes
   * itself, so it gets no button. Time used to share this same shape, but
   * moved to TimeField — see there for why.
   */
  const datePicker = (value: Date, onPick: (next: Date) => void) =>
    openPicker === "date" ? (
      <View style={styles.pickerWrap}>
        <DateTimePicker
          value={value}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          accentColor={t.accent}
          themeVariant={isDark ? "dark" : "light"}
          locale={DATE_LOCALE}
          maximumDate={new Date()}
          minimumDate={MIN_PICKABLE_DATE}
          onChange={(_, picked) => {
            if (Platform.OS !== "ios") setOpenPicker(null);
            onPick(safePickedDate(picked, value));
          }}
        />
        {Platform.OS === "ios" && (
          <Button
            label="Done"
            variant="secondary"
            fullWidth
            onPress={() => setOpenPicker(null)}
          />
        )}
      </View>
    ) : null;

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
                if (type !== "diaper") {
                  setDiaperStatus(null);
                  setUseFromStock(false);
                } else {
                  // On by default — logging a diaper change almost always
                  // means one came out of stock; a caregiver without stock
                  // to draw from unchecks it rather than opting in each time.
                  setUseFromStock(true);
                }
              }}
            />
          ))}
        </ChipWrap>
      </Field>

      {takesMl && (
        <>
          <Field
            label="Side"
            helper="Optional — add a side to make this a timed session, with or without an amount."
          >
            <View style={styles.sideRow}>
              {(["left", "right"] as const).map((s) => {
                const selected = side === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setSide(selected ? null : s)}
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
            helper={
              side
                ? activityType === "feed"
                  ? "Optional — a bottle top-up amount, if there was one."
                  : "Optional — how much came out, if you know it."
                : undefined
            }
            suffix={units.volume}
            value={amount}
            onChangeText={setAmount}
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

      {isDiaper && (
        <View
          style={[
            styles.stockBox,
            { backgroundColor: t.accentSofter, borderColor: t.border },
          ]}
        >
          <View style={styles.stockHead}>
            <Text variant="caption" tone="muted">
              Diaper stock
            </Text>
            <Text variant="subheadStrong" tabular>
              {diaperStock == null
                ? "—"
                : diaperStock > 0
                  ? `${diaperStock} left`
                  : "Out of stock"}
            </Text>
          </View>

          {/* Always toggleable, even with zero on hand — a caregiver can
              still check it while, say, entering a restock and a change in
              the same visit, and the server simply floors the count at zero
              rather than treating a negative draw as an error. */}
          <Pressable
            onPress={() => setUseFromStock((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: useFromStock }}
            accessibilityLabel="Use one from stock for this change"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={({ pressed }) => [
              styles.stockCheckRow,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <View
              style={[
                styles.checkbox,
                {
                  backgroundColor: useFromStock ? t.success : "transparent",
                  borderColor: useFromStock ? t.success : t.borderStrong,
                },
              ]}
            >
              {useFromStock && (
                <Icon name="check" size="xs" color={t.textInverse} strokeWidth={3} />
              )}
            </View>
            <Text variant="subhead">Use one from stock for this change</Text>
          </Pressable>

          <View style={styles.restockRow}>
            <Input
              label="Add to stock"
              helper="A new pack arrived — this doesn't create a log entry."
              keyboardType="number-pad"
              value={restockAmount}
              onChangeText={setRestockAmount}
              placeholder="e.g. 50"
              containerStyle={styles.flex}
            />
            <Button
              label="Add"
              variant="secondary"
              size="sm"
              loading={restocking}
              disabled={!restockValid}
              onPress={handleRestock}
            />
          </View>
        </View>
      )}

      {dateField("Date", formatDateDisplay(date))}
      {datePicker(date, setDate)}

      {isInstant ? (
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

      {/* The resulting length, stated plainly. Picking 2:00 AM to 9:24 PM is
          easy to do by accident on a wheel, and a nineteen-hour nap saved in
          silence is only discovered later, in the averages. */}
      {!isInstant && (
        <View style={styles.durationRow}>
          <Text variant="footnote" tone="subtle">
            That's{" "}
            <Text variant="footnote" style={{ color: t.accentText }}>
              {formatDuration(spanMinutes)}
            </Text>
            {crossesMidnight ? " (ends next day)" : ""}
          </Text>
          {implausible && (
            <Text variant="footnote" style={{ color: t.warning }}>
              That's unusually long — check the start and end.
            </Text>
          )}
        </View>
      )}

      <Input
        label="Notes"
        value={comments}
        onChangeText={setComments}
        placeholder="Optional"
      />

      {blockedReason && (
        <Text variant="footnote" style={{ color: t.warning }}>
          {blockedReason}
        </Text>
      )}
    </Sheet>
  );
}

/**
 * Memoized because Home re-renders every second while any timer runs, and
 * each of those re-renders reached the native date/time pickers here — on a
 * phone mid-interaction, a controlled picker being re-rendered under the
 * user's finger is how a freshly spun time snaps back before their eyes.
 * With stable props (Home's callbacks are useCallback'd), a ticking clock
 * elsewhere on the screen no longer touches this sheet at all.
 */
export default React.memo(ManualEntryModal);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  actions: { flexDirection: "row", gap: space.sm },
  rowGap: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  pickerWrap: { gap: space.sm },
  durationRow: { gap: space.xxs },
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
  stockBox: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    gap: space.md,
  },
  stockHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stockCheckRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.md,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  restockRow: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
});
