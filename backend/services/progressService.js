import LessonProgress from "../models/LessonProgress.js";

export async function listProgressByUser(userId) {
  return LessonProgress.find({ userId }).sort({ updatedAt: -1 }).lean();
}

export async function getProgress(userId, lessonId) {
  return LessonProgress.findOne({ userId, lessonId }).lean();
}

export async function upsertProgress(userId, lessonId, update) {
  // Strip undefined values so we don't accidentally $set fields to undefined
  const $set = Object.fromEntries(Object.entries(update).filter(([, v]) => v !== undefined));
  return LessonProgress.findOneAndUpdate(
    { userId, lessonId },
    { $set },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
      runValidators: true,
    }
  ).lean();
}
