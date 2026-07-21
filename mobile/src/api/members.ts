import apiClient from "./client";

export interface BabyMember {
  id: number;
  accountId: number;
  name: string;
  email: string;
  role: "owner" | "member";
  joinedAt: string;
  isYou: boolean;
}

export interface PendingInvite {
  id: number;
  email: string;
  role: string;
  createdAt: string;
}

export interface MembersResponse {
  members: BabyMember[];
  pendingInvites: PendingInvite[];
}

export async function getMembers(babyId: number): Promise<MembersResponse> {
  const res = await apiClient.get<MembersResponse>(`/babies/${babyId}/members`);
  return res.data;
}

export interface AddMemberResult {
  status: "added" | "invited";
  message: string;
  member?: BabyMember;
  invite?: PendingInvite;
}

export async function addMember(
  babyId: number,
  email: string
): Promise<AddMemberResult> {
  const res = await apiClient.post<AddMemberResult>(
    `/babies/${babyId}/members`,
    { email }
  );
  return res.data;
}

export async function removeMember(
  babyId: number,
  accountId: number
): Promise<void> {
  await apiClient.delete(`/babies/${babyId}/members/${accountId}`);
}

export async function cancelInvite(
  babyId: number,
  inviteId: number
): Promise<void> {
  await apiClient.delete(`/babies/${babyId}/invites/${inviteId}`);
}
