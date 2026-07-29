import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
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
  SkeletonList,
  FadeInUp,
  ConfirmDialog,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useBaby } from "../context/BabyContext";
import { useSettings, useUnits } from "../context/SettingsContext";
import { useToast } from "../components/Toast";
import {
  getMembers,
  addMember,
  removeMember,
  cancelInvite,
  type BabyMember,
  type PendingInvite,
} from "../api/members";
import { getReminders, type Reminder } from "../api/reminders";
import { updateBaby } from "../api/babies";
import DobField from "../components/DobField";
import type { UnitSystem } from "../api/settings";
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
  const navigation =
    useNavigation<NativeStackNavigationProp<AccountStackParamList>>();

  const [members, setMembers] = useState<BabyMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);

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
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: { marginVertical: space.lg },
  // The tappable card that opens the Reminders screen.
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
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
