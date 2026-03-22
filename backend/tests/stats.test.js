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
  getChatCompletionStream: vi.fn().mockImplementation(async function* () {
    yield "Hello ";
    yield "student!";
  }),
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

async function createClass(token, name = "Stats Class") {
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

async function openLearningItem(token, classId, itemId) {
  return request(app)
    .get(`/api/v1/classes/${classId}/learn/${itemId}`)
    .set("Authorization", `Bearer ${token}`);
}

async function sendChatMessage(token, classId) {
  // POST to /api/v1/chat — SSE endpoint; we just trigger it and don't need the full stream
  return request(app)
    .post("/api/v1/chat")
    .set("Authorization", `Bearer ${token}`)
    .send({
      messages: [{ role: "user", content: "Hello!" }],
      context: { classId },
    });
}

// ─── Phase 4: Enhanced Teacher Course Statistics ─────────────────────────────

describe("Phase 4 — Enhanced Teacher Course Statistics", () => {
  describe("studentBreakdowns — per-student breakdown fields", () => {
    let teacherToken, studentToken, classId, classroom, topicId;

    beforeEach(async () => {
      teacherToken = await signup("t-stats4-base");
      studentToken = await signup("s-stats4-base", "student");
      classroom = await createClass(teacherToken);
      classId = classroom.id;
      await joinClass(studentToken, classroom.joinCode);
      const topic = await createTopic(teacherToken, classId);
      topicId = topic.id;
    });

    it("returns quizAttempts, quizCorrect, practiceAttempts in studentBreakdowns", async () => {
      const quizItem = await createItem(teacherToken, classId, topicId, {
        type: "quiz",
        title: "Q1",
        quizSubtype: "mcq",
        quizQuestion: "2+2?",
        quizOptions: ["3", "4"],
        quizAnswer: "4",
        maxPoints: 5,
      });
      const practiceItem = await createItem(teacherToken, classId, topicId, {
        type: "practice",
        title: "P1",
        practiceQuestion: "Write a loop.",
      });

      await submitAttempt(studentToken, classId, quizItem.id, "4");
      await submitAttempt(studentToken, classId, practiceItem.id, "for i in range(5): pass");

      const res = await request(app)
        .get(`/api/v1/classes/${classId}/stats`)
        .set("Authorization", `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      const breakdown = res.body.data.studentBreakdowns[0];
      expect(breakdown.quizAttempts).toBe(1);
      expect(breakdown.quizCorrect).toBe(1);
      expect(breakdown.practiceAttempts).toBe(1);
    });

    it("returns pendingGrading count for pending short-answer attempts", async () => {
      const item = await createItem(teacherToken, classId, topicId, {
        type: "quiz",
        title: "SA",
        quizSubtype: "short_answer",
        quizQuestion: "Explain loops.",
        // no quizAnswer → stays pending
      });

      await submitAttempt(studentToken, classId, item.id, "A loop repeats code.");

      const res = await request(app)
        .get(`/api/v1/classes/${classId}/stats`)
        .set("Authorization", `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      const breakdown = res.body.data.studentBreakdowns[0];
      expect(breakdown.pendingGrading).toBe(1);
    });

    it("returns learningItemsViewed after student opens a learning item", async () => {
      const learningItem = await createItem(teacherToken, classId, topicId, {
        type: "learning",
        title: "Intro to Python",
        practiceBody: "Python is a great language.",
      });

      await openLearningItem(studentToken, classId, learningItem.id);

      const res = await request(app)
        .get(`/api/v1/classes/${classId}/stats`)
        .set("Authorization", `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      const breakdown = res.body.data.studentBreakdowns[0];
      expect(breakdown.learningItemsViewed).toBe(1);
    });

    it("does not double-count learningItemsViewed when same item opened multiple times", async () => {
      const learningItem = await createItem(teacherToken, classId, topicId, {
        type: "learning",
        title: "Variables",
        practiceBody: "Variables store data.",
      });

      await openLearningItem(studentToken, classId, learningItem.id);
      await openLearningItem(studentToken, classId, learningItem.id);
      await openLearningItem(studentToken, classId, learningItem.id);

      const res = await request(app)
        .get(`/api/v1/classes/${classId}/stats`)
        .set("Authorization", `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      const breakdown = res.body.data.studentBreakdowns[0];
      expect(breakdown.learningItemsViewed).toBe(1);
    });

    it("returns aiInteractions count after student sends a chat message", async () => {
      // Send a chat message as student with the classId in context
      await sendChatMessage(studentToken, classId);

      const res = await request(app)
        .get(`/api/v1/classes/${classId}/stats`)
        .set("Authorization", `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      const breakdown = res.body.data.studentBreakdowns[0];
      expect(breakdown.aiInteractions).toBeGreaterThanOrEqual(1);
    });

    it("counts multiple AI chat messages correctly", async () => {
      await sendChatMessage(studentToken, classId);
      await sendChatMessage(studentToken, classId);
      await sendChatMessage(studentToken, classId);

      const res = await request(app)
        .get(`/api/v1/classes/${classId}/stats`)
        .set("Authorization", `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      const breakdown = res.body.data.studentBreakdowns[0];
      expect(breakdown.aiInteractions).toBeGreaterThanOrEqual(3);
    });

    it("teacher chat messages are NOT counted in aiInteractions", async () => {
      // Teacher sends a chat message — should not appear in student breakdown
      await sendChatMessage(teacherToken, classId);

      // teacher is not a student, so no AIInteraction should be logged for the student breakdown
      const res = await request(app)
        .get(`/api/v1/classes/${classId}/stats`)
        .set("Authorization", `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      const breakdown = res.body.data.studentBreakdowns[0];
      // student has no interactions
      expect(breakdown.aiInteractions).toBe(0);
    });
  });

  describe("itemBreakdowns — per-item stats (already present, verify fields)", () => {
    it("itemBreakdowns include maxPoints, avgScore, attempted, correct", async () => {
      const teacherToken = await signup("t-item-phase4");
      const studentToken = await signup("s-item-phase4", "student");
      const classroom = await createClass(teacherToken);
      await joinClass(studentToken, classroom.joinCode);
      const topic = await createTopic(teacherToken, classroom.id);

      const item = await createItem(teacherToken, classroom.id, topic.id, {
        type: "quiz",
        title: "Item Stats",
        quizSubtype: "mcq",
        quizQuestion: "Q?",
        quizOptions: ["A", "B"],
        quizAnswer: "A",
        maxPoints: 6,
      });

      await submitAttempt(studentToken, classroom.id, item.id, "A");

      const res = await request(app)
        .get(`/api/v1/classes/${classroom.id}/stats`)
        .set("Authorization", `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      const ib = res.body.data.itemBreakdowns.find((i) => i.id === item.id);
      expect(ib.maxPoints).toBe(6);
      expect(ib.avgScore).toBe(6);
      expect(ib.attempted).toBe(1);
      expect(ib.correct).toBe(1);
      expect(ib.correctRate).toBe(100);
    });
  });

  describe("AI Interaction log — GET /:id/students/:studentId/ai-interactions", () => {
    let teacherToken, studentToken, classId, classroom, studentId;

    beforeEach(async () => {
      teacherToken = await signup("t-ailog");
      studentToken = await signup("s-ailog", "student");
      classroom = await createClass(teacherToken);
      classId = classroom.id;
      await joinClass(studentToken, classroom.joinCode);

      const studentsRes = await request(app)
        .get(`/api/v1/classes/${classId}/students`)
        .set("Authorization", `Bearer ${teacherToken}`);
      studentId = studentsRes.body.data.students.find((s) => s.name === "s-ailog").id;
    });

    it("returns empty array when student has no chat messages", async () => {
      const res = await request(app)
        .get(`/api/v1/classes/${classId}/students/${studentId}/ai-interactions`)
        .set("Authorization", `Bearer ${teacherToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.interactions).toEqual([]);
    });

    it("returns interactions with userMessage after student sends chat", async () => {
      await request(app)
        .post("/api/v1/chat")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({
          messages: [{ role: "user", content: "What is a variable?" }],
          context: { classId },
        });

      const res = await request(app)
        .get(`/api/v1/classes/${classId}/students/${studentId}/ai-interactions`)
        .set("Authorization", `Bearer ${teacherToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.interactions).toHaveLength(1);
      expect(res.body.data.interactions[0].userMessage).toBe("What is a variable?");
    });

    it("returns multiple interactions in newest-first order", async () => {
      await request(app)
        .post("/api/v1/chat")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ messages: [{ role: "user", content: "First message" }], context: { classId } });
      await request(app)
        .post("/api/v1/chat")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ messages: [{ role: "user", content: "Second message" }], context: { classId } });

      const res = await request(app)
        .get(`/api/v1/classes/${classId}/students/${studentId}/ai-interactions`)
        .set("Authorization", `Bearer ${teacherToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.interactions).toHaveLength(2);
      // newest first — second message should be index 0
      expect(res.body.data.interactions[0].userMessage).toBe("Second message");
    });

    it("returns 403 when a student tries to access the endpoint", async () => {
      const res = await request(app)
        .get(`/api/v1/classes/${classId}/students/${studentId}/ai-interactions`)
        .set("Authorization", `Bearer ${studentToken}`);
      expect(res.status).toBe(403);
    });

    it("does not include interactions from a different class", async () => {
      const classroom2 = await createClass(teacherToken, "Other Class");
      await joinClass(studentToken, classroom2.joinCode);

      await request(app)
        .post("/api/v1/chat")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ messages: [{ role: "user", content: "Class 1 message" }], context: { classId } });
      await request(app)
        .post("/api/v1/chat")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ messages: [{ role: "user", content: "Class 2 message" }], context: { classId: classroom2.id } });

      const res = await request(app)
        .get(`/api/v1/classes/${classId}/students/${studentId}/ai-interactions`)
        .set("Authorization", `Bearer ${teacherToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.interactions).toHaveLength(1);
      expect(res.body.data.interactions[0].userMessage).toBe("Class 1 message");
    });
  });

  describe("pendingGrading count matches unreviewed auto-graded attempts", () => {
    it("pendingGrading decreases to 0 after teacher grades all pending attempts", async () => {
      const teacherToken = await signup("t-pending-grade");
      const studentToken = await signup("s-pending-grade", "student");
      const classroom = await createClass(teacherToken);
      await joinClass(studentToken, classroom.joinCode);
      const topic = await createTopic(teacherToken, classroom.id);

      const item = await createItem(teacherToken, classroom.id, topic.id, {
        type: "quiz",
        title: "Pending SA",
        quizSubtype: "short_answer",
        quizQuestion: "What is a variable?",
        maxPoints: 5,
      });

      const attemptRes = await submitAttempt(studentToken, classroom.id, item.id, "A container for data.");
      const attemptId = attemptRes.body.data.attempt.id;

      const studentsRes = await request(app)
        .get(`/api/v1/classes/${classroom.id}/students`)
        .set("Authorization", `Bearer ${teacherToken}`);
      const student = studentsRes.body.data.students.find((s) => s.name === "s-pending-grade");

      // Before grading — should have 1 pending
      const before = await request(app)
        .get(`/api/v1/classes/${classroom.id}/stats`)
        .set("Authorization", `Bearer ${teacherToken}`);
      expect(before.body.data.studentBreakdowns[0].pendingGrading).toBe(1);

      // Grade the attempt
      await request(app)
        .put(`/api/v1/classes/${classroom.id}/students/${student.id}/quiz-attempts/${attemptId}/grade`)
        .set("Authorization", `Bearer ${teacherToken}`)
        .send({ isCorrect: true, score: 4, feedback: "Good." });

      // After grading — should have 0 pending
      const after = await request(app)
        .get(`/api/v1/classes/${classroom.id}/stats`)
        .set("Authorization", `Bearer ${teacherToken}`);
      expect(after.body.data.studentBreakdowns[0].pendingGrading).toBe(0);
    });
  });
});
