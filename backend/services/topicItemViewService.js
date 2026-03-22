import TopicItemView from "../models/TopicItemView.js";

export async function upsertView({ userId, classId, itemId }) {
  return TopicItemView.findOneAndUpdate(
    { userId, itemId },
    { $setOnInsert: { userId, classId, itemId } },
    { upsert: true, new: true }
  ).lean();
}

export async function countViewsByUserInClass(userId, classId) {
  return TopicItemView.countDocuments({ userId, classId });
}

/** Returns plain object mapping userId → view count for a given class */
export async function groupedViewCountsByClass(classId) {
  const results = await TopicItemView.aggregate([
    { $match: { classId: classId instanceof Object ? classId : new Object(classId) } },
    { $group: { _id: "$userId", count: { $sum: 1 } } },
  ]);
  const map = {};
  for (const r of results) map[r._id] = r.count;
  return map;
}
