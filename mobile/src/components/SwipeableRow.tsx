import React, { useCallback, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Animated,
  LayoutAnimation,
  UIManager,
  Platform,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
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

const DELETE_THRESHOLD = 96;

/**
 * A swipe is unreachable with a screen reader on, so the same delete is offered
 * as a rotor / local-menu action.
 */
const A11Y_ACTIONS = [{ name: "delete", label: "Delete" }];

interface Props {
  children: React.ReactNode;
  onDelete: () => void;
}

/**
 * Swipe a row aside to delete.
 *
 * Uses react-native-gesture-handler rather than PanResponder: the old responder
 * lost the horizontal drag to the surrounding ScrollView, so the swipe simply
 * never engaged. A Pan gesture with `activeOffsetX` only claims the touch once
 * it's clearly sideways, and `failOffsetY` hands a vertical drag straight back
 * to the list — so scrolling and swiping stop fighting. Callbacks `runOnJS` so
 * the existing Animated values drive the motion without a worklet dependency.
 */
export default function SwipeableRow({ children, onDelete }: Props) {
  const t = useTheme();
  const translateX = useRef(new Animated.Value(0)).current;
  const isDismissed = useRef(false);
  const [removing, setRemoving] = useState(false);

  // The red "Delete" slab fades in as the row travels, both directions.
  const progress = translateX.interpolate({
    inputRange: [-DELETE_THRESHOLD, 0, DELETE_THRESHOLD],
    outputRange: [0.9, 0, 0.9],
    extrapolate: "clamp",
  });

  const handleDelete = useCallback(() => {
    if (isDismissed.current) return;
    isDismissed.current = true;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setRemoving(true);
    onDelete();
  }, [onDelete]);

  const settleBack = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: false,
      bounciness: 4,
    }).start();
  }, [translateX]);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      if (isDismissed.current) return;
      translateX.setValue(e.translationX);
    })
    .onEnd((e) => {
      if (isDismissed.current) return;
      if (Math.abs(e.translationX) > DELETE_THRESHOLD) {
        Animated.timing(translateX, {
          toValue: (e.translationX > 0 ? 1 : -1) * 500,
          duration: 200,
          useNativeDriver: false,
        }).start(() => handleDelete());
      } else {
        settleBack();
      }
    })
    .onFinalize(() => {
      if (!isDismissed.current) settleBack();
    });

  if (removing) {
    return <View style={styles.gone} />;
  }

  return (
    <View style={styles.container}>
      {/* Red delete background */}
      <Animated.View
        style={[
          styles.background,
          { backgroundColor: t.dangerSoft, opacity: progress },
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

      {/* Swipeable foreground */}
      <GestureDetector gesture={pan}>
        <Animated.View
          style={{ transform: [{ translateX }] }}
          accessibilityActions={A11Y_ACTIONS}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === "delete") onDelete();
          }}
        >
          {children}
        </Animated.View>
      </GestureDetector>
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
