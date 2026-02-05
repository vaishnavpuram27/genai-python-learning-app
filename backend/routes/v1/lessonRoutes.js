import { Router } from "express";
import authMiddleware from "../../middleware/auth.js";
import ensureDb from "../../middleware/ensureDb.js";
import validateObjectId from "../../middleware/validateObjectId.js";
import {
  createLessonHandler,
  deleteLessonHandler,
  getLesson,
  getLessons,
  updateLessonHandler,
} from "../../controllers/lessonController.js";

const router = Router();

router.use(authMiddleware, ensureDb);

router.get("/", getLessons);
router.get("/:id", validateObjectId("id"), getLesson);
router.post("/", createLessonHandler);
router.put("/:id", validateObjectId("id"), updateLessonHandler);
router.delete("/:id", validateObjectId("id"), deleteLessonHandler);

export default router;
