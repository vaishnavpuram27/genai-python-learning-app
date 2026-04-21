import { Router } from "express";
import authMiddleware from "../../middleware/auth.js";
import ensureDb from "../../middleware/ensureDb.js";
import validateObjectId from "../../middleware/validateObjectId.js";
import {
  createClassHandler,
  deleteClassHandler,
  getClass,
  getClassStats,
  getMyClassProgress,
  getMyDashboard,
  getStudentProgress,
  getStudentStats,
  joinClass,
  listClasses,
  listStudents,
  listTopics,
  createTopicHandler,
  reorderTopicsHandler,
  createTopicItemHandler,
  reorderTopicItemsHandler,
  updateTopicHandler,
  deleteTopicHandler,
  updateTopicItemHandler,
  deleteTopicItemHandler,
  getPracticeItem,
  getLearningItem,
  getQuizItem,
  submitQuizAttempt,
  gradeQuizAttempt,
  getStudentAIInteractions,
  getAiConfigHandler,
  updateAiConfigHandler,
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
router.get(
  "/:id/students/:studentId/stats",
  validateObjectId("id"),
  validateObjectId("studentId"),
  getStudentStats
);
router.get(
  "/:id/students/:studentId/ai-interactions",
  validateObjectId("id"),
  validateObjectId("studentId"),
  getStudentAIInteractions
);
router.get("/:id/stats", validateObjectId("id"), getClassStats);
router.get("/:id/my-progress", validateObjectId("id"), getMyClassProgress);
router.get("/:id/my-dashboard", validateObjectId("id"), getMyDashboard);
router.get("/:id/topics", validateObjectId("id"), listTopics);
router.post("/:id/topics", validateObjectId("id"), createTopicHandler);
// Reorder route must be BEFORE /:topicId so "reorder" isn't matched as a topicId
router.put("/:id/topics/reorder", validateObjectId("id"), reorderTopicsHandler);
router.put("/:id/topics/:topicId", validateObjectId("id"), validateObjectId("topicId"), updateTopicHandler);
router.delete("/:id/topics/:topicId", validateObjectId("id"), validateObjectId("topicId"), deleteTopicHandler);
router.post(
  "/:id/topics/:topicId/items",
  validateObjectId("id"),
  validateObjectId("topicId"),
  createTopicItemHandler
);
// Reorder route must be BEFORE /:itemId routes so "reorder" isn't matched as an itemId
router.put(
  "/:id/topics/:topicId/items/reorder",
  validateObjectId("id"),
  validateObjectId("topicId"),
  reorderTopicItemsHandler
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
  "/:id/learn/:itemId",
  validateObjectId("id"),
  validateObjectId("itemId"),
  getLearningItem
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
router.get("/:id/ai-config", validateObjectId("id"), getAiConfigHandler);
router.put("/:id/ai-config", validateObjectId("id"), updateAiConfigHandler);
router.post("/", createClassHandler);
router.post("/join", joinClass);
router.delete("/:id", validateObjectId("id"), deleteClassHandler);

export default router;
