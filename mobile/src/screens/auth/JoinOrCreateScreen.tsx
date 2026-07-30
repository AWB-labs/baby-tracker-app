import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from "react-native";
import { useBaby } from "../../context/BabyContext";
import { useToast } from "../../components/Toast";
import { useTheme } from "../../design/ThemeProvider";
import { space, radius, PRESSED_OPACITY } from "../../design/tokens";
import { useActivityTone } from "../../design/activity";
import { Screen, Text, Emoji, Input, Button } from "../../components/ui";
import { claimInvite } from "../../api/members";
import { getErrorMessage } from "../../lib/errors";

interface Props {
  /** Chosen "create a new family" — hands off to the existing Add Baby screen. */
  onCreate: () => void;
}

/**
 * "Are you starting a family here, or joining one that's already running?"
 *
 * Sits between the relationship question and Add Baby, and only for that
 * reason: Add Baby makes no sense for someone about to gain access to a baby
 * that already exists elsewhere. Nielsen's "visibility of system status" is
 * the whole shape of this screen — every state the join side can be in
 * (typing, checking, wrong code, joined) says so in words, not just by what
 * does or doesn't happen next.
 *
 * The join half doesn't invent a new mechanism: it calls the same invite-link
 * claim endpoint Account already uses to add a caregiver to an existing baby.
 * A brand-new account claiming a code is the identical action as an existing
 * one claiming a link sent to it later — one endpoint, two entry points.
 */
export default function JoinOrCreateScreen({ onCreate }: Props) {
  const t = useTheme();
  const toast = useToast();
  const mark = useActivityTone("pump").emoji;
  const { refreshBabies } = useBaby();

  // null = the two-choice screen; true = the code-entry form. Not a separate
  // navigator screen, so "back" is just this flipping to false again.
  const [joining, setJoining] = useState(false);
  const [token, setToken] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinedName, setJoinedName] = useState<string | null>(null);

  const handleClaim = async () => {
    const code = token.trim();
    if (!code) return;
    setChecking(true);
    setError(null);
    try {
      const result = await claimInvite(code);
      // Named explicitly, not just "you're in" — the whole point of asking
      // "join or create" is to be sure which family you just landed in.
      setJoinedName(result.babyName);
      await refreshBabies();
    } catch (err) {
      // The API already writes a human sentence for a bad or expired code
      // ("bad_invite" / "invite_expired"); this only covers what it can't
      // reach the user for, like no connection at all.
      setError(getErrorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  // refreshBabies() populates the baby list, which is what actually moves the
  // app forward — the navigator re-renders past this screen on its own once
  // babies.length > 0. This state is purely the still-mounted confirmation
  // shown in the instant before that happens.
  if (joinedName) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <View style={[styles.mark, { backgroundColor: t.successSoft }]}>
            <Emoji size={44}>✅</Emoji>
          </View>
          <Text variant="display" center accessibilityRole="header">
            You're in
          </Text>
          <Text variant="body" tone="muted" center>
            You can now see and add entries for {joinedName}.
          </Text>
        </View>
      </Screen>
    );
  }

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
            {joining ? "Enter your invite code" : "Is this a new family, or an existing one?"}
          </Text>
          <Text variant="body" tone="muted" center>
            {joining
              ? "Another caregiver can send you one from Account."
              : "If another caregiver already tracks this baby, join them instead of starting over."}
          </Text>
        </View>

        {joining ? (
          <View style={styles.form}>
            <Input
              label="Invite code"
              value={token}
              onChangeText={(v) => {
                setToken(v);
                setError(null);
              }}
              placeholder="Paste the code you were sent"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleClaim}
              error={error}
            />
            <Button
              label="Join"
              variant="primary"
              size="lg"
              fullWidth
              loading={checking}
              disabled={!token.trim()}
              onPress={handleClaim}
            />
            <Pressable
              onPress={() => {
                setJoining(false);
                setError(null);
              }}
              disabled={checking}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={({ pressed }) => [
                styles.back,
                { opacity: pressed ? PRESSED_OPACITY : 1 },
              ]}
              accessibilityRole="button"
            >
              <Text variant="subheadStrong" tone="accent" center>
                ← I'm starting a new family instead
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.form}>
            <Button
              label="Start a new family"
              variant="primary"
              size="lg"
              fullWidth
              onPress={onCreate}
            />
            <Button
              label="I have an invite code"
              icon="userPlus"
              variant="secondary"
              size="lg"
              fullWidth
              onPress={() => setJoining(true)}
            />
          </View>
        )}
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.xs },
  hero: { alignItems: "center", gap: space.xs },
  mark: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.sm,
  },
  form: { gap: space.md },
  back: { paddingVertical: space.sm },
});
