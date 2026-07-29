import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * One client per process, in every environment.
 *
 * The usual version of this guards the global assignment with
 * `NODE_ENV !== "production"`, which is written for a dev server that
 * re-evaluates modules on hot reload. On serverless that condition is exactly
 * backwards: production is where a warm container should be reusing an already
 * connected client, and creating a fresh one costs a connection handshake to
 * the pooler on a request the user is waiting for.
 *
 * Connecting is lazy, so this line itself is cheap — the cost being avoided is
 * a second client on a container that already has one.
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

globalForPrisma.prisma = prisma;

export default prisma;
