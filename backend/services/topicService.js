import Topic from "../models/Topic.js";

export async function listTopicsByClass(classId) {
  return Topic.find({ classId }).sort({ order: 1, createdAt: 1 }).lean();
}

export async function countTopicsByClass(classId) {
  return Topic.countDocuments({ classId });
}

export async function reorderTopics(topicIds) {
  await Promise.all(
    topicIds.map((id, index) =>
      Topic.findByIdAndUpdate(id, { $set: { order: index } })
    )
  );
}

export async function createTopic(payload) {
  const topic = await Topic.create(payload);
  return topic.toObject();
}

export async function updateTopic(id, update) {
  return Topic.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  }).lean();
}

export async function deleteTopicById(id) {
  return Topic.findByIdAndDelete(id).lean();
}

export async function getTopicById(id) {
  return Topic.findById(id).lean();
}
