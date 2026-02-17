import QuizAttempt from "../models/QuizAttempt.js";

export async function getQuizAttemptByUserAndItem(userId, itemId) {
  return QuizAttempt.findOne({ userId, itemId }).lean();
}

export async function getQuizAttemptById(id) {
  return QuizAttempt.findById(id).lean();
}

export async function upsertQuizAttemptByUserAndItem(userId, itemId, update, setOnInsert = {}) {
  return QuizAttempt.findOneAndUpdate(
    { userId, itemId },
    { ...update, $setOnInsert: setOnInsert },
    {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  ).lean();
}

export async function listQuizAttemptsByUserInClass(userId, classId) {
  return QuizAttempt.find({ userId, classId }).sort({ updatedAt: -1 }).lean();
}

export async function updateQuizAttemptById(id, update) {
  return QuizAttempt.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  }).lean();
}

export async function deleteQuizAttemptsByItem(itemId) {
  return QuizAttempt.deleteMany({ itemId });
}

export async function deleteQuizAttemptsByClass(classId) {
  return QuizAttempt.deleteMany({ classId });
}
