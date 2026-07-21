import "react-native-gesture-handler";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ToastProvider } from "./src/components/Toast";
import { AuthProvider } from "./src/context/AuthContext";
import { SettingsProvider } from "./src/context/SettingsContext";
import { BabyProvider } from "./src/context/BabyContext";
import { ThemeProvider, useThemeContext } from "./src/design/ThemeProvider";
import RootNavigator from "./src/navigation/RootNavigator";
import { configureNotificationHandler } from "./src/lib/push";

// Reminders should surface while the app is open, not just in the background.
configureNotificationHandler();

/**
 * Provider order is load-bearing:
 *
 *   Auth      -> owns the session everything else keys off
 *   Settings  -> needs the session; supplies the accent colour
 *   Baby      -> needs the session; supplies the fallback accent
 *   Theme     -> reads both to resolve the palette
 *   Toast     -> is themed, so it must sit inside Theme
 *
 * Auth therefore cannot raise toasts directly; it publishes a session-expiry
 * event that the toast layer picks up instead.
 */
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <SettingsProvider>
            <BabyProvider>
              <ThemeProvider>
                <ToastProvider>
                  <RootNavigator />
                  <ThemedStatusBar />
                </ToastProvider>
              </ThemeProvider>
            </BabyProvider>
          </SettingsProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Status bar icons have to invert with the theme or they vanish. */
function ThemedStatusBar() {
  const { isDark } = useThemeContext();
  return <StatusBar style={isDark ? "light" : "dark"} />;
}
