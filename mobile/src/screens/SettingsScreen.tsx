import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme, THEME_PRESETS, isValidHexColor } from "../theme";
import { useAuth } from "../context/AuthContext";
import { useBaby } from "../context/BabyContext";
import { useSettings } from "../context/SettingsContext";
import { useToast } from "../components/Toast";
import { usePushRegistration } from "../hooks/usePushRegistration";
import DeleteConfirmModal from "../components/DeleteConfirmModal";
import {
  getMembers,
  addMember,
  removeMember,
  cancelInvite,
  type BabyMember,
  type PendingInvite,
} from "../api/members";
import {
  getReminders,
  createReminder,
  updateReminder,
  deleteReminder,
  formatInterval,
  REMINDER_TYPES,
  REMINDER_META,
  type Reminder,
  type ReminderType,
} from "../api/reminders";
import { updateBaby } from "../api/babies";
import type { UnitSystem } from "../api/settings";
import { getErrorMessage } from "../lib/errors";

const AVATAR_EMOJIS = [
  "👶", "🐣", "🐻", "🐰", "🦊", "🐨", "🦁", "🐼",
  "🌸", "⭐", "🌙", "🍼",
];

interface PendingRemoval {
  kind: "member" | "invite";
  id: number;
  label: string;
}

export default function SettingsScreen() {
  const theme = useTheme();
  const toast = useToast();
  const { account, signOut, setAccount } = useAuth();
  const { activeBaby, refreshBabies } = useBaby();
  const {
    unitSystem,
    themeColor,
    notificationsEnabled,
    save,
    refresh: refreshSettings,
  } = useSettings();
  const push = usePushRegistration();

  const [members, setMembers] = useState<BabyMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);

  // New-reminder form
  const [newType, setNewType] = useState<ReminderType>("feed");
  const [newLabel, setNewLabel] = useState("");
  const [newHours, setNewHours] = useState("3");
  const [newMinutes, setNewMinutes] = useState("0");
  const [addingReminder, setAddingReminder] = useState(false);

  const [customColor, setCustomColor] = useState(themeColor ?? "");
  const [savingField, setSavingField] = useState<string | null>(null);

  const isOwner = activeBaby ? activeBaby.role === "owner" : false;

  const load = useCallback(async () => {
    if (!activeBaby) {
      setLoading(false);
      return;
    }
    try {
      const [membersRes, remindersRes] = await Promise.all([
        getMembers(activeBaby.id),
        getReminders(activeBaby.id),
      ]);
      setMembers(membersRes.members);
      setInvites(membersRes.pendingInvites);
      setReminders(remindersRes);
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
    await Promise.all([load(), refreshSettings()]);
    setRefreshing(false);
  }, [load, refreshSettings]);

  // --- Caregivers ---

  const handleInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) {
      toast.error("Enter an email address first.");
      return;
    }
    if (!activeBaby) return;
    setInviting(true);
    try {
      const result = await addMember(activeBaby.id, email);
      toast.success(result.message);
      setInviteEmail("");
      await load();
    } catch (err) {
      toast.showError(err);
    } finally {
      setInviting(false);
    }
  };

  const confirmRemoval = async () => {
    if (!pendingRemoval || !activeBaby) return;
    const target = pendingRemoval;
    setPendingRemoval(null);
    try {
      if (target.kind === "member") {
        await removeMember(activeBaby.id, target.id);
        toast.success(`${target.label} no longer has access.`);
        // Removing yourself means losing the baby entirely.
        if (target.id === account?.id) {
          await refreshBabies();
          return;
        }
      } else {
        await cancelInvite(activeBaby.id, target.id);
        toast.success(`Invitation to ${target.label} withdrawn.`);
      }
      await load();
    } catch (err) {
      toast.showError(err);
    }
  };

  // --- Reminders ---

  const handleAddReminder = async () => {
    if (!activeBaby) return;
    const hours = parseInt(newHours || "0", 10);
    const minutes = parseInt(newMinutes || "0", 10);
    if (isNaN(hours) || isNaN(minutes) || hours * 60 + minutes < 5) {
      toast.error("Choose an interval of at least 5 minutes.");
      return;
    }
    if (newType === "custom" && !newLabel.trim()) {
      toast.error("Give your custom reminder a name.");
      return;
    }
    setAddingReminder(true);
    try {
      const created = await createReminder({
        babyId: activeBaby.id,
        type: newType,
        label: newLabel.trim() || null,
        hours,
        minutes,
      });
      setReminders((prev) => [...prev, created]);
      setNewLabel("");
      toast.success(
        `You'll be reminded every ${formatInterval(created.intervalMinutes)}.`
      );
    } catch (err) {
      toast.showError(err);
    } finally {
      setAddingReminder(false);
    }
  };

  const handleToggleReminder = async (reminder: Reminder) => {
    // Flip immediately so the switch feels instant, then put it back if the
    // server disagrees.
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

  const handleDeleteReminder = async (reminder: Reminder) => {
    const previous = reminders;
    setReminders((prev) => prev.filter((r) => r.id !== reminder.id));
    try {
      await deleteReminder(reminder.id);
      toast.success("Reminder removed.");
    } catch (err) {
      setReminders(previous);
      toast.showError(err);
    }
  };

  // --- Preferences ---

  const handleUnitChange = async (system: UnitSystem) => {
    if (system === unitSystem) return;
    setSavingField("units");
    try {
      await save({ unitSystem: system });
      toast.success(
        system === "metric"
          ? "Now showing kg, cm, ml and °C."
          : "Now showing lb, in, fl oz and °F."
      );
    } catch (err) {
      toast.showError(err);
    } finally {
      setSavingField(null);
    }
  };

  const handleThemeChange = async (color: string | null) => {
    setSavingField("theme");
    try {
      const updated = await save({ themeColor: color });
      if (account) setAccount({ ...account, themeColor: updated.themeColor });
      toast.success(color ? "Colour updated." : "Back to the default colour.");
    } catch (err) {
      toast.showError(err);
    } finally {
      setSavingField(null);
    }
  };

  const handleCustomColor = async () => {
    const value = customColor.trim().startsWith("#")
      ? customColor.trim()
      : `#${customColor.trim()}`;
    if (!isValidHexColor(value)) {
      toast.error("Enter a colour like #ff6b95.");
      return;
    }
    await handleThemeChange(value.toLowerCase());
  };

  const handleNotificationsToggle = async (value: boolean) => {
    try {
      await save({ notificationsEnabled: value });
      toast.success(
        value ? "Reminders switched on." : "All reminders paused."
      );
    } catch (err) {
      toast.showError(err);
    }
  };

  // --- Baby appearance ---

  const handleBabyAvatar = async (patch: {
    avatarEmoji?: string | null;
    avatarColor?: string | null;
  }) => {
    if (!activeBaby) return;
    setSavingField("avatar");
    try {
      await updateBaby(activeBaby.id, patch);
      await refreshBabies();
      toast.success(`${activeBaby.name}'s look updated.`);
    } catch (err) {
      toast.showError(err);
    } finally {
      setSavingField(null);
    }
  };

  const availableTypes = useMemo(() => {
    const used = new Set(
      reminders.filter((r) => r.type !== "custom").map((r) => r.type)
    );
    return REMINDER_TYPES.filter((t) => t.value === "custom" || !used.has(t.value));
  }, [reminders]);

  useEffect(() => {
    // The previously selected type may have just been used up.
    if (!availableTypes.some((t) => t.value === newType)) {
      setNewType(availableTypes[0]?.value ?? "custom");
    }
  }, [availableTypes, newType]);

  const s = makeStyles(theme);

  if (!activeBaby) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: theme.background }]}>
        <View style={s.center}>
          <Text style={s.emptyEmoji}>⚙️</Text>
          <Text style={s.emptyText}>Add a baby first to manage settings.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
          />
        }
      >
        <Text style={s.title}>Settings</Text>
        <Text style={s.subtitle}>
          {account?.name} · {account?.email}
        </Text>

        {loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* ---------- Caregivers ---------- */}
            <Section title="Caregivers" icon="👨‍👩‍👧">
              <Text style={s.hint}>
                Everyone here can see and add entries for {activeBaby.name}.
              </Text>

              <View style={s.inviteRow}>
                <TextInput
                  style={[s.input, s.inviteInput]}
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  placeholder="family@email.com"
                  placeholderTextColor="#ccc"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                  onSubmitEditing={handleInvite}
                />
                <TouchableOpacity
                  style={[s.primaryBtn, inviting && s.disabled]}
                  onPress={handleInvite}
                  disabled={inviting}
                  activeOpacity={0.8}
                >
                  <Text style={s.primaryBtnText}>
                    {inviting ? "…" : "Add"}
                  </Text>
                </TouchableOpacity>
              </View>

              {members.map((m) => (
                <View key={`m-${m.id}`} style={s.row}>
                  <View style={[s.avatar, { backgroundColor: theme.primaryLight }]}>
                    <Text style={[s.avatarText, { color: theme.pillText }]}>
                      {m.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={s.rowBody}>
                    <Text style={s.rowTitle}>
                      {m.name}
                      {m.isYou ? " (you)" : ""}
                    </Text>
                    <Text style={s.rowSub}>{m.email}</Text>
                  </View>
                  {m.role === "owner" ? (
                    <View style={[s.tag, { backgroundColor: theme.primaryLight }]}>
                      <Text style={[s.tagText, { color: theme.pillText }]}>
                        Owner
                      </Text>
                    </View>
                  ) : (isOwner || m.isYou) ? (
                    <TouchableOpacity
                      onPress={() =>
                        setPendingRemoval({
                          kind: "member",
                          id: m.accountId,
                          label: m.isYou ? "You" : m.name,
                        })
                      }
                      activeOpacity={0.7}
                      style={s.removeBtn}
                    >
                      <Text style={s.removeText}>
                        {m.isYou ? "Leave" : "Remove"}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}

              {invites.map((i) => (
                <View key={`i-${i.id}`} style={s.row}>
                  <View style={[s.avatar, s.avatarPending]}>
                    <Text style={s.avatarPendingText}>✉️</Text>
                  </View>
                  <View style={s.rowBody}>
                    <Text style={s.rowTitle}>{i.email}</Text>
                    <Text style={s.rowSub}>
                      Waiting for them to sign up with this email
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() =>
                      setPendingRemoval({
                        kind: "invite",
                        id: i.id,
                        label: i.email,
                      })
                    }
                    activeOpacity={0.7}
                    style={s.removeBtn}
                  >
                    <Text style={s.removeText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </Section>

            {/* ---------- Reminders ---------- */}
            <Section title="Reminders" icon="⏰">
              <View style={s.switchRow}>
                <View style={s.rowBody}>
                  <Text style={s.rowTitle}>Notifications</Text>
                  <Text style={s.rowSub}>
                    {push && push.status !== "granted"
                      ? push.message
                      : "Reminders are sent to this device."}
                  </Text>
                </View>
                <Switch
                  value={notificationsEnabled}
                  onValueChange={handleNotificationsToggle}
                  trackColor={{ true: theme.primary, false: "#e5e5e5" }}
                  thumbColor="#fff"
                />
              </View>

              {reminders.length === 0 && (
                <Text style={s.hint}>
                  No reminders yet. Add one below and we'll nudge you when it's
                  been too long.
                </Text>
              )}

              {reminders.map((r) => {
                const meta = REMINDER_META.get(r.type);
                return (
                  <View key={r.id} style={s.row}>
                    <View style={[s.avatar, { backgroundColor: theme.primaryLighter }]}>
                      <Text style={s.avatarEmoji}>{meta?.icon ?? "⏰"}</Text>
                    </View>
                    <View style={s.rowBody}>
                      <Text style={s.rowTitle}>
                        {r.label || meta?.label || r.type}
                      </Text>
                      <Text style={s.rowSub}>
                        Every {formatInterval(r.intervalMinutes)}
                        {meta?.watchesActivity ? " since the last one" : ""}
                      </Text>
                    </View>
                    <Switch
                      value={r.enabled}
                      onValueChange={() => handleToggleReminder(r)}
                      trackColor={{ true: theme.primary, false: "#e5e5e5" }}
                      thumbColor="#fff"
                    />
                    <TouchableOpacity
                      onPress={() => handleDeleteReminder(r)}
                      activeOpacity={0.7}
                      style={s.deleteIcon}
                    >
                      <Text style={s.deleteIconText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}

              <View style={s.divider} />
              <Text style={s.fieldLabel}>REMIND ME TO…</Text>
              <View style={s.pillWrap}>
                {availableTypes.map((t) => {
                  const selected = newType === t.value;
                  return (
                    <TouchableOpacity
                      key={t.value}
                      style={[
                        s.pill,
                        {
                          backgroundColor: selected
                            ? theme.primary
                            : theme.primaryLighter,
                        },
                      ]}
                      onPress={() => setNewType(t.value)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          s.pillText,
                          { color: selected ? "#fff" : theme.pillText },
                        ]}
                      >
                        {t.icon} {t.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {newType === "custom" && (
                <TextInput
                  style={s.input}
                  value={newLabel}
                  onChangeText={setNewLabel}
                  placeholder="What should we call it?"
                  placeholderTextColor="#ccc"
                />
              )}

              <Text style={s.fieldLabel}>EVERY</Text>
              <View style={s.intervalRow}>
                <TextInput
                  style={[s.input, s.intervalInput]}
                  value={newHours}
                  onChangeText={setNewHours}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor="#ccc"
                />
                <Text style={s.intervalUnit}>hours</Text>
                <TextInput
                  style={[s.input, s.intervalInput]}
                  value={newMinutes}
                  onChangeText={setNewMinutes}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor="#ccc"
                />
                <Text style={s.intervalUnit}>mins</Text>
              </View>

              <TouchableOpacity
                style={[s.wideBtn, addingReminder && s.disabled]}
                onPress={handleAddReminder}
                disabled={addingReminder}
                activeOpacity={0.8}
              >
                <Text style={s.wideBtnText}>
                  {addingReminder ? "Adding…" : "Add reminder"}
                </Text>
              </TouchableOpacity>
            </Section>

            {/* ---------- Units ---------- */}
            <Section title="Units" icon="📐">
              <View style={s.segmented}>
                {(["metric", "imperial"] as const).map((system) => {
                  const selected = unitSystem === system;
                  return (
                    <TouchableOpacity
                      key={system}
                      style={[
                        s.segment,
                        selected && { backgroundColor: theme.primary },
                      ]}
                      onPress={() => handleUnitChange(system)}
                      disabled={savingField === "units"}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          s.segmentText,
                          { color: selected ? "#fff" : theme.pillText },
                        ]}
                      >
                        {system === "metric" ? "Metric" : "Imperial"}
                      </Text>
                      <Text
                        style={[
                          s.segmentSub,
                          { color: selected ? "rgba(255,255,255,0.85)" : "#aaa" },
                        ]}
                      >
                        {system === "metric"
                          ? "kg · cm · ml · °C"
                          : "lb · in · fl oz · °F"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Section>

            {/* ---------- Appearance ---------- */}
            <Section title="Appearance" icon="🎨">
              <Text style={s.fieldLabel}>YOUR ACCENT COLOUR</Text>
              <View style={s.swatchWrap}>
                <TouchableOpacity
                  style={[
                    s.swatch,
                    s.swatchDefault,
                    !themeColor && s.swatchSelected,
                  ]}
                  onPress={() => handleThemeChange(null)}
                  activeOpacity={0.8}
                >
                  <Text style={s.swatchDefaultText}>Auto</Text>
                </TouchableOpacity>
                {THEME_PRESETS.map((preset) => (
                  <TouchableOpacity
                    key={preset.color}
                    style={[
                      s.swatch,
                      { backgroundColor: preset.color },
                      themeColor?.toLowerCase() === preset.color &&
                        s.swatchSelected,
                    ]}
                    onPress={() => handleThemeChange(preset.color)}
                    activeOpacity={0.8}
                    accessibilityLabel={preset.label}
                  >
                    {themeColor?.toLowerCase() === preset.color && (
                      <Text style={s.swatchCheck}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              <View style={s.inviteRow}>
                <TextInput
                  style={[s.input, s.inviteInput]}
                  value={customColor}
                  onChangeText={setCustomColor}
                  placeholder="#ff6b95"
                  placeholderTextColor="#ccc"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={[s.primaryBtn, savingField === "theme" && s.disabled]}
                  onPress={handleCustomColor}
                  disabled={savingField === "theme"}
                  activeOpacity={0.8}
                >
                  <Text style={s.primaryBtnText}>Use</Text>
                </TouchableOpacity>
              </View>

              <View style={s.divider} />

              <Text style={s.fieldLabel}>{activeBaby.name.toUpperCase()}'S ICON</Text>
              <View style={s.pillWrap}>
                {AVATAR_EMOJIS.map((emoji) => {
                  const selected = activeBaby.avatarEmoji === emoji;
                  return (
                    <TouchableOpacity
                      key={emoji}
                      style={[
                        s.emojiTile,
                        {
                          backgroundColor: selected
                            ? theme.primaryLight
                            : theme.primaryLighter,
                          borderColor: selected ? theme.primary : "transparent",
                        },
                      ]}
                      onPress={() => handleBabyAvatar({ avatarEmoji: emoji })}
                      disabled={savingField === "avatar"}
                      activeOpacity={0.7}
                    >
                      <Text style={s.emojiTileText}>{emoji}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={s.fieldLabel}>{activeBaby.name.toUpperCase()}'S COLOUR</Text>
              <View style={s.swatchWrap}>
                <TouchableOpacity
                  style={[
                    s.swatch,
                    s.swatchDefault,
                    !activeBaby.avatarColor && s.swatchSelected,
                  ]}
                  onPress={() => handleBabyAvatar({ avatarColor: null })}
                  activeOpacity={0.8}
                >
                  <Text style={s.swatchDefaultText}>Auto</Text>
                </TouchableOpacity>
                {THEME_PRESETS.map((preset) => (
                  <TouchableOpacity
                    key={preset.color}
                    style={[
                      s.swatch,
                      { backgroundColor: preset.color },
                      activeBaby.avatarColor?.toLowerCase() === preset.color &&
                        s.swatchSelected,
                    ]}
                    onPress={() => handleBabyAvatar({ avatarColor: preset.color })}
                    activeOpacity={0.8}
                    accessibilityLabel={preset.label}
                  >
                    {activeBaby.avatarColor?.toLowerCase() === preset.color && (
                      <Text style={s.swatchCheck}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.hint}>
                Your accent colour is used first; the baby's is a fallback when
                yours is set to Auto.
              </Text>
            </Section>

            <TouchableOpacity
              style={s.signOut}
              onPress={signOut}
              activeOpacity={0.8}
            >
              <Text style={s.signOutText}>Sign out</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <DeleteConfirmModal
        visible={pendingRemoval !== null}
        onConfirm={confirmRemoval}
        onCancel={() => setPendingRemoval(null)}
      />
    </SafeAreaView>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <View style={sectionStyles.card}>
      <Text style={sectionStyles.title}>
        {icon} {title}
      </Text>
      {children}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: "800",
    color: "#555",
    letterSpacing: 0.5,
    marginBottom: 12,
    textTransform: "uppercase",
  },
});

function makeStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safe: { flex: 1 },
    content: { padding: 16, paddingBottom: 40 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
    emptyEmoji: { fontSize: 44 },
    emptyText: { fontSize: 14, color: "#aaa" },
    title: { fontSize: 24, fontWeight: "800", color: "#1a1a1a" },
    subtitle: { fontSize: 13, color: "#aaa", marginTop: 2, marginBottom: 20 },
    hint: { fontSize: 12, color: "#999", lineHeight: 17, marginBottom: 12 },
    fieldLabel: {
      fontSize: 10,
      fontWeight: "700",
      color: "#aaa",
      letterSpacing: 1,
      marginBottom: 8,
      marginTop: 4,
    },
    input: {
      borderWidth: 2,
      borderColor: theme.primaryLight,
      backgroundColor: theme.primaryLighter,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      color: "#333",
      marginBottom: 12,
    },
    inviteRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
    inviteInput: { flex: 1 },
    primaryBtn: {
      backgroundColor: theme.primary,
      borderRadius: 14,
      paddingHorizontal: 18,
      paddingVertical: 12,
      alignItems: "center",
    },
    primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    disabled: { opacity: 0.5 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: "#f0f0f0",
    },
    switchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingBottom: 12,
    },
    rowBody: { flex: 1, minWidth: 0 },
    rowTitle: { fontSize: 14, fontWeight: "700", color: "#333" },
    rowSub: { fontSize: 12, color: "#aaa", marginTop: 2 },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { fontSize: 15, fontWeight: "800" },
    avatarEmoji: { fontSize: 18 },
    avatarPending: { backgroundColor: "#f5f5f5" },
    avatarPendingText: { fontSize: 16 },
    tag: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
    tagText: { fontSize: 11, fontWeight: "700" },
    removeBtn: {
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: "#fef2f2",
    },
    removeText: { fontSize: 12, fontWeight: "700", color: "#dc2626" },
    deleteIcon: { paddingHorizontal: 6, paddingVertical: 4 },
    deleteIconText: { fontSize: 15, color: "#ccc", fontWeight: "700" },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: "#eee",
      marginVertical: 14,
    },
    pillWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
    pill: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
    pillText: { fontSize: 13, fontWeight: "700" },
    intervalRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    intervalInput: { width: 64, textAlign: "center", marginBottom: 0 },
    intervalUnit: { fontSize: 13, color: "#888", fontWeight: "600" },
    wideBtn: {
      marginTop: 14,
      backgroundColor: theme.primary,
      borderRadius: 14,
      paddingVertical: 13,
      alignItems: "center",
    },
    wideBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    segmented: { flexDirection: "row", gap: 10 },
    segment: {
      flex: 1,
      borderRadius: 14,
      paddingVertical: 12,
      alignItems: "center",
      backgroundColor: theme.primaryLighter,
    },
    segmentText: { fontSize: 14, fontWeight: "700" },
    segmentSub: { fontSize: 11, marginTop: 3 },
    swatchWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
    swatch: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 3,
      borderColor: "transparent",
    },
    swatchDefault: { backgroundColor: "#f3f4f6" },
    swatchDefaultText: { fontSize: 10, fontWeight: "800", color: "#888" },
    swatchSelected: { borderColor: "#1a1a1a" },
    swatchCheck: { color: "#fff", fontSize: 17, fontWeight: "900" },
    emojiTile: {
      width: 46,
      height: 46,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
    },
    emojiTileText: { fontSize: 22 },
    signOut: {
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
      backgroundColor: "#fff",
      borderWidth: 1,
      borderColor: "#fca5a5",
    },
    signOutText: { color: "#dc2626", fontWeight: "700", fontSize: 14 },
  });
}
