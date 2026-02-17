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
  listQuizAttemptsByUserInClass,
  updateQuizAttemptById,
  upsertQuizAttemptByUserAndItem,
} from "../services/quizAttemptService.js";
import {
  createTopic,
  deleteTopicById,
  getTopicById,
  listTopicsByClass,
  updateTopic,
} from "../services/topicService.js";
import {
  createTopicItem,
  deleteTopicItemById,
  getTopicItemById,
  getTopicItemWithTopic,
  listTopicItemsByClass,
  listTopicItemsByTopic,
  updateTopicItem,
} from "../services/topicItemService.js";
import { sendError, sendSuccess } from "../utils/responses.js";

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
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
  };
}

function normalizeTopicItem(item) {
  return {
    id: item._id.toString(),
    topicId: item.topicId.toString(),
    type: item.type,
    title: item.title,
    quizSubtype: item.quizSubtype || null,
    quizQuestion: item.quizQuestion || "",
    quizOptions: Array.isArray(item.quizOptions) ? item.quizOptions : [],
    quizAnswer: item.quizAnswer || "",
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
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
  const items = await listTopicItemsByClass(classroom._id);
  const itemsByTopic = items.reduce((acc, item) => {
    const key = item.topicId.toString();
    if (!acc[key]) acc[key] = [];
    acc[key].push(normalizeTopicItem(item));
    return acc;
  }, {});

  return sendSuccess(res, {
    topics: topics.map((topic) => ({
      ...toTopicResponse(topic),
      items: (itemsByTopic[topic._id.toString()] || []).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
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
  const topic = await createTopic({
    classId: classroom._id,
    title: payload.title,
    concepts: Array.isArray(payload.concepts) ? payload.concepts : [],
    createdBy: req.user.id,
  });
  return sendSuccess(res, { topic: toTopicResponse(topic) }, 201);
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
  await Promise.all(listTopicItemsByTopic(topic._id).then((items) =>
    Promise.all(
      items.map(async (item) => {
        await deleteQuizAttemptsByItem(item._id);
        return deleteTopicItemById(item._id);
      })
    )
  ));
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
  const item = await createTopicItem({
    classId: classroom._id,
    topicId: req.params.topicId,
    type: payload.type,
    title: payload.title,
    ...quizFields,
  });
  return sendSuccess(res, { item: normalizeTopicItem(item) }, 201);
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
  };
  if (!TOPIC_ITEM_TYPES.includes(update.type)) {
    return sendError(res, "Invalid type", 400, "VALIDATION_ERROR");
  }
  const quizFields = resolveQuizFields(payload, update.type, item);
  if (quizFields.error) {
    return sendError(res, quizFields.error, 400, "VALIDATION_ERROR");
  }
  const updated = await updateTopicItem(item._id, { ...update, ...quizFields });
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
  if (item.type !== "practice") {
    return sendError(res, "Not a practice item", 400, "INVALID_TYPE");
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
  if (item.type !== "quiz") {
    return sendError(res, "Not a quiz item", 400, "INVALID_TYPE");
  }

  const payload = req.body || {};
  const responseText = `${payload.responseText ?? ""}`.trim();
  if (!responseText) {
    return sendError(res, "Response is required", 400, "VALIDATION_ERROR");
  }

  let status = "submitted";
  let gradingStatus = "pending";
  let isCorrect = null;
  let score = null;
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
      score = isCorrect ? 1 : 0;
      status = "graded";
      gradingStatus = "auto_graded";
      gradedAt = new Date();
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
        feedback: "",
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

  const payload = req.body || {};
  if (typeof payload.isCorrect !== "boolean") {
    return sendError(res, "isCorrect must be true or false", 400, "VALIDATION_ERROR");
  }
  const feedback = `${payload.feedback ?? ""}`.trim();
  const score =
    typeof payload.score === "number" && Number.isFinite(payload.score)
      ? payload.score
      : payload.isCorrect
        ? 1
        : 0;

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
        itemTitle: item?.title || "Quiz",
        quizSubtype: item?.quizSubtype || "mcq",
        quizQuestion: item?.quizQuestion || "",
        topicTitle: item?.topicId?.title || "",
      };
    }),
  });
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
