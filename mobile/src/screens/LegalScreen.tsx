import React from "react";
import { StyleSheet, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "../design/ThemeProvider";
import { space, radius } from "../design/tokens";
import { Screen, ScreenHeader, Text, IconButton, Card } from "../components/ui";
import { LEGAL } from "../content/legal";
import type { AccountStackParamList } from "../navigation/AppTabs";

type Nav = NativeStackNavigationProp<AccountStackParamList, "Legal">;
type Route = RouteProp<AccountStackParamList, "Legal">;

/**
 * Privacy Policy and Terms of Use.
 *
 * One screen for both: the two documents differ only in their words, so they
 * share a renderer and are picked apart by the `doc` route param. The text
 * lives in content/legal.ts — see the note there about keeping it in step
 * with the published copy App Store Connect points at.
 *
 * Rendered natively rather than opened in a browser so it works with no
 * connection, keeps the app's own type and theme, and doesn't hand someone
 * off to Safari from the middle of Account.
 */
export default function LegalScreen() {
  const t = useTheme();
  const navigation = useNavigation<Nav>();
  const { doc } = useRoute<Route>().params;
  const document = LEGAL[doc];

  return (
    <Screen scroll>
      <View style={styles.headerRow}>
        <IconButton
          icon="chevronLeft"
          label="Back to Account"
          variant="surface"
          onPress={() => navigation.goBack()}
        />
        <ScreenHeader
          title={document.title}
          subtitle={document.updated}
          style={styles.headerText}
        />
      </View>

      <Card>
        <Text variant="callout" tone="muted">
          {document.intro}
        </Text>
      </Card>

      {document.sections.map((section, index) => (
        // Sections are fixed content in a fixed order, so the index is a
        // stable key — nothing here is reordered, filtered or inserted.
        <View key={index} style={styles.section}>
          {section.heading ? (
            <Text variant="title3" accessibilityRole="header">
              {section.heading}
            </Text>
          ) : null}

          {section.body?.map((paragraph, i) => (
            <Text key={i} variant="body" tone="muted">
              {paragraph}
            </Text>
          ))}

          {section.bullets?.map((bullet, i) => (
            <View key={i} style={styles.bulletRow}>
              <View style={[styles.dot, { backgroundColor: t.accent }]} />
              <Text variant="body" tone="muted" style={styles.bulletText}>
                {bullet}
              </Text>
            </View>
          ))}
        </View>
      ))}

      <Text variant="footnote" tone="subtle" center style={styles.footer}>
        {document.footer}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  headerText: { flex: 1 },
  section: { gap: space.sm },
  bulletRow: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  dot: {
    width: 5,
    height: 5,
    borderRadius: radius.pill,
    // Nudged down to sit on the first line's optical centre rather than its top.
    marginTop: 9,
  },
  bulletText: { flex: 1 },
  footer: { marginTop: space.md },
});
