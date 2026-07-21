import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";

export type PushSetupStatus =
  | "granted"
  | "denied"
  | "unsupported"
  | "not_configured"
  | "failed";

export interface PushSetupResult {
  status: PushSetupStatus;
  token: string | null;
  /** A sentence explaining the status, safe to show in Settings. */
  message: string;
}

/** Show reminders while the app is open too, not only in the background. */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: string } }
    | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/**
 * Ask for permission and obtain this device's Expo push token.
 *
 * Every failure path returns a readable reason rather than throwing, because
 * this runs in the background at launch — a phone that can't receive pushes
 * must not stop the rest of the app working.
 */
export async function registerForPushNotifications(): Promise<PushSetupResult> {
  if (!Device.isDevice) {
    return {
      status: "unsupported",
      token: null,
      message: "Reminders need a real device — a simulator can't receive them.",
    };
  }

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("reminders", {
        name: "Reminders",
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      const requested = await Notifications.requestPermissionsAsync();
      granted = requested.granted;
    }

    if (!granted) {
      return {
        status: "denied",
        token: null,
        message:
          "Notifications are turned off for this app. Enable them in your phone's settings to get reminders.",
      };
    }

    const id = projectId();
    if (!id) {
      // getExpoPushTokenAsync throws without one; a clear explanation beats a
      // caught exception nobody can act on.
      return {
        status: "not_configured",
        token: null,
        message:
          "Push reminders need an EAS project id in app.json and a development build.",
      };
    }

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    return {
      status: "granted",
      token: data,
      message: "Reminders are on for this device.",
    };
  } catch {
    return {
      status: "failed",
      token: null,
      message: "Couldn't set up reminders on this device. You can try again later.",
    };
  }
}
