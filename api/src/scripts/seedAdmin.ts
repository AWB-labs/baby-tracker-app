import "dotenv/config";
import bcrypt from "bcrypt";
import prisma from "../lib/prisma";

/**
 * Create (or reset) the dashboard's admin account.
 *
 *   npm run db:seed-admin --workspace=api
 *
 * Idempotent: run it again to reset a forgotten password rather than to make a
 * second account. The credentials can be overridden per-run, which is how a
 * real deployment should set them —
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='…' npm run db:seed-admin --workspace=api
 */
const email = (process.env.ADMIN_EMAIL ?? "admin@mail.com").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? "aminaelbadry2026";
const name = process.env.ADMIN_NAME ?? "Administrator";

async function main(): Promise<void> {
  const hashed = await bcrypt.hash(password, 10);

  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: { password: hashed, name },
    create: { email, password: hashed, name },
    select: { id: true, email: true, name: true, createdAt: true },
  });

  console.log(`Admin ready: ${admin.email} (id ${admin.id})`);
  console.log("Sign in at /admin.");
}

main()
  .catch((err) => {
    console.error("Seeding the admin account failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
