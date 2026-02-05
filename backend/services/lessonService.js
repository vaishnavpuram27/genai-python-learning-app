import Lesson from "../models/Lesson.js";

export async function listLessons() {
  return Lesson.find().sort({ updatedAt: -1 }).lean();
}

export async function getLessonById(id) {
  return Lesson.findById(id).lean();
}

export async function createLesson(payload) {
  const lesson = await Lesson.create(payload);
  return lesson.toObject();
}

export async function updateLesson(id, update) {
  return Lesson.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  }).lean();
}

export async function deleteLesson(id) {
  return Lesson.findByIdAndDelete(id).lean();
}
