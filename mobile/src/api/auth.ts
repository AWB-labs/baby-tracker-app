import apiClient from "./client";
import type { AccountSettings, UnitSystem } from "./settings";

export interface AccountInfo {
  id: number;
  name: string;
  email: string;
  unitSystem?: UnitSystem;
  themeColor?: string | null;
  notificationsEnabled?: boolean;
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
