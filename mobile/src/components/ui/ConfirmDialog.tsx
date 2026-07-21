import React from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useThemeContext } from "../../design/ThemeProvider";
import { space, radius, elevation } from "../../design/tokens";
import { Icon, type IconName } from "../../design/icons";
import { Text } from "./primitives";
import { Button } from "./Button";

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  /** Spell out what will happen — a bare "Are you sure?" helps nobody decide. */
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  icon?: IconName;
  destructive?: boolean;
}

/**
 * Centered confirmation for actions that can't be taken back. Deliberately a
 * dialog rather than a sheet: it should interrupt, briefly, and the safe action
 * is the easy one — tapping anywhere outside cancels.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  icon = "trash",
  destructive = true,
}: ConfirmDialogProps) {
  const { theme: t, isDark } = useThemeContext();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.overlay, { backgroundColor: t.scrim }]}>
        {/* The backdrop is a sibling of the card, never its parent: a Pressable
            wrapping the card is one accessibility element, and everything inside
            it — title, message, both buttons — stops being reachable. */}
        <Pressable
          style={styles.backdrop}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
        />

        <View
          style={[
            styles.card,
            { backgroundColor: t.surface, borderColor: t.border },
            elevation(3, isDark),
          ]}
          accessibilityViewIsModal
        >
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: destructive ? t.dangerSoft : t.accentSoft },
            ]}
          >
            <Icon
              name={icon}
              size="lg"
              color={destructive ? t.danger : t.accentText}
            />
          </View>
          <Text variant="title3" center accessibilityRole="header">
            {title}
          </Text>
          <Text variant="subhead" tone="muted" center style={styles.message}>
            {message}
          </Text>
          <View style={styles.actions}>
            <Button
              label={cancelLabel}
              variant="secondary"
              onPress={onCancel}
              style={styles.action}
            />
            <Button
              label={confirmLabel}
              variant={destructive ? "danger" : "primary"}
              onPress={onConfirm}
              style={styles.action}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xxl,
  },
  backdrop: { ...StyleSheet.absoluteFillObject },
  card: {
    width: "100%",
    maxWidth: 340,
    borderRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.xxl,
    alignItems: "center",
    gap: space.sm,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.xs,
  },
  message: { maxWidth: 260 },
  actions: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.md,
    alignSelf: "stretch",
  },
  action: { flex: 1 },
});
