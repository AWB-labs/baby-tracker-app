import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../../navigation/RootNavigator";
import { useToast } from "../../components/Toast";
import { useTheme } from "../../design/ThemeProvider";
import { space, radius } from "../../design/tokens";
import { useActivityTone } from "../../design/activity";
import { Screen, Text, Emoji, Input, Button } from "../../components/ui";
import { requestPasswordReset } from "../../api/auth";

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, "ForgotPassword">;
};

/**
 * Request a reset code, then hand off to entering it.
 *
 * There is exactly one outcome shown for "submitted" — never "no account
 * with that email" — because the server itself never says which case
 * happened; showing a different message here for one case than the other
 * would just reconstruct, on the client, the exact leak the API was written
 * to avoid.
 */
export default function ForgotPasswordScreen({ navigation }: Props) {
  const toast = useToast();
  const t = useTheme();
  const mark = useActivityTone("pump").emoji;
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!email.trim()) {
      toast.error("Enter your email first.");
      return;
    }
    setLoading(true);
    try {
      await requestPasswordReset(email.trim().toLowerCase());
      setSent(true);
    } catch (err) {
      toast.showError(err);
    } finally {
      setLoading(false);
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
            <Emoji size={44}>{sent ? "📬" : mark}</Emoji>
          </View>
          <Text variant="display" center accessibilityRole="header">
            {sent ? "Check your email" : "Reset your password"}
          </Text>
          <Text variant="body" tone="muted" center>
            {sent
              ? `If an account exists for ${email.trim()}, a reset code is on its way. It's good for 60 minutes.`
              : "Enter the email on your account and we'll send a code to reset it."}
          </Text>
        </View>

        {sent ? (
          <View style={styles.form}>
            <Button
              label="I have my code"
              variant="primary"
              size="lg"
              fullWidth
              onPress={() => navigation.navigate("ResetPassword", { email: email.trim() })}
            />
            <Button
              label="Use a different email"
              variant="ghost"
              fullWidth
              onPress={() => setSent(false)}
            />
          </View>
        ) : (
          <View style={styles.form}>
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSend}
            />
            <Button
              label="Send reset code"
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              onPress={handleSend}
            />
          </View>
        )}

        <Button
          label="← Back to sign in"
          variant="ghost"
          fullWidth
          onPress={() => navigation.navigate("Login")}
        />
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
  form: { gap: space.md },
});
