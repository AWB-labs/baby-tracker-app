import apiClient from "./client";
import type { AccountSettings, UnitSystem } from "./settings";

export interface AccountInfo {
  id: number;
  name: string;
  email: string;
  unitSystem?: UnitSystem;
  themeColor?: string | null;
  notificationsEnabled?: boolean;
  relation?: string | null;
  relationNote?: string | null;
}

export interface AuthResponse {
  token: string;
  account: AccountInfo;
  /** Babies this email had been invited to, granted on sign-up/sign-in. */
  claimedInvites?: number;
}

export async function signup(
  name: string,
  email: string,
  password: string
): Promise<AuthResponse> {
  const res = await apiClient.post<AuthResponse>("/auth/signup", {
    name,
    email,
    password,
  });
  return res.data;
}

export async function login(
  email: string,
  password: string
): Promise<AuthResponse> {
  const res = await apiClient.post<AuthResponse>("/auth/login", {
    email,
    password,
  });
  return res.data;
}

/**
 * Always resolves, whether or not the email has an account — the server
 * deliberately gives one answer either way, so the app can't be used to test
 * which addresses are registered.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  await apiClient.post("/auth/forgot-password", { email });
}

export async function resetPassword(
  token: string,
  password: string
): Promise<void> {
  await apiClient.post("/auth/reset-password", { token, password });
}

export interface Baby {
  id: number;
  name: string;
  dob: string | null;
  gender: "girl" | "boy";
  avatarEmoji: string | null;
  avatarColor: string | null;
  ownerAccountId: number;
  createdAt: string;
  /** This account's role on the baby. Only present on /me. */
  role?: "owner" | "member";
}

export interface Profile {
  id: number;
  displayName: string;
}

export interface MeResponse {
  account: AccountSettings & { createdAt: string };
  babies: Baby[];
  profiles: Profile[];
}

export async function getMe(): Promise<MeResponse> {
  const res = await apiClient.get<MeResponse>("/me");
  return res.data;
}

/**
 * Permanently delete the signed-in account. Babies it owns are deleted in
 * full, for every caregiver; babies it only helps with keep their history —
 * this account's own entries stay, just no longer attributed to a live login.
 */
export async function deleteAccount(): Promise<void> {
  await apiClient.delete("/me");
}
