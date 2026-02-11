import { Router } from "express";
import authMiddleware from "../../middleware/auth.js";
import ensureDb from "../../middleware/ensureDb.js";
import validateObjectId from "../../middleware/validateObjectId.js";
import {
  createClassHandler,
  deleteClassHandler,
  getClass,
  getStudentProgress,
  joinClass,
  listClasses,
  listStudents,
} from "../../controllers/classController.js";

const router = Router();

router.use(authMiddleware, ensureDb);

router.get("/", listClasses);
router.get("/:id", validateObjectId("id"), getClass);
router.get("/:id/students", validateObjectId("id"), listStudents);
router.get(
  "/:id/students/:studentId/progress",
  validateObjectId("id"),
  validateObjectId("studentId"),
  getStudentProgress
);
router.post("/", createClassHandler);
router.post("/join", joinClass);
router.delete("/:id", validateObjectId("id"), deleteClassHandler);

export default router;
