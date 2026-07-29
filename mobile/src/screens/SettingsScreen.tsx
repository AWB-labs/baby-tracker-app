import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, Share, StyleSheet, Switch, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
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
  createInviteLink,
  claimInvite,
  setMemberRelation,
  formatRelation,
  RELATIONS,
  type BabyMember,
  type PendingInvite,
} from "../api/members";
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
import { updateBaby } from "../api/babies";
import DobField from "../components/DobField";
import { updateSettings, type UnitSystem } from "../api/settings";

const GENDER_OPTIONS: { value: "girl" | "boy"; label: string }[] = [
  { value: "girl", label: "Girl" },
  { value: "boy", label: "Boy" },
];

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
  // Chosen once and applied to whichever way the invite goes out.
  const [inviteRelation, setInviteRelation] = useState<string | null>(null);
  const [inviteNote, setInviteNote] = useState("");
  const [sharingLink, setSharingLink] = useState(false);
  const [joinToken, setJoinToken] = useState("");
  const [joining, setJoining] = useState(false);
  const [savingRelation, setSavingRelation] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);

  // New-reminder form
  const [newType, setNewType] = useState<ReminderType>("feed");
  const [newLabel, setNewLabel] = useState("");
  const [newTime, setNewTime] = useState(DEFAULT_TIME_OF_DAY);
  const [showTimePicker, setShowTimePicker] = useState(false);
  // Empty means every day — the common case, so it's also the default.
  const [newDays, setNewDays] = useState<number[]>([]);
  const [addingReminder, setAddingReminder] = useState(false);

  const [savingField, setSavingField] = useState<string | null>(null);

  // Baby details, seeded from the active baby and re-seeded when it changes.
  const [babyName, setBabyName] = useState(activeBaby?.name ?? "");
  const [babyGender, setBabyGender] = useState<"girl" | "boy">(
    activeBaby?.gender ?? "girl"
  );
  const [babyDob, setBabyDob] = useState<string | null>(activeBaby?.dob ?? null);

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
    if (inviteRelation === "other" && !inviteNote.trim()) {
      toast.error("Say how they're related.");
      return;
    }
    setInviting(true);
    try {
      const result = await addMember(
        activeBaby.id,
        email,
        inviteRelation,
        inviteRelation === "other" ? inviteNote.trim() : null
      );
      toast.success(result.message);
      setInviteEmail("");
      setInviteRelation(null);
      setInviteNote("");
      await load();
    } catch (err) {
      toast.showError(err);
    } finally {
      setInviting(false);
    }
  };

  /**
   * Share a claim link instead of an address.
   *
   * An email invite only lands if that person signs up with the exact address
   * typed, which is a poor bet when you're sending it over WhatsApp. The link
   * works whatever address they use, so it goes out through the OS share sheet
   * rather than being copied by hand.
   */
  const handleShareLink = async () => {
    if (!activeBaby) return;
    if (inviteRelation === "other" && !inviteNote.trim()) {
      toast.error("Say how they're related.");
      return;
    }
    setSharingLink(true);
    try {
      const link = await createInviteLink(
        activeBaby.id,
        inviteRelation,
        inviteRelation === "other" ? inviteNote.trim() : null
      );
      await Share.share({
        message:
          `Join me on Baby Tracker to help look after ${activeBaby.name}.\n\n` +
          `Sign up, then go to Account → Join a baby and paste this code:\n\n${link.token}\n\n` +
          `It expires in ${link.expiresInDays} days.`,
      });
      setInviteRelation(null);
      setInviteNote("");
    } catch (err) {
      toast.showError(err);
    } finally {
      setSharingLink(false);
    }
  };

  /**
   * Change your own relationship.
   *
   * Written to both places it matters: the account, which is what a baby you
   * create next will inherit, and your membership of the baby on screen, which
   * is what the caregiver list below actually renders. Keeping them in step is
   * why this isn't just a settings PATCH.
   */
  const handleSaveMyRelation = async (relation: string | null) => {
    if (!activeBaby || !account) return;
    // "Other" needs a note, and there's nowhere to type one from a chip row, so
    // it's handled by the same field the invite form uses.
    const note = relation === "other" ? account.relationNote ?? null : null;
    setSavingRelation(true);
    try {
      const updated = await updateSettings({ relation, relationNote: note });
      setAccount({ ...account, ...updated });
      await setMemberRelation(activeBaby.id, account.id, relation, note);
      await load();
    } catch (err) {
      toast.showError(err);
    } finally {
      setSavingRelation(false);
    }
  };

  /** Redeem a code someone shared with you. */
  const handleJoin = async () => {
    const token = joinToken.trim();
    if (!token) return;
    setJoining(true);
    try {
      const result = await claimInvite(token);
      toast.success(
        result.status === "joined"
          ? `You've joined ${result.babyName}.`
          : `You already have access to ${result.babyName}.`
      );
      setJoinToken("");
      await refreshBabies();
      await load();
    } catch (err) {
      toast.showError(err);
    } finally {
      setJoining(false);
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
        timeOfDay: newTime,
        daysOfWeek: newDays.length > 0 ? newDays : null,
      });
      setReminders((prev) => [...prev, created]);
      setNewLabel("");
      setNewDays([]);
      toast.success(
        `You'll be reminded at ${formatTimeOfDay(created.timeOfDay)} ${
          created.daysOfWeek
            ? `on ${formatDays(created.daysOfWeek).toLowerCase()}`
            : "every day"
        }.`
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

  // Switching baby while this screen is open must not leave the previous
  // baby's name sitting in the form, ready to be saved onto the new one.
  useEffect(() => {
    setBabyName(activeBaby?.name ?? "");
    setBabyGender(activeBaby?.gender ?? "girl");
    setBabyDob(activeBaby?.dob ?? null);
  }, [activeBaby?.id, activeBaby?.name, activeBaby?.gender, activeBaby?.dob]);

  const babyDetailsChanged =
    !!activeBaby &&
    (babyName.trim() !== activeBaby.name ||
      babyGender !== activeBaby.gender ||
      (babyDob ?? null) !== (activeBaby.dob ?? null));

  const handleSaveBabyDetails = async () => {
    if (!activeBaby) return;
    if (!babyName.trim()) {
      toast.error("Enter a name for your baby.");
      return;
    }
    setSavingField("details");
    try {
      await updateBaby(activeBaby.id, {
        name: babyName.trim(),
        gender: babyGender,
        dob: babyDob,
      });
      await refreshBabies();
      toast.success("Details saved.");
    } catch (err) {
      toast.showError(err);
    } finally {
      setSavingField(null);
    }
  };

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
      <Screen scroll={false}>
        <ScreenHeader title="Account" />
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
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <ScreenHeader
        title="Account"
        subtitle={account ? `${account.name} · ${account.email}` : undefined}
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

              {/* Anyone who signed up before onboarding asked this has no
                  relationship set, so this is where they fill it in. */}
              <Field label={`You are ${activeBaby.name}'s…`}>
                <ChipWrap>
                  {RELATIONS.map((option) => (
                    <Chip
                      key={option.value}
                      label={option.label}
                      emoji={option.emoji}
                      selected={account?.relation === option.value}
                      disabled={savingRelation}
                      onPress={() =>
                        handleSaveMyRelation(
                          account?.relation === option.value ? null : option.value
                        )
                      }
                    />
                  ))}
                </ChipWrap>
              </Field>

              <Divider style={styles.divider} />

              {/* Who they are is asked once, up front, and applies to whichever
                  way you send it — so the list below reads as people rather
                  than as a column of addresses. */}
              <Field
                label="Who are they?"
                helper="Optional. It doesn't change what they can see or do."
              >
                <ChipWrap>
                  {RELATIONS.map((option) => (
                    <Chip
                      key={option.value}
                      label={option.label}
                      emoji={option.emoji}
                      selected={inviteRelation === option.value}
                      onPress={() =>
                        setInviteRelation(
                          inviteRelation === option.value ? null : option.value
                        )
                      }
                    />
                  ))}
                </ChipWrap>
              </Field>

              {inviteRelation === "other" && (
                <Input
                  label="How are they related?"
                  value={inviteNote}
                  onChangeText={setInviteNote}
                  placeholder="e.g. Godmother, family friend"
                  maxLength={60}
                />
              )}

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

              <Button
                label="Share an invite link instead"
                icon="users"
                variant="secondary"
                fullWidth
                loading={sharingLink}
                onPress={handleShareLink}
              />
              <Text variant="footnote" tone="subtle">
                A link works whatever email they sign up with, and expires after
                two weeks. An emailed invite only reaches them if they use that
                exact address.
              </Text>

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
                          {/* The relationship is the more useful of the two, so
                              it leads and the address follows it. */}
                          {[formatRelation(m.relation, m.relationNote), m.email]
                            .filter(Boolean)
                            .join(" · ")}
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
                          {[
                            formatRelation(i.relation, i.relationNote),
                            "Waiting for them to sign up with this email",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
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

          {/* ---------- Join a baby ---------- */}
          <View style={styles.section}>
            <SectionHeader title="Join a baby" />
            <Card>
              <Text variant="footnote" tone="subtle">
                Got an invite code from another caregiver? Paste it here to get
                access to their baby.
              </Text>
              <View style={styles.inlineForm}>
                <Input
                  containerStyle={styles.flex}
                  label="Invite code"
                  value={joinToken}
                  onChangeText={setJoinToken}
                  placeholder="Paste the code you were sent"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleJoin}
                />
                <Button
                  label="Join"
                  variant="primary"
                  loading={joining}
                  disabled={!joinToken.trim()}
                  onPress={handleJoin}
                />
              </View>
            </Card>
          </View>

          {/* ---------- Baby ---------- */}
          <View style={styles.section}>
            <SectionHeader title={`${activeBaby.name}'s details`} />
            <Card>
              <View style={styles.form}>
                <Input
                  label="Name"
                  value={babyName}
                  onChangeText={setBabyName}
                  placeholder="Baby's name"
                  returnKeyType="done"
                />

                <Field label="Gender">
                  <Segmented
                    options={GENDER_OPTIONS}
                    value={babyGender}
                    onChange={setBabyGender}
                    disabled={savingField === "details"}
                  />
                </Field>

                <DobField value={babyDob} onChange={setBabyDob} />

                {/* Only offered once something has actually changed, so the
                    card doesn't sit there looking like unfinished work. */}
                {babyDetailsChanged && (
                  <Button
                    label="Save details"
                    icon="check"
                    variant="primary"
                    fullWidth
                    loading={savingField === "details"}
                    onPress={handleSaveBabyDetails}
                  />
                )}
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
                              {formatTimeOfDay(r.timeOfDay)}
                              {` · ${formatDays(r.daysOfWeek)}`}
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

                {/* A wall-clock time rather than an interval: "every 3 hours"
                    drifts through the night, whereas a parent thinks in terms
                    of the vitamin they give at breakfast. */}
                <Field label="At this time">
                  <Pressable
                    onPress={() => setShowTimePicker(true)}
                    accessibilityRole="button"
                    accessibilityLabel={`Reminder time: ${formatTimeOfDay(newTime)}`}
                    style={({ pressed }) => [
                      styles.timeBtn,
                      {
                        backgroundColor: t.accentSofter,
                        borderColor: t.borderStrong,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Emoji size={16}>🕘</Emoji>
                    <Text variant="bodyStrong">{formatTimeOfDay(newTime)}</Text>
                  </Pressable>
                </Field>
                {showTimePicker && (
                  <DateTimePicker
                    value={timeOfDayToDate(newTime)}
                    mode="time"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={(_, picked) => {
                      setShowTimePicker(Platform.OS === "ios");
                      if (picked) setNewTime(dateToTimeOfDay(picked));
                    }}
                  />
                )}

                {/* Nothing selected means every day, so the common case needs
                    no interaction at all — you only touch this to narrow it. */}
                <Field
                  label="On these days"
                  helper={
                    newDays.length === 0
                      ? "Every day. Tap to limit it to certain days."
                      : formatDays(newDays)
                  }
                >
                  <View style={styles.dayRow}>
                    {WEEKDAYS.map((day) => {
                      const selected = newDays.includes(day.value);
                      return (
                        <Pressable
                          key={day.value}
                          onPress={() =>
                            setNewDays((prev) =>
                              prev.includes(day.value)
                                ? prev.filter((d) => d !== day.value)
                                : [...prev, day.value].sort((a, b) => a - b)
                            )
                          }
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={day.long}
                          style={({ pressed }) => [
                            styles.dayTile,
                            {
                              backgroundColor: selected
                                ? t.accent
                                : t.accentSofter,
                              borderColor: selected ? t.accent : "transparent",
                              opacity: pressed ? PRESSED_OPACITY : 1,
                            },
                          ]}
                        >
                          <Text
                            variant="caption"
                            style={{
                              color: selected ? t.onAccent : t.accentText,
                            }}
                          >
                            {day.short}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </Field>

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
  timeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderRadius: radius.md,
    borderWidth: 2,
    paddingHorizontal: space.md,
    minHeight: 48,
  },
  // Seven tiles that must fit one line on the narrowest phone, so they flex
  // rather than carrying a fixed width.
  dayRow: { flexDirection: "row", gap: space.xs },
  dayTile: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
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
