import LessonProgress from "../models/LessonProgress.js";

export async function listProgressByUser(userId) {
  return LessonProgress.find({ userId }).sort({ updatedAt: -1 }).lean();
}

export async function getProgress(userId, lessonId) {
  return LessonProgress.findOne({ userId, lessonId }).lean();
}

export async function upsertProgress(userId, lessonId, update) {
  return LessonProgress.findOneAndUpdate(
    { userId, lessonId },
    update,
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
      runValidators: true,
    }
  ).lean();
}
