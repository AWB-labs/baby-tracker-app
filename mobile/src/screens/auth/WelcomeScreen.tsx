import React from "react";
import { StyleSheet, View } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../../design/ThemeProvider";
import { space, radius } from "../../design/tokens";
import { useActivityTone } from "../../design/activity";
import { Screen, Text, Emoji, Button } from "../../components/ui";
import type { AuthStackParamList } from "../../navigation/RootNavigator";

/**
 * The first thing anyone sees.
 *
 * Sign-in used to be the landing screen, which asks for credentials before
 * saying what the app is for — and reads as "log in" to someone who has never
 * heard of it. This says what it does in one line and then offers the two
 * doors, with Get Started first because most people arriving here are new.
 */
export default function WelcomeScreen() {
  const t = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const mark = useActivityTone("pump").emoji;

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.hero}>
        <View style={[styles.mark, { backgroundColor: t.accentSoft }]}>
          <Emoji size={52}>{mark}</Emoji>
        </View>
        <Text variant="display" center accessibilityRole="header">
          Welcome to Baby Tracker
        </Text>
        <Text variant="body" tone="muted" center>
          Track everything about your baby's journey in one place, from the very
          first feed to their biggest milestones.
        </Text>
      </View>

      <View style={styles.actions}>
        <Button
          label="Get Started"
          variant="primary"
          size="lg"
          fullWidth
          onPress={() => navigation.navigate("Signup")}
        />
        {/* Secondary, not a link: someone returning to a new phone needs to
            find this without hunting, but it isn't the common path. */}
        <Button
          label="Log In"
          variant="secondary"
          size="lg"
          fullWidth
          onPress={() => navigation.navigate("Login")}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: space.xxxl,
    gap: space.xxl,
  },
  hero: { alignItems: "center", gap: space.sm },
  mark: {
    width: 104,
    height: 104,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.sm,
  },
  actions: { gap: space.md },
});
