import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getErrorMessage } from "../lib/errors";

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

const KIND_STYLE: Record<
  ToastKind,
  { background: string; border: string; text: string; icon: string }
> = {
  success: { background: "#f0fdf4", border: "#86efac", text: "#15803d", icon: "✓" },
  error: { background: "#fef2f2", border: "#fca5a5", text: "#b91c1c", icon: "!" },
  info: { background: "#eff6ff", border: "#93c5fd", text: "#1d4ed8", icon: "i" },
};

// Errors linger a little longer: they usually ask the reader to do something.
const DURATION: Record<ToastKind, number> = {
  success: 2600,
  info: 3000,
  error: 4200,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-16)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);
  const insets = useSafeAreaInsets();

  const dismiss = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -16,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setToast(null);
    });
  }, [opacity, translateY]);

  const show = useCallback(
    (message: string, kind: ToastKind = "info") => {
      if (!message) return;
      if (hideTimer.current) clearTimeout(hideTimer.current);

      // A new toast replaces the current one rather than queueing: the newest
      // message is always the one worth reading.
      nextId.current += 1;
      setToast({ id: nextId.current, message, kind });

      opacity.setValue(0);
      translateY.setValue(-16);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          friction: 8,
          tension: 80,
          useNativeDriver: true,
        }),
      ]).start();

      hideTimer.current = setTimeout(dismiss, DURATION[kind]);
    },
    [opacity, translateY, dismiss]
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

  const palette = toast ? KIND_STYLE[toast.kind] : KIND_STYLE.info;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.wrap,
            { top: insets.top + 8, opacity, transform: [{ translateY }] },
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={dismiss}
            accessibilityRole="alert"
            accessibilityLabel={toast.message}
            style={[
              styles.toast,
              {
                backgroundColor: palette.background,
                borderColor: palette.border,
              },
            ]}
          >
            <View style={[styles.badge, { backgroundColor: palette.border }]}>
              <Text style={[styles.badgeText, { color: palette.text }]}>
                {palette.icon}
              </Text>
            </View>
            <Text style={[styles.message, { color: palette.text }]}>
              {toast.message}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
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
    paddingHorizontal: 16,
    zIndex: 1000,
    elevation: 1000,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    maxWidth: 480,
    width: "100%",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
  badge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 13, fontWeight: "900" },
  message: { flex: 1, fontSize: 13, fontWeight: "600", lineHeight: 18 },
});
