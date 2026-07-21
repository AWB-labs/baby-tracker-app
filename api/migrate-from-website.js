/**
 * One-way migration: baby-tracker-website  ->  baby-tracker-app
 *
 * Copies every ActivityLog row from the website's database into the app's
 * database, under a named account and a new baby.
 *
 * Run it from D:/baby-tracker-app/api (it uses that workspace's Prisma client):
 *     node migrate-to-app.js              # dry run, writes nothing
 *     node migrate-to-app.js --confirm    # actually writes
 *
 * The target account must already exist — sign up in the app first. This script
 * never creates accounts and never handles a password.
 */

const path = require("path");
const { PrismaClient } = require("@prisma/client");

// ---------------------------------------------------------------- settings --
// Defaults match the account and baby that already exist in the app's database.
// The baby is looked up by name *within this account*, so the unrelated "Touti"
// belonging to another account is never touched.
const TARGET_EMAIL = (process.env.TARGET_EMAIL || "nour@babytracker.com")
  .trim()
  .toLowerCase();
const BABY_NAME = process.env.BABY_NAME || "Touti";
// Only used when the baby has to be created; an existing one keeps its own.
const BABY_GENDER = process.env.BABY_GENDER || "girl"; // "girl" | "boy"
const BABY_DOB = process.env.BABY_DOB || null; // "YYYY-MM-DD" or null
const CHUNK = 500;
const CONFIRM = process.argv.includes("--confirm");

// Load each app's .env explicitly; the two databases are different servers.
require("dotenv").config({ path: "D:/baby-tracker-app/api/.env" });
const TARGET_URL = process.env.DATABASE_URL;
const sourceEnv = require("dotenv").config({
  path: "D:/Projects/baby-tracker-website/.env",
  processEnv: {}, // don't clobber DATABASE_URL above
});
const SOURCE_URL = sourceEnv.parsed && sourceEnv.parsed.PRISMA_DATABASE_URL;

if (!TARGET_URL) throw new Error("DATABASE_URL missing from baby-tracker-app/api/.env");
if (!SOURCE_URL) throw new Error("PRISMA_DATABASE_URL missing from baby-tracker-website/.env");

// Mirrors api/src/lib/activities.ts — the destination decides what counts as a
// moment, so rows normalise to the rules of the app they are landing in.
const INSTANT_TYPES = new Set([
  "diaper",
  "shower",
  "vitamin",
  "nailcut",
  "growth",
  "health",
]);
function isInstantLog(type, { side, amountMl } = {}) {
  if (INSTANT_TYPES.has(type)) return true;
  if (type !== "feed" && type !== "pump") return false;
  const hasMl = amountMl !== undefined && amountMl !== null && amountMl !== "";
  return hasMl && !side;
}

const target = new PrismaClient();
// Raw SQL only — the source database has a different schema, so the generated
// client's models don't apply to it, but $queryRaw doesn't care.
const source = new PrismaClient({ datasources: { db: { url: SOURCE_URL } } });

(async () => {
  console.log(CONFIRM ? "MODE: WRITING\n" : "MODE: DRY RUN (pass --confirm to write)\n");

  // -- 1. the account must already exist -------------------------------------
  const account = await target.account.findUnique({
    where: { email: TARGET_EMAIL },
    select: { id: true, email: true, name: true },
  });
  if (!account) {
    // Deliberately not created here. Signing up is the app's own job: POST
    // /auth/signup hashes the password with bcrypt, creates the default
    // Profile, and redeems any pending invites. A migration script that
    // inserted the row itself would duplicate that logic and drift from it.
    console.error(
      `\nNo account with email "${TARGET_EMAIL}" in this database yet.\n` +
        `\nCreate it by signing up — in the app, or with one request:\n` +
        `\n  curl -X POST https://baby-tracker-app-api.vercel.app/auth/signup \\\n` +
        `    -H "Content-Type: application/json" \\\n` +
        `    -d '{"name":"Nour","email":"${TARGET_EMAIL}","password":"YOUR-PASSWORD"}'\n` +
        `\nOr against a local API (npm run dev, port 3001):\n` +
        `\n  curl -X POST http://localhost:3001/auth/signup \\\n` +
        `    -H "Content-Type: application/json" \\\n` +
        `    -d '{"name":"Nour","email":"${TARGET_EMAIL}","password":"YOUR-PASSWORD"}'\n` +
        `\nThen re-run this script. It picks the account up automatically.\n`
    );
    process.exit(1);
  }
  console.log(`Account: #${account.id} ${account.name} <${account.email}>`);

  // -- 2. adopt an empty baby, or refuse to run twice ------------------------
  // Signing up lands on the app's "create your baby" screen when the account
  // has none, so Amina may already exist by the time this runs. An empty one is
  // adopted and filled; one that already has logs is left alone, because a
  // second run would duplicate every row.
  const existing = await target.baby.findFirst({
    where: { ownerAccountId: account.id, name: BABY_NAME },
    select: { id: true, name: true, gender: true, _count: { select: { logs: true } } },
  });
  if (existing && existing._count.logs > 0) {
    console.error(
      `\nBaby "${existing.name}" (#${existing.id}) already has ${existing._count.logs} logs.\n` +
        `Nothing was changed. Delete the baby in the app if you want a clean re-import.`
    );
    process.exit(1);
  }
  if (existing) {
    console.log(`Found empty baby #${existing.id} "${existing.name}" (${existing.gender}) — will fill it`);
  }

  // -- 3. read the source ----------------------------------------------------
  const rows = await source.$queryRawUnsafe(`
    SELECT id, type, side, "amountMl", "diaperStatus", "weightKg", "heightCm",
           "healthCondition", medication, dose, "feverCelsius",
           "startTime", "endTime", "durationMinutes", comments,
           "enteredByName", "pauseTimelineJson", "createdAt"
    FROM "ActivityLog"
    ORDER BY id ASC
  `);
  console.log(`Source rows: ${rows.length}`);

  // -- 4. map + normalise ----------------------------------------------------
  let healed = 0;
  const skipped = [];
  const data = [];

  for (const r of rows) {
    const start = new Date(r.startTime);
    let end = r.endTime === null ? null : new Date(r.endTime);

    if (isNaN(start.getTime())) {
      skipped.push({ id: r.id, why: "invalid startTime" });
      continue;
    }

    // An instant activity is a moment, not a span. Pin the end to the start so
    // legacy rows that picked up a bogus duration land clean.
    if (isInstantLog(r.type, { side: r.side, amountMl: r.amountMl })) {
      if (end === null || end.getTime() !== start.getTime() || r.durationMinutes) {
        healed++;
      }
      end = start;
    } else if (end && end.getTime() < start.getTime()) {
      skipped.push({ id: r.id, why: "endTime before startTime" });
      continue;
    }

    const durationMinutes =
      end === null ? null : (end.getTime() - start.getTime()) / 60000;

    data.push({
      accountId: account.id,
      // babyId filled in after the baby is created
      type: r.type,
      side: r.side,
      amountMl: r.amountMl,
      diaperStatus: r.diaperStatus,
      weightKg: r.weightKg,
      heightCm: r.heightCm,
      healthCondition: r.healthCondition,
      medication: r.medication,
      dose: r.dose,
      feverCelsius: r.feverCelsius,
      startTime: start,
      endTime: end,
      durationMinutes,
      comments: r.comments,
      enteredByName: r.enteredByName,
      pauseTimelineJson: r.pauseTimelineJson,
      createdAt: new Date(r.createdAt), // preserved; the HTTP API can't do this
    });
  }

  const byType = data.reduce((m, d) => ((m[d.type] = (m[d.type] || 0) + 1), m), {});
  console.log(`Mapped: ${data.length}   healed (instant rows): ${healed}   skipped: ${skipped.length}`);
  console.log(`By type: ${JSON.stringify(byType)}`);
  if (skipped.length) console.log(`Skipped detail: ${JSON.stringify(skipped.slice(0, 20))}`);

  if (!CONFIRM) {
    console.log(
      `\nDry run complete. Would ${
        existing
          ? `fill existing baby #${existing.id} "${existing.name}"`
          : `create baby "${BABY_NAME}" (${BABY_GENDER})`
      } on account #${account.id} with ${data.length} logs.`
    );
    await target.$disconnect();
    await source.$disconnect();
    return;
  }

  // -- 5. create the baby + the membership that grants access ----------------
  // Access is membership, not ownership (api/src/lib/babyAccess.ts): without a
  // BabyMember row the baby is invisible even to the account that owns it. A
  // baby made in the app already has one; a baby made here needs it created.
  const baby = existing
    ? existing
    : await target.baby.create({
        data: {
          ownerAccountId: account.id,
          name: BABY_NAME,
          gender: BABY_GENDER,
          dob: BABY_DOB ? new Date(BABY_DOB) : null,
          members: { create: { accountId: account.id, role: "owner" } },
        },
        select: { id: true, name: true, gender: true },
      });
  console.log(
    existing
      ? `\nFilling existing baby #${baby.id} "${baby.name}"`
      : `\nCreated baby #${baby.id} "${baby.name}" (${baby.gender}) + owner membership`
  );

  // Belt and braces: adopt a baby that somehow has no membership row.
  await target.babyMember.upsert({
    where: { babyId_accountId: { babyId: baby.id, accountId: account.id } },
    update: {},
    create: { babyId: baby.id, accountId: account.id, role: "owner" },
  });

  // -- 6. insert in chunks ---------------------------------------------------
  let inserted = 0;
  for (let i = 0; i < data.length; i += CHUNK) {
    const slice = data.slice(i, i + CHUNK).map((d) => ({ ...d, babyId: baby.id }));
    const res = await target.activityLog.createMany({ data: slice });
    inserted += res.count;
    console.log(`  inserted ${inserted}/${data.length}`);
  }

  // -- 7. verify against the source -----------------------------------------
  const finalCount = await target.activityLog.count({ where: { babyId: baby.id } });
  const finalByType = await target.activityLog.groupBy({
    by: ["type"],
    where: { babyId: baby.id },
    _count: { _all: true },
  });
  const range = await target.activityLog.aggregate({
    where: { babyId: baby.id },
    _min: { startTime: true },
    _max: { startTime: true },
  });
  const memberOk = await target.babyMember.findUnique({
    where: { babyId_accountId: { babyId: baby.id, accountId: account.id } },
    select: { role: true },
  });

  console.log("\n--- verification ---");
  console.log(`rows in target for baby #${baby.id}: ${finalCount} (expected ${data.length})`);
  console.log(`by type: ${JSON.stringify(
    Object.fromEntries(finalByType.map((t) => [t.type, t._count._all]))
  )}`);
  console.log(`date range: ${range._min.startTime?.toISOString()} -> ${range._max.startTime?.toISOString()}`);
  console.log(`owner membership: ${memberOk ? memberOk.role : "MISSING"}`);
  console.log(finalCount === data.length && memberOk ? "\nOK" : "\nMISMATCH — check above");

  await target.$disconnect();
  await source.$disconnect();
})().catch(async (e) => {
  console.error("\nFAILED:", e.message);
  try { await target.$disconnect(); await source.$disconnect(); } catch {}
  process.exit(1);
});
