import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../../design/ThemeProvider";
import { space, radius } from "../../design/tokens";
import { Icon, type IconName } from "../../design/icons";
import { Text } from "./primitives";
import { Button } from "./Button";

export interface EmptyStateProps {
  icon: IconName;
  title: string;
  /** Say what to do next — an empty screen with no guidance is a dead end. */
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "neutral" | "danger";
}

export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  tone = "neutral",
}: EmptyStateProps) {
  const t = useTheme();
  const isDanger = tone === "danger";

  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <View
        style={[
          styles.iconCircle,
          { backgroundColor: isDanger ? t.dangerSoft : t.surfaceAlt },
        ]}
      >
        <Icon
          name={icon}
          size="xl"
          color={isDanger ? t.danger : t.textSubtle}
        />
      </View>
      <Text variant="title3" center>
        {title}
      </Text>
      {body ? (
        <Text variant="subhead" tone="subtle" center style={styles.body}>
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          variant={isDanger ? "danger" : "primary"}
          size="sm"
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingVertical: space.xxxl,
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.xs,
  },
  // Keeps the sentence inside a comfortable measure rather than edge to edge.
  body: { maxWidth: 280 },
  action: { marginTop: space.sm },
});
