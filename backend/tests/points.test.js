import request from "supertest";
import { vi } from "vitest";
import app from "../app.js";

vi.mock("../services/chatService.js", () => ({
  gradeShortAnswer: vi.fn().mockResolvedValue({
    isCorrect: true,
    feedback: "Correct!",
    gradingStatus: "auto_graded",
  }),
  buildSystemPrompt: vi.fn().mockReturnValue("mocked prompt"),
  repairJson: vi.fn().mockResolvedValue("{}"),
  validateStudentResponse: vi.fn().mockResolvedValue({ onTopic: true }),
  rateContent: vi.fn().mockResolvedValue({ rating: 5 }),
  streamTeacherResponse: vi.fn(),
  streamStudentResponse: vi.fn(),
  explainError: vi.fn().mockResolvedValue("mocked explanation"),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

async function signup(name, role = "teacher") {
  const res = await request(app)
    .post("/api/v1/auth/signup")
    .send({ name, password: "pass1234", role });
  return res.body.data.token;
}

async function createClass(token, name = "Points Class") {
  const res = await request(app)
    .post("/api/v1/classes")
    .set("Authorization", `Bearer ${token}`)
    .send({ name });
  return res.body.data.classroom;
}

async function createTopic(token, classId) {
  const res = await request(app)
    .post(`/api/v1/classes/${classId}/topics`)
    .set("Authorization", `Bearer ${token}`)
    .send({ title: "Topic" });
  return res.body.data.topic;
}

async function createItem(token, classId, topicId, body) {
  const res = await request(app)
    .post(`/api/v1/classes/${classId}/topics/${topicId}/items`)
    .set("Authorization", `Bearer ${token}`)
    .send(body);
  return res.body.data.item;
}

async function joinClass(token, joinCode) {
  return request(app)
    .post("/api/v1/classes/join")
    .set("Authorization", `Bearer ${token}`)
    .send({ joinCode });
}

async function submitAttempt(token, classId, itemId, responseText) {
  return request(app)
    .put(`/api/v1/classes/${classId}/quiz/${itemId}/attempt`)
    .set("Authorization", `Bearer ${token}`)
    .send({ responseText });
}

// ─── Phase 1: Points & Scoring Tests ────────────────────────────────────────

describe("Phase 1 — Points & Scoring", () => {
  describe("Teacher assigns maxPoints to an item", () => {
    it("item is created with maxPoints=0 by default", async () => {
      const token = await signup("t-pts-default");
      const classroom = await createClass(token);
      const topic = await createTopic(token, classroom.id);

      const item = await createItem(token, classroom.id, topic.id, {
        type: "quiz",
        title: "No points quiz",
        quizSubtype: "mcq",
        quizQuestion: "2+2?",
        quizOptions: ["3", "4"],
        quizAnswer: "4",
      });

      expect(item.maxPoints).toBe(0);
    });

    it("teacher can create an item with maxPoints set", async () => {
      const token = await signup("t-pts-create");
      const classroom = await createClass(token);
      const topic = await createTopic(token, classroom.id);

      const item = await createItem(token, classroom.id, topic.id, {
        type: "quiz",
        title: "10-point quiz",
        quizSubtype: "mcq",
        quizQuestion: "2+2?",
        quizOptions: ["3", "4"],
        quizAnswer: "4",
        maxPoints: 10,
      });

      expect(item.maxPoints).toBe(10);
    });

    it("teacher can update maxPoints on an existing item", async () => {
      const token = await signup("t-pts-update");
      const classroom = await createClass(token);
      const topic = await createTopic(token, classroom.id);

      const item = await createItem(token, classroom.id, topic.id, {
        type: "quiz",
        title: "Quiz",
        quizSubtype: "mcq",
        quizQuestion: "Q?",
        quizOptions: ["A", "B"],
        quizAnswer: "A",
      });

      const updateRes = await request(app)
        .put(`/api/v1/classes/${classroom.id}/topics/${topic.id}/items/${item.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ maxPoints: 20 });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.item.maxPoints).toBe(20);
    });

    it("maxPoints is included in the topics list response", async () => {
      const token = await signup("t-pts-list");
      const classroom = await createClass(token);
      const topic = await createTopic(token, classroom.id);

      await createItem(token, classroom.id, topic.id, {
        type: "quiz",
        title: "Valued Quiz",
        quizSubtype: "mcq",
        quizQuestion: "Q?",
        quizOptions: ["A", "B"],
        quizAnswer: "A",
        maxPoints: 15,
      });

      const topicsRes = await request(app)
        .get(`/api/v1/classes/${classroom.id}/topics`)
        .set("Authorization", `Bearer ${token}`);

      const createdItem = topicsRes.body.data.topics[0].items[0];
      expect(createdItem.maxPoints).toBe(15);
    });
  });

  describe("MCQ auto-grading respects maxPoints", () => {
    let teacherToken, studentToken, classId, topicId;

    beforeEach(async () => {
      teacherToken = await signup("t-mcq-pts");
      studentToken = await signup("s-mcq-pts", "student");
      const classroom = await createClass(teacherToken);
      classId = classroom.id;
      await joinClass(studentToken, classroom.joinCode);
      const topic = await createTopic(teacherToken, classId);
      topicId = topic.id;
    });

    it("correct MCQ answer earns maxPoints", async () => {
      const item = await createItem(teacherToken, classId, topicId, {
        type: "quiz",
        title: "10-pt MCQ",
        quizSubtype: "mcq",
        quizQuestion: "2+2?",
        quizOptions: ["3", "4", "5"],
        quizAnswer: "4",
        maxPoints: 10,
      });

      const res = await submitAttempt(studentToken, classId, item.id, "4");
      expect(res.status).toBe(200);
      expect(res.body.data.attempt.score).toBe(10);
      expect(res.body.data.attempt.isCorrect).toBe(true);
    });

    it("incorrect MCQ answer earns 0 points", async () => {
      const item = await createItem(teacherToken, classId, topicId, {
        type: "quiz",
        title: "10-pt MCQ wrong",
        quizSubtype: "mcq",
        quizQuestion: "2+2?",
        quizOptions: ["3", "4", "5"],
        quizAnswer: "4",
        maxPoints: 10,
      });

      const res = await submitAttempt(studentToken, classId, item.id, "3");
      expect(res.status).toBe(200);
      expect(res.body.data.attempt.score).toBe(0);
      expect(res.body.data.attempt.isCorrect).toBe(false);
    });

    it("MCQ with maxPoints=0 defaults score to 1 when correct", async () => {
      const item = await createItem(teacherToken, classId, topicId, {
        type: "quiz",
        title: "Ungraded MCQ",
        quizSubtype: "mcq",
        quizQuestion: "2+2?",
        quizOptions: ["3", "4", "5"],
        quizAnswer: "4",
      });

      const res = await submitAttempt(studentToken, classId, item.id, "4");
      expect(res.body.data.attempt.score).toBe(1);
    });
  });

  describe("Teacher grading with score validation", () => {
    let teacherToken, studentToken, classId, topicId, item, attemptId, studentId;

    beforeEach(async () => {
      teacherToken = await signup("t-grade-pts");
      studentToken = await signup("s-grade-pts", "student");
      const classroom = await createClass(teacherToken);
      classId = classroom.id;
      await joinClass(studentToken, classroom.joinCode);
      const topic = await createTopic(teacherToken, classId);
      topicId = topic.id;

      item = await createItem(teacherToken, classId, topicId, {
        type: "quiz",
        title: "SA Quiz",
        quizSubtype: "short_answer",
        quizQuestion: "Explain a variable.",
        quizAnswer: "A variable stores data.",
        maxPoints: 5,
      });

      const attemptRes = await submitAttempt(studentToken, classId, item.id, "A variable stores a value.");
      attemptId = attemptRes.body.data.attempt.id;

      const studentsRes = await request(app)
        .get(`/api/v1/classes/${classId}/students`)
        .set("Authorization", `Bearer ${teacherToken}`);
      studentId = studentsRes.body.data.students.find((s) => s.name === "s-grade-pts")?.id;
    });

    it("teacher can assign a score within maxPoints", async () => {
      const res = await request(app)
        .put(`/api/v1/classes/${classId}/students/${studentId}/quiz-attempts/${attemptId}/grade`)
        .set("Authorization", `Bearer ${teacherToken}`)
        .send({ isCorrect: true, score: 4, feedback: "Good, but incomplete." });

      expect(res.status).toBe(200);
      expect(res.body.data.attempt.score).toBe(4);
      expect(res.body.data.attempt.gradingStatus).toBe("manual_graded");
    });

    it("teacher cannot assign a score exceeding maxPoints", async () => {
      const res = await request(app)
        .put(`/api/v1/classes/${classId}/students/${studentId}/quiz-attempts/${attemptId}/grade`)
        .set("Authorization", `Bearer ${teacherToken}`)
        .send({ isCorrect: true, score: 99, feedback: "Too generous!" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe("Class stats include points data", () => {
    it("stats response includes pointsEarned and totalPossiblePoints per student", async () => {
      const teacherToken = await signup("t-stats-pts");
      const studentToken = await signup("s-stats-pts", "student");
      const classroom = await createClass(teacherToken);
      await joinClass(studentToken, classroom.joinCode);
      const topic = await createTopic(teacherToken, classroom.id);

      const item = await createItem(teacherToken, classroom.id, topic.id, {
        type: "quiz",
        title: "Stats Quiz",
        quizSubtype: "mcq",
        quizQuestion: "Q?",
        quizOptions: ["A", "B"],
        quizAnswer: "A",
        maxPoints: 10,
      });

      await submitAttempt(studentToken, classroom.id, item.id, "A");

      const statsRes = await request(app)
        .get(`/api/v1/classes/${classroom.id}/stats`)
        .set("Authorization", `Bearer ${teacherToken}`);

      expect(statsRes.status).toBe(200);
      const studentBreakdown = statsRes.body.data.studentBreakdowns[0];
      expect(studentBreakdown.pointsEarned).toBe(10);
      expect(studentBreakdown.totalPossiblePoints).toBe(10);
    });

    it("stats itemBreakdowns include maxPoints and avgScore", async () => {
      const teacherToken = await signup("t-item-stats");
      const studentToken = await signup("s-item-stats", "student");
      const classroom = await createClass(teacherToken);
      await joinClass(studentToken, classroom.joinCode);
      const topic = await createTopic(teacherToken, classroom.id);

      const item = await createItem(teacherToken, classroom.id, topic.id, {
        type: "quiz",
        title: "Item Stats Quiz",
        quizSubtype: "mcq",
        quizQuestion: "Q?",
        quizOptions: ["A", "B"],
        quizAnswer: "A",
        maxPoints: 8,
      });

      await submitAttempt(studentToken, classroom.id, item.id, "A");

      const statsRes = await request(app)
        .get(`/api/v1/classes/${classroom.id}/stats`)
        .set("Authorization", `Bearer ${teacherToken}`);

      const itemBreakdown = statsRes.body.data.itemBreakdowns.find((i) => i.id === item.id);
      expect(itemBreakdown.maxPoints).toBe(8);
      expect(itemBreakdown.avgScore).toBe(8);
    });
  });

  describe("Student my-progress includes points data", () => {
    it("my-progress response includes pointsEarned and totalPossiblePoints", async () => {
      const teacherToken = await signup("t-myprog-pts");
      const studentToken = await signup("s-myprog-pts", "student");
      const classroom = await createClass(teacherToken);
      await joinClass(studentToken, classroom.joinCode);
      const topic = await createTopic(teacherToken, classroom.id);

      const item = await createItem(teacherToken, classroom.id, topic.id, {
        type: "quiz",
        title: "Progress Quiz",
        quizSubtype: "mcq",
        quizQuestion: "Q?",
        quizOptions: ["A", "B"],
        quizAnswer: "A",
        maxPoints: 5,
      });

      await submitAttempt(studentToken, classroom.id, item.id, "A");

      const progressRes = await request(app)
        .get(`/api/v1/classes/${classroom.id}/my-progress`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(progressRes.status).toBe(200);
      expect(progressRes.body.data.pointsEarned).toBe(5);
      expect(progressRes.body.data.totalPossiblePoints).toBe(5);
    });

    it("my-progress items include per-item score and maxPoints", async () => {
      const teacherToken = await signup("t-item-prog");
      const studentToken = await signup("s-item-prog", "student");
      const classroom = await createClass(teacherToken);
      await joinClass(studentToken, classroom.joinCode);
      const topic = await createTopic(teacherToken, classroom.id);

      const item = await createItem(teacherToken, classroom.id, topic.id, {
        type: "quiz",
        title: "Item Progress Quiz",
        quizSubtype: "mcq",
        quizQuestion: "Q?",
        quizOptions: ["A", "B"],
        quizAnswer: "A",
        maxPoints: 7,
      });

      await submitAttempt(studentToken, classroom.id, item.id, "A");

      const progressRes = await request(app)
        .get(`/api/v1/classes/${classroom.id}/my-progress`)
        .set("Authorization", `Bearer ${studentToken}`);

      const progressItem = progressRes.body.data.items.find((i) => i.id === item.id);
      expect(progressItem.maxPoints).toBe(7);
      expect(progressItem.score).toBe(7);
    });
  });
});
