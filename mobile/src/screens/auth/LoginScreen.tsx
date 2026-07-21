import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../context/AuthContext";
import { AuthStackParamList } from "../../navigation/RootNavigator";
import { useToast } from "../../components/Toast";
import { useTheme } from "../../design/ThemeProvider";
import { space, radius } from "../../design/tokens";
import { useActivityTone } from "../../design/activity";
import { Screen, Text, Emoji, Input, Button } from "../../components/ui";

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, "Login">;
};

export default function LoginScreen({ navigation }: Props) {
  const toast = useToast();
  const t = useTheme();
  // The bottle is already the product's mark on every feed surface, so the
  // sign-in screens lead with it rather than introducing a second symbol.
  const mark = useActivityTone("pump").emoji;
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      toast.error("Enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      const claimed = await signIn(email.trim().toLowerCase(), password);
      if (claimed > 0) {
        toast.success(
          claimed === 1
            ? "You've been added to a baby's care team."
            : `You've been added to ${claimed} babies' care teams.`
        );
      }
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
      {/* Auth sits outside the tab navigator, so the content is centred and the
          tab-bar clearance Screen normally reserves is dropped. */}
      <Screen scroll contentStyle={styles.content}>
        <View style={styles.hero}>
          <View style={[styles.mark, { backgroundColor: t.accentSoft }]}>
            <Emoji size={44}>{mark}</Emoji>
          </View>
          <Text variant="display" center accessibilityRole="header">
            Welcome back
          </Text>
          <Text variant="body" tone="muted" center>
            Sign in to pick up where you left off.
          </Text>
        </View>

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
            returnKeyType="next"
          />

          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secureTextEntry
            textContentType="password"
            returnKeyType="done"
          />

          <Button
            label="Sign in"
            variant="primary"
            size="lg"
            fullWidth
            loading={loading}
            onPress={handleLogin}
          />
        </View>

        <Button
          label="New here? Create an account"
          variant="ghost"
          fullWidth
          onPress={() => navigation.navigate("Signup")}
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
  form: { gap: space.lg },
});
