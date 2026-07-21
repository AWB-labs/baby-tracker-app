import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { registerForPushNotifications, type PushSetupResult } from "../lib/push";
import { registerPushToken, unregisterPushToken } from "../api/settings";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";

const TOKEN_KEY = "babytracker_push_token";

/**
 * Keeps this device's push token in sync with the signed-in account.
 *
 * The token is remembered locally so signing out can withdraw it — otherwise a
 * phone would keep receiving the previous user's reminders.
 */
export function usePushRegistration(): PushSetupResult | null {
  const { token: authToken } = useAuth();
  const { notificationsEnabled } = useSettings();
  const [result, setResult] = useState<PushSetupResult | null>(null);
  const registeredFor = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!authToken) {
        // Signed out: stop this device receiving anything further.
        const stored = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
        if (stored) {
          await unregisterPushToken(stored).catch(() => {});
          await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
        }
        registeredFor.current = null;
        if (!cancelled) setResult(null);
        return;
      }

      if (!notificationsEnabled) return;
      // Re-registering on every render would spam the API; once per session is
      // enough because the token is stable for the install.
      if (registeredFor.current === authToken) return;

      const outcome = await registerForPushNotifications();
      if (cancelled) return;
      setResult(outcome);

      if (outcome.token) {
        try {
          await registerPushToken(outcome.token, Platform.OS);
          await AsyncStorage.setItem(TOKEN_KEY, outcome.token);
          registeredFor.current = authToken;
        } catch {
          // A failed registration just means no reminders yet; the next launch
          // tries again.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authToken, notificationsEnabled]);

  return result;
}
