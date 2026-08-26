import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Share, StyleSheet, useWindowDimensions, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme, useThemeContext, type Appearance } from "../design/ThemeProvider";
import { space, radius, DISABLED_OPACITY, PRESSED_OPACITY } from "../design/tokens";
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
  Sheet,
  SkeletonList,
  FadeInUp,
  ConfirmDialog,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useBaby } from "../context/BabyContext";
import BabySwitcher from "../components/BabySwitcher";
import { useSettings, useUnits } from "../context/SettingsContext";
import { useToast } from "../components/Toast";
import { toFriendlyError } from "../lib/errors";
import {
  getMembers,
  addMember,
  removeMember,
  cancelInvite,
  createInviteLink,
  claimInvite,
  setMemberRelation,
  formatRelation,
  relationEmoji,
  formatInviteCode,
  RELATIONS,
  type BabyMember,
  type PendingInvite,
  type InviteLink,
} from "../api/members";
import { getReminders, type Reminder } from "../api/reminders";
import { getBagItems, type BagItem } from "../api/bag";
import { updateBaby } from "../api/babies";
import DobField from "../components/DobField";
import { updateSettings, type UnitSystem } from "../api/settings";
import type { Baby } from "../api/auth";
import type { AccountStackParamList } from "../navigation/AppTabs";

const GENDER_OPTIONS: { value: "girl" | "boy"; label: string }[] = [
  { value: "girl", label: "Girl" },
  { value: "boy", label: "Boy" },
];

/**
 * Avatar emoji are content, not chrome — they're the picture the family picks
 * for their baby, so they stay emoji rather than becoming stroke icons.
 */
const AVATAR_EMOJIS = [
  "👶", "🐣", "🐤", "🐥", "🐻", "🐰", "🦊", "🐨",
  "🦁", "🐼", "🐯", "🐶", "🐱", "🐹", "🐷", "🐮",
  "🐸", "🦄", "🐘", "🐢", "🦋", "🐬", "🌸", "🌷",
  "🌈", "⭐", "🌟", "🌙", "☀️", "🍼", "🧸", "🎀",
  "🦆", "🦉", "🦔", "🐝", "🐞", "🐙",
];

/** Tiles per row in the avatar picker — sized to fill the row, not a fixed 48px. */
const EMOJI_COLUMNS = 6;

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

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/**
 * What deleting the account actually costs, in plain terms — it differs by
 * role, so a caregiver isn't scared with "permanently deleted" language that
 * only applies to babies they own, and an owner isn't given false comfort
 * that "their entries stay" when the whole baby goes with them.
 */
function deleteAccountWarning(babies: Baby[]): string {
  const owned = babies.filter((b) => b.role === "owner").map((b) => b.name);
  const caregiving = babies.filter((b) => b.role !== "owner").map((b) => b.name);
  const parts: string[] = [];

  if (owned.length > 0) {
    parts.push(
      `${joinNames(owned)}'s entire ${
        owned.length > 1 ? "histories" : "history"
      } — feeds, sleep, everything — will be permanently deleted for every caregiver.`
    );
  }
  if (caregiving.length > 0) {
    parts.push(
      owned.length > 0
        ? `Your own entries on ${joinNames(caregiving)} will stay behind.`
        : `You'll lose access to ${joinNames(caregiving)} — your entries stay, but you won't be able to sign back in with this account.`
    );
  }
  parts.push("This can't be undone.");
  return parts.join(" ");
}

export default function SettingsScreen() {
  const t = useTheme();
  const { appearance, setAppearance } = useThemeContext();
  const toast = useToast();
  const units = useUnits();
  const { account, signOut, deleteAccount, setAccount } = useAuth();
  const { activeBaby, babies, refreshBabies } = useBaby();
  const {
    unitSystem,
    notificationsEnabled,
    save,
    refresh: refreshSettings,
  } = useSettings();
  const navigation =
    useNavigation<NativeStackNavigationProp<AccountStackParamList>>();

  const { width: windowWidth } = useWindowDimensions();
  // Fixed insets between the window edge and the emoji grid: Screen's own
  // horizontal padding, then the Appearance card's padding around it — both
  // space.lg on each side. A flat 48px tile leaves a sliver of dead space on
  // most phone widths (just short of fitting one more); sizing tiles to what
  // actually remains fills the row exactly instead.
  const emojiTileSize = Math.max(
    36,
    Math.floor(
      (windowWidth - space.lg * 4 - space.sm * (EMOJI_COLUMNS - 1)) / EMOJI_COLUMNS
    )
  );

  const [members, setMembers] = useState<BabyMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [bagItems, setBagItems] = useState<BagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  // Chosen once and applied to whichever way the invite goes out.
  const [inviteRelation, setInviteRelation] = useState<string | null>(null);
  const [inviteNote, setInviteNote] = useState("");
  const [generatingLink, setGeneratingLink] = useState(false);
  // The most recently minted link invite, shown as a readable code with its
  // own Copy/Share actions rather than going straight to the OS share sheet —
  // see handleGetCode.
  const [inviteLink, setInviteLink] = useState<InviteLink | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [showAddCaregiver, setShowAddCaregiver] = useState(false);
  const [showMyRelation, setShowMyRelation] = useState(false);
  const [myRelationNote, setMyRelationNote] = useState("");
  const [joinToken, setJoinToken] = useState("");
  const [joining, setJoining] = useState(false);
  const [savingRelation, setSavingRelation] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deletePasswordError, setDeletePasswordError] = useState<string | null>(null);

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
      const [membersRes, remindersRes, bagItemsRes] = await Promise.all([
        getMembers(activeBaby.id),
        getReminders(activeBaby.id),
        getBagItems(activeBaby.id),
      ]);
      setMembers(membersRes.members);
      setInvites(membersRes.pendingInvites);
      setReminders(remindersRes);
      setBagItems(bagItemsRes);
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
      closeAddCaregiver();
      await load();
    } catch (err) {
      toast.showError(err);
    } finally {
      setInviting(false);
    }
  };

  /** Reset everything scoped to the sheet, whether it closed after a
   *  successful invite or the caregiver backed out. */
  const closeAddCaregiver = () => {
    setShowAddCaregiver(false);
    setInviteEmail("");
    setInviteRelation(null);
    setInviteNote("");
    setInviteLink(null);
    setCodeCopied(false);
  };

  /**
   * Mint a claim code instead of addressing an email.
   *
   * An email invite only lands if that person signs up with the exact address
   * typed, which is a poor bet when you're sending it over WhatsApp. The code
   * works whatever address they use — shown in the sheet with its own Copy and
   * Share actions rather than jumping straight to the OS share sheet, so a
   * caregiver who'd rather paste it into an existing chat than pick one from
   * the share list can.
   */
  const handleGetCode = async () => {
    if (!activeBaby) return;
    if (inviteRelation === "other" && !inviteNote.trim()) {
      toast.error("Say how they're related.");
      return;
    }
    setGeneratingLink(true);
    try {
      const link = await createInviteLink(
        activeBaby.id,
        inviteRelation,
        inviteRelation === "other" ? inviteNote.trim() : null
      );
      setInviteLink(link);
      setCodeCopied(false);
    } catch (err) {
      toast.showError(err);
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleCopyCode = async () => {
    if (!inviteLink) return;
    await Clipboard.setStringAsync(formatInviteCode(inviteLink.token));
    setCodeCopied(true);
    toast.success("Invite code copied.");
  };

  const handleShareCode = async () => {
    if (!activeBaby || !inviteLink) return;
    try {
      await Share.share({
        message:
          `Join me on Baby Tracker to help look after ${activeBaby.name}.\n\n` +
          `Sign up, then go to Account → Join a baby and enter this code:\n\n${formatInviteCode(
            inviteLink.token
          )}\n\n` +
          `It expires in ${inviteLink.expiresInDays} days.`,
      });
    } catch (err) {
      toast.showError(err);
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
  const handleSaveMyRelation = async (
    relation: string | null,
    noteOverride?: string
  ) => {
    if (!activeBaby || !account) return;
    // Only "other" carries a note; anything else clears it, so switching away
    // from Other doesn't leave stale text attached.
    const note =
      relation === "other"
        ? (noteOverride ?? myRelationNote).trim() || null
        : null;
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

  // --- Delete account ---

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      setDeletePasswordError("Enter your password to confirm.");
      return;
    }
    setDeletePasswordError(null);
    setDeletingAccount(true);
    try {
      await deleteAccount(deletePassword);
      // Nothing else to do: the token going null flips the root navigator to
      // the signed-out stack, which unmounts this screen.
    } catch (err) {
      setDeletingAccount(false);
      // A wrong password keeps the dialog open so it can be retried in
      // place; anything else (network, server) closes it and falls back to
      // a toast, matching every other destructive action on this screen.
      if (toFriendlyError(err).code === "wrong_password") {
        setDeletePasswordError("That password isn't right.");
      } else {
        setConfirmDeleteAccount(false);
        toast.showError(err);
      }
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
          {/* ---------- Switch baby ---------- */}
          <View style={styles.section}>
            <SectionHeader title="Switch baby" />
            <Card>
              <Text variant="footnote" tone="subtle">
                Everything below applies to whichever baby is selected here.
              </Text>
              {/* BabySwitcher's own trigger is a compact pill, not a full-width
                  row — left-aligning it here keeps that shape instead of
                  letting the card's column flex stretch it edge to edge. */}
              <View style={styles.switcherWrap}>
                <BabySwitcher />
              </View>
            </Card>
          </View>

          {/* ---------- Caregivers ---------- */}
          <View style={styles.section}>
            <SectionHeader title="Caregivers" />
            <Card>
              <Text variant="footnote" tone="subtle">
                Everyone here can see and add entries for {activeBaby.name}.
              </Text>

              {/* One line, not a grid. This is set once and rarely changed, so
                  it states the answer and hides the nine options behind a tap —
                  two full chip grids on one card drowned everything else. */}
              <Pressable
                onPress={() => {
                  // Seed from the account so reopening shows what's saved
                  // rather than an empty field that would clear it on blur.
                  setMyRelationNote(account?.relationNote ?? "");
                  setShowMyRelation(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={`You are ${activeBaby.name}'s ${
                  formatRelation(
                    account?.relation ?? null,
                    account?.relationNote ?? null
                  ) ?? "— not set"
                }. Tap to change.`}
                style={({ pressed }) => [
                  styles.pickerRow,
                  { borderColor: t.border, opacity: pressed ? PRESSED_OPACITY : 1 },
                ]}
              >
                <Emoji size={18}>
                  {relationEmoji(account?.relation ?? null) ?? "🧑"}
                </Emoji>
                <View style={styles.flex}>
                  <Text variant="caption" tone="muted">
                    You are {activeBaby.name}'s
                  </Text>
                  <Text variant="subheadStrong">
                    {formatRelation(
                      account?.relation ?? null,
                      account?.relationNote ?? null
                    ) ?? "Not set"}
                  </Text>
                </View>
                <Icon name="chevronRight" size="sm" color={t.textSubtle} />
              </Pressable>

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

              {/* The whole add flow lives in a sheet. Inline, its email field,
                  relationship grid and link button pushed the list of people
                  this card is actually about off the bottom of the screen. */}
              <Button
                label="Add a caregiver"
                icon="userPlus"
                variant="primary"
                fullWidth
                onPress={() => setShowAddCaregiver(true)}
              />
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
                  placeholder="e.g. 7F3K-9P2Q"
                  // The code is always uppercase letters and digits — typing
                  // it that way makes it visibly match what was shown to
                  // whoever sent it, even though the server accepts any case.
                  autoCapitalize="characters"
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
            <Pressable
              onPress={() => navigation.navigate("Reminders")}
              accessibilityRole="button"
              accessibilityLabel={`Reminders. ${
                reminders.filter((r) => r.enabled).length
              } active. Opens the reminders screen.`}
              style={({ pressed }) => [
                styles.navRow,
                {
                  backgroundColor: t.surface,
                  borderColor: t.border,
                  opacity: pressed ? PRESSED_OPACITY : 1,
                },
              ]}
            >
              <View style={[styles.avatar, { backgroundColor: t.accentSofter }]}>
                <Emoji size={18}>{notificationsEnabled ? "🔔" : "🔕"}</Emoji>
              </View>
              <View style={styles.rowBody}>
                <Text variant="subheadStrong">Reminders</Text>
                <Text variant="caption" tone="subtle">
                  {!notificationsEnabled
                    ? "Notifications off"
                    : reminders.length === 0
                      ? "None yet — add your first nudge"
                      : `${reminders.filter((r) => r.enabled).length} of ${reminders.length} active`}
                </Text>
              </View>
              <Icon name="chevronRight" size="md" color={t.textSubtle} />
            </Pressable>
          </View>

          {/* ---------- Diaper Bag ---------- */}
          <View style={styles.section}>
            <SectionHeader title="Diaper Bag" />
            <Pressable
              onPress={() => navigation.navigate("Bag")}
              accessibilityRole="button"
              accessibilityLabel={`Diaper Bag. ${
                bagItems.filter((i) => i.checked).length
              } of ${bagItems.length} packed. Opens the checklist.`}
              style={({ pressed }) => [
                styles.navRow,
                {
                  backgroundColor: t.surface,
                  borderColor: t.border,
                  opacity: pressed ? PRESSED_OPACITY : 1,
                },
              ]}
            >
              <View style={[styles.avatar, { backgroundColor: t.accentSofter }]}>
                <Emoji size={18}>🎒</Emoji>
              </View>
              <View style={styles.rowBody}>
                <Text variant="subheadStrong">Diaper Bag</Text>
                <Text variant="caption" tone="subtle">
                  {bagItems.length === 0
                    ? "None yet — add what to pack"
                    : `${bagItems.filter((i) => i.checked).length} of ${bagItems.length} packed`}
                </Text>
              </View>
              <Icon name="chevronRight" size="md" color={t.textSubtle} />
            </Pressable>
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
                              width: emojiTileSize,
                              height: emojiTileSize,
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

          {/* ---------- Legal ---------- */}
          {/* Last section before the two destructive buttons: reference
              material people look up rarely, and putting it below "Delete my
              account" would end the screen on a row that isn't an action. */}
          <View style={styles.section}>
            <SectionHeader title="Legal" />
            <Pressable
              onPress={() => navigation.navigate("Legal", { doc: "privacy" })}
              accessibilityRole="button"
              accessibilityLabel="Privacy Policy. Opens the policy."
              style={({ pressed }) => [
                styles.navRow,
                {
                  backgroundColor: t.surface,
                  borderColor: t.border,
                  opacity: pressed ? PRESSED_OPACITY : 1,
                },
              ]}
            >
              <View style={[styles.avatar, { backgroundColor: t.accentSofter }]}>
                <Emoji size={18}>🔒</Emoji>
              </View>
              <View style={styles.rowBody}>
                <Text variant="subheadStrong">Privacy Policy</Text>
                <Text variant="caption" tone="subtle">
                  What we collect, and what we never do with it
                </Text>
              </View>
              <Icon name="chevronRight" size="md" color={t.textSubtle} />
            </Pressable>

            <Pressable
              onPress={() => navigation.navigate("Legal", { doc: "terms" })}
              accessibilityRole="button"
              accessibilityLabel="Terms of Use. Opens the terms."
              style={({ pressed }) => [
                styles.navRow,
                {
                  backgroundColor: t.surface,
                  borderColor: t.border,
                  opacity: pressed ? PRESSED_OPACITY : 1,
                },
              ]}
            >
              <View style={[styles.avatar, { backgroundColor: t.accentSofter }]}>
                <Emoji size={18}>📋</Emoji>
              </View>
              <View style={styles.rowBody}>
                <Text variant="subheadStrong">Terms of Use</Text>
                <Text variant="caption" tone="subtle">
                  How the app may be used — and why it isn't medical advice
                </Text>
              </View>
              <Icon name="chevronRight" size="md" color={t.textSubtle} />
            </Pressable>
          </View>

          <Button
            label="Sign out"
            icon="logout"
            variant="danger"
            fullWidth
            onPress={signOut}
          />

          {/* No extra margin here — Screen's own gap between top-level
              siblings already separates it from Sign out on both sides;
              styles.divider's larger margin is tuned for the Appearance
              card's denser internal layout, not this bare button stack. */}
          <Divider />

          <Button
            label="Delete my account"
            icon="trash"
            variant="danger"
            fullWidth
            onPress={() => setConfirmDeleteAccount(true)}
          />
        </>
      )}

      {/* ---------- Your relationship ---------- */}
      <Sheet
        visible={showMyRelation}
        onClose={() => setShowMyRelation(false)}
        title={`You are ${activeBaby.name}'s…`}
        subtitle="How other caregivers will recognise you. It doesn't change what anyone can see or do."
        footer={
          <Button
            label="Done"
            variant="primary"
            fullWidth
            onPress={() => setShowMyRelation(false)}
          />
        }
      >
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
        {account?.relation === "other" && (
          <Input
            label="How are you related?"
            value={myRelationNote}
            onChangeText={setMyRelationNote}
            onBlur={() => handleSaveMyRelation("other", myRelationNote)}
            placeholder="e.g. Godmother, family friend"
            maxLength={60}
          />
        )}
      </Sheet>

      {/* ---------- Add a caregiver ---------- */}
      <Sheet
        visible={showAddCaregiver}
        onClose={closeAddCaregiver}
        title="Add a caregiver"
        subtitle={`They'll be able to see and add entries for ${activeBaby.name}.`}
        footer={
          <View style={styles.sheetActions}>
            <Button
              label="Cancel"
              variant="ghost"
              onPress={closeAddCaregiver}
              style={styles.flex}
            />
            <Button
              label="Send invite"
              variant="primary"
              loading={inviting}
              disabled={!inviteEmail.trim()}
              onPress={handleInvite}
              style={styles.flex}
            />
          </View>
        }
      >
        <Input
          label="Their email"
          value={inviteEmail}
          onChangeText={setInviteEmail}
          placeholder="family@email.com"
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={handleInvite}
        />

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

        <Divider style={styles.divider} />

        {inviteLink ? (
          <View
            style={[
              styles.codeBox,
              { backgroundColor: t.accentSofter, borderColor: t.border },
            ]}
          >
            <Text variant="caption" tone="muted">
              Invite code
            </Text>
            <Text
              variant="title2"
              tabular
              center
              style={[styles.codeText, { color: t.accentText }]}
              // So the code itself, not just the Copy button, can be selected
              // and copied by hand — a fallback if the clipboard call above
              // is ever unavailable.
              selectable
            >
              {formatInviteCode(inviteLink.token)}
            </Text>
            <Text variant="footnote" tone="subtle" center>
              Expires in {inviteLink.expiresInDays} days
            </Text>
            <View style={styles.codeActions}>
              <Button
                label={codeCopied ? "Copied" : "Copy"}
                icon={codeCopied ? "check" : "copy"}
                variant="secondary"
                onPress={handleCopyCode}
                style={styles.flex}
              />
              <Button
                label="Share"
                icon="share"
                variant="secondary"
                onPress={handleShareCode}
                style={styles.flex}
              />
            </View>
          </View>
        ) : (
          <Button
            label="Get an invite code instead"
            icon="users"
            variant="secondary"
            fullWidth
            loading={generatingLink}
            onPress={handleGetCode}
          />
        )}
        <Text variant="footnote" tone="subtle">
          A code works whatever email they sign up with and expires after two
          weeks. An emailed invite only reaches them if they use that exact
          address.
        </Text>
      </Sheet>

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

      <ConfirmDialog
        visible={confirmDeleteAccount}
        icon="trash"
        title="Delete your account?"
        message={deleteAccountWarning(babies)}
        confirmLabel="Delete"
        onConfirm={handleDeleteAccount}
        onCancel={() => {
          setConfirmDeleteAccount(false);
          setDeletePassword("");
          setDeletePasswordError(null);
        }}
        loading={deletingAccount}
      >
        <Input
          label="Confirm your password"
          value={deletePassword}
          onChangeText={(v) => {
            setDeletePassword(v);
            if (deletePasswordError) setDeletePasswordError(null);
          }}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Your password"
          error={deletePasswordError}
          returnKeyType="done"
          onSubmitEditing={handleDeleteAccount}
        />
      </ConfirmDialog>
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
  switcherWrap: { alignItems: "flex-start", marginTop: space.md },
  // The tappable card that opens the Reminders screen.
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
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
  sheetActions: { flexDirection: "row", gap: space.sm },
  codeBox: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    gap: space.xs,
  },
  // Letter-spaced so the eight characters read as distinct glyphs rather
  // than running together — the same reason a phone number is never set in
  // ordinary tracking.
  codeText: { letterSpacing: 3 },
  codeActions: { flexDirection: "row", gap: space.sm, marginTop: space.xs },
  // A tappable summary row: states the current answer, hides the options.
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
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
    // width/height are computed per-render (see emojiTileSize) so the row
    // always fills the available width exactly, on any device.
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
});
