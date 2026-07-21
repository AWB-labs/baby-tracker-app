import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTheme, useThemeContext, type Appearance } from "../design/ThemeProvider";
import { space, radius, DISABLED_OPACITY, PRESSED_OPACITY } from "../design/tokens";
import { REMINDER_EMOJI } from "../design/activity";
import { Icon } from "../design/icons";
import {
  Screen,
  ScreenHeader,
  SectionHeader,
  Card,
  Text,
  Emoji,
  Badge,
  Divider,
  Button,
  IconButton,
  Input,
  Field,
  EmptyState,
  Chip,
  ChipWrap,
  Segmented,
  SkeletonList,
  FadeInUp,
  ConfirmDialog,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useBaby } from "../context/BabyContext";
import { useSettings, useUnits } from "../context/SettingsContext";
import { useToast } from "../components/Toast";
import { usePushRegistration } from "../hooks/usePushRegistration";
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

/**
 * Avatar emoji are content, not chrome — they're the picture the family picks
 * for their baby, so they stay emoji rather than becoming stroke icons.
 */
const AVATAR_EMOJIS = [
  "👶", "🐣", "🐻", "🐰", "🦊", "🐨", "🦁", "🐼",
  "🌸", "⭐", "🌙", "🍼",
];

const APPEARANCE_OPTIONS: { value: Appearance; label: string; icon: "auto" | "sun" | "moon" }[] = [
  { value: "system", label: "System", icon: "auto" },
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
];

const UNIT_OPTIONS: { value: UnitSystem; label: string }[] = [
  { value: "metric", label: "Metric" },
  { value: "imperial", label: "Imperial" },
];

interface PendingRemoval {
  kind: "member" | "invite";
  id: number;
  label: string;
}

export default function SettingsScreen() {
  const t = useTheme();
  const navigation = useNavigation();
  const { appearance, setAppearance } = useThemeContext();
  const toast = useToast();
  const units = useUnits();
  const { account, signOut, setAccount } = useAuth();
  const { activeBaby, refreshBabies } = useBaby();
  const {
    unitSystem,
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

  const handleBabyAvatar = async (patch: { avatarEmoji?: string | null }) => {
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

  if (!activeBaby) {
    return (
      <Screen scroll={false} grabber presentation="modal">
        <ScreenHeader
          title="Settings"
          actions={
            <IconButton
              icon="close"
              label="Close settings"
              variant="surface"
              onPress={() => navigation.goBack()}
            />
          }
        />
        <EmptyState
          icon="settings"
          title="Nothing to configure yet"
          body="Add a baby first to manage settings."
        />
      </Screen>
    );
  }

  const removingSelf =
    pendingRemoval?.kind === "member" && pendingRemoval.id === account?.id;

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={onRefresh}
      grabber
      presentation="modal"
    >
      <ScreenHeader
        title="Settings"
        subtitle={account ? `${account.name} · ${account.email}` : undefined}
        actions={
          <IconButton
            icon="close"
            label="Close settings"
            variant="surface"
            onPress={() => navigation.goBack()}
          />
        }
      />

      {loading ? (
        <SkeletonList rows={4} />
      ) : (
        <>
          {/* ---------- Caregivers ---------- */}
          <View style={styles.section}>
            <SectionHeader title="Caregivers" />
            <Card>
              <Text variant="footnote" tone="subtle">
                Everyone here can see and add entries for {activeBaby.name}.
              </Text>

              <View style={styles.inlineForm}>
                <Input
                  containerStyle={styles.flex}
                  label="Add by email"
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  placeholder="family@email.com"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleInvite}
                />
                <Button
                  label="Add"
                  icon="userPlus"
                  variant="primary"
                  loading={inviting}
                  onPress={handleInvite}
                />
              </View>

              <View style={styles.rows}>
                {members.map((m, index) => (
                  <FadeInUp key={`m-${m.id}`} index={index}>
                    <View style={[styles.row, { borderTopColor: t.border }]}>
                      <View style={[styles.avatar, { backgroundColor: t.accentSoft }]}>
                        <Text variant="bodyStrong" style={{ color: t.accentText }}>
                          {m.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.rowBody}>
                        <Text variant="subheadStrong" numberOfLines={1}>
                          {m.name}
                          {m.isYou ? " (you)" : ""}
                        </Text>
                        <Text variant="caption" tone="subtle" numberOfLines={1}>
                          {m.email}
                        </Text>
                      </View>
                      {m.role === "owner" ? (
                        <Badge tone="accent">Owner</Badge>
                      ) : isOwner || m.isYou ? (
                        <Button
                          label={m.isYou ? "Leave" : "Remove"}
                          variant="danger"
                          size="sm"
                          onPress={() =>
                            setPendingRemoval({
                              kind: "member",
                              id: m.accountId,
                              label: m.isYou ? "You" : m.name,
                            })
                          }
                        />
                      ) : null}
                    </View>
                  </FadeInUp>
                ))}

                {invites.map((i, index) => (
                  <FadeInUp key={`i-${i.id}`} index={members.length + index}>
                    <View style={[styles.row, { borderTopColor: t.border }]}>
                      <View style={[styles.avatar, { backgroundColor: t.surfaceAlt }]}>
                        <Icon name="mail" size="sm" color={t.textSubtle} />
                      </View>
                      <View style={styles.rowBody}>
                        <Text variant="subheadStrong" numberOfLines={1}>
                          {i.email}
                        </Text>
                        <Text variant="caption" tone="subtle">
                          Waiting for them to sign up with this email
                        </Text>
                      </View>
                      <Button
                        label="Cancel"
                        variant="danger"
                        size="sm"
                        onPress={() =>
                          setPendingRemoval({
                            kind: "invite",
                            id: i.id,
                            label: i.email,
                          })
                        }
                      />
                    </View>
                  </FadeInUp>
                ))}
              </View>
            </Card>
          </View>

          {/* ---------- Reminders ---------- */}
          <View style={styles.section}>
            <SectionHeader title="Reminders" />
            <Card>
              <View style={styles.switchRow}>
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

              {reminders.length === 0 ? (
                <EmptyState
                  icon="bell"
                  title="No reminders yet"
                  body="Add one below and we'll nudge you when it's been too long."
                />
              ) : (
                <View style={styles.rows}>
                  {reminders.map((r, index) => {
                    const meta = REMINDER_META.get(r.type);
                    const name = r.label || meta?.label || r.type;
                    return (
                      <FadeInUp key={r.id} index={index}>
                        <View style={[styles.row, { borderTopColor: t.border }]}>
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
                            </Text>
                          </View>
                          <Switch
                            value={r.enabled}
                            onValueChange={() => handleToggleReminder(r)}
                            trackColor={{ true: t.accent, false: t.border }}
                            thumbColor={t.surface}
                            ios_backgroundColor={t.border}
                            accessibilityLabel={`${name} reminder`}
                          />
                          <IconButton
                            icon="trash"
                            label={`Delete the ${name.toLowerCase()} reminder`}
                            variant="ghost"
                            size="sm"
                            onPress={() => handleDeleteReminder(r)}
                          />
                        </View>
                      </FadeInUp>
                    );
                  })}
                </View>
              )}

              <Divider style={styles.divider} />

              <View style={styles.form}>
                <Field label="Remind me to…">
                  <ChipWrap>
                    {availableTypes.map((option) => (
                      <Chip
                        key={option.value}
                        label={option.label}
                        emoji={REMINDER_EMOJI[option.value] ?? REMINDER_EMOJI.custom}
                        selected={newType === option.value}
                        onPress={() => setNewType(option.value)}
                      />
                    ))}
                  </ChipWrap>
                </Field>

                {newType === "custom" && (
                  <Input
                    label="Call it"
                    value={newLabel}
                    onChangeText={setNewLabel}
                    placeholder="What should we call it?"
                  />
                )}

                <View style={styles.intervalRow}>
                  <Input
                    containerStyle={styles.flex}
                    label="Every · hours"
                    value={newHours}
                    onChangeText={setNewHours}
                    keyboardType="number-pad"
                    placeholder="0"
                  />
                  <Input
                    containerStyle={styles.flex}
                    label="…and minutes"
                    value={newMinutes}
                    onChangeText={setNewMinutes}
                    keyboardType="number-pad"
                    placeholder="0"
                  />
                </View>
                <Text variant="footnote" tone="subtle">
                  At least 5 minutes in total.
                </Text>

                <Button
                  label={addingReminder ? "Adding…" : "Add reminder"}
                  icon="plus"
                  variant="secondary"
                  fullWidth
                  loading={addingReminder}
                  onPress={handleAddReminder}
                />
              </View>
            </Card>
          </View>

          {/* ---------- Units ---------- */}
          <View style={styles.section}>
            <SectionHeader title="Units" />
            <Card>
              <View style={styles.form}>
                {/* Locked while the save is in flight, so a second tap can't
                    race the first request. */}
                <Segmented
                  options={UNIT_OPTIONS}
                  value={unitSystem}
                  onChange={handleUnitChange}
                  disabled={savingField === "units"}
                />
                <Text variant="footnote" tone="subtle" center>
                  {units.weight} · {units.height} · {units.volume} ·{" "}
                  {units.temperature}
                </Text>
              </View>
            </Card>
          </View>

          {/* ---------- Appearance ---------- */}
          <View style={styles.section}>
            <SectionHeader title="Appearance" />
            <Card>
              <View style={styles.form}>
                <Field
                  label="Theme"
                  helper="System follows your phone's light or dark setting."
                >
                  <Segmented
                    options={APPEARANCE_OPTIONS}
                    value={appearance}
                    onChange={setAppearance}
                  />
                </Field>

                <Divider style={styles.divider} />

                <Field label={`${activeBaby.name}'s icon`}>
                  <View style={styles.swatchWrap}>
                    {AVATAR_EMOJIS.map((emoji) => {
                      const selected = activeBaby.avatarEmoji === emoji;
                      return (
                        <Pressable
                          key={emoji}
                          onPress={() => handleBabyAvatar({ avatarEmoji: emoji })}
                          disabled={savingField === "avatar"}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={`Use ${emoji} for ${activeBaby.name}`}
                          style={({ pressed }) => [
                            styles.emojiTile,
                            {
                              backgroundColor: selected
                                ? t.accentSoft
                                : t.accentSofter,
                              borderColor: selected ? t.accent : "transparent",
                              opacity:
                                savingField === "avatar"
                                  ? DISABLED_OPACITY
                                  : pressed
                                    ? PRESSED_OPACITY
                                    : 1,
                            },
                          ]}
                        >
                          <Emoji size={22}>{emoji}</Emoji>
                        </Pressable>
                      );
                    })}
                  </View>
                </Field>
              </View>
            </Card>
          </View>

          <Button
            label="Sign out"
            icon="logout"
            variant="danger"
            fullWidth
            onPress={signOut}
          />
        </>
      )}

      <ConfirmDialog
        visible={pendingRemoval !== null}
        icon={
          removingSelf
            ? "logout"
            : pendingRemoval?.kind === "invite"
              ? "mail"
              : "trash"
        }
        title={
          removingSelf
            ? "Leave this baby?"
            : pendingRemoval?.kind === "invite"
              ? "Withdraw this invitation?"
              : `Remove ${pendingRemoval?.label}?`
        }
        message={
          !pendingRemoval
            ? ""
            : removingSelf
              ? `You'll lose access to ${activeBaby.name}'s entries. Another caregiver can invite you back.`
              : pendingRemoval.kind === "invite"
                ? `${pendingRemoval.label} will no longer be able to join with that invitation.`
                : `${pendingRemoval.label} will no longer see or add entries for ${activeBaby.name}.`
        }
        confirmLabel={
          removingSelf
            ? "Leave"
            : pendingRemoval?.kind === "invite"
              ? "Withdraw"
              : "Remove"
        }
        onConfirm={confirmRemoval}
        onCancel={() => setPendingRemoval(null)}
      />
    </Screen>
  );
}

/**
 * A colour choice. The swatch *is* the value, so its fill comes from the preset
 * itself; the tick is black or white depending on which reads on that colour.
 */

const styles = StyleSheet.create({
  section: { gap: space.sm },
  flex: { flex: 1 },
  form: { gap: space.lg },
  // The button sits level with the input box, below its label.
  inlineForm: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.sm,
    marginTop: space.md,
  },
  rows: { marginTop: space.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowBody: { flex: 1, minWidth: 0, gap: space.xxs },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingBottom: space.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: { marginVertical: space.lg },
  intervalRow: { flexDirection: "row", gap: space.sm },
  swatchWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
  },
  emojiTile: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
});
