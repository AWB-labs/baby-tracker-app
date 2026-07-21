import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../context/AuthContext";
import { useBaby } from "../../context/BabyContext";
import { AuthStackParamList } from "../../navigation/RootNavigator";
import { useToast } from "../../components/Toast";

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, "Signup">;
};

export default function SignupScreen({ navigation }: Props) {
  const toast = useToast();
  const { signUp } = useAuth();
  const { addBaby, setActiveBaby, refreshBabies } = useBaby();

  // Step 1: account fields
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Step 2: first baby fields
  const [babyName, setBabyName] = useState("");
  const [gender, setGender] = useState<"girl" | "boy">("girl");

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
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.emoji}>👶</Text>
          <Text style={styles.title}>Add Your Baby</Text>
          <Text style={styles.subtitle}>
            You can add more babies later from any screen
          </Text>

          <View style={styles.form}>
            <Text style={styles.label}>BABY&apos;S NAME</Text>
            <TextInput
              style={styles.input}
              value={babyName}
              onChangeText={setBabyName}
              placeholder="e.g. Touti"
              placeholderTextColor="#ccc"
              autoFocus
            />

            <Text style={styles.label}>GENDER</Text>
            <View style={styles.genderRow}>
              {(["girl", "boy"] as const).map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[
                    styles.genderBtn,
                    gender === g && {
                      backgroundColor: g === "girl" ? "#ff6b95" : "#4e9eff",
                      borderColor: g === "girl" ? "#ff6b95" : "#4e9eff",
                    },
                  ]}
                  onPress={() => setGender(g)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.genderEmoji}>
                    {g === "girl" ? "👧" : "👦"}
                  </Text>
                  <Text
                    style={[
                      styles.genderLabel,
                      gender === g && { color: "#fff" },
                    ]}
                  >
                    {g === "girl" ? "Girl" : "Boy"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[
                styles.button,
                loading && styles.buttonDisabled,
                { backgroundColor: gender === "girl" ? "#ff6b95" : "#4e9eff" },
              ]}
              onPress={handleStep2}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>
                {loading ? "Setting up..." : "Let's Go! 🎉"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.emoji}>🍼</Text>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Track your baby&apos;s journey</Text>

        <View style={styles.form}>
          <Text style={styles.label}>YOUR NAME</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Ali"
            placeholderTextColor="#ccc"
            autoFocus
          />

          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#ccc"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>PASSWORD</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Min. 6 characters"
            placeholderTextColor="#ccc"
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleStep1}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>
              {loading ? "Creating account..." : "Next →"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => navigation.navigate("Login")}
          >
            <Text style={styles.linkText}>
              Already have an account?{" "}
              <Text style={styles.linkBold}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#fff5f7" },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingVertical: 40,
  },
  emoji: { fontSize: 52, marginBottom: 12 },
  title: { fontSize: 28, fontWeight: "700", color: "#333", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#999", marginBottom: 32 },
  form: { width: "100%" },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: "#aaa",
    letterSpacing: 1,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  input: {
    borderWidth: 2,
    borderColor: "#ffe0e8",
    borderRadius: 14,
    backgroundColor: "#fff5f7",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#333",
    marginBottom: 16,
  },
  button: {
    backgroundColor: "#ff6b95",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
    shadowColor: "#ff6b95",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  linkBtn: { marginTop: 20, alignItems: "center" },
  linkText: { fontSize: 14, color: "#aaa" },
  linkBold: { color: "#ff6b95", fontWeight: "700" },
  genderRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
  genderBtn: {
    flex: 1,
    borderWidth: 2,
    borderColor: "#ffe0e8",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#fff5f7",
  },
  genderEmoji: { fontSize: 28, marginBottom: 4 },
  genderLabel: { fontSize: 14, fontWeight: "700", color: "#aaa" },
});
