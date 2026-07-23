import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useBaby } from "../context/BabyContext";
import { useTheme } from "../design/ThemeProvider";
import {
  space,
  radius,
  hitSlop,
  HIT_SLOP_MIN,
  PRESSED_OPACITY,
} from "../design/tokens";
import { Icon } from "../design/icons";
import {
  Text,
  Emoji,
  Badge,
  Button,
  Input,
  Field,
  Segmented,
  Sheet,
  EmptyState,
  FadeInUp,
} from "./ui";
import { useToast } from "./Toast";
import DobField from "./DobField";
import { formatBabyAge } from "../lib/greeting";
import type { Baby } from "../api/auth";

const GENDERS: { value: "girl" | "boy"; label: string }[] = [
  { value: "girl", label: "Girl" },
  { value: "boy", label: "Boy" },
];

/**
 * Who you are tracking, and how to change it.
 *
 * The trigger lives in the screen header beside the title, so it stays a
 * compact pill — the baby's own avatar, their name, a chevron — and never
 * competes with the heading. Everything else happens in a sheet, because on a
 * shared account the list can grow and the add form needs real room.
 */
export default function BabySwitcher() {
  const { babies, activeBaby, setActiveBaby, addBaby, refreshBabies } =
    useBaby();
  const t = useTheme();
  const toast = useToast();
  const [visible, setVisible] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGender, setNewGender] = useState<"girl" | "boy">("girl");
  const [newDob, setNewDob] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSelect = async (baby: Baby) => {
    await setActiveBaby(baby);
    setVisible(false);
  };

  const handleAdd = async () => {
    if (!newName.trim()) {
      toast.error("Enter a name for your baby.");
      return;
    }
    setSaving(true);
    try {
      const baby = await addBaby({
        name: newName.trim(),
        gender: newGender,
        dob: newDob,
      });
      await setActiveBaby(baby);
      await refreshBabies();
      setShowAddForm(false);
      setNewName("");
      setNewGender("girl");
      setNewDob(null);
      setVisible(false);
    } catch (err) {
      toast.showError(err);
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    setVisible(false);
    setShowAddForm(false);
  };

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        hitSlop={hitSlop}
        accessibilityRole="button"
        accessibilityLabel={
          activeBaby ? `Tracking ${activeBaby.name}` : "Select baby"
        }
        accessibilityHint="Switch baby or add a new one"
        style={({ pressed }) => [
          styles.trigger,
          {
            backgroundColor: t.surface,
            borderColor: t.borderStrong,
            opacity: pressed ? PRESSED_OPACITY : 1,
          },
        ]}
      >
        {activeBaby?.avatarEmoji ? (
          <Emoji size={16}>{activeBaby.avatarEmoji}</Emoji>
        ) : (
          <View
            style={[
              styles.dot,
              { backgroundColor: t.accent },
            ]}
          />
        )}
        <Text
          variant="subheadStrong"
          tone="accent"
          numberOfLines={1}
          style={styles.triggerLabel}
        >
          {activeBaby?.name || "Select Baby"}
        </Text>
        <Icon name="chevronDown" size="sm" color={t.accentText} />
      </Pressable>

      <Sheet
        visible={visible}
        onClose={close}
        title="Select Baby"
        subtitle="Everything you log goes to whoever is selected here"
        // Only the actions are pinned. The form's fields live in the scroll
        // area above — the footer cannot scroll, so anything tall placed here
        // is unreachable once the keyboard is up.
        footer={
          showAddForm ? (
            <View style={styles.formActions}>
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => setShowAddForm(false)}
                style={styles.flex}
              />
              <Button
                label="Add"
                variant="primary"
                loading={saving}
                onPress={handleAdd}
                style={styles.flex}
              />
            </View>
          ) : (
            <Button
              label="Add Baby"
              icon="plus"
              variant="secondary"
              fullWidth
              onPress={() => setShowAddForm(true)}
            />
          )
        }
      >
        {babies.length === 0 ? (
          <EmptyState
            icon="home"
            title="No babies yet"
            body="Add your first one below to start tracking feeds, naps and nappies."
          />
        ) : (
          // Grouped so the rows sit on their own tight rhythm — as direct
          // children of the sheet they'd inherit its section gap and read as
          // separate blocks rather than one list.
          <View style={styles.babyList}>
            {babies.map((baby, index) => {
              const selected = activeBaby?.id === baby.id;
              return (
                <FadeInUp key={baby.id} index={index}>
                  <Pressable
                    onPress={() => handleSelect(baby)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    // The label replaces the row's children for a screen
                    // reader, so the ownership badge has to be spoken here or
                    // it exists for sighted users only.
                    accessibilityLabel={[
                      baby.name,
                      baby.gender === "girl" ? "girl" : "boy",
                      formatBabyAge(baby.dob),
                      baby.role
                        ? baby.role === "owner"
                          ? "yours"
                          : "shared"
                        : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                    style={({ pressed }) => [
                      styles.babyRow,
                      {
                        backgroundColor: selected ? t.accentSofter : t.surface,
                        borderColor: selected ? t.accent : t.border,
                        opacity: pressed ? PRESSED_OPACITY : 1,
                      },
                    ]}
                  >
                    <View
                      style={[styles.avatar, { backgroundColor: t.accentSoft }]}
                    >
                      {baby.avatarEmoji ? (
                        <Emoji size={20}>{baby.avatarEmoji}</Emoji>
                      ) : (
                        <View
                          style={[
                            styles.avatarDot,
                            { backgroundColor: t.accent },
                          ]}
                        />
                      )}
                    </View>

                    {/* Gender and age sit under the name: on a shared account
                        two siblings can have similar names, and the age is the
                        fastest way to tell which row is which. */}
                    <View style={styles.rowBody}>
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {baby.name}
                      </Text>
                      <Text variant="caption" tone="subtle" numberOfLines={1}>
                        {[
                          baby.gender === "girl" ? "Girl" : "Boy",
                          formatBabyAge(baby.dob),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </View>

                    {/* Role only comes back from /me, so it stays optional. */}
                    {baby.role ? (
                      <Badge tone={baby.role === "owner" ? "accent" : "info"}>
                        {baby.role === "owner" ? "Yours" : "Shared"}
                      </Badge>
                    ) : null}

                    {selected && (
                      <Icon name="check" size="md" color={t.success} />
                    )}
                  </Pressable>
                </FadeInUp>
              );
            })}
          </View>
        )}

        {showAddForm && (
          <View style={styles.addForm}>
            <Input
              label="Name"
              value={newName}
              onChangeText={setNewName}
              placeholder="Baby's name"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleAdd}
            />
            <Field label="Gender">
              <Segmented
                options={GENDERS}
                value={newGender}
                onChange={setNewGender}
              />
            </Field>
            <DobField value={newDob} onChange={setNewDob} />
          </View>
        )}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    maxWidth: 160,
    height: HIT_SLOP_MIN,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 2,
  },
  // Shrinks before the avatar and chevron do, so a long name truncates
  // instead of pushing the chevron out of the pill.
  triggerLabel: { flexShrink: 1 },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  babyList: { gap: space.sm },
  // Takes the leftover width so a long name truncates instead of shoving the
  // badge and tick off the row.
  rowBody: { flex: 1, minWidth: 0, gap: space.xxs, paddingVertical: space.sm },
  addForm: { gap: space.md },
  babyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.md,
    minHeight: 60,
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
  avatarDot: { width: 14, height: 14, borderRadius: radius.pill },
  formActions: { flexDirection: "row", gap: space.sm },
});
