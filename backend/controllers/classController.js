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
import { sendError, sendSuccess } from "../utils/responses.js";

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
  const progressByLesson = new Map(
    progress.map((item) => [item.lessonId.toString(), item])
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
    };
  });

  return sendSuccess(res, {
    student: student
      ? { id: student._id.toString(), name: student.name }
      : { id: req.params.studentId, name: "Student" },
    progress: payload,
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
  await deleteMembershipsByClassId(classroom._id);
  await deleteClassById(classroom._id);
  return sendSuccess(res, { success: true });
}
