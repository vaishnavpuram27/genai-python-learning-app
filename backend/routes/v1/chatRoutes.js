import { Router } from "express";
import authMiddleware from "../../middleware/auth.js";
import ensureDb from "../../middleware/ensureDb.js";
import { streamChat, explainErrorHandler } from "../../controllers/chatController.js";

const router = Router();

router.use(authMiddleware, ensureDb);

router.post("/", streamChat);
router.post("/explain-error", explainErrorHandler);

export default router;
