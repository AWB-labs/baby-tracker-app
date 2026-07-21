import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { useBaby } from "../../context/BabyContext";
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

type Gender = "girl" | "boy";

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "girl", label: "Girl" },
  { value: "boy", label: "Boy" },
];

export default function SetupBabyScreen() {
  const toast = useToast();
  const t = useTheme();
  // Same mark as the sign-in screens — this is still onboarding, not the app.
  const mark = useActivityTone("pump").emoji;
  const { addBaby, setActiveBaby, refreshBabies } = useBaby();
  const [babyName, setBabyName] = useState("");
  const [gender, setGender] = useState<Gender>("girl");
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
      {/* Onboarding sits outside the tab navigator, so the content is centred
          and the tab-bar clearance Screen normally reserves is dropped. */}
      <Screen scroll contentStyle={styles.content}>
        <View style={styles.hero}>
          <View style={[styles.mark, { backgroundColor: t.accentSoft }]}>
            <Emoji size={44}>{mark}</Emoji>
          </View>
          <Text variant="display" center accessibilityRole="header">
            Add your baby
          </Text>
          <Text variant="body" tone="muted" center>
            One profile to start with — you can add more any time.
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
});
