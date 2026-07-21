import React, { useEffect, useRef } from "react";
import { Animated, Easing, type StyleProp, type ViewStyle } from "react-native";
import { useReduceMotion } from "../../design/ThemeProvider";
import { motion, STAGGER_MS } from "../../design/tokens";

export interface FadeInUpProps {
  children: React.ReactNode;
  /**
   * Position in a list, used to stagger entrances. Capped so a long list's tail
   * doesn't crawl in seconds after the top — the point is rhythm, not delay.
   */
  index?: number;
  style?: StyleProp<ViewStyle>;
}

const MAX_STAGGERED = 8;

/**
 * Content that arrives, rather than snapping into existence. Enter-only —
 * exits are handled by whatever removes the element, because a departing row
 * shouldn't hold the list hostage.
 */
export function FadeInUp({ children, index = 0, style }: FadeInUpProps) {
  const reduceMotion = useReduceMotion();
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: motion.slow,
      delay: Math.min(index, MAX_STAGGERED) * STAGGER_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, index, reduceMotion]);

  return (
    <Animated.View
      style={[
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [10, 0],
              }),
            },
          ],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}
