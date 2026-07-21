import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useTheme } from "../theme";
import { formatTimer } from "../utils/formatTime";
import { useTimer, ActivityType } from "../hooks/useTimer";
import { createLog } from "../api/logs";
import { isInstantLog } from "../lib/activities";
import { useToast } from "./Toast";
import { useUnits } from "../context/SettingsContext";

const ACTIVITY_CONFIG: Record<
  ActivityType,
  {
    label: string;
    icon: string;
    hasSide: boolean;
    hasTimer: boolean;
    /** Offers a "how many ml?" instant log alongside the timer. */
    hasMl: boolean;
    /** Label for the ml button. */
    mlLabel?: string;
  }
> = {
  pump: { label: "Pump", icon: "🍼", hasSide: true, hasTimer: true, hasMl: true, mlLabel: "Amount" },
  feed: { label: "Feed", icon: "🤱", hasSide: true, hasTimer: true, hasMl: true, mlLabel: "Bottle" },
  sleep: { label: "Sleep", icon: "😴", hasSide: false, hasTimer: true, hasMl: false },
  diaper: { label: "Diaper", icon: "🩲", hasSide: false, hasTimer: false, hasMl: false },
  shower: { label: "Shower", icon: "🚿", hasSide: false, hasTimer: false, hasMl: false },
  vitamin: { label: "Vitamin", icon: "💊", hasSide: false, hasTimer: false, hasMl: false },
  nailcut: { label: "Nail Cut", icon: "💅", hasSide: false, hasTimer: false, hasMl: false },
};

const DIAPER_OPTIONS = [
  { value: "empty", icon: "✅", label: "Empty" },
  { value: "wet", icon: "💧", label: "Wet" },
  { value: "dirty", icon: "💩", label: "Dirty" },
  { value: "wet_and_dirty", icon: "💧💩", label: "Wet & Dirty" },
];

interface Props {
  type: ActivityType;
  babyId: number;
  babyName: string;
  enteredByName: string;
  onLogSaved: () => void;
}

export default function ActivityTimerCard({
  type,
  babyId,
  babyName,
  enteredByName,
  onLogSaved,
}: Props) {
  const theme = useTheme();
  const toast = useToast();
  const units = useUnits();
  const config = ACTIVITY_CONFIG[type];

  const timer = useTimer(type, babyId);
  const [diaperStatus, setDiaperStatus] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [showMlPrompt, setShowMlPrompt] = useState(false);
  const [amountMl, setAmountMl] = useState("");

  // The box is in the caregiver's chosen unit; storage is always ml.
  const ml = units.parseVolume(amountMl);
  const canSaveMl = !isNaN(ml) && ml > 0;

  const handleDiaperStatus = useCallback(
    (status: string) => {
      setDiaperStatus(status);
      timer.handleDiaperStatusSelect(status);
    },
    [timer]
  );

  const resetLocal = useCallback(() => {
    setComment("");
    setDiaperStatus(null);
    setShowMlPrompt(false);
    setAmountMl("");
  }, []);

  const handleCancel = useCallback(() => {
    resetLocal();
    timer.handleCancel();
  }, [resetLocal, timer]);

  const handleSave = useCallback(async () => {
    const start = timer.getOriginalStartTime() || timer.startTime;
    const end = timer.getEndTime() || new Date();
    if (!start) return;

    const timeline = timer.getTimeline();

    setSaving(true);
    try {
      await createLog({
        babyId,
        type,
        side: timer.activeSide,
        diaperStatus: type === "diaper" ? diaperStatus : null,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        comments: comment.trim() || null,
        enteredByName,
        pauseTimeline: timeline.length > 0 ? timeline : null,
      });
      onLogSaved();
    } catch (err) {
      toast.showError(err);
      return;
    } finally {
      setSaving(false);
    }

    resetLocal();
    timer.handleCancel();
  }, [
    babyId,
    type,
    timer,
    diaperStatus,
    comment,
    enteredByName,
    onLogSaved,
    resetLocal,
  ]);

  // A bottle feed / pumped amount is an instant log measured in ml: no side, no
  // timer. Tapping opens the "How many ml?" prompt.
  const handleOpenMl = useCallback(() => {
    setAmountMl("");
    setShowMlPrompt(true);
    timer.markInstant();
  }, [timer]);

  const handleSaveMl = useCallback(async () => {
    if (saving || !canSaveMl) return;
    const now = timer.getOriginalStartTime() ?? new Date();
    setSaving(true);
    try {
      await createLog({
        babyId,
        type,
        side: null,
        amountMl: ml,
        startTime: now.toISOString(),
        endTime: now.toISOString(),
        comments: null,
        enteredByName,
      });
      onLogSaved();
    } catch (err) {
      toast.showError(err);
      return;
    } finally {
      setSaving(false);
    }
    resetLocal();
    timer.handleCancel();
  }, [
    saving,
    canSaveMl,
    ml,
    babyId,
    type,
    enteredByName,
    onLogSaved,
    resetLocal,
    timer,
  ]);

  // One-tap logs with no follow-up form: shower / vitamin / nail cut.
  const handleInstantTap = useCallback(async () => {
    if (saving) return;
    const now = new Date();
    setSaving(true);
    try {
      await createLog({
        babyId,
        type,
        startTime: now.toISOString(),
        endTime: now.toISOString(),
        enteredByName,
      });
      onLogSaved();
    } catch (err) {
      toast.showError(err);
    } finally {
      setSaving(false);
    }
  }, [saving, babyId, type, enteredByName, onLogSaved]);

  const s = StyleSheet.create({
    card: {
      backgroundColor: "#fff",
      borderRadius: 20,
      padding: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    heading: {
      fontSize: 13,
      fontWeight: "700",
      color: "#888",
      textAlign: "center",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    babyLabel: {
      fontSize: 11,
      color: theme.primary,
      textAlign: "center",
      marginBottom: 8,
      fontWeight: "600",
    },
    elapsedPill: {
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 5,
      alignSelf: "center",
      marginBottom: 8,
    },
    elapsedText: {
      fontSize: 15,
      fontWeight: "700",
      color: "#fff",
    },
    adjustRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginBottom: 10,
    },
    adjustBtn: {
      borderWidth: 1,
      borderColor: theme.primaryLight,
      backgroundColor: theme.primaryLighter,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    adjustText: { fontSize: 12, fontWeight: "700", color: theme.pillText },
    adjustHint: { fontSize: 11, fontWeight: "500", color: "#bbb" },
    sideRow: { flexDirection: "row", gap: 10 },
    sideBtn: {
      flex: 1,
      borderWidth: 2,
      borderColor: theme.primaryLight,
      backgroundColor: theme.primaryLighter,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: "center",
    },
    sideEmoji: { fontSize: 26 },
    sideLetter: {
      fontSize: 12,
      fontWeight: "700",
      color: theme.pillText,
      marginTop: 2,
    },
    mlBtn: {
      marginTop: 10,
      borderWidth: 2,
      borderColor: theme.primaryLight,
      backgroundColor: theme.primaryLighter,
      borderRadius: 14,
      paddingVertical: 13,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    mlBtnText: { fontSize: 13, fontWeight: "700", color: theme.pillText },
    controlRow: { flexDirection: "row", gap: 10 },
    pauseBtn: {
      flex: 1,
      borderWidth: 2,
      borderColor: "#fcd34d",
      backgroundColor: "#fffbeb",
      borderRadius: 14,
      paddingVertical: 12,
      alignItems: "center",
    },
    pauseText: { fontSize: 13, fontWeight: "700", color: "#d97706" },
    resumeBtn: {
      flex: 1,
      borderWidth: 2,
      borderColor: "#86efac",
      backgroundColor: "#f0fdf4",
      borderRadius: 14,
      paddingVertical: 12,
      alignItems: "center",
    },
    resumeText: { fontSize: 13, fontWeight: "700", color: "#16a34a" },
    stopBtn: {
      flex: 1,
      borderWidth: 2,
      borderColor: "#fca5a5",
      backgroundColor: "#fef2f2",
      borderRadius: 14,
      paddingVertical: 12,
      alignItems: "center",
    },
    stopText: { fontSize: 13, fontWeight: "700", color: "#dc2626" },
    startBtn: {
      borderWidth: 2,
      borderColor: theme.primaryLight,
      backgroundColor: theme.primaryLighter,
      borderRadius: 14,
      paddingVertical: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    startText: { fontSize: 15, fontWeight: "700", color: theme.pillText },
    input: {
      borderWidth: 2,
      borderColor: theme.primaryLight,
      backgroundColor: theme.primaryLighter,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      color: "#333",
      marginBottom: 10,
    },
    prompt: {
      textAlign: "center",
      fontSize: 13,
      color: "#aaa",
      marginBottom: 12,
    },
    actionRow: { flexDirection: "row", gap: 10 },
    cancelBtn: {
      flex: 1,
      borderWidth: 1,
      borderColor: "#e5e5e5",
      borderRadius: 14,
      paddingVertical: 11,
      alignItems: "center",
    },
    cancelText: { fontSize: 14, fontWeight: "600", color: "#aaa" },
    saveBtn: {
      flex: 1,
      backgroundColor: theme.primary,
      borderRadius: 14,
      paddingVertical: 11,
      alignItems: "center",
    },
    saveText: { fontSize: 14, fontWeight: "700", color: "#fff" },
    diaperGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    diaperOption: {
      width: "47%",
      borderWidth: 2,
      borderColor: theme.primaryLight,
      backgroundColor: theme.primaryLighter,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
      gap: 4,
    },
    diaperEmoji: { fontSize: 22 },
    diaperLabel: { fontSize: 12, fontWeight: "700", color: theme.pillText },
    topRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
  });

  // ±5m quick-adjust for the running/paused timer, so a late tap can backdate
  // the start (or correct an overshoot). "+5m" pushes the start 5 min earlier
  // (more elapsed); "−5m" pulls it later, disabled near zero.
  const startAdjuster = (
    <View style={s.adjustRow}>
      <TouchableOpacity
        style={[s.adjustBtn, timer.elapsed < 300 && { opacity: 0.4 }]}
        onPress={() => timer.adjustStart(-300)}
        disabled={timer.elapsed < 300}
        activeOpacity={0.7}
        accessibilityLabel="Remove 5 minutes from the start"
      >
        <Text style={s.adjustText}>−5m</Text>
      </TouchableOpacity>
      <Text style={s.adjustHint}>adjust start</Text>
      <TouchableOpacity
        style={s.adjustBtn}
        onPress={() => timer.adjustStart(300)}
        activeOpacity={0.7}
        accessibilityLabel="Add 5 minutes to the start"
      >
        <Text style={s.adjustText}>+5m</Text>
      </TouchableOpacity>
    </View>
  );

  // --- "How many ml?" prompt ---
  if (showMlPrompt) {
    return (
      <View style={s.card}>
        <View style={s.topRow}>
          <Text style={s.heading}>
            {config.icon} {config.label}
          </Text>
          <TouchableOpacity onPress={handleCancel}>
            <Text style={{ color: "#aaa", fontSize: 12 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.babyLabel}>Logging for: {babyName}</Text>
        <Text style={s.prompt}>How many {units.volume}?</Text>
        <TextInput
          style={s.input}
          value={amountMl}
          onChangeText={setAmountMl}
          placeholder={units.system === "metric" ? "e.g. 120" : "e.g. 4"}
          placeholderTextColor="#ccc"
          keyboardType="decimal-pad"
          autoFocus
        />
        <View style={s.actionRow}>
          <TouchableOpacity style={s.cancelBtn} onPress={handleCancel} activeOpacity={0.8}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.saveBtn, (saving || !canSaveMl) && { opacity: 0.5 }]}
            onPress={handleSaveMl}
            disabled={saving || !canSaveMl}
            activeOpacity={0.8}
          >
            <Text style={s.saveText}>{saving ? "Saving..." : "Save"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // --- Diaper status picker view ---
  if (timer.showDiaperStatus) {
    return (
      <View style={s.card}>
        <View style={s.topRow}>
          <Text style={s.heading}>
            {config.icon} {config.label}
          </Text>
          <TouchableOpacity onPress={handleCancel}>
            <Text style={{ color: "#aaa", fontSize: 12 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.babyLabel}>Logging for: {babyName}</Text>
        <Text style={s.prompt}>What&apos;s the status?</Text>
        <View style={s.diaperGrid}>
          {DIAPER_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={s.diaperOption}
              onPress={() => handleDiaperStatus(opt.value)}
              activeOpacity={0.7}
            >
              <Text style={s.diaperEmoji}>{opt.icon}</Text>
              <Text style={s.diaperLabel}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  // --- Comment / save view ---
  if (timer.showComment) {
    const foundDiaper = DIAPER_OPTIONS.find((o) => o.value === diaperStatus);
    // An instant log is a moment, not a span — an elapsed pill would read 00:00.
    const instant = isInstantLog(type, { side: timer.activeSide });
    return (
      <View style={s.card}>
        <View style={s.topRow}>
          <Text style={s.heading}>
            {config.icon} {config.label}
            {timer.activeSide ? ` (${timer.activeSide === "left" ? "L" : "R"})` : ""}
            {foundDiaper ? ` — ${foundDiaper.label}` : ""}
          </Text>
          {!instant && (
            <View
              style={[
                s.elapsedPill,
                {
                  backgroundColor: theme.primary,
                  marginBottom: 0,
                  paddingVertical: 3,
                  paddingHorizontal: 10,
                },
              ]}
            >
              <Text style={s.elapsedText}>{formatTimer(timer.elapsed)}</Text>
            </View>
          )}
        </View>
        <Text style={s.babyLabel}>Logging for: {babyName}</Text>
        <TextInput
          style={s.input}
          value={comment}
          onChangeText={setComment}
          placeholder="Add a note (optional)"
          placeholderTextColor="#ccc"
        />
        <View style={s.actionRow}>
          <TouchableOpacity style={s.cancelBtn} onPress={handleCancel} activeOpacity={0.8}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            <Text style={s.saveText}>{saving ? "Saving..." : "Save"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // --- Timer with sides (feed / pump) ---
  if (config.hasSide) {
    return (
      <View style={s.card}>
        <Text style={s.heading}>
          {config.icon} {config.label}
        </Text>
        <Text style={s.babyLabel}>Logging for: {babyName}</Text>
        {timer.isActive && (
          <>
            <View
              style={[
                s.elapsedPill,
                { backgroundColor: timer.paused ? "#f59e0b" : theme.primary },
              ]}
            >
              <Text style={s.elapsedText}>
                {formatTimer(timer.elapsed)} —{" "}
                {timer.activeSide === "left" ? "L" : "R"}
                {timer.paused ? " (paused)" : ""}
              </Text>
            </View>
            {startAdjuster}
          </>
        )}
        {timer.isActive ? (
          <View style={s.controlRow}>
            {timer.paused ? (
              <TouchableOpacity style={s.resumeBtn} onPress={timer.handleResume} activeOpacity={0.8}>
                <Text style={s.resumeText}>▶ Resume</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.pauseBtn} onPress={timer.handlePause} activeOpacity={0.8}>
                <Text style={s.pauseText}>⏸ Pause</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.stopBtn} onPress={timer.handleStop} activeOpacity={0.8}>
              <Text style={s.stopText}>⏹ Stop</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={s.sideRow}>
              <TouchableOpacity
                style={s.sideBtn}
                onPress={() => timer.handleStart("left")}
                activeOpacity={0.7}
              >
                <Text style={s.sideEmoji}>🫲</Text>
                <Text style={s.sideLetter}>L</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.sideBtn}
                onPress={() => timer.handleStart("right")}
                activeOpacity={0.7}
              >
                <Text style={s.sideEmoji}>🫱</Text>
                <Text style={s.sideLetter}>R</Text>
              </TouchableOpacity>
            </View>
            {config.hasMl && (
              <TouchableOpacity style={s.mlBtn} onPress={handleOpenMl} activeOpacity={0.7}>
                <Text style={{ fontSize: 20 }}>🍼</Text>
                <Text style={s.mlBtnText}>{config.mlLabel}</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    );
  }

  // --- Diaper: instant, with a status picker ---
  if (type === "diaper") {
    return (
      <View style={s.card}>
        <Text style={s.babyLabel}>Logging for: {babyName}</Text>
        <TouchableOpacity style={s.startBtn} onPress={timer.openDiaperStatus} activeOpacity={0.7}>
          <Text style={{ fontSize: 26 }}>{config.icon}</Text>
          <Text style={s.startText}>{config.label}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- Instant one-tap logs (shower / vitamin / nail cut) ---
  if (!config.hasTimer) {
    return (
      <View style={s.card}>
        <Text style={s.babyLabel}>Logging for: {babyName}</Text>
        <TouchableOpacity
          style={[s.startBtn, saving && { opacity: 0.6 }]}
          onPress={handleInstantTap}
          disabled={saving}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 26 }}>{config.icon}</Text>
          <Text style={s.startText}>{saving ? "Saving..." : config.label}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- Regular timer (sleep) ---
  return (
    <View style={s.card}>
      <Text style={s.heading}>
        {config.icon} {config.label}
      </Text>
      <Text style={s.babyLabel}>Logging for: {babyName}</Text>
      {timer.isActive && (
        <>
          <View
            style={[
              s.elapsedPill,
              { backgroundColor: timer.paused ? "#f59e0b" : theme.primary },
            ]}
          >
            <Text style={s.elapsedText}>
              {formatTimer(timer.elapsed)}
              {timer.paused ? " (paused)" : ""}
            </Text>
          </View>
          {startAdjuster}
        </>
      )}
      {timer.isActive ? (
        <View style={s.controlRow}>
          {timer.paused ? (
            <TouchableOpacity style={s.resumeBtn} onPress={timer.handleResume} activeOpacity={0.8}>
              <Text style={s.resumeText}>▶ Resume</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.pauseBtn} onPress={timer.handlePause} activeOpacity={0.8}>
              <Text style={s.pauseText}>⏸ Pause</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.stopBtn} onPress={timer.handleStop} activeOpacity={0.8}>
            <Text style={s.stopText}>⏹ Stop</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={s.startBtn} onPress={() => timer.handleStart()} activeOpacity={0.7}>
          <Text style={{ fontSize: 26 }}>{config.icon}</Text>
          <Text style={s.startText}>{config.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
