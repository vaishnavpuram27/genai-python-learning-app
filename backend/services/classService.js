import Classroom from "../models/Classroom.js";
import ClassMembership from "../models/ClassMembership.js";
import Lesson from "../models/Lesson.js";

export async function listClassesForUser(userId) {
  const memberships = await ClassMembership.find({ userId }).lean();
  const classIds = memberships.map((m) => m.classId);
  if (!classIds.length) return [];
  return Classroom.find({ _id: { $in: classIds } })
    .sort({ updatedAt: -1 })
    .lean();
}

export async function getClassById(id) {
  return Classroom.findById(id).lean();
}

export async function getClassByJoinCode(joinCode) {
  return Classroom.findOne({ joinCode }).lean();
}

export async function createClass(payload) {
  const classroom = await Classroom.create(payload);
  return classroom.toObject();
}

export async function addMembership(payload) {
  const membership = await ClassMembership.create(payload);
  return membership.toObject();
}

export async function getMembership(userId, classId) {
  return ClassMembership.findOne({ userId, classId }).lean();
}

export async function listMemberships(classId) {
  return ClassMembership.find({ classId }).lean();
}

export async function deleteClassById(classId) {
  return Classroom.findByIdAndDelete(classId).lean();
}

export async function deleteMembershipsByClassId(classId) {
  return ClassMembership.deleteMany({ classId });
}

export async function deleteLessonsByClassId(classId) {
  return Lesson.deleteMany({ classId });
}
