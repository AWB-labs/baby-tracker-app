import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../../design/ThemeProvider";
import { space, radius, PRESSED_OPACITY } from "../../design/tokens";
import { useActivityTone } from "../../design/activity";
import {
  Screen,
  Text,
  Emoji,
  Input,
  Field,
  Button,
} from "../../components/ui";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../context/AuthContext";
import { RELATIONS } from "../../api/members";
import { updateSettings } from "../../api/settings";

/**
 * "What's your relationship to the baby?"
 *
 * Asked between creating the account and adding the baby, which is why the
 * answer lives on the account rather than on a membership — there is no baby
 * yet. Creating a baby then stamps it onto the owner's membership, so the
 * caregiver list reads as people from the very first row.
 *
 * Only new accounts see this: anyone who already has a baby is past onboarding
 * and shouldn't be sent back through it.
 */
export default function ParentProfileScreen() {
  const t = useTheme();
  const toast = useToast();
  const mark = useActivityTone("pump").emoji;
  const { account, setAccount } = useAuth();

  const [relation, setRelation] = useState<string | null>(
    account?.relation ?? null
  );
  const [note, setNote] = useState(account?.relationNote ?? "");
  const [saving, setSaving] = useState(false);

  const needsNote = relation === "other";
  const canSave = relation !== null && (!needsNote || note.trim().length > 0);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const updated = await updateSettings({
        relation,
        relationNote: needsNote ? note.trim() : null,
      });
      // Updating the account is what advances the navigator to Add Baby.
      setAccount({ ...(account ?? updated), ...updated });
    } catch (err) {
      toast.showError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen scroll contentStyle={styles.content}>
        <View style={styles.hero}>
          <View style={[styles.mark, { backgroundColor: t.accentSoft }]}>
            <Emoji size={44}>{mark}</Emoji>
          </View>
          <Text variant="display" center accessibilityRole="header">
            What's your relationship to the baby?
          </Text>
          <Text variant="body" tone="muted" center>
            It's how other caregivers will recognise you. You can change it later.
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.grid}>
            {RELATIONS.map((option) => {
              const selected = relation === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setRelation(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={option.label}
                  style={({ pressed }) => [
                    styles.tile,
                    {
                      backgroundColor: selected ? t.accent : t.accentSofter,
                      borderColor: selected ? t.accent : t.borderStrong,
                      opacity: pressed ? PRESSED_OPACITY : 1,
                    },
                  ]}
                >
                  <Emoji size={20}>{option.emoji}</Emoji>
                  <Text
                    variant="subheadStrong"
                    numberOfLines={1}
                    style={{ color: selected ? t.onAccent : t.accentText }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {needsNote && (
            <Input
              label="Tell us how"
              value={note}
              onChangeText={setNote}
              placeholder="e.g. Godmother, family friend"
              maxLength={60}
              autoFocus
              returnKeyType="done"
            />
          )}

          <Button
            label="Continue"
            variant="primary"
            size="lg"
            fullWidth
            loading={saving}
            disabled={!canSave}
            onPress={handleSave}
          />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: space.xxxl,
    gap: space.xxl,
  },
  hero: { alignItems: "center", gap: space.xs },
  mark: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.sm,
  },
  form: { gap: space.lg },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  tile: {
    flexGrow: 1,
    flexBasis: "45%",
    minHeight: 64,
    borderRadius: radius.lg,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xxs,
    paddingHorizontal: space.xs,
  },
});
