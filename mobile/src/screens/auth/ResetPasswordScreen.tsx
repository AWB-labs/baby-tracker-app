import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import type { AuthStackParamList } from "../../navigation/RootNavigator";
import { useToast } from "../../components/Toast";
import { useTheme } from "../../design/ThemeProvider";
import { space, radius } from "../../design/tokens";
import { useActivityTone } from "../../design/activity";
import { Screen, Text, Emoji, Input, Button } from "../../components/ui";
import { resetPassword } from "../../api/auth";

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, "ResetPassword">;
  route: RouteProp<AuthStackParamList, "ResetPassword">;
};

/**
 * Redeem the code emailed by Forgot Password for a new password.
 *
 * The code is pasted in by hand rather than followed as a link — this app has
 * no deep-link/universal-link configuration, and building one is a separate
 * undertaking on its own. A copy-pasted code needs none of that, and it's the
 * same pattern the invite-link join flow already uses for exactly the same
 * reason.
 */
export default function ResetPasswordScreen({ navigation, route }: Props) {
  const toast = useToast();
  const t = useTheme();
  const mark = useActivityTone("pump").emoji;
  const [token, setToken] = useState(route.params?.token ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;
  const canSave =
    token.trim().length > 0 && password.length >= 6 && password === confirm;

  const handleReset = async () => {
    if (!canSave) return;
    setLoading(true);
    try {
      await resetPassword(token.trim(), password);
      toast.success("Password updated. Sign in with your new one.");
      navigation.navigate("Login");
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
            <Emoji size={44}>{mark}</Emoji>
          </View>
          <Text variant="display" center accessibilityRole="header">
            Enter your code
          </Text>
          <Text variant="body" tone="muted" center>
            {route.params?.email
              ? `Sent to ${route.params.email}.`
              : "Paste the code from the email, then choose a new password."}
          </Text>
        </View>

        <View style={styles.form}>
          <Input
            label="Reset code"
            value={token}
            onChangeText={setToken}
            placeholder="Paste the code you were sent"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={!route.params?.token}
            returnKeyType="next"
          />

          <Input
            label="New password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            secureTextEntry
            textContentType="newPassword"
            returnKeyType="next"
          />

          <Input
            label="Confirm new password"
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Type it again"
            secureTextEntry
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={handleReset}
            error={mismatch ? "Passwords don't match." : null}
          />

          <Button
            label="Reset password"
            variant="primary"
            size="lg"
            fullWidth
            loading={loading}
            disabled={!canSave}
            onPress={handleReset}
          />
        </View>

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
