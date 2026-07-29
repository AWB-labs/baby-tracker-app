import apiClient from "./client";

export type UnitSystem = "metric" | "imperial";

export interface AccountSettings {
  id: number;
  name: string;
  email: string;
  unitSystem: UnitSystem;
  themeColor: string | null;
  notificationsEnabled: boolean;
  /** This caregiver's own relationship to their babies. Null until asked. */
  relation: string | null;
  relationNote: string | null;
}

export async function getSettings(): Promise<AccountSettings> {
  const res = await apiClient.get<AccountSettings>("/settings");
  return res.data;
}

export async function updateSettings(data: {
  name?: string;
  unitSystem?: UnitSystem;
  themeColor?: string | null;
  notificationsEnabled?: boolean;
  relation?: string | null;
  relationNote?: string | null;
}): Promise<AccountSettings> {
  const res = await apiClient.patch<AccountSettings>("/settings", data);
  return res.data;
}

export async function registerPushToken(
  token: string,
  platform?: string
): Promise<void> {
  await apiClient.post("/settings/push-token", { token, platform });
}

export async function unregisterPushToken(token: string): Promise<void> {
  await apiClient.delete("/settings/push-token", { data: { token } });
}
