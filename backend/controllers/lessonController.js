import {
  createLesson,
  deleteLesson,
  getLessonById,
  listLessons,
  updateLesson,
} from "../services/lessonService.js";
import { sendError, sendSuccess } from "../utils/responses.js";

function toLessonResponse(lesson) {
  return {
    id: lesson._id.toString(),
    unit: lesson.unit,
    heading: lesson.heading,
    duration: lesson.duration,
    body: lesson.body,
    instructions: lesson.instructions,
    question: lesson.question,
    hints: lesson.hints,
    codeStarter: lesson.codeStarter,
    createdBy: lesson.createdBy,
    createdAt: lesson.createdAt,
    updatedAt: lesson.updatedAt,
  };
}

export async function getLessons(_req, res) {
  const lessons = await listLessons();
  return sendSuccess(res, { lessons: lessons.map(toLessonResponse) });
}

export async function getLesson(req, res) {
  const lesson = await getLessonById(req.params.id);
  if (!lesson) {
    return sendError(res, "Lesson not found", 404, "NOT_FOUND");
  }
  return sendSuccess(res, { lesson: toLessonResponse(lesson) });
}

export async function createLessonHandler(req, res) {
  if (req.user.role !== "teacher") {
    return sendError(res, "Only teachers can create lessons", 403, "FORBIDDEN");
  }

  const payload = req.body || {};
  try {
    const lesson = await createLesson({
      unit: payload.unit,
      heading: payload.heading,
      duration: payload.duration,
      body: payload.body,
      instructions: payload.instructions,
      question: payload.question,
      hints: Array.isArray(payload.hints) ? payload.hints : [],
      codeStarter: payload.codeStarter || "",
      createdBy: req.user.id,
    });
    return sendSuccess(res, { lesson: toLessonResponse(lesson) }, 201);
  } catch (error) {
    return sendError(res, error.message, 400, "VALIDATION_ERROR");
  }
}

export async function updateLessonHandler(req, res) {
  if (req.user.role !== "teacher") {
    return sendError(res, "Only teachers can update lessons", 403, "FORBIDDEN");
  }

  const payload = req.body || {};
  const update = {
    unit: payload.unit,
    heading: payload.heading,
    duration: payload.duration,
    body: payload.body,
    instructions: payload.instructions,
    question: payload.question,
    hints: Array.isArray(payload.hints) ? payload.hints : [],
    codeStarter: payload.codeStarter || "",
  };

  const lesson = await updateLesson(req.params.id, update);
  if (!lesson) {
    return sendError(res, "Lesson not found", 404, "NOT_FOUND");
  }
  return sendSuccess(res, { lesson: toLessonResponse(lesson) });
}

export async function deleteLessonHandler(req, res) {
  if (req.user.role !== "teacher") {
    return sendError(res, "Only teachers can delete lessons", 403, "FORBIDDEN");
  }

  const lesson = await deleteLesson(req.params.id);
  if (!lesson) {
    return sendError(res, "Lesson not found", 404, "NOT_FOUND");
  }
  return sendSuccess(res, { success: true });
}
