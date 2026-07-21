import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../context/AuthContext";
import { useBaby } from "../../context/BabyContext";
import { AuthStackParamList } from "../../navigation/RootNavigator";
import { useToast } from "../../components/Toast";
import { useTheme } from "../../design/ThemeProvider";
import { space, radius } from "../../design/tokens";
import { useActivityTone } from "../../design/activity";
import {
  Screen,
  Text,
  Emoji,
  Input,
  Field,
  Segmented,
  Button,
} from "../../components/ui";

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, "Signup">;
};

type Gender = "girl" | "boy";

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "girl", label: "Girl" },
  { value: "boy", label: "Boy" },
];

export default function SignupScreen({ navigation }: Props) {
  const toast = useToast();
  const t = useTheme();
  // Same mark as sign-in, so the two steps read as one flow.
  const mark = useActivityTone("pump").emoji;
  const { signUp } = useAuth();
  const { addBaby, setActiveBaby, refreshBabies } = useBaby();

  // Step 1: account fields
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Step 2: first baby fields
  const [babyName, setBabyName] = useState("");
  const [gender, setGender] = useState<Gender>("girl");

  const [loading, setLoading] = useState(false);

  const handleStep1 = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      toast.error("Fill in your name, email and password.");
      return;
    }
    if (password.length < 6) {
      toast.error("Choose a password of at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      const claimed = await signUp(
        name.trim(),
        email.trim().toLowerCase(),
        password
      );
      if (claimed > 0) {
        // Someone already invited this email, so there's a baby waiting — no
        // need to make them create one.
        await refreshBabies();
        toast.success(
          claimed === 1
            ? "You've been added to a baby's care team."
            : `You've been added to ${claimed} babies' care teams.`
        );
        return;
      }
      setStep(2);
    } catch (err) {
      toast.showError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStep2 = async () => {
    if (!babyName.trim()) {
      toast.error("Enter a name for your baby.");
      return;
    }
    setLoading(true);
    try {
      const baby = await addBaby({ name: babyName.trim(), gender });
      await setActiveBaby(baby);
      await refreshBabies();
      // Navigation handled by RootNavigator (babies.length > 0)
    } catch (err) {
      toast.showError(err);
    } finally {
      setLoading(false);
    }
  };

  if (step === 2) {
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
              Add your baby
            </Text>
            <Text variant="body" tone="muted" center>
              You can add more babies later, from any screen.
            </Text>
          </View>

          <View style={styles.form}>
            <Input
              label="Baby's name"
              value={babyName}
              onChangeText={setBabyName}
              placeholder="e.g. Touti"
              autoFocus
              returnKeyType="done"
            />

            <Field label="Gender">
              <Segmented
                options={GENDER_OPTIONS}
                value={gender}
                onChange={setGender}
              />
            </Field>

            <Button
              label="Start tracking"
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              onPress={handleStep2}
            />
          </View>
        </Screen>
      </KeyboardAvoidingView>
    );
  }

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
            Create your account
          </Text>
          <Text variant="body" tone="muted" center>
            One calm place for feeds, naps and nappies.
          </Text>
        </View>

        <View style={styles.form}>
          <Input
            label="Your name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Ali"
            autoFocus
            textContentType="name"
            returnKeyType="next"
          />

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
            helper="At least 6 characters."
            value={password}
            onChangeText={setPassword}
            placeholder="Choose a password"
            secureTextEntry
            textContentType="newPassword"
            returnKeyType="done"
          />

          <Button
            label="Continue"
            icon="chevronRight"
            iconPosition="trailing"
            variant="primary"
            size="lg"
            fullWidth
            loading={loading}
            onPress={handleStep1}
          />
        </View>

        <Button
          label="Already have an account? Sign in"
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
  form: { gap: space.lg },
});
