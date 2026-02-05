import { Router } from "express";
import authMiddleware from "../../middleware/auth.js";
import ensureDb from "../../middleware/ensureDb.js";
import validateObjectId from "../../middleware/validateObjectId.js";
import {
  getProgressForLesson,
  listProgress,
  upsertProgressForLesson,
} from "../../controllers/progressController.js";

const router = Router();

router.use(authMiddleware, ensureDb);

router.get("/", listProgress);
router.get("/:lessonId", validateObjectId("lessonId"), getProgressForLesson);
router.put("/:lessonId", validateObjectId("lessonId"), upsertProgressForLesson);

export default router;
