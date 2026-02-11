import {
  createLesson,
  deleteLesson,
  getLessonById,
  listLessons,
  updateLesson,
} from "../services/lessonService.js";
import { getMembership } from "../services/classService.js";
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
    classId: lesson.classId?.toString?.() || lesson.classId,
    createdBy: lesson.createdBy,
    createdAt: lesson.createdAt,
    updatedAt: lesson.updatedAt,
  };
}

export async function getLessons(_req, res) {
  const classId = _req.query.classId;
  if (!classId) {
    return sendError(res, "classId is required", 400, "VALIDATION_ERROR");
  }
  const membership = await getMembership(_req.user.id, classId);
  if (!membership) {
    return sendError(res, "Forbidden", 403, "FORBIDDEN");
  }
  const lessons = await listLessons(classId);
  return sendSuccess(res, { lessons: lessons.map(toLessonResponse) });
}

export async function getLesson(req, res) {
  const lesson = await getLessonById(req.params.id);
  if (!lesson) {
    return sendError(res, "Lesson not found", 404, "NOT_FOUND");
  }
  const membership = await getMembership(req.user.id, lesson.classId);
  if (!membership) {
    return sendError(res, "Forbidden", 403, "FORBIDDEN");
  }
  return sendSuccess(res, { lesson: toLessonResponse(lesson) });
}

export async function createLessonHandler(req, res) {
  if (req.user.role !== "teacher") {
    return sendError(res, "Only teachers can create lessons", 403, "FORBIDDEN");
  }

  const payload = req.body || {};
  if (!payload.classId) {
    return sendError(res, "classId is required", 400, "VALIDATION_ERROR");
  }
  const membership = await getMembership(req.user.id, payload.classId);
  if (!membership || membership.role !== "teacher") {
    return sendError(res, "Forbidden", 403, "FORBIDDEN");
  }
  try {
    const lesson = await createLesson({
      classId: payload.classId,
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
  const existing = await getLessonById(req.params.id);
  if (!existing) {
    return sendError(res, "Lesson not found", 404, "NOT_FOUND");
  }
  const membership = await getMembership(req.user.id, existing.classId);
  if (!membership || membership.role !== "teacher") {
    return sendError(res, "Forbidden", 403, "FORBIDDEN");
  }
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
  return sendSuccess(res, { lesson: toLessonResponse(lesson) });
}

export async function deleteLessonHandler(req, res) {
  if (req.user.role !== "teacher") {
    return sendError(res, "Only teachers can delete lessons", 403, "FORBIDDEN");
  }

  const existing = await getLessonById(req.params.id);
  if (!existing) {
    return sendError(res, "Lesson not found", 404, "NOT_FOUND");
  }
  const membership = await getMembership(req.user.id, existing.classId);
  if (!membership || membership.role !== "teacher") {
    return sendError(res, "Forbidden", 403, "FORBIDDEN");
  }
  const lesson = await deleteLesson(req.params.id);
  return sendSuccess(res, { success: true });
}
