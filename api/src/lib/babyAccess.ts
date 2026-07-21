import prisma from "./prisma";
import { forbidden } from "./httpError";

export type BabyRole = "owner" | "member";

/**
 * The single gate for "may this account touch this baby?".
 *
 * Access is membership, not ownership: a baby's logs belong to the baby, and
 * every caregiver with a BabyMember row reads and writes them equally. Routes
 * must never fall back to filtering on ActivityLog.accountId — that column
 * records who typed the entry, and using it to scope queries would hide each
 * caregiver's entries from the others.
 */
export async function getBabyRole(
  accountId: number,
  babyId: number
): Promise<BabyRole | null> {
  const member = await prisma.babyMember.findUnique({
    where: { babyId_accountId: { babyId, accountId } },
    select: { role: true },
  });
  return (member?.role as BabyRole) ?? null;
}

export async function hasBabyAccess(
  accountId: number,
  babyId: number
): Promise<boolean> {
  return (await getBabyRole(accountId, babyId)) !== null;
}

/** Ids of every baby this account can see, for un-scoped list endpoints. */
export async function accessibleBabyIds(accountId: number): Promise<number[]> {
  const rows = await prisma.babyMember.findMany({
    where: { accountId },
    select: { babyId: true },
  });
  return rows.map((r) => r.babyId);
}

/**
 * Throws unless the account is a member of the baby. `requireOwner` gates the
 * few destructive actions (removing caregivers, deleting the baby) that only
 * the creator should be able to perform.
 *
 * Throws an AppError, so routes can simply call this and let the central error
 * handler turn it into a friendly response.
 */
export async function requireBabyAccess(
  accountId: number,
  babyId: number,
  options: { requireOwner?: boolean } = {}
): Promise<BabyRole> {
  const role = await getBabyRole(accountId, babyId);
  if (!role) {
    // Deliberately indistinguishable from a missing baby: a non-member must not
    // be able to probe which baby ids exist.
    throw forbidden(
      "You don't have access to this baby.",
      "no_baby_access"
    );
  }
  if (options.requireOwner && role !== "owner") {
    throw forbidden(
      "Only the person who created this baby can do that.",
      "owner_only"
    );
  }
  return role;
}
