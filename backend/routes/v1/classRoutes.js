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
  listTopics,
  createTopicHandler,
  createTopicItemHandler,
  updateTopicHandler,
  deleteTopicHandler,
  updateTopicItemHandler,
  deleteTopicItemHandler,
  getPracticeItem,
  getQuizItem,
  submitQuizAttempt,
  gradeQuizAttempt,
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
router.get("/:id/topics", validateObjectId("id"), listTopics);
router.post("/:id/topics", validateObjectId("id"), createTopicHandler);
router.put("/:id/topics/:topicId", validateObjectId("id"), validateObjectId("topicId"), updateTopicHandler);
router.delete("/:id/topics/:topicId", validateObjectId("id"), validateObjectId("topicId"), deleteTopicHandler);
router.post(
  "/:id/topics/:topicId/items",
  validateObjectId("id"),
  validateObjectId("topicId"),
  createTopicItemHandler
);
router.put(
  "/:id/topics/:topicId/items/:itemId",
  validateObjectId("id"),
  validateObjectId("topicId"),
  validateObjectId("itemId"),
  updateTopicItemHandler
);
router.delete(
  "/:id/topics/:topicId/items/:itemId",
  validateObjectId("id"),
  validateObjectId("topicId"),
  validateObjectId("itemId"),
  deleteTopicItemHandler
);
router.get(
  "/:id/practice/:itemId",
  validateObjectId("id"),
  validateObjectId("itemId"),
  getPracticeItem
);
router.get(
  "/:id/quiz/:itemId",
  validateObjectId("id"),
  validateObjectId("itemId"),
  getQuizItem
);
router.put(
  "/:id/quiz/:itemId/attempt",
  validateObjectId("id"),
  validateObjectId("itemId"),
  submitQuizAttempt
);
router.put(
  "/:id/students/:studentId/quiz-attempts/:attemptId/grade",
  validateObjectId("id"),
  validateObjectId("studentId"),
  validateObjectId("attemptId"),
  gradeQuizAttempt
);
router.post("/", createClassHandler);
router.post("/join", joinClass);
router.delete("/:id", validateObjectId("id"), deleteClassHandler);

export default router;
