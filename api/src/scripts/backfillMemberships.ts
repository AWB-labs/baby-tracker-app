import "dotenv/config";
import prisma from "../lib/prisma";

/**
 * Give every pre-existing baby an owner membership.
 *
 * Access used to be implied by Baby.accountId. It is now carried by BabyMember
 * rows, so without this every existing baby would become invisible to the
 * person who created it. Safe to run repeatedly — it only fills in what's
 * missing.
 */
async function main() {
  const babies = await prisma.baby.findMany({
    select: { id: true, name: true, ownerAccountId: true },
  });

  if (babies.length === 0) {
    console.log("No babies found — nothing to backfill.");
    return;
  }

  const result = await prisma.babyMember.createMany({
    data: babies.map((b) => ({
      babyId: b.id,
      accountId: b.ownerAccountId,
      role: "owner",
    })),
    skipDuplicates: true,
  });

  console.log(
    `Checked ${babies.length} baby/babies — created ${result.count} owner membership(s).`
  );

  // A baby with no members at all would be unreachable by anyone.
  const orphans = await prisma.baby.findMany({
    where: { members: { none: {} } },
    select: { id: true, name: true },
  });
  if (orphans.length > 0) {
    console.warn(
      `WARNING: ${orphans.length} baby/babies still have no caregivers:`,
      orphans.map((o) => `${o.name} (#${o.id})`).join(", ")
    );
  } else {
    console.log("Every baby has at least one caregiver.");
  }
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
