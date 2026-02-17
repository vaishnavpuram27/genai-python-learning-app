import TopicItem from "../models/TopicItem.js";

export async function listTopicItemsByClass(classId) {
  return TopicItem.find({ classId }).sort({ createdAt: 1 }).lean();
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
