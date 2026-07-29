import React, { useCallback, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  PanResponder,
  Animated,
  LayoutAnimation,
  UIManager,
  Platform,
} from "react-native";
import { useTheme } from "../design/ThemeProvider";
import { radius } from "../design/tokens";
import { Icon } from "../design/icons";
import { Text } from "./ui/primitives";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const DELETE_THRESHOLD = 90;

/**
 * A swipe is unreachable with a screen reader on, so the same delete is offered
 * as a rotor / local-menu action, and every row also carries a visible trash
 * button — the swipe is a shortcut, never the only way out.
 */
const A11Y_ACTIONS = [{ name: "delete", label: "Delete" }];

interface Props {
  children: React.ReactNode;
  onDelete: () => void;
}

/**
 * Swipe a row aside to delete.
 *
 * Deliberately plain PanResponder: the gesture-handler `GestureDetector` path
 * runs on Reanimated's worklet runtime, which crashes under this project's
 * babel setup, and legacy (Animated) `Swipeable` is gone in gesture-handler 2.
 * PanResponder is pure React Native — it never touches a worklet — so the Log
 * stays up. It only claims the touch once the drag is clearly horizontal, so
 * the list still scrolls vertically.
 */
export default function SwipeableRow({ children, onDelete }: Props) {
  const t = useTheme();
  const translateX = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const isDismissed = useRef(false);
  const [removing, setRemoving] = useState(false);

  const handleDelete = useCallback(() => {
    if (isDismissed.current) return;
    isDismissed.current = true;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setRemoving(true);
    onDelete();
  }, [onDelete]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, gs) => {
        // Claim only clearly-horizontal drags, so vertical scrolling is left to
        // the list.
        const horizontal =
          Math.abs(gs.dx) > Math.abs(gs.dy) * 1.4 && Math.abs(gs.dx) > 8;
        return horizontal && !isDismissed.current;
      },
      onPanResponderMove: (_e, gs) => {
        if (isDismissed.current) return;
        translateX.setValue(gs.dx);
        progressAnim.setValue(Math.min(Math.abs(gs.dx) / DELETE_THRESHOLD, 1));
      },
      onPanResponderRelease: (_e, gs) => {
        if (isDismissed.current) return;
        if (Math.abs(gs.dx) > DELETE_THRESHOLD) {
          Animated.timing(translateX, {
            toValue: (gs.dx > 0 ? 1 : -1) * 400,
            duration: 200,
            useNativeDriver: true,
          }).start(() => handleDelete());
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
          Animated.timing(progressAnim, {
            toValue: 0,
            duration: 160,
            useNativeDriver: false,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        if (isDismissed.current) return;
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
        Animated.timing(progressAnim, {
          toValue: 0,
          duration: 160,
          useNativeDriver: false,
        }).start();
      },
    })
  ).current;

  if (removing) {
    return <View style={styles.gone} />;
  }

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.background,
          {
            backgroundColor: t.dangerSoft,
            opacity: progressAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.9],
            }),
          },
        ]}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Icon name="trash" size="md" color={t.danger} />
        <Text variant="subheadStrong" style={{ color: t.danger }}>
          Delete
        </Text>
      </Animated.View>

      <Animated.View
        style={{ transform: [{ translateX }] }}
        accessibilityActions={A11Y_ACTIONS}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "delete") onDelete();
        }}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    overflow: "hidden",
    borderRadius: radius.lg,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.lg,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  gone: { height: 0, overflow: "hidden" },
});
