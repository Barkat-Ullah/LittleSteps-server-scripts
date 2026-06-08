import { Router } from "express";
import {
  bullBoard,
  bullBoardBasePath,
} from "../../helpers/queueMonitor/bullBoard";
import { apiKeyMiddleware } from "../middlewares/apiKeyMiddleware";
import { apiAccessTokenMiddleware } from "../middlewares/apiAccessTokenMiddleware";
import userRouter from "../modules/user/user.route";
import authRouter from "../modules/auth/auth.route";
import sendResponse from "../../shared/sendResponse";
import uploadRouter from "../modules/upload/upload.route";
import taskRouter from "../modules/task/task.route";
import { favoriteRouter } from "../modules/favorite/favorite.route";
import { childrenRouter } from "../modules/children/children.route";
import { childDocumentRouter } from "../modules/childDocument/childDocument.route";
import { noteProviderRouter } from "../modules/noteProvider/noteProvider.route";
import { healthCareNoteRouter } from "../modules/healthCareNote/healthCareNote.route";
import { preferenceSensoryNoteRouter } from "../modules/preferenceSensoryNote/preferenceSensoryNote.route";
import { lognoteRouter } from "../modules/lognote/lognote.route";
import { behaviorLogRouter } from "../modules/behaviorLog/behaviorLog.route";
import { scheduleItemRouter } from "../modules/scheduleItem/scheduleItem.route";
import { contactRouter } from "../modules/contact/contact.route";
import {inspireRouter} from "../modules/inspire/inspire.route";

const router = Router();

// 🛡️ Reusable Security Layer Array
const secureApiLayer = [apiKeyMiddleware, apiAccessTokenMiddleware];

// ─────────────────────────────────────────────────────────────────────────────
// 1. GLOBAL / ROUTE-SPECIFIC PROTECTIONS
// ─────────────────────────────────────────────────────────────────────────────
router.use("/users", ...secureApiLayer);
router.use("/users/*", ...secureApiLayer);
router.use("/event", ...secureApiLayer);
router.use("/event/*", ...secureApiLayer);
router.use("/tasks", ...secureApiLayer);
router.use("/tasks/*", ...secureApiLayer);
router.use("/favorites", ...secureApiLayer);
router.use("/favorites/*", ...secureApiLayer);
router.use("/children", ...secureApiLayer);
router.use("/children/*", ...secureApiLayer);
router.use("/child-documents", ...secureApiLayer);
router.use("/child-documents/*", ...secureApiLayer);
router.use("/note-providers", ...secureApiLayer);
router.use("/note-providers/*", ...secureApiLayer);
router.use("/health-care-notes", ...secureApiLayer);
router.use("/health-care-notes/*", ...secureApiLayer);
router.use("/preference", ...secureApiLayer);
router.use("/preference/*", ...secureApiLayer);
router.use("/lognotes", ...secureApiLayer);
router.use("/lognotes/*", ...secureApiLayer);
router.use("/log-behavior", ...secureApiLayer);
router.use("/log-behavior/*", ...secureApiLayer);
router.use("/contact", ...secureApiLayer);
router.use("/contact/*", ...secureApiLayer);
router.use("/inspires", ...secureApiLayer);
router.use("/inspires/*", ...secureApiLayer);

router.use(bullBoardBasePath, ...secureApiLayer);
router.use(`${bullBoardBasePath}/*`, ...secureApiLayer);

router.use("/uploads", uploadRouter);

// ─────────────────────────────────────────────────────────────────────────────
// 2. MOUNT SUB-ROUTERS
// ─────────────────────────────────────────────────────────────────────────────

router.use("/auth", authRouter);
router.use("/users", userRouter);
router.use("/tasks", taskRouter);
router.use("/favorites", favoriteRouter);
router.use("/children", childrenRouter);
router.use("/child-documents", childDocumentRouter);
router.use("/note-providers", noteProviderRouter);
router.use("/health-care-notes", healthCareNoteRouter);
router.use("/preference", preferenceSensoryNoteRouter);
router.use("/lognotes", lognoteRouter);
router.use("/log-behavior", behaviorLogRouter);
router.use("/event", scheduleItemRouter);
router.use("/contact", contactRouter);
router.use("/inspires", inspireRouter);

router.use(bullBoardBasePath, bullBoard);

// ─────────────────────────────────────────────────────────────────────────────
// 3. CATCH-ALL 404 ROUTE
// ─────────────────────────────────────────────────────────────────────────────


// Catch-all 404   <── add this line
router.all("*", (req, res) => {
  return sendResponse(res, {
    statusCode: 404,
    success: false,
    message: `Cannot ${req.method} ${req.url}`,
  });
});

export default router;
