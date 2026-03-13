import { Router } from "express";
import authMiddleware from "../../middleware/auth.js";
import ensureDb from "../../middleware/ensureDb.js";
import {
  streamChat,
  explainErrorHandler,
  repairJsonHandler,
  validateStudentResponseHandler,
  rateContentHandler,
} from "../../controllers/chatController.js";

const router = Router();

router.use(authMiddleware, ensureDb);

router.post("/", streamChat);
router.post("/explain-error", explainErrorHandler);
router.post("/repair-json", repairJsonHandler);
router.post("/validate-student-response", validateStudentResponseHandler);
router.post("/rate-content", rateContentHandler);

export default router;
