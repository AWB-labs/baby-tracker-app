import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Where the app talks to.
 *
 * Production is a public HTTPS URL, so any device on any network can reach it —
 * no LAN IP, no firewall rule, no "same Wi-Fi" requirement.
 *
 * To point at a server running on this machine instead, set EXPO_PUBLIC_API_URL
 * before starting Expo:
 *   Expo Go on a phone   -> http://<your-LAN-IP>:3001   (and allow port 3001
 *                            through the firewall)
 *   Android emulator     -> http://10.0.2.2:3001
 *   iOS simulator        -> http://localhost:3001
 */
const PRODUCTION_API_URL = "https://baby-tracker-app-api.vercel.app";

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || PRODUCTION_API_URL;

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  // Serverless functions cold-start, and a phone on mobile data adds latency on
  // top; 10s was tight enough to time out a first request that would have
  // succeeded.
  timeout: 20000,
});

// Inject token on every request
apiClient.interceptors.request.use(async (config) => {
  try {
    const token = await AsyncStorage.getItem("babytracker_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // ignore
  }
  return config;
});

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

/**
 * Called when the server rejects our token. Registered by AuthProvider so an
 * expired session drops the user back to the sign-in screen with an
 * explanation, instead of every screen quietly failing to load.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Sign-in and sign-up answer 401 for a wrong password; that's a normal
    // failed attempt, not an expired session, so it must not sign anyone out.
    const url = error?.config?.url ?? "";
    const isAuthAttempt = url.includes("/auth/");
    if (error?.response?.status === 401 && !isAuthAttempt) {
      onUnauthorized?.();
    }
    return Promise.reject(error);
  }
);

export default apiClient;
