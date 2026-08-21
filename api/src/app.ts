import "dotenv/config";
// Patches Express 4 so a rejected promise from an async handler reaches the
// error middleware. Without it such a request hangs until the client times out
// instead of returning anything at all. Must be imported before the routers.
import "express-async-errors";
import path from "path";
import express from "express";
import cors from "cors";
import compression from "compression";
import { ZodError } from "zod";

import authRouter from "./routes/auth";
import meRouter from "./routes/me";
import babiesRouter from "./routes/babies";
import membersRouter from "./routes/members";
import diaperStockRouter from "./routes/diaperStock";
import logsRouter from "./routes/logs";
import activeTimersRouter from "./routes/activeTimers";
import vaccinesRouter from "./routes/vaccines";
import profilesRouter from "./routes/profiles";
import settingsRouter from "./routes/settings";
import remindersRouter from "./routes/reminders";
import bagRouter from "./routes/bag";
import internalRouter from "./routes/internal";
import adminRouter from "./routes/admin";
import { AppError, friendlyPrismaMessage } from "./lib/httpError";

const app = express();

app.use(cors());
// A log response is thousands of near-identical JSON objects, which gzip cuts by
// roughly an order of magnitude. Mounted before the routes so it covers every
// one of them, and it matters most on the phone: these bodies are fetched over
// mobile data, and the hosting tier bills for outbound bandwidth.
app.use(compression());
app.use(express.json());

/**
 * Health check, and which build is answering.
 *
 * The commit is here because "is my change live?" was repeatedly guessed at by
 * probing for a route that only exists in the new code — which conflates a
 * missing deploy with a genuine 404. Vercel injects the SHA at build time; it
 * reads "local" anywhere else.
 *
 * Answered `no-store` rather than Express's default (`public, max-age=0,
 * must-revalidate` plus an ETag). That default does force revalidation, so it
 * isn't currently serving anything stale — but `public` still invites any
 * shared cache between here and the caller to keep a copy, and a version
 * stamp that something is allowed to hold is a version stamp that can lie.
 * The one thing this endpoint exists to do is be believed.
 *
 * Worth knowing when this reads older than you expect: the far likelier cause
 * is a deploy still in flight, not a cache. The SHA only changes once the new
 * deployment actually starts serving, so the reliable check is to poll this
 * until it matches `git rev-parse --short HEAD` rather than to read it once
 * and conclude the push failed.
 */
app.get("/health", (_req, res) => {
  res.set("Cache-Control", "no-store, max-age=0");
  res.json({
    ok: true,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
  });
});

// Routes
app.use("/auth", authRouter);
app.use("/me", meRouter);
app.use("/babies", babiesRouter);
// Caregiver management hangs off a baby: /babies/:babyId/members
app.use("/babies", membersRouter);
app.use("/babies", diaperStockRouter);
app.use("/logs", logsRouter);
app.use("/active-timers", activeTimersRouter);
app.use("/vaccines", vaccinesRouter);
app.use("/profiles", profilesRouter);
app.use("/settings", settingsRouter);
app.use("/reminders", remindersRouter);
app.use("/bag-items", bagRouter);
app.use("/internal", internalRouter);

/**
 * The admin dashboard: its JSON under /admin/api, its pages under /admin.
 *
 * The API is mounted first so the static handler below can never shadow it,
 * and the dashboard is served from this same app rather than deployed
 * separately so it needs no CORS grant, no second set of environment
 * variables, and no way to drift from the API it reads.
 *
 * `__dirname` is src/ when running from ts-node and dist/ once built — both a
 * single level under the package root, so one relative path finds public/
 * either way.
 */
const ADMIN_DIR = path.resolve(__dirname, "..", "public", "admin");
app.use("/admin/api", adminRouter);
app.use("/admin", express.static(ADMIN_DIR));
// The dashboard routes on the hash, so this only catches a hard refresh of a
// path that isn't a real file — hand back the shell rather than the JSON 404.
app.get("/admin/*", (_req, res) => {
  res.sendFile(path.join(ADMIN_DIR, "index.html"));
});

// Unknown route — still a readable message rather than Express's HTML page.
app.use((_req, res) => {
  res.status(404).json({ error: "That page doesn't exist." });
});

/**
 * Every error the app can ever receive passes through here.
 *
 * The rule: a client only ever sees a sentence written for a parent. Known,
 * expected failures carry their own message; anything else is a bug, gets
 * logged in full server-side, and is reported as a generic apology so no stack
 * trace, SQL fragment or "Internal server error" leaks into the UI.
 */
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    if (err instanceof AppError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }

    if (err instanceof ZodError) {
      res.status(400).json({
        error: err.errors[0]?.message ?? "Some of those details aren't valid.",
        code: "validation",
      });
      return;
    }

    if (err instanceof SyntaxError && "body" in err) {
      res.status(400).json({ error: "That request was malformed.", code: "bad_json" });
      return;
    }

    const prismaError = friendlyPrismaMessage(err);
    if (prismaError) {
      res
        .status(prismaError.status)
        .json({ error: prismaError.message, code: prismaError.code });
      return;
    }

    console.error("[unhandled]", err);
    res.status(500).json({
      error: "Something went wrong on our end. Please try again.",
      code: "server_error",
    });
  }
);

export default app;
