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
import { AuthStackParamList } from "../../navigation/RootNavigator";
import { useToast } from "../../components/Toast";

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, "Login">;
};

export default function LoginScreen({ navigation }: Props) {
  const toast = useToast();
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
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.emoji}>🍼</Text>
        <Text style={styles.title}>Baby Tracker</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        <View style={styles.form}>
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
            placeholder="••••••"
            placeholderTextColor="#ccc"
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>
              {loading ? "Signing in..." : "Sign In"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => navigation.navigate("Signup")}
          >
            <Text style={styles.linkText}>
              Don&apos;t have an account?{" "}
              <Text style={styles.linkBold}>Sign up</Text>
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
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#333",
    marginBottom: 4,
  },
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
});
