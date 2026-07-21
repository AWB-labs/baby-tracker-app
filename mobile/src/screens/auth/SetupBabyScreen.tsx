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
import { useBaby } from "../../context/BabyContext";
import { useToast } from "../../components/Toast";

export default function SetupBabyScreen() {
  const toast = useToast();
  const { addBaby, setActiveBaby, refreshBabies } = useBaby();
  const [babyName, setBabyName] = useState("");
  const [gender, setGender] = useState<"girl" | "boy">("girl");
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!babyName.trim()) {
      toast.error("Enter a name for your baby.");
      return;
    }
    setLoading(true);
    try {
      const baby = await addBaby({ name: babyName.trim(), gender });
      await setActiveBaby(baby);
      await refreshBabies();
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
        <Text style={styles.emoji}>👶</Text>
        <Text style={styles.title}>Add Your Baby</Text>
        <Text style={styles.subtitle}>Set up your first baby profile</Text>

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
            onPress={handleSave}
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
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
    elevation: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
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
