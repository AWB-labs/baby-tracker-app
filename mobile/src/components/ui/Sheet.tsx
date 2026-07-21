import React from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../design/ThemeProvider";
import { space, radius } from "../../design/tokens";
import { Text } from "./primitives";
import { IconButton } from "./Button";

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Pinned to the bottom, outside the scroll area, so it's always reachable. */
  footer?: React.ReactNode;
}

/**
 * Bottom sheet.
 *
 * The scrim is deliberately heavy: a weak overlay leaves the page behind
 * competing for attention, and the sheet stops reading as a separate layer.
 * Tapping it dismisses, matching the platform expectation.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: SheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.overlay, { backgroundColor: t.scrim }]}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />

        <KeyboardAvoidingView
          // Android ignores "padding" inside a Modal, so it resizes instead.
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardWrap}
          pointerEvents="box-none"
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: t.surface,
                borderColor: t.border,
                paddingBottom: Math.max(insets.bottom, space.lg),
              },
            ]}
          >
            {/* Grabber: the affordance that says "this can be dragged away". */}
            <View style={[styles.grabber, { backgroundColor: t.borderStrong }]} />

            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text variant="title3" accessibilityRole="header">
                  {title}
                </Text>
                {subtitle ? (
                  <Text variant="footnote" tone="subtle">
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              <IconButton icon="close" label="Close" onPress={onClose} />
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>

            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject },
  // flex:1 is load-bearing, not decoration: the sheet's `maxHeight: "92%"` is a
  // percentage, and Yoga resolves a percentage against an auto-height parent to
  // nothing at all. Without a definite height here the cap is silently dropped,
  // the sheet grows past the screen, and its footer is clipped off the bottom.
  keyboardWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    maxHeight: "92%",
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    alignSelf: "center",
    marginBottom: space.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space.md,
    marginBottom: space.md,
  },
  headerText: { flex: 1, gap: space.xxs },
  // flexShrink must be explicit: Yoga defaults it to 0 (unlike the web), so
  // without it a list taller than the sheet's maxHeight refuses to compress and
  // shoves the pinned footer — often the only Save button — off the screen.
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { gap: space.lg, paddingBottom: space.md },
  footer: { paddingTop: space.md, gap: space.sm },
});
