import "dotenv/config";
// Patches Express 4 so a rejected promise from an async handler reaches the
// error middleware. Without it such a request hangs until the client times out
// instead of returning anything at all. Must be imported before the routers.
import "express-async-errors";
import express from "express";
import cors from "cors";
import { ZodError } from "zod";

import authRouter from "./routes/auth";
import meRouter from "./routes/me";
import babiesRouter from "./routes/babies";
import membersRouter from "./routes/members";
import logsRouter from "./routes/logs";
import profilesRouter from "./routes/profiles";
import settingsRouter from "./routes/settings";
import remindersRouter from "./routes/reminders";
import internalRouter from "./routes/internal";
import { AppError, friendlyPrismaMessage } from "./lib/httpError";

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => res.json({ ok: true }));

// Routes
app.use("/auth", authRouter);
app.use("/me", meRouter);
app.use("/babies", babiesRouter);
// Caregiver management hangs off a baby: /babies/:babyId/members
app.use("/babies", membersRouter);
app.use("/logs", logsRouter);
app.use("/profiles", profilesRouter);
app.use("/settings", settingsRouter);
app.use("/reminders", remindersRouter);
app.use("/internal", internalRouter);

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
