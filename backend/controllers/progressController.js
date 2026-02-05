import {
  getProgress,
  listProgressByUser,
  upsertProgress,
} from "../services/progressService.js";
import { sendError, sendSuccess } from "../utils/responses.js";

function toProgressResponse(progress) {
  return {
    id: progress._id.toString(),
    userId: progress.userId,
    lessonId: progress.lessonId.toString(),
    status: progress.status,
    lastCode: progress.lastCode,
    lastAnswer: progress.lastAnswer,
    attempts: progress.attempts,
    lastRunAt: progress.lastRunAt,
    completedAt: progress.completedAt,
    createdAt: progress.createdAt,
    updatedAt: progress.updatedAt,
  };
}

export async function listProgress(req, res) {
  const progress = await listProgressByUser(req.user.id);
  return sendSuccess(res, { progress: progress.map(toProgressResponse) });
}

export async function getProgressForLesson(req, res) {
  const progress = await getProgress(req.user.id, req.params.lessonId);
  if (!progress) {
    return sendSuccess(res, { progress: null });
  }
  return sendSuccess(res, { progress: toProgressResponse(progress) });
}

export async function upsertProgressForLesson(req, res) {
  const payload = req.body || {};
  const update = {
    status: payload.status,
    lastCode: payload.lastCode,
    lastAnswer: payload.lastAnswer,
    attempts: typeof payload.attempts === "number" ? payload.attempts : undefined,
    lastRunAt: payload.lastRunAt ? new Date(payload.lastRunAt) : undefined,
    completedAt: payload.completedAt ? new Date(payload.completedAt) : undefined,
  };

  if (update.status === "completed" && !update.completedAt) {
    update.completedAt = new Date();
  }

  const progress = await upsertProgress(req.user.id, req.params.lessonId, update);
  if (!progress) {
    return sendError(res, "Unable to update progress", 400, "UPDATE_FAILED");
  }

  return sendSuccess(res, { progress: toProgressResponse(progress) });
}
