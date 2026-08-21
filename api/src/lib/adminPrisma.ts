import prisma from "./prisma";

/**
 * The same database client the app uses, with a ceiling on how many dashboard
 * queries may be in flight at once.
 *
 * Every admin screen answers a dozen or more unrelated questions and issues
 * them together, which asks the pool for a dozen connections in the same
 * instant. Supabase's session-mode pooler allows fifteen for the entire
 * project, so one overview refresh could exhaust it — failing itself, and
 * taking parents' requests down with it, which is the part that actually
 * matters.
 *
 * The gate is module-level rather than per-request on purpose: three admin tabs
 * refreshing together are three times the fan-out, and the pooler counts the
 * total. Queries past the limit wait their turn instead of failing, so a
 * dashboard gets slower under load rather than erroring.
 *
 * The app's own routes keep the ungated client. They issue three parallel
 * queries at most and have no business queueing behind a dashboard refresh.
 */
const MAX_IN_FLIGHT = 5;

let active = 0;
const waiting: (() => void)[] = [];

async function gate<T>(run: () => Promise<T>): Promise<T> {
  if (active >= MAX_IN_FLIGHT) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  active += 1;
  try {
    return await run();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

/**
 * `$allOperations` at the top level covers raw queries as well as model calls,
 * so the grouped SQL in the engagement route queues with everything else rather
 * than slipping past the gate.
 */
export const adminPrisma = prisma.$extends({
  query: {
    $allOperations: ({ args, query }) => gate(() => query(args)),
  },
});

export default adminPrisma;
