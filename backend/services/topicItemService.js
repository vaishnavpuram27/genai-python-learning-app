import TopicItem from "../models/TopicItem.js";

export async function listTopicItemsByClass(classId) {
  return TopicItem.find({ classId }).sort({ order: 1, createdAt: 1 }).lean();
}

export async function countTopicItemsByTopic(topicId) {
  return TopicItem.countDocuments({ topicId });
}

export async function reorderTopicItems(itemIds) {
  // itemIds is an ordered array of item ID strings; assign order = index
  await Promise.all(
    itemIds.map((id, index) =>
      TopicItem.findByIdAndUpdate(id, { $set: { order: index } })
    )
  );
}

export async function createTopicItem(payload) {
  const item = await TopicItem.create(payload);
  return item.toObject();
}

export async function updateTopicItem(id, update) {
  return TopicItem.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  }).lean();
}

export async function deleteTopicItemById(id) {
  return TopicItem.findByIdAndDelete(id).lean();
}

export async function listTopicItemsByTopic(topicId) {
  return TopicItem.find({ topicId }).lean();
}

export async function getTopicItemById(id) {
  return TopicItem.findById(id).lean();
}

export async function getTopicItemWithTopic(id) {
  return TopicItem.findById(id).populate("topicId").lean();
}

export async function listUpcomingDeadlines(classId, after) {
  return TopicItem.find({ classId, isPublished: true, deadline: { $gt: after } })
    .sort({ deadline: 1 })
    .lean();
}

export async function listRecentItems(classId, since) {
  return TopicItem.find({ classId, isPublished: true, createdAt: { $gte: since } })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
}
