import {
  createHubTemplate,
  listHubTemplates,
  getHubTemplateById,
  updateHubTemplate,
  deleteHubTemplate,
  incrementImportCount,
} from "../services/hubService.js";
import { getClassById, getMembership, createClass, getClassByJoinCode, addMembership } from "../services/classService.js";
import { listTopicsByClass } from "../services/topicService.js";
import { listTopicItemsByTopic, createTopicItem } from "../services/topicItemService.js";
import { createTopic } from "../services/topicService.js";
import { sendError, sendSuccess } from "../utils/responses.js";

function makeJoinCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

async function generateUniqueJoinCode() {
  let joinCode = makeJoinCode();
  let attempts = 0;
  while (attempts < 5) {
    const existing = await getClassByJoinCode(joinCode);
    if (!existing) break;
    joinCode = makeJoinCode();
    attempts += 1;
  }
  return joinCode;
}

function mapTemplateToResponse(t) {
  return {
    id: t._id?.toString() || t.id,
    title: t.title,
    description: t.description,
    authorName: t.authorName,
    tags: t.tags || [],
    topicCount: t.snapshot?.topicCount ?? 0,
    itemCount: t.snapshot?.itemCount ?? 0,
    importCount: t.importCount ?? 0,
    sourceClassId: t.sourceClassId,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

function buildSnapshot(topicsWithItems) {
  const topics = topicsWithItems.map((topic) => {
    const items = (topic.items || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((item) => ({
      type: item.type,
      title: item.title,
      order: item.order ?? 0,
      quizSubtype: item.quizSubtype ?? null,
      quizQuestion: item.quizQuestion ?? "",
      quizOptions: item.quizOptions ?? [],
      quizAnswer: item.quizAnswer ?? "",
      practiceBody: item.practiceBody ?? "",
      practiceInstructions: item.practiceInstructions ?? "",
      practiceQuestion: item.practiceQuestion ?? "",
      practiceHints: item.practiceHints ?? [],
      practiceCodeStarter: item.practiceCodeStarter ?? "",
      practiceModelAnswer: item.practiceModelAnswer ?? "",
      maxPoints: item.maxPoints ?? 0,
      practiceTestMode: item.practiceTestMode ?? false,
      practiceTestCases: item.practiceTestCases ?? [],
      body: item.body ?? "",
      practiceBodyCells: item.practiceBodyCells ?? null,
    }));
    return {
      title: topic.title,
      concepts: topic.concepts ?? [],
      order: topic.order ?? 0,
      items,
    };
  });

  const topicCount = topics.length;
  const itemCount = topics.reduce((sum, t) => sum + t.items.length, 0);

  return { topics, topicCount, itemCount };
}

async function fetchTopicsWithItems(classId, topicIds) {
  const allTopics = await listTopicsByClass(classId);
  const filtered = topicIds && topicIds.length
    ? allTopics.filter((t) => topicIds.includes(t._id?.toString()))
    : allTopics;

  const topicsWithItems = await Promise.all(
    filtered.map(async (topic) => {
      const items = await listTopicItemsByTopic(topic._id?.toString());
      return { ...topic, items };
    })
  );

  return topicsWithItems;
}

export async function listTemplates(req, res) {
  try {
    const { search, tags: tagsStr, page, limit, mine, sourceClassId } = req.query;
    const tags = tagsStr ? tagsStr.split(",").map((t) => t.trim()).filter(Boolean) : [];
    const isMine = mine === "true" || mine === "1";

    const templates = await listHubTemplates({
      search,
      tags,
      mine: isMine,
      authorId: req.user.id,
      sourceClassId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
    });

    return sendSuccess(res, { templates: templates.map(mapTemplateToResponse) });
  } catch (err) {
    return sendError(res, err.message || "Failed to list templates", 500);
  }
}

export async function getTemplate(req, res) {
  try {
    const template = await getHubTemplateById(req.params.templateId);
    if (!template) return sendError(res, "Template not found", 404, "NOT_FOUND");
    return sendSuccess(res, { template: { ...template, id: template._id?.toString() } });
  } catch (err) {
    return sendError(res, err.message || "Failed to get template", 500);
  }
}

export async function publishTemplate(req, res) {
  try {
    if (!req.user || req.user.role !== "teacher") {
      return sendError(res, "Teachers only", 403, "FORBIDDEN");
    }

    const { title, description, tags, sourceClassId, topicIds } = req.body;

    if (!title || !title.trim()) {
      return sendError(res, "Title is required", 400, "VALIDATION_ERROR");
    }
    if (!sourceClassId) {
      return sendError(res, "sourceClassId is required", 400, "VALIDATION_ERROR");
    }

    const classroom = await getClassById(sourceClassId);
    if (!classroom) return sendError(res, "Class not found", 404, "NOT_FOUND");
    if (classroom.createdBy?.toString() !== req.user.id) {
      return sendError(res, "Not authorized for this class", 403, "FORBIDDEN");
    }

    const topicsWithItems = await fetchTopicsWithItems(sourceClassId, topicIds);
    const snapshot = buildSnapshot(topicsWithItems);

    const template = await createHubTemplate({
      title: title.trim(),
      description: (description || "").trim(),
      authorId: req.user.id,
      authorName: req.user.name || "Unknown",
      sourceClassId,
      tags: (tags || []).map((t) => t.trim()).filter(Boolean),
      snapshot,
    });

    return sendSuccess(res, { template: { ...template.toObject(), id: template._id?.toString() } }, 201);
  } catch (err) {
    return sendError(res, err.message || "Failed to publish template", 500);
  }
}

export async function updateTemplate(req, res) {
  try {
    if (!req.user || req.user.role !== "teacher") {
      return sendError(res, "Teachers only", 403, "FORBIDDEN");
    }

    const { templateId } = req.params;
    const { title, description, tags, sourceClassId, topicIds } = req.body;

    const updates = {};
    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description.trim();
    if (tags !== undefined) updates.tags = tags.map((t) => t.trim()).filter(Boolean);

    if (sourceClassId) {
      const classroom = await getClassById(sourceClassId);
      if (!classroom) return sendError(res, "Class not found", 404, "NOT_FOUND");
      if (classroom.createdBy?.toString() !== req.user.id) {
        return sendError(res, "Not authorized for this class", 403, "FORBIDDEN");
      }

      const topicsWithItems = await fetchTopicsWithItems(sourceClassId, topicIds);
      updates.snapshot = buildSnapshot(topicsWithItems);
      updates.sourceClassId = sourceClassId;
    }

    const template = await updateHubTemplate(templateId, req.user.id, updates);
    if (!template) return sendError(res, "Template not found or not authorized", 404, "NOT_FOUND");

    return sendSuccess(res, { template: { ...template, id: template._id?.toString() } });
  } catch (err) {
    return sendError(res, err.message || "Failed to update template", 500);
  }
}

export async function deleteTemplate(req, res) {
  try {
    if (!req.user || req.user.role !== "teacher") {
      return sendError(res, "Teachers only", 403, "FORBIDDEN");
    }

    const deleted = await deleteHubTemplate(req.params.templateId, req.user.id);
    if (!deleted) return sendError(res, "Template not found or not authorized", 404, "NOT_FOUND");

    return sendSuccess(res, { deleted: true });
  } catch (err) {
    return sendError(res, err.message || "Failed to delete template", 500);
  }
}

export async function importTemplate(req, res) {
  try {
    if (!req.user || req.user.role !== "teacher") {
      return sendError(res, "Teachers only", 403, "FORBIDDEN");
    }

    const { className, selectedTopicIndices } = req.body;
    const template = await getHubTemplateById(req.params.templateId);
    if (!template) return sendError(res, "Template not found", 404, "NOT_FOUND");

    // Always create a new class for the import
    const joinCode = await generateUniqueJoinCode();
    const newClass = await createClass({
      name: (className || template.title).trim(),
      joinCode,
      createdBy: req.user.id,
    });
    const targetClassId = newClass._id.toString();
    await addMembership({ classId: newClass._id, userId: req.user.id, role: "teacher" });

    let importedTopicCount = 0;
    let importedItemCount = 0;

    // Filter topics by selected indices if provided
    const allTopics = template.snapshot?.topics || [];
    const topicsToImport = Array.isArray(selectedTopicIndices) && selectedTopicIndices.length > 0
      ? allTopics.filter((_, idx) => selectedTopicIndices.includes(idx))
      : allTopics;

    for (const snapshotTopic of topicsToImport) {
      const newTopic = await createTopic({
        classId: targetClassId,
        title: snapshotTopic.title,
        concepts: snapshotTopic.concepts || [],
        order: snapshotTopic.order ?? 0,
        createdBy: req.user.id,
      });
      importedTopicCount++;

      for (const snapshotItem of snapshotTopic.items || []) {
        await createTopicItem({
          topicId: newTopic._id?.toString(),
          classId: targetClassId,
          type: snapshotItem.type,
          title: snapshotItem.title,
          order: snapshotItem.order ?? 0,
          isPublished: true,
          quizSubtype: snapshotItem.quizSubtype ?? null,
          quizQuestion: snapshotItem.quizQuestion ?? "",
          quizOptions: snapshotItem.quizOptions ?? [],
          quizAnswer: snapshotItem.quizAnswer ?? "",
          practiceBody: snapshotItem.practiceBody ?? "",
          practiceInstructions: snapshotItem.practiceInstructions ?? "",
          practiceQuestion: snapshotItem.practiceQuestion ?? "",
          practiceHints: snapshotItem.practiceHints ?? [],
          practiceCodeStarter: snapshotItem.practiceCodeStarter ?? "",
          practiceModelAnswer: snapshotItem.practiceModelAnswer ?? "",
          maxPoints: snapshotItem.maxPoints ?? 0,
          practiceTestMode: snapshotItem.practiceTestMode ?? false,
          practiceTestCases: snapshotItem.practiceTestCases ?? [],
          body: snapshotItem.body ?? "",
          practiceBodyCells: snapshotItem.practiceBodyCells ?? null,
          createdBy: req.user.id,
        });
        importedItemCount++;
      }
    }

    await incrementImportCount(req.params.templateId);

    return sendSuccess(res, {
      importedTopicCount,
      importedItemCount,
      newClassId: targetClassId,
      newClassName: newClass.name,
    }, 201);
  } catch (err) {
    return sendError(res, err.message || "Failed to import template", 500);
  }
}
