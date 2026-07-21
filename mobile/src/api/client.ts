import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Update this to your API server address.
// For Expo Go on a physical device, use your machine's LAN IP (e.g. http://192.168.1.x:3001).
// For Android emulator use http://10.0.2.2:3001
// For iOS simulator use http://localhost:3001
export const API_BASE_URL = "http://192.168.1.99:3001";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 10000,
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
