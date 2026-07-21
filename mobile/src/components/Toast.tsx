import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, useReduceMotion } from "../design/ThemeProvider";
import { space, radius, motion, elevation } from "../design/tokens";
import { Icon, type IconName } from "../design/icons";
import { Text } from "./ui/primitives";
import { getErrorMessage } from "../lib/errors";
import { useAuth } from "../context/AuthContext";

export type ToastKind = "success" | "error" | "info";

interface ToastState {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastContextValue {
  show: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  /** Show whatever a caught error should say to a parent. */
  showError: (err: unknown) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICON: Record<ToastKind, IconName> = {
  success: "checkCircle",
  error: "alert",
  info: "info",
};

// Errors linger: they usually ask the reader to do something about it.
const DURATION: Record<ToastKind, number> = {
  success: 2600,
  info: 3000,
  error: 4400,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);
  const insets = useSafeAreaInsets();
  const t = useTheme();
  const reduceMotion = useReduceMotion();

  const dismiss = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    // Exits run shorter than entrances so dismissal feels immediate.
    const duration = reduceMotion ? 0 : motion.base * motion.exitRatio;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -12, duration, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setToast(null);
    });
  }, [opacity, translateY, reduceMotion]);

  const show = useCallback(
    (message: string, kind: ToastKind = "info") => {
      if (!message) return;
      if (hideTimer.current) clearTimeout(hideTimer.current);

      // A new toast replaces the current one rather than queueing: the newest
      // message is always the one worth reading.
      nextId.current += 1;
      setToast({ id: nextId.current, message, kind });

      opacity.setValue(0);
      translateY.setValue(-12);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: reduceMotion ? 0 : motion.base,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          ...motion.springSoft,
        }),
      ]).start();

      hideTimer.current = setTimeout(dismiss, DURATION[kind]);
    },
    [opacity, translateY, dismiss, reduceMotion]
  );

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    []
  );

  const value: ToastContextValue = {
    show,
    success: useCallback((m: string) => show(m, "success"), [show]),
    error: useCallback((m: string) => show(m, "error"), [show]),
    info: useCallback((m: string) => show(m, "info"), [show]),
    showError: useCallback(
      (err: unknown) => show(getErrorMessage(err), "error"),
      [show]
    ),
  };

  const tone = toast
    ? {
        success: { bg: t.successSoft, border: t.successBorder, fg: t.success },
        error: { bg: t.dangerSoft, border: t.dangerBorder, fg: t.danger },
        info: { bg: t.infoSoft, border: t.infoBorder, fg: t.info },
      }[toast.kind]
    : null;

  return (
    <ToastContext.Provider value={value}>
      {children}
      <SessionExpiryWatcher />
      {toast && tone && (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.wrap,
            { top: insets.top + space.sm, opacity, transform: [{ translateY }] },
          ]}
        >
          <Pressable
            onPress={dismiss}
            // Announced without stealing focus from whatever the user is doing.
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            accessibilityLabel={toast.message}
            accessibilityHint="Tap to dismiss"
            style={[
              styles.toast,
              { backgroundColor: tone.bg, borderColor: tone.border },
              elevation(3, t.scheme === "dark"),
            ]}
          >
            <Icon name={ICON[toast.kind]} size="md" color={tone.fg} />
            <Text variant="subheadStrong" style={{ color: tone.fg, flex: 1 }}>
              {toast.message}
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

/**
 * Reports an expired session. Lives here because auth deliberately can't reach
 * the toast layer directly — see the note on AuthContext.sessionExpiredAt.
 */
function SessionExpiryWatcher() {
  const { sessionExpiredAt, acknowledgeSessionExpiry } = useAuth();
  const toast = useToast();

  useEffect(() => {
    if (!sessionExpiredAt) return;
    toast.error("Your session has expired. Please sign in again.");
    acknowledgeSessionExpiry();
  }, [sessionExpiredAt, toast, acknowledgeSessionExpiry]);

  return null;
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: space.lg,
    zIndex: 1000,
    elevation: 1000,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    maxWidth: 480,
    width: "100%",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
});
