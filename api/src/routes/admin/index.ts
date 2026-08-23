import { Router } from "express";
import { adminAuthMiddleware } from "../../middleware/adminAuth";
import authRouter from "./auth";
import overviewRouter from "./overview";
import usersRouter from "./users";
import babiesRouter from "./babies";
import engagementRouter from "./engagement";
import liveRouter from "./live";
import systemRouter from "./system";
import feedbackRouter from "./feedback";

const router = Router();

/**
 * Everything the dashboard reads, under /admin/api.
 *
 * The whole surface is read-only. An admin looking at the numbers has no
 * reason to be able to edit a family's logs, and not building the ability to
 * means a leaked dashboard session cannot damage anyone's data — only expose
 * it, which is bad enough to be worth not compounding.
 */
router.use("/auth", authRouter);

// Login is the only thing reachable without a session; the gate goes here, so
// no route below can forget it.
router.use(adminAuthMiddleware);

router.use("/overview", overviewRouter);
router.use("/users", usersRouter);
router.use("/babies", babiesRouter);
router.use("/engagement", engagementRouter);
router.use("/live", liveRouter);
router.use("/system", systemRouter);
router.use("/feedback", feedbackRouter);

export default router;
