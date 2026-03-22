import AIInteraction from "../models/AIInteraction.js";

export async function logInteraction({ userId, classId, itemId, role, userMessage = "" }) {
  return AIInteraction.create({
    userId,
    classId: classId || null,
    itemId: itemId || null,
    role,
    userMessage,
    aiResponse: "",
  });
}

export async function updateInteractionResponse(id, aiResponse) {
  return AIInteraction.findByIdAndUpdate(id, { aiResponse }, { new: true }).lean();
}

/** Returns interactions for a student in a class, newest first, with item title populated */
export async function listByStudentInClass(userId, classId) {
  return AIInteraction.find({ userId, classId })
    .populate("itemId", "title type")
    .sort({ createdAt: -1 })
    .lean();
}

export async function countByUserInClass(userId, classId) {
  return AIInteraction.countDocuments({ userId, classId });
}

/** Returns a plain object mapping userId → count for a given class */
export async function groupedCountsByClass(classId) {
  const results = await AIInteraction.aggregate([
    { $match: { classId: classId instanceof Object ? classId : new Object(classId) } },
    { $group: { _id: "$userId", count: { $sum: 1 } } },
  ]);
  const map = {};
  for (const r of results) map[r._id] = r.count;
  return map;
}
