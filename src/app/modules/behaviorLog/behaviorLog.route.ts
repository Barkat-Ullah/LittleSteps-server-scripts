import express from "express";
import auth from "../../middlewares/auth";
import { behaviorLogController } from "./behaviorLog.controller";

const router = express.Router();

router.post("/", auth(), behaviorLogController.updateBehaviorLog);

router.get("/:childId", auth(), behaviorLogController.getBehaviorLogByChild);

export const behaviorLogRouter = router;
