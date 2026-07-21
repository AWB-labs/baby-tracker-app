import apiClient from "./client";
import type { Baby } from "./auth";

export async function createBaby(data: {
  name: string;
  gender: "girl" | "boy";
  dob?: string | null;
}): Promise<Baby> {
  const res = await apiClient.post<Baby>("/babies", data);
  return res.data;
}

export async function getBabies(): Promise<Baby[]> {
  const res = await apiClient.get<Baby[]>("/babies");
  return res.data;
}

export async function updateBaby(
  id: number,
  data: {
    name?: string;
    gender?: "girl" | "boy";
    dob?: string | null;
    avatarEmoji?: string | null;
    avatarColor?: string | null;
  }
): Promise<Baby> {
  const res = await apiClient.patch<Baby>(`/babies/${id}`, data);
  return res.data;
}

export async function deleteBaby(id: number): Promise<void> {
  await apiClient.delete(`/babies/${id}`);
}
