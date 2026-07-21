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

const DELETE_THRESHOLD = 100;

/**
 * A swipe is unreachable with a screen reader on, so the same delete is offered
 * as a rotor / local-menu action. It opens the same confirmation the swipe does
 * rather than dismissing the row outright.
 */
const A11Y_ACTIONS = [{ name: "delete", label: "Delete" }];

interface Props {
  children: React.ReactNode;
  onDelete: () => void;
}

export default function SwipeableRow({ children, onDelete }: Props) {
  const t = useTheme();
  const translateX = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const isDismissed = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const isSwiping = useRef(false);
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
        const isHorizontal = Math.abs(gs.dx) > Math.abs(gs.dy) && Math.abs(gs.dx) > 5;
        return isHorizontal && !isDismissed.current;
      },
      onPanResponderGrant: (e) => {
        startX.current = e.nativeEvent.pageX;
        startY.current = e.nativeEvent.pageY;
        isSwiping.current = false;
      },
      onPanResponderMove: (_e, gs) => {
        if (isDismissed.current) return;
        const dx = gs.dx;
        const progress = Math.min(Math.abs(dx) / DELETE_THRESHOLD, 1);
        translateX.setValue(dx);
        progressAnim.setValue(progress);
        isSwiping.current = true;
      },
      onPanResponderRelease: (_e, gs) => {
        if (isDismissed.current) return;
        if (Math.abs(gs.dx) > DELETE_THRESHOLD) {
          const direction = gs.dx > 0 ? 1 : -1;
          Animated.timing(translateX, {
            toValue: direction * 400,
            duration: 250,
            useNativeDriver: true,
          }).start(() => handleDelete());
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
          Animated.timing(progressAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: false,
          }).start();
        }
        isSwiping.current = false;
      },
      onPanResponderTerminate: () => {
        if (isDismissed.current) return;
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
        Animated.timing(progressAnim, {
          toValue: 0,
          duration: 200,
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
      {/* Red delete background */}
      <Animated.View
        style={[
          styles.background,
          {
            // The danger pair, not a fixed red: a saturated slab would glare on
            // a dark screen, and the pale light-mode fill would vanish on it.
            backgroundColor: t.dangerSoft,
            opacity: progressAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.9],
            }),
          },
        ]}
        pointerEvents="none"
        // pointerEvents alone still leaves it in the accessibility tree, so
        // TalkBack would announce a "Delete" that can't be reached or pressed.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Icon name="trash" size="md" color={t.danger} />
        <Text variant="subheadStrong" style={{ color: t.danger }}>
          Delete
        </Text>
      </Animated.View>

      {/* Swipeable foreground */}
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
