import apiClient from "./client";

/**
 * How a caregiver is related to the baby. Mirrors api/src/lib/relations.ts.
 *
 * Descriptive only — access is decided by `role`, so a grandmother has exactly
 * the same rights as a father. It exists so the caregiver list reads as people
 * rather than as a column of email addresses.
 */
export const RELATIONS: { value: string; label: string; emoji: string }[] = [
  { value: "mother", label: "Mother", emoji: "👩" },
  { value: "father", label: "Father", emoji: "👨" },
  { value: "sister", label: "Sister", emoji: "👧" },
  { value: "brother", label: "Brother", emoji: "👦" },
  { value: "grandmother", label: "Grandmother", emoji: "👵" },
  { value: "grandfather", label: "Grandfather", emoji: "👴" },
  { value: "aunt", label: "Aunt", emoji: "👩‍🦰" },
  { value: "uncle", label: "Uncle", emoji: "🧔" },
  { value: "guardian", label: "Guardian", emoji: "🧑‍⚖️" },
  { value: "nanny", label: "Nanny", emoji: "🧑‍🍼" },
  { value: "other", label: "Other", emoji: "🧑" },
];

const RELATION_BY_VALUE = new Map(RELATIONS.map((r) => [r.value, r]));

/** "Grandmother" / "Other · Nanny", or null when nobody said. */
export function formatRelation(
  relation: string | null,
  relationNote: string | null
): string | null {
  if (!relation) return null;
  const meta = RELATION_BY_VALUE.get(relation);
  if (!meta) return null;
  if (relation === "other" && relationNote) return `${meta.label} · ${relationNote}`;
  return meta.label;
}

export function relationEmoji(relation: string | null): string | null {
  return relation ? RELATION_BY_VALUE.get(relation)?.emoji ?? null : null;
}

export interface BabyMember {
  id: number;
  accountId: number;
  name: string;
  email: string;
  role: "owner" | "member";
  relation: string | null;
  relationNote: string | null;
  joinedAt: string;
  isYou: boolean;
}

export interface PendingInvite {
  id: number;
  email: string;
  role: string;
  relation: string | null;
  relationNote: string | null;
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
  email: string,
  relation?: string | null,
  relationNote?: string | null
): Promise<AddMemberResult> {
  const res = await apiClient.post<AddMemberResult>(
    `/babies/${babyId}/members`,
    { email, relation: relation ?? null, relationNote: relationNote ?? null }
  );
  return res.data;
}

export async function setMemberRelation(
  babyId: number,
  accountId: number,
  relation: string | null,
  relationNote: string | null
): Promise<BabyMember> {
  const res = await apiClient.patch<BabyMember>(
    `/babies/${babyId}/members/${accountId}`,
    { relation, relationNote }
  );
  return res.data;
}

export interface InviteLink {
  id: number;
  /** An 8-character code from an unambiguous alphabet (no 0/O, 1/I/L, no
   *  lowercase) — see formatInviteCode for how it's displayed. */
  token: string;
  expiresAt: string | null;
  expiresInDays: number;
  relation: string | null;
  relationNote: string | null;
}

/**
 * Mint a claim link for a caregiver.
 *
 * Deliberately not a deep link into the app: most people receiving one won't
 * have it installed, so the token is shared as text and pasted into "Join a
 * baby" after signing up. A universal link can replace this without the server
 * changing.
 */
export async function createInviteLink(
  babyId: number,
  relation?: string | null,
  relationNote?: string | null
): Promise<InviteLink> {
  const res = await apiClient.post<InviteLink>(
    `/babies/${babyId}/invite-link`,
    { relation: relation ?? null, relationNote: relationNote ?? null }
  );
  return res.data;
}

/** "7F3K-9P2Q" — split into two groups of four so an 8-character code reads
 *  as two short chunks instead of one long one. Purely cosmetic: the server
 *  strips the dash back out on claim, so it's fine to copy or type either way. */
export function formatInviteCode(token: string): string {
  if (token.length !== 8) return token;
  return `${token.slice(0, 4)}-${token.slice(4)}`;
}

export interface ClaimResult {
  status: "joined" | "already_member";
  babyId: number;
  babyName: string;
}

export async function claimInvite(token: string): Promise<ClaimResult> {
  // Whatever formatting the display or a fumbled paste added — the dash, a
  // stray space, lowercase — none of it is part of the actual code. The
  // server re-normalises too; doing it here as well means a bad code fails
  // for the actual reason ("not valid") and not a formatting mismatch.
  const cleaned = token.trim().toUpperCase().replace(/[\s-]/g, "");
  const res = await apiClient.post<ClaimResult>("/babies/invites/claim", {
    token: cleaned,
  });
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
