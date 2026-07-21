import "react-native-gesture-handler";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ToastProvider } from "./src/components/Toast";
import { AuthProvider } from "./src/context/AuthContext";
import { SettingsProvider } from "./src/context/SettingsContext";
import { BabyProvider } from "./src/context/BabyContext";
import RootNavigator from "./src/navigation/RootNavigator";
import { configureNotificationHandler } from "./src/lib/push";

// Reminders should surface while the app is open, not just in the background.
configureNotificationHandler();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* SafeAreaProvider must wrap the toast, which positions itself using
          the status-bar inset. */}
      <SafeAreaProvider>
        <ToastProvider>
          <AuthProvider>
            <SettingsProvider>
              <BabyProvider>
                <RootNavigator />
                <StatusBar style="dark" />
              </BabyProvider>
            </SettingsProvider>
          </AuthProvider>
        </ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
