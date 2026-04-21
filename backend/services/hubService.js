import HubTemplate from "../models/HubTemplate.js";

export async function createHubTemplate(payload) {
  return HubTemplate.create(payload);
}

export async function listHubTemplates({ search, tags, mine, authorId, sourceClassId, page = 1, limit = 20 } = {}) {
  const filter = { isPublished: true };
  if (mine && authorId) filter.authorId = authorId;
  if (sourceClassId) filter.sourceClassId = sourceClassId;
  if (tags && tags.length) filter.tags = { $in: tags };

  const skip = (Math.max(1, page) - 1) * Math.min(50, limit);

  let query;
  if (search) {
    filter.$text = { $search: search };
    query = HubTemplate.find(filter, { score: { $meta: "textScore" } })
      .sort({ score: { $meta: "textScore" } });
  } else {
    query = HubTemplate.find(filter).sort({ importCount: -1, createdAt: -1 });
  }

  return query.skip(skip).limit(Math.min(50, limit)).lean();
}

export async function getHubTemplateById(id) {
  return HubTemplate.findById(id).lean();
}

export async function updateHubTemplate(id, authorId, updates) {
  return HubTemplate.findOneAndUpdate(
    { _id: id, authorId },
    { $set: updates },
    { new: true }
  ).lean();
}

export async function deleteHubTemplate(id, authorId) {
  return HubTemplate.findOneAndDelete({ _id: id, authorId }).lean();
}

export async function incrementImportCount(id) {
  return HubTemplate.findByIdAndUpdate(id, { $inc: { importCount: 1 } });
}
