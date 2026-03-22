import {
  addMembership,
  createClass,
  deleteClassById,
  deleteLessonsByClassId,
  deleteMembershipsByClassId,
  getClassById,
  getClassByJoinCode,
  getMembership,
  listClassesForUser,
  listMemberships,
} from "../services/classService.js";
import User from "../models/User.js";
import { listLessons } from "../services/lessonService.js";
import { listProgressByUser } from "../services/progressService.js";
import {
  deleteQuizAttemptsByClass,
  deleteQuizAttemptsByItem,
  getQuizAttemptById,
  getQuizAttemptByUserAndItem,
  listQuizAttemptsByClass,
  listQuizAttemptsByUserInClass,
  updateQuizAttemptById,
  upsertQuizAttemptByUserAndItem,
} from "../services/quizAttemptService.js";
import {
  countTopicsByClass,
  createTopic,
  deleteTopicById,
  getTopicById,
  listTopicsByClass,
  reorderTopics,
  updateTopic,
} from "../services/topicService.js";
import {
  countTopicItemsByTopic,
  createTopicItem,
  deleteTopicItemById,
  getTopicItemById,
  getTopicItemWithTopic,
  listTopicItemsByClass,
  listTopicItemsByTopic,
  listUpcomingDeadlines,
  listRecentItems,
  reorderTopicItems,
  updateTopicItem,
} from "../services/topicItemService.js";
import { sendError, sendSuccess } from "../utils/responses.js";
import { gradeShortAnswer } from "../services/chatService.js";
import { groupedCountsByClass, listByStudentInClass } from "../services/aiInteractionService.js";
import { upsertView, groupedViewCountsByClass } from "../services/topicItemViewService.js";

const TOPIC_ITEM_TYPES = ["learning", "quiz", "practice"];
const QUIZ_SUBTYPES = ["mcq", "short_answer"];

function makeJoinCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function toClassResponse(classroom) {
  return {
    id: classroom._id.toString(),
    name: classroom.name,
    joinCode: classroom.joinCode,
    createdBy: classroom.createdBy,
    createdAt: classroom.createdAt,
    updatedAt: classroom.updatedAt,
  };
}

export async function listClasses(req, res) {
  const classes = await listClassesForUser(req.user.id);
  return sendSuccess(res, { classes: classes.map(toClassResponse) });
}

export async function createClassHandler(req, res) {
  if (req.user.role !== "teacher") {
    return sendError(res, "Only teachers can create classes", 403, "FORBIDDEN");
  }
  const payload = req.body || {};
  if (!payload.name) {
    return sendError(res, "Class name is required", 400, "VALIDATION_ERROR");
  }

  let joinCode = makeJoinCode();
  let attempts = 0;
  while (attempts < 5) {
    const existing = await getClassByJoinCode(joinCode);
    if (!existing) break;
    joinCode = makeJoinCode();
    attempts += 1;
  }
  const classroom = await createClass({
    name: payload.name,
    joinCode,
    createdBy: req.user.id,
  });
  await addMembership({
    classId: classroom._id,
    userId: req.user.id,
    role: "teacher",
  });
  return sendSuccess(res, { classroom: toClassResponse(classroom) }, 201);
}

export async function joinClass(req, res) {
  if (req.user.role !== "student") {
    return sendError(res, "Only students can join classes", 403, "FORBIDDEN");
  }
  const { joinCode } = req.body || {};
  if (!joinCode) {
    return sendError(res, "Join code is required", 400, "VALIDATION_ERROR");
  }
  const classroom = await getClassByJoinCode(joinCode.trim().toUpperCase());
  if (!classroom) {
    return sendError(res, "Class not found", 404, "NOT_FOUND");
  }
  const existing = await getMembership(req.user.id, classroom._id);
  if (existing) {
    return sendSuccess(res, { classroom: toClassResponse(classroom) });
  }
  await addMembership({
    classId: classroom._id,
    userId: req.user.id,
    role: "student",
  });
  return sendSuccess(res, { classroom: toClassResponse(classroom) }, 201);
}

export async function getClass(req, res) {
  const classroom = await getClassById(req.params.id);
  if (!classroom) {
    return sendError(res, "Class not found", 404, "NOT_FOUND");
  }
  const membership = await getMembership(req.user.id, classroom._id);
  if (!membership) {
    return sendError(res, "Forbidden", 403, "FORBIDDEN");
  }
  return sendSuccess(res, { classroom: toClassResponse(classroom) });
}

export async function listStudents(req, res) {
  const classroom = await getClassById(req.params.id);
  if (!classroom) {
    return sendError(res, "Class not found", 404, "NOT_FOUND");
  }
  const membership = await getMembership(req.user.id, classroom._id);
  if (!membership || membership.role !== "teacher") {
    return sendError(res, "Forbidden", 403, "FORBIDDEN");
  }
  const memberships = await listMemberships(classroom._id);
  const studentIds = memberships
    .filter((member) => member.role === "student")
    .map((member) => member.userId);
  if (!studentIds.length) {
    return sendSuccess(res, { students: [] });
  }
  const students = await User.find({ _id: { $in: studentIds } })
    .select({ name: 1 })
    .lean();
  return sendSuccess(res, {
    students: students.map((student) => ({
      id: student._id.toString(),
      name: student.name,
    })),
  });
}

function toTopicResponse(topic) {
  return {
    id: topic._id.toString(),
    title: topic.title,
    concepts: topic.concepts,
    classId: topic.classId.toString(),
    createdBy: topic.createdBy,
    order: topic.order ?? 0,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
  };
}

function normalizeTopicItem(item) {
  const base = {
    id: item._id.toString(),
    topicId: item.topicId.toString(),
    type: item.type,
    title: item.title,
    maxPoints: item.maxPoints ?? 0,
    deadline: item.deadline || null,
    isPublished: item.isPublished !== false,
    order: item.order ?? 0,
    quizSubtype: item.quizSubtype || null,
    quizQuestion: item.quizQuestion || "",
    quizOptions: Array.isArray(item.quizOptions) ? item.quizOptions : [],
    quizAnswer: item.quizAnswer || "",
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
  if (item.type === "learning" || item.type === "practice") {
    base.practiceBody         = item.practiceBody         || "";
    base.practiceInstructions = item.practiceInstructions || "";
    base.practiceHints        = Array.isArray(item.practiceHints) ? item.practiceHints : [];
    base.practiceCodeStarter  = item.practiceCodeStarter  || "";
  }
  return base;
}

function resolveQuizFields(payload, currentType, currentItem = null) {
  const type = payload.type || currentType;
  if (type !== "quiz") {
    return {
      quizSubtype: null,
      quizQuestion: "",
      quizOptions: [],
      quizAnswer: "",
    };
  }

  const nextSubtype = payload.quizSubtype ?? currentItem?.quizSubtype ?? "mcq";
  if (!QUIZ_SUBTYPES.includes(nextSubtype)) {
    return { error: "Invalid quiz subtype" };
  }

  const rawOptions = payload.quizOptions ?? currentItem?.quizOptions ?? [];
  const parsedOptions = Array.isArray(rawOptions)
    ? rawOptions
        .map((option) => `${option ?? ""}`.trim())
        .filter(Boolean)
    : [];

  return {
    quizSubtype: nextSubtype,
    quizQuestion: `${payload.quizQuestion ?? currentItem?.quizQuestion ?? ""}`.trim(),
    quizOptions: nextSubtype === "mcq" ? parsedOptions : [],
    quizAnswer: `${payload.quizAnswer ?? currentItem?.quizAnswer ?? ""}`.trim(),
  };
}

function toQuizAttemptResponse(attempt) {
  return {
    id: attempt._id.toString(),
    itemId: attempt.itemId.toString(),
    topicId: attempt.topicId?.toString?.() || "",
    classId: attempt.classId?.toString?.() || "",
    responseText: attempt.responseText || "",
    status: attempt.status,
    gradingStatus: attempt.gradingStatus,
    isCorrect: typeof attempt.isCorrect === "boolean" ? attempt.isCorrect : null,
    score: typeof attempt.score === "number" ? attempt.score : null,
    feedback: attempt.feedback || "",
    attempts: attempt.attempts || 0,
    submittedAt: attempt.submittedAt || null,
    gradedAt: attempt.gradedAt || null,
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
  };
}

export async function listTopics(req, res) {
  const classroom = await getClassById(req.params.id);
  if (!classroom) {
    return sendError(res, "Class not found", 404, "NOT_FOUND");
  }
  const membership = await getMembership(req.user.id, classroom._id);
  if (!membership) {
    return sendError(res, "Forbidden", 403, "FORBIDDEN");
  }
  const topics = await listTopicsByClass(classroom._id);
  const allItems = await listTopicItemsByClass(classroom._id);
  // Students only see published items
  const items = req.user.role === "student"
    ? allItems.filter((i) => i.isPublished !== false)
    : allItems;
  const itemsByTopic = items.reduce((acc, item) => {
    const key = item.topicId.toString();
    if (!acc[key]) acc[key] = [];
    acc[key].push(normalizeTopicItem(item));
    return acc;
  }, {});

  return sendSuccess(res, {
    topics: topics
      .sort((a, b) => a.order - b.order || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((topic) => ({
        ...toTopicResponse(topic),
        items: (itemsByTopic[topic._id.toString()] || []).sort(
          (a, b) => a.order - b.order || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ),
      })),
  });
}

export async function createTopicHandler(req, res) {
  if (req.user.role !== "teacher") {
    return sendError(res, "Only teachers can create topics", 403, "FORBIDDEN");
  }
  const classroom = await getClassById(req.params.id);
  if (!classroom) {
    return sendError(res, "Class not found", 404, "NOT_FOUND");
  }
  const membership = await getMembership(req.user.id, classroom._id);
  if (!membership || membership.role !== "teacher") {
    return sendError(res, "Forbidden", 403, "FORBIDDEN");
  }
  const payload = req.body || {};
  if (!payload.title) {
    return sendError(res, "Topic title is required", 400, "VALIDATION_ERROR");
  }
  const order = await countTopicsByClass(classroom._id);
  const topic = await createTopic({
    classId: classroom._id,
    title: payload.title,
    concepts: Array.isArray(payload.concepts) ? payload.concepts : [],
    createdBy: req.user.id,
    order,
  });
  return sendSuccess(res, { topic: toTopicResponse(topic) }, 201);
}

export async function reorderTopicsHandler(req, res) {
  if (req.user.role !== "teacher") {
    return sendError(res, "Only teachers can reorder topics", 403, "FORBIDDEN");
  }
  const classroom = await getClassById(req.params.id);
  if (!classroom) {
    return sendError(res, "Class not found", 404, "NOT_FOUND");
  }
  const membership = await getMembership(req.user.id, classroom._id);
  if (!membership || membership.role !== "teacher") {
    return sendError(res, "Forbidden", 403, "FORBIDDEN");
  }
  const { topicIds } = req.body || {};
  if (!Array.isArray(topicIds) || topicIds.length === 0) {
    return sendError(res, "topicIds array is required", 400, "VALIDATION_ERROR");
  }
  await reorderTopics(topicIds);
  return sendSuccess(res, { ok: true });
}

export async function updateTopicHandler(req, res) {
  if (req.user.role !== "teacher") {
    return sendError(res, "Only teachers can update topics", 403, "FORBIDDEN");
  }
  const classroom = await getClassById(req.params.id);
  if (!classroom) {
    return sendError(res, "Class not found", 404, "NOT_FOUND");
  }
  const membership = await getMembership(req.user.id, classroom._id);
  if (!membership || membership.role !== "teacher") {
    return sendError(res, "Forbidden", 403, "FORBIDDEN");
  }
  const topic = await getTopicById(req.params.topicId);
  if (!topic || topic.classId.toString() !== classroom._id.toString()) {
    return sendError(res, "Topic not found", 404, "NOT_FOUND");
  }
  const payload = req.body || {};
  const updated = await updateTopic(topic._id, {
    title: payload.title || topic.title,
  });
  return sendSuccess(res, { topic: toTopicResponse(updated) });
}

export async function deleteTopicHandler(req, res) {
  if (req.user.role !== "teacher") {
    return sendError(res, "Only teachers can delete topics", 403, "FORBIDDEN");
  }
  const classroom = await getClassById(req.params.id);
  if (!classroom) {
    return sendError(res, "Class not found", 404, "NOT_FOUND");
  }
  const membership = await getMembership(req.user.id, classroom._id);
  if (!membership || membership.role !== "teacher") {
    return sendError(res, "Forbidden", 403, "FORBIDDEN");
  }
  const topic = await getTopicById(req.params.topicId);
  if (!topic || topic.classId.toString() !== classroom._id.toString()) {
    return sendError(res, "Topic not found", 404, "NOT_FOUND");
  }
  const itemsToDelete = await listTopicItemsByTopic(topic._id);
  await Promise.all(
    itemsToDelete.map(async (item) => {
      await deleteQuizAttemptsByItem(item._id);
      return deleteTopicItemById(item._id);
    })
  );
  await deleteTopicById(topic._id);
  return sendSuccess(res, { success: true });
}

export async function createTopicItemHandler(req, res) {
  if (req.user.role !== "teacher") {
    return sendError(res, "Only teachers can add topic items", 403, "FORBIDDEN");
  }
  const classroom = await getClassById(req.params.id);
  if (!classroom) {
    return sendError(res, "Class not found", 404, "NOT_FOUND");
  }
  const membership = await getMembership(req.user.id, classroom._id);
  if (!membership || membership.role !== "teacher") {
    return sendError(res, "Forbidden", 403, "FORBIDDEN");
  }
  const payload = req.body || {};
  if (!payload.title || !payload.type) {
    return sendError(res, "Title and type are required", 400, "VALIDATION_ERROR");
  }
  if (!TOPIC_ITEM_TYPES.includes(payload.type)) {
    return sendError(res, "Invalid type", 400, "VALIDATION_ERROR");
  }
  const quizFields = resolveQuizFields(payload, payload.type);
  if (quizFields.error) {
    return sendError(res, quizFields.error, 400, "VALIDATION_ERROR");
  }
  const practiceFields = {};
  if (payload.type === "practice" || payload.type === "learning") {
    if (payload.practiceBody         !== undefined) practiceFields.practiceBody         = payload.practiceBody;
    if (payload.practiceInstructions !== undefined) practiceFields.practiceInstructions = payload.practiceInstructions;
    if (payload.practiceHints        !== undefined) practiceFields.practiceHints        = payload.practiceHints;
    if (payload.practiceCodeStarter  !== undefined) practiceFields.practiceCodeStarter  = payload.practiceCodeStarter;
  }
  if (payload.type === "practice") {
    if (payload.practiceQuestion     !== undefined) practiceFields.practiceQuestion     = payload.practiceQuestion;
    if (payload.practiceModelAnswer  !== undefined) practiceFields.practiceModelAnswer  = payload.practiceModelAnswer;
    if (payload.practiceTestMode     !== undefined) practiceFields.practiceTestMode     = payload.practiceTestMode;
    if (payload.practiceTestCases    !== undefined) practiceFields.practiceTestCases    = payload.practiceTestCases;
  }
  const order = await countTopicItemsByTopic(req.params.topicId);
  const item = await createTopicItem({
    classId: classroom._id,
    topicId: req.params.topicId,
    type: payload.type,
    title: payload.title,
    maxPoints: typeof payload.maxPoints === "number" && payload.maxPoints >= 0 ? Math.floor(payload.maxPoints) : 0,
    deadline: payload.deadline ? new Date(payload.deadline) : null,
    isPublished: typeof payload.isPublished === "boolean" ? payload.isPublished : true,
    order,
    ...quizFields,
    ...practiceFields,
  });
  return sendSuccess(res, { item: normalizeTopicItem(item) }, 201);
}

export async function reorderTopicItemsHandler(req, res) {
  if (req.user.role !== "teacher") {
    return sendError(res, "Only teachers can reorder items", 403, "FORBIDDEN");
  }
  const classroom = await getClassById(req.params.id);
  if (!classroom) {
    return sendError(res, "Class not found", 404, "NOT_FOUND");
  }
  const membership = await getMembership(req.user.id, classroom._id);
  if (!membership || membership.role !== "teacher") {
    return sendError(res, "Forbidden", 403, "FORBIDDEN");
  }
  const { itemIds } = req.body || {};
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return sendError(res, "itemIds array is required", 400, "VALIDATION_ERROR");
  }
  await reorderTopicItems(itemIds);
  return sendSuccess(res, { ok: true });
}

export async function updateTopicItemHandler(req, res) {
  if (req.user.role !== "teacher") {
    return sendError(res, "Only teachers can update items", 403, "FORBIDDEN");
  }
  const classroom = await getClassById(req.params.id);
  if (!classroom) {
    return sendError(res, "Class not found", 404, "NOT_FOUND");
  }
  const membership = await getMembership(req.user.id, classroom._id);
  if (!membership || membership.role !== "teacher") {
    return sendError(res, "Forbidden", 403, "FORBIDDEN");
  }
  const item = await getTopicItemById(req.params.itemId);
  if (!item || item.classId.toString() !== classroom._id.toString()) {
    return sendError(res, "Item not found", 404, "NOT_FOUND");
  }
  const payload = req.body || {};
  const update = {
    title: payload.title || item.title,
    type: payload.type || item.type,
    maxPoints: typeof payload.maxPoints === "number" && payload.maxPoints >= 0 ? Math.floor(payload.maxPoints) : item.maxPoints ?? 0,
    ...(payload.deadline !== undefined && { deadline: payload.deadline ? new Date(payload.deadline) : null }),
    ...(typeof payload.isPublished === "boolean" && { isPublished: payload.isPublished }),
  };
  if (!TOPIC_ITEM_TYPES.includes(update.type)) {
    return sendError(res, "Invalid type", 400, "VALIDATION_ERROR");
  }
  const quizFields = resolveQuizFields(payload, update.type, item);
  if (quizFields.error) {
    return sendError(res, quizFields.error, 400, "VALIDATION_ERROR");
  }
  // Persist content fields when updating a practice or learning item
  const practiceFields = {};
  if (update.type === "practice" || item.type === "practice" ||
      update.type === "learning"  || item.type === "learning") {
    if (payload.practiceBody         !== undefined) practiceFields.practiceBody         = payload.practiceBody;
    if (payload.practiceInstructions !== undefined) practiceFields.practiceInstructions = payload.practiceInstructions;
    if (payload.practiceHints        !== undefined) practiceFields.practiceHints        = payload.practiceHints;
    if (payload.practiceCodeStarter  !== undefined) practiceFields.practiceCodeStarter  = payload.practiceCodeStarter;
  }
  if (update.type === "practice" || item.type === "practice") {
    if (payload.practiceQuestion     !== undefined) practiceFields.practiceQuestion     = payload.practiceQuestion;
    if (payload.practiceModelAnswer  !== undefined) practiceFields.practiceModelAnswer  = payload.practiceModelAnswer;
    if (payload.practiceTestMode     !== undefined) practiceFields.practiceTestMode     = payload.practiceTestMode;
    if (payload.practiceTestCases    !== undefined) practiceFields.practiceTestCases    = payload.practiceTestCases;
  }
  const updated = await updateTopicItem(item._id, { ...update, ...quizFields, ...practiceFields });
  return sendSuccess(res, { item: normalizeTopicItem(updated) });
}

export async function deleteTopicItemHandler(req, res) {
  if (req.user.role !== "teacher") {
    return sendError(res, "Only teachers can delete items", 403, "FORBIDDEN");
  }
  const classroom = await getClassById(req.params.id);
  if (!classroom) {
    return sendError(res, "Class not found", 404, "NOT_FOUND");
  }
  const membership = await getMembership(req.user.id, classroom._id);
  if (!membership || membership.role !== "teacher") {
    return sendError(res, "Forbidden", 403, "FORBIDDEN");
  }
  const item = await getTopicItemById(req.params.itemId);
  if (!item || item.classId.toString() !== classroom._id.toString()) {
    return sendError(res, "Item not found", 404, "NOT_FOUND");
  }
  await deleteQuizAttemptsByItem(item._id);
  await deleteTopicItemById(item._id);
  return sendSuccess(res, { success: true });
}

export async function getPracticeItem(req, res) {
  const classroom = await getClassById(req.params.id);
  if (!classroom) {
    return sendError(res, "Class not found", 404, "NOT_FOUND");
  }
  const membership = await getMembership(req.user.id, classroom._id);
  if (!membership) {
    return sendError(res, "Forbidden", 403, "FORBIDDEN");
  }
  const item = await getTopicItemWithTopic(req.params.itemId);
  if (!item || item.classId.toString() !== classroom._id.toString()) {
    return sendError(res, "Item not found", 404, "NOT_FOUND");
  }
  if (req.user.role === "student" && item.isPublished === false) {
    return sendError(res, "Item not found", 404, "NOT_FOUND");
  }
  if (item.type !== "practice") {
    return sendError(res, "Not a practice item", 400, "INVALID_TYPE");
  }
  const existingAttempt = await getQuizAttemptByUserAndItem(req.user.id, item._id);
  return sendSuccess(res, {
    item: {
      id: item._id.toString(),
      title: item.title,
      type: item.type,
      topic: {
        id: item.topicId?._id?.toString?.() || item.topicId?.toString?.(),
        title: item.topicId?.title || "",
      },
      practiceBody:         item.practiceBody         || "",
      practiceInstructions: item.practiceInstructions || "",
      practiceQuestion:     item.practiceQuestion     || "",
      practiceHints:        item.practiceHints        || [],
      practiceCodeStarter:  item.practiceCodeStarter  || "",
      practiceModelAnswer:  item.practiceModelAnswer  || "",
      practiceTestMode:     item.practiceTestMode     || false,
      practiceTestCases:    item.practiceTestCases    || [],
      submittedCode:        existingAttempt?.responseText || null,
    },
  });
}

export async function getLearningItem(req, res) {
  const classroom = await getClassById(req.params.id);
  if (!classroom) {
    return sendError(res, "Class not found", 404, "NOT_FOUND");
  }
  const membership = await getMembership(req.user.id, classroom._id);
  if (!membership) {
    return sendError(res, "Forbidden", 403, "FORBIDDEN");
  }
  const item = await getTopicItemWithTopic(req.params.itemId);
  if (!item || item.classId.toString() !== classroom._id.toString()) {
    return sendError(res, "Item not found", 404, "NOT_FOUND");
  }
  if (req.user.role === "student" && item.isPublished === false) {
    return sendError(res, "Item not found", 404, "NOT_FOUND");
  }
  if (item.type !== "learning") {
    return sendError(res, "Not a learning item", 400, "INVALID_TYPE");
  }
  // Track that this student has viewed this learning item
  if (req.user.role === "student") {
    await upsertView({ userId: req.user.id, classId: classroom._id, itemId: item._id }).catch(() => {});
  }
  return sendSuccess(res, {
    item: {
      id: item._id.toString(),
      title: item.title,
      type: item.type,
      topic: {
        id: item.topicId?._id?.toString?.() || item.topicId?.toString?.(),
        title: item.topicId?.title || "",
      },
      practiceBody:         item.practiceBody         || "",
      practiceInstructions: item.practiceInstructions || "",
      practiceHints:        item.practiceHints        || [],
      practiceCodeStarter:  item.practiceCodeStarter  || "",
    },
  });
}

export async function getQuizItem(req, res) {
  const classroom = await getClassById(req.params.id);
  if (!classroom) {
    return sendError(res, "Class not found", 404, "NOT_FOUND");
  }
  const membership = await getMembership(req.user.id, classroom._id);
  if (!membership) {
    return sendError(res, "Forbidden", 403, "FORBIDDEN");
  }
  const item = await getTopicItemWithTopic(req.params.itemId);
  if (!item || item.classId.toString() !== classroom._id.toString()) {
    return sendError(res, "Item not found", 404, "NOT_FOUND");
  }
  if (req.user.role === "student" && item.isPublished === false) {
    return sendError(res, "Item not found", 404, "NOT_FOUND");
  }
  if (item.type !== "quiz") {
    return sendError(res, "Not a quiz item", 400, "INVALID_TYPE");
  }
  const attempt = await getQuizAttemptByUserAndItem(req.user.id, item._id);
  return sendSuccess(res, {
    item: {
      id: item._id.toString(),
      title: item.title,
      type: item.type,
      quizSubtype: item.quizSubtype || "mcq",
      quizQuestion: item.quizQuestion || "",
      quizOptions: Array.isArray(item.quizOptions) ? item.quizOptions : [],
      topic: {
        id: item.topicId?._id?.toString?.() || item.topicId?.toString?.(),
        title: item.topicId?.title || "",
      },
    },
    attempt: attempt ? toQuizAttemptResponse(attempt) : null,
  });
}

export async function submitQuizAttempt(req, res) {
  if (req.user.role !== "student") {
    return sendError(res, "Only students can submit quiz answers", 403, "FORBIDDEN");
  }
  const classroom = await getClassById(req.params.id);
  if (!classroom) {
    return sendError(res, "Class not found", 404, "NOT_FOUND");
  }
  const membership = await getMembership(req.user.id, classroom._id);
  if (!membership || membership.role !== "student") {
    return sendError(res, "Forbidden", 403, "FORBIDDEN");
  }
  const item = await getTopicItemWithTopic(req.params.itemId);
  if (!item || item.classId.toString() !== classroom._id.toString()) {
    return sendError(res, "Item not found", 404, "NOT_FOUND");
  }
  if (item.type !== "quiz" && item.type !== "practice") {
    return sendError(res, "Not a quiz or practice item", 400, "INVALID_TYPE");
  }

  const payload = req.body || {};
  const responseText = `${payload.responseText ?? ""}`.trim();

  // For practice items: just store the code, no grading needed
  if (item.type === "practice") {
    const attempt = await upsertQuizAttemptByUserAndItem(
      req.user.id,
      item._id,
      {
        $set: {
          responseText,
          classId: classroom._id,
          status: "submitted",
          gradingStatus: "pending",
          submittedAt: new Date(),
        },
        $inc: { attempts: 1 },
      },
      {
        userId: req.user.id,
        itemId: item._id,
        topicId: item.topicId?._id || item.topicId,
      }
    );
    return sendSuccess(res, { attempt: toQuizAttemptResponse(attempt) }, 200);
  }

  if (!responseText) {
    return sendError(res, "Response is required", 400, "VALIDATION_ERROR");
  }

  let status = "submitted";
  let gradingStatus = "pending";
  let isCorrect = null;
  let score = null;
  let feedback = "";
  let gradedAt = null;
  const subtype = item.quizSubtype || "mcq";

  if (subtype === "mcq") {
    const options = Array.isArray(item.quizOptions) ? item.quizOptions : [];
    if (!options.includes(responseText)) {
      return sendError(res, "Response must match one of the options", 400, "VALIDATION_ERROR");
    }
    const expected = `${item.quizAnswer || ""}`.trim();
    if (expected) {
      const normalize = (value) => `${value}`.trim().toLowerCase();
      isCorrect = normalize(responseText) === normalize(expected);
      score = isCorrect ? (item.maxPoints || 1) : 0;
      status = "graded";
      gradingStatus = "auto_graded";
      gradedAt = new Date();
    }
  } else if (subtype === "short_answer") {
    const expected = `${item.quizAnswer || ""}`.trim();
    if (expected) {
      try {
        const grading = await gradeShortAnswer({
          question: item.quizQuestion || "",
          expectedAnswer: expected,
          studentResponse: responseText,
        });
        isCorrect = grading.isCorrect;
        score = isCorrect ? (item.maxPoints || 1) : 0;
        feedback = grading.feedback;
        status = "graded";
        gradingStatus = "auto_graded";
        gradedAt = new Date();
      } catch {
        // LLM grading failed — leave as pending for teacher review
        feedback = "Auto-grading unavailable. Awaiting teacher review.";
      }
    }
  }

  const attempt = await upsertQuizAttemptByUserAndItem(
    req.user.id,
    item._id,
    {
      $set: {
        responseText,
        status,
        gradingStatus,
        isCorrect,
        score,
        feedback,
        submittedAt: new Date(),
        gradedAt,
      },
      $inc: { attempts: 1 },
    },
    {
      classId: classroom._id,
      topicId: item.topicId?._id || item.topicId,
    }
  );

  return sendSuccess(res, {
    attempt: toQuizAttemptResponse(attempt),
  });
}

export async function gradeQuizAttempt(req, res) {
  if (req.user.role !== "teacher") {
    return sendError(res, "Only teachers can grade quiz answers", 403, "FORBIDDEN");
  }
  const classroom = await getClassById(req.params.id);
  if (!classroom) {
    return sendError(res, "Class not found", 404, "NOT_FOUND");
  }
  const membership = await getMembership(req.user.id, classroom._id);
  if (!membership || membership.role !== "teacher") {
    return sendError(res, "Forbidden", 403, "FORBIDDEN");
  }
  const studentMembership = await getMembership(req.params.studentId, classroom._id);
  if (!studentMembership || studentMembership.role !== "student") {
    return sendError(res, "Student not enrolled", 404, "NOT_FOUND");
  }

  const attempt = await getQuizAttemptById(req.params.attemptId);
  if (!attempt || attempt.classId.toString() !== classroom._id.toString()) {
    return sendError(res, "Quiz attempt not found", 404, "NOT_FOUND");
  }
  if (attempt.userId !== req.params.studentId) {
    return sendError(res, "Quiz attempt does not belong to this student", 400, "VALIDATION_ERROR");
  }

  const gradingItem = await getTopicItemById(attempt.itemId);
  const itemMaxPoints = gradingItem?.maxPoints ?? 0;

  const payload = req.body || {};
  if (typeof payload.isCorrect !== "boolean") {
    return sendError(res, "isCorrect must be true or false", 400, "VALIDATION_ERROR");
  }
  const feedback = `${payload.feedback ?? ""}`.trim();
  let score =
    typeof payload.score === "number" && Number.isFinite(payload.score)
      ? payload.score
      : payload.isCorrect
        ? (itemMaxPoints || 1)
        : 0;
  if (itemMaxPoints > 0 && score > itemMaxPoints) {
    return sendError(res, `Score cannot exceed maxPoints (${itemMaxPoints})`, 400, "VALIDATION_ERROR");
  }

  const updated = await updateQuizAttemptById(attempt._id, {
    status: "graded",
    gradingStatus: "manual_graded",
    isCorrect: payload.isCorrect,
    score,
    feedback,
    gradedAt: new Date(),
  });

  return sendSuccess(res, { attempt: toQuizAttemptResponse(updated) });
}

export async function getStudentStats(req, res) {
  const classroom = await getClassById(req.params.id);
  if (!classroom) return sendError(res, "Class not found", 404, "NOT_FOUND");
  const membership = await getMembership(req.user.id, classroom._id);
  if (!membership || membership.role !== "teacher") return sendError(res, "Forbidden", 403, "FORBIDDEN");
  const studentMembership = await getMembership(req.params.studentId, classroom._id);
  if (!studentMembership || studentMembership.role !== "student") return sendError(res, "Student not enrolled", 404, "NOT_FOUND");

  const student = await User.findById(req.params.studentId).select({ name: 1 }).lean();

  const [allItems, myAttempts, topics] = await Promise.all([
    listTopicItemsByClass(classroom._id),
    listQuizAttemptsByUserInClass(req.params.studentId, classroom._id),
    listTopicsByClass(classroom._id),
  ]);

  const topicMap = new Map(topics.map((t) => [t._id.toString(), t.title]));
  const attemptByItem = new Map(myAttempts.map((a) => [a.itemId.toString(), a]));
  const gradableItems = allItems.filter((i) => i.type === "quiz" || i.type === "practice");

  const attempted = myAttempts.length;
  const correct = myAttempts.filter((a) => a.isCorrect === true).length;

  const items = gradableItems.map((item) => {
    const a = attemptByItem.get(item._id.toString());
    return {
      id: item._id.toString(),
      title: item.title,
      type: item.type,
      quizSubtype: item.quizSubtype || null,
      topicTitle: topicMap.get(item.topicId.toString()) || "",
      status: !a ? "none" : item.type === "practice" ? "attempted" : a.gradingStatus === "pending" ? "pending" : a.isCorrect ? "correct" : "incorrect",
      responseText: a?.responseText || null,
      feedback: a?.feedback || null,
      submittedAt: a?.submittedAt || null,
      attempts: a?.attempts || 0,
    };
  });

  return sendSuccess(res, {
    student: { id: req.params.studentId, name: student?.name || "Unknown" },
    summary: { attempted, correct, total: gradableItems.length },
    items,
  });
}

export async function getStudentProgress(req, res) {
  const classroom = await getClassById(req.params.id);
  if (!classroom) {
    return sendError(res, "Class not found", 404, "NOT_FOUND");
  }
  const membership = await getMembership(req.user.id, classroom._id);
  if (!membership || membership.role !== "teacher") {
    return sendError(res, "Forbidden", 403, "FORBIDDEN");
  }
  const studentMembership = await getMembership(req.params.studentId, classroom._id);
  if (!studentMembership || studentMembership.role !== "student") {
    return sendError(res, "Student not enrolled", 404, "NOT_FOUND");
  }
  const student = await User.findById(req.params.studentId)
    .select({ name: 1 })
    .lean();
  const lessons = await listLessons(classroom._id);
  const progress = await listProgressByUser(req.params.studentId);
  const quizAttempts = await listQuizAttemptsByUserInClass(req.params.studentId, classroom._id);
  const progressByLesson = new Map(
    progress.map((item) => [item.lessonId.toString(), item])
  );
  const quizItemIds = [...new Set(quizAttempts.map((item) => item.itemId.toString()))];
  const topicItems = await Promise.all(quizItemIds.map((itemId) => getTopicItemWithTopic(itemId)));
  const quizItemById = new Map(
    topicItems
      .filter(Boolean)
      .map((item) => [item._id.toString(), item])
  );

  const payload = lessons.map((lesson) => {
    const item = progressByLesson.get(lesson._id.toString());
    return {
      lessonId: lesson._id.toString(),
      unit: lesson.unit,
      heading: lesson.heading,
      duration: lesson.duration,
      status: item?.status || "not_started",
      attempts: item?.attempts || 0,
      lastRunAt: item?.lastRunAt || null,
      completedAt: item?.completedAt || null,
      updatedAt: item?.updatedAt || null,
      lastCode: item?.lastCode || "",
      lastAnswer: item?.lastAnswer || "",
    };
  });

  return sendSuccess(res, {
    student: student
      ? { id: student._id.toString(), name: student.name }
      : { id: req.params.studentId, name: "Student" },
    progress: payload,
    quizAttempts: quizAttempts.map((attempt) => {
      const item = quizItemById.get(attempt.itemId.toString());
      return {
        ...toQuizAttemptResponse(attempt),
        itemTitle: item?.title || "Submission",
        itemType: item?.type || "quiz",
        quizSubtype: item?.quizSubtype || "mcq",
        quizQuestion: item?.quizQuestion || "",
        topicTitle: item?.topicId?.title || "",
      };
    }),
  });
}

export async function getClassStats(req, res) {
  const classroom = await getClassById(req.params.id);
  if (!classroom) return sendError(res, "Class not found", 404, "NOT_FOUND");
  const membership = await getMembership(req.user.id, classroom._id);
  if (!membership || membership.role !== "teacher") return sendError(res, "Forbidden", 403, "FORBIDDEN");

  const [memberships, allItems, allAttempts, topicCount, topics, aiInteractionMap, learningViewMap] = await Promise.all([
    listMemberships(classroom._id),
    listTopicItemsByClass(classroom._id),
    listQuizAttemptsByClass(classroom._id),
    countTopicsByClass(classroom._id),
    listTopicsByClass(classroom._id),
    groupedCountsByClass(classroom._id),
    groupedViewCountsByClass(classroom._id),
  ]);

  // Summary counts
  const studentMemberships = memberships.filter((m) => m.role === "student");
  const studentCount = studentMemberships.length;
  const itemCounts = { learning: 0, quiz: 0, practice: 0 };
  for (const item of allItems) {
    if (itemCounts[item.type] !== undefined) itemCounts[item.type]++;
  }

  const quizSummary = { total: allAttempts.length, correct: 0, incorrect: 0, pending: 0 };
  for (const a of allAttempts) {
    if (a.gradingStatus === "pending") quizSummary.pending++;
    else if (a.isCorrect === true) quizSummary.correct++;
    else quizSummary.incorrect++;
  }

  // Lookup maps
  const topicMap = new Map(topics.map((t) => [t._id.toString(), t.title]));
  const studentIds = studentMemberships.map((m) => m.userId);
  const students = studentIds.length
    ? await User.find({ _id: { $in: studentIds } }).select({ name: 1 }).lean()
    : [];
  const studentNameMap = new Map(students.map((s) => [s._id.toString(), s.name]));

  // Group attempts
  const attemptsByStudent = new Map();
  const attemptsByItem = new Map();
  for (const a of allAttempts) {
    const sid = a.userId;
    const iid = a.itemId.toString();
    if (!attemptsByStudent.has(sid)) attemptsByStudent.set(sid, []);
    attemptsByStudent.get(sid).push(a);
    if (!attemptsByItem.has(iid)) attemptsByItem.set(iid, []);
    attemptsByItem.get(iid).push(a);
  }

  const gradableItems = allItems.filter((i) => i.type === "quiz" || i.type === "practice");

  // Total possible points across all gradable items
  const totalPossiblePoints = gradableItems.reduce((sum, i) => sum + (i.maxPoints ?? 0), 0);
  // Map itemId → maxPoints for quick lookup
  const itemMaxPointsMap = new Map(gradableItems.map((i) => [i._id.toString(), i.maxPoints ?? 0]));
  // Map itemId → type for quiz vs practice breakdown
  const itemTypeMap = new Map(allItems.map((i) => [i._id.toString(), i.type]));

  // Per-student breakdown
  const studentBreakdowns = studentIds.map((sid) => {
    const attempts = attemptsByStudent.get(sid) || [];
    const attempted = attempts.length;
    const correct = attempts.filter((a) => a.isCorrect === true).length;
    const pointsEarned = attempts.reduce((sum, a) => sum + (typeof a.score === "number" ? a.score : 0), 0);
    const sortedByDate = [...attempts].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    const quizAttempts = attempts.filter((a) => itemTypeMap.get(a.itemId.toString()) === "quiz").length;
    const quizCorrect = attempts.filter((a) => itemTypeMap.get(a.itemId.toString()) === "quiz" && a.isCorrect === true).length;
    const practiceAttempts = attempts.filter((a) => itemTypeMap.get(a.itemId.toString()) === "practice").length;
    const pendingGrading = attempts.filter((a) => a.gradingStatus === "pending").length;

    return {
      id: sid,
      name: studentNameMap.get(sid) || "Unknown",
      attempted,
      correct,
      total: gradableItems.length,
      pointsEarned,
      totalPossiblePoints,
      successRate: attempted > 0 ? Math.round((correct / attempted) * 100) : null,
      lastActivity: sortedByDate[0]?.updatedAt || null,
      quizAttempts,
      quizCorrect,
      practiceAttempts,
      pendingGrading,
      learningItemsViewed: learningViewMap[sid] || 0,
      aiInteractions: aiInteractionMap[sid] || 0,
    };
  }).sort((a, b) => b.attempted - a.attempted);

  // Per-item breakdown
  const itemBreakdowns = gradableItems.map((item) => {
    const attempts = attemptsByItem.get(item._id.toString()) || [];
    const attempted = attempts.length;
    const correct = attempts.filter((a) => a.isCorrect === true).length;
    const correctRate = attempted > 0 ? Math.round((correct / attempted) * 100) : null;
    const avgScore = attempted > 0
      ? +(attempts.reduce((sum, a) => sum + (typeof a.score === "number" ? a.score : 0), 0) / attempted).toFixed(2)
      : null;
    return {
      id: item._id.toString(),
      title: item.title,
      type: item.type,
      quizSubtype: item.quizSubtype || null,
      topicTitle: topicMap.get(item.topicId.toString()) || "",
      maxPoints: item.maxPoints ?? 0,
      attempted,
      correct,
      correctRate,
      avgScore,
      studentCount,
    };
  });

  // Gradebook matrix: one row per student, one cell per gradable item
  const gradebook = studentIds.map((sid) => {
    const attempts = attemptsByStudent.get(sid) || [];
    const attemptByItem = new Map(attempts.map((a) => [a.itemId.toString(), a]));
    return {
      studentId: sid,
      name: studentNameMap.get(sid) || "Unknown",
      cells: gradableItems.map((item) => {
        const a = attemptByItem.get(item._id.toString());
        if (!a) return { status: "none", score: null };
        if (a.gradingStatus === "pending") return { status: "pending", score: null };
        return {
          status: a.isCorrect ? "correct" : "incorrect",
          score: typeof a.score === "number" ? a.score : null,
        };
      }),
    };
  });

  const gradebookHeaders = gradableItems.map((i) => ({
    id: i._id.toString(),
    title: i.title,
    type: i.type,
    maxPoints: i.maxPoints ?? 0,
  }));

  return sendSuccess(res, {
    studentCount,
    topicCount,
    itemCounts,
    quizSummary,
    studentBreakdowns,
    itemBreakdowns,
    gradebook,
    gradebookHeaders,
  });
}

export async function getMyClassProgress(req, res) {
  const classroom = await getClassById(req.params.id);
  if (!classroom) return sendError(res, "Class not found", 404, "NOT_FOUND");
  const membership = await getMembership(req.user.id, classroom._id);
  if (!membership || membership.role !== "student") return sendError(res, "Forbidden", 403, "FORBIDDEN");

  const [allItems, myAttempts] = await Promise.all([
    listTopicItemsByClass(classroom._id),
    listQuizAttemptsByUserInClass(req.user.id, classroom._id),
  ]);

  const attemptedItemIds = new Set(myAttempts.map((a) => a.itemId.toString()));
  const correctItemIds = new Set(myAttempts.filter((a) => a.isCorrect === true).map((a) => a.itemId.toString()));
  const attemptByItemId = new Map(myAttempts.map((a) => [a.itemId.toString(), a]));

  const gradedItems = allItems.filter((i) => i.type === "quiz" || i.type === "practice");
  const attemptedCount = gradedItems.filter((i) => attemptedItemIds.has(i._id.toString())).length;
  const correctCount = gradedItems.filter((i) => correctItemIds.has(i._id.toString())).length;

  const pointsEarned = myAttempts.reduce((sum, a) => sum + (typeof a.score === "number" ? a.score : 0), 0);
  const totalPossiblePoints = gradedItems.reduce((sum, i) => sum + (i.maxPoints ?? 0), 0);

  const items = allItems.map((i) => {
    const attempt = attemptByItemId.get(i._id.toString());
    return {
      id: i._id.toString(),
      topicId: i.topicId.toString(),
      type: i.type,
      title: i.title,
      maxPoints: i.maxPoints ?? 0,
      attempted: i.type !== "learning" ? attemptedItemIds.has(i._id.toString()) : null,
      score: attempt ? (typeof attempt.score === "number" ? attempt.score : null) : null,
      isCorrect: attempt ? (typeof attempt.isCorrect === "boolean" ? attempt.isCorrect : null) : null,
    };
  });

  return sendSuccess(res, {
    totalItems: allItems.length,
    gradedItems: gradedItems.length,
    attemptedItems: attemptedCount,
    correctItems: correctCount,
    pointsEarned,
    totalPossiblePoints,
    items,
  });
}

export async function getMyDashboard(req, res) {
  const classroom = await getClassById(req.params.id);
  if (!classroom) return sendError(res, "Class not found", 404, "NOT_FOUND");
  const membership = await getMembership(req.user.id, classroom._id);
  if (!membership || membership.role !== "student") return sendError(res, "Forbidden", 403, "FORBIDDEN");

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [myAttempts, upcomingItems, recentNewItems, allItems] = await Promise.all([
    listQuizAttemptsByUserInClass(req.user.id, classroom._id),
    listUpcomingDeadlines(classroom._id, now),
    listRecentItems(classroom._id, sevenDaysAgo),
    listTopicItemsByClass(classroom._id),
  ]);

  const itemById = new Map(allItems.map((i) => [i._id.toString(), i]));

  // Last 10 graded attempts with item details
  const gradedAttempts = myAttempts
    .filter((a) => a.gradingStatus !== "pending" && a.status === "graded")
    .sort((a, b) => new Date(b.gradedAt || b.updatedAt) - new Date(a.gradedAt || a.updatedAt))
    .slice(0, 10);

  const recentScores = gradedAttempts.map((a) => {
    const item = itemById.get(a.itemId.toString());
    return {
      attemptId: a._id.toString(),
      itemId: a.itemId.toString(),
      title: item?.title || "Unknown",
      type: item?.type || "quiz",
      score: typeof a.score === "number" ? a.score : null,
      maxPoints: item?.maxPoints ?? 0,
      isCorrect: a.isCorrect,
      gradedAt: a.gradedAt || a.updatedAt || null,
    };
  });

  // Upcoming deadlines with daysLeft
  const upcomingDeadlines = upcomingItems.map((item) => {
    const deadline = new Date(item.deadline);
    const msLeft = deadline.getTime() - now.getTime();
    const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
    return {
      id: item._id.toString(),
      title: item.title,
      type: item.type,
      deadline: item.deadline,
      daysLeft,
    };
  });

  // Items added in the last 7 days (updates feed)
  const updates = recentNewItems.map((item) => ({
    id: item._id.toString(),
    title: item.title,
    type: item.type,
    createdAt: item.createdAt,
  }));

  return sendSuccess(res, { recentScores, upcomingDeadlines, updates });
}

export async function deleteClassHandler(req, res) {
  if (req.user.role !== "teacher") {
    return sendError(res, "Only teachers can delete classes", 403, "FORBIDDEN");
  }
  const classroom = await getClassById(req.params.id);
  if (!classroom) {
    return sendError(res, "Class not found", 404, "NOT_FOUND");
  }
  const membership = await getMembership(req.user.id, classroom._id);
  if (!membership || membership.role !== "teacher") {
    return sendError(res, "Forbidden", 403, "FORBIDDEN");
  }
  await deleteLessonsByClassId(classroom._id);
  await deleteQuizAttemptsByClass(classroom._id);
  await deleteMembershipsByClassId(classroom._id);
  await deleteClassById(classroom._id);
  return sendSuccess(res, { success: true });
}

export async function getStudentAIInteractions(req, res) {
  const classroom = await getClassById(req.params.id);
  if (!classroom) return sendError(res, "Class not found", 404, "NOT_FOUND");
  const membership = await getMembership(req.user.id, classroom._id);
  if (!membership || membership.role !== "teacher") return sendError(res, "Forbidden", 403, "FORBIDDEN");

  const interactions = await listByStudentInClass(req.params.studentId, classroom._id);
  return sendSuccess(res, { interactions });
}
