import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeContext, useReduceMotion } from "../../design/ThemeProvider";
import { space, radius, motion } from "../../design/tokens";
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
 * The backdrop and the panel animate independently: the frosted backdrop just
 * fades in, and only the panel slides up from the bottom. (The old
 * `animationType="slide"` moved the whole layer — scrim included — so the
 * darkening appeared to climb up the screen with the sheet, which read as a
 * glitch.) A blur separates the sheet from the page behind it instead of a
 * heavy black wash. Tapping the backdrop dismisses.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: SheetProps) {
  const { theme: t, isDark } = useThemeContext();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();

  // Keep the Modal mounted through the closing animation, then unmount.
  const [mounted, setMounted] = useState(visible);
  // Measured so the panel slides exactly its own height — no off-screen guess.
  const [sheetH, setSheetH] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      if (reduceMotion) {
        progress.setValue(1);
        return;
      }
      const anim = Animated.timing(progress, {
        toValue: 1,
        duration: motion.base,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });
      anim.start();
      return () => anim.stop();
    }
    if (mounted) {
      if (reduceMotion) {
        progress.setValue(0);
        setMounted(false);
        return;
      }
      const anim = Animated.timing(progress, {
        toValue: 0,
        duration: motion.base * motion.exitRatio,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      });
      anim.start(({ finished }) => {
        if (finished) setMounted(false);
      });
      return () => anim.stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduceMotion]);

  if (!mounted) return null;

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetH || 600, 0],
  });

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        {/* Frosted backdrop — fades in on its own, so the darkening no longer
            travels up with the sheet. */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
          <BlurView
            intensity={isDark ? 40 : 26}
            tint={isDark ? "dark" : "light"}
            style={StyleSheet.absoluteFill}
            experimentalBlurMethod="dimezisBlurView"
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: isDark
                  ? "rgba(0,0,0,0.35)"
                  : "rgba(20,10,15,0.18)",
              },
            ]}
            pointerEvents="none"
          />
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
        </Animated.View>

        <KeyboardAvoidingView
          // Android ignores "padding" inside a Modal, so it resizes instead.
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardWrap}
          pointerEvents="box-none"
        >
          <Animated.View
            onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}
            style={[
              styles.sheet,
              {
                backgroundColor: t.surface,
                borderColor: t.border,
                paddingBottom: Math.max(insets.bottom, space.lg),
                // Hidden until measured, so the first open never flashes at the
                // fallback offset before sliding from its true height.
                opacity: sheetH === 0 ? 0 : progress,
                transform: [{ translateY }],
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
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
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
