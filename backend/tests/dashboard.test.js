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

async function createClass(token, name = "Dashboard Class") {
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

// ─── Phase 3: Student Dashboard Tests ────────────────────────────────────────

describe("Phase 3 — Student Dashboard", () => {
  describe("GET /classes/:id/my-dashboard — access control", () => {
    it("returns 403 if teacher accesses dashboard", async () => {
      const teacherToken = await signup("t-dash-access");
      const classroom = await createClass(teacherToken);

      const res = await request(app)
        .get(`/api/v1/classes/${classroom.id}/my-dashboard`)
        .set("Authorization", `Bearer ${teacherToken}`);

      expect(res.status).toBe(403);
    });

    it("returns 403 if non-member student accesses dashboard", async () => {
      const teacherToken = await signup("t-dash-nomem");
      const studentToken = await signup("s-dash-nomem", "student");
      const classroom = await createClass(teacherToken);

      const res = await request(app)
        .get(`/api/v1/classes/${classroom.id}/my-dashboard`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it("returns 200 with empty arrays for enrolled student with no activity", async () => {
      const teacherToken = await signup("t-dash-empty");
      const studentToken = await signup("s-dash-empty", "student");
      const classroom = await createClass(teacherToken);
      await joinClass(studentToken, classroom.joinCode);

      const res = await request(app)
        .get(`/api/v1/classes/${classroom.id}/my-dashboard`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.recentScores).toEqual([]);
      expect(res.body.data.upcomingDeadlines).toEqual([]);
      expect(res.body.data.updates).toEqual([]);
    });
  });

  describe("recentScores", () => {
    it("includes graded attempts with item title, score, and maxPoints", async () => {
      const teacherToken = await signup("t-dash-scores");
      const studentToken = await signup("s-dash-scores", "student");
      const classroom = await createClass(teacherToken);
      await joinClass(studentToken, classroom.joinCode);
      const topic = await createTopic(teacherToken, classroom.id);

      const item = await createItem(teacherToken, classroom.id, topic.id, {
        type: "quiz",
        title: "Score Quiz",
        quizSubtype: "mcq",
        quizQuestion: "2+2?",
        quizOptions: ["3", "4"],
        quizAnswer: "4",
        maxPoints: 10,
      });

      await submitAttempt(studentToken, classroom.id, item.id, "4");

      const res = await request(app)
        .get(`/api/v1/classes/${classroom.id}/my-dashboard`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      const scores = res.body.data.recentScores;
      expect(scores).toHaveLength(1);
      expect(scores[0].title).toBe("Score Quiz");
      expect(scores[0].score).toBe(10);
      expect(scores[0].maxPoints).toBe(10);
      expect(scores[0].isCorrect).toBe(true);
    });

    it("does not include pending (ungraded) attempts in recentScores", async () => {
      const teacherToken = await signup("t-dash-pending");
      const studentToken = await signup("s-dash-pending", "student");
      const classroom = await createClass(teacherToken);
      await joinClass(studentToken, classroom.joinCode);
      const topic = await createTopic(teacherToken, classroom.id);

      // short_answer with no expected answer → stays pending
      const item = await createItem(teacherToken, classroom.id, topic.id, {
        type: "quiz",
        title: "Pending SA",
        quizSubtype: "short_answer",
        quizQuestion: "Explain variables.",
        // no quizAnswer → won't auto-grade
      });

      await submitAttempt(studentToken, classroom.id, item.id, "Some answer");

      const res = await request(app)
        .get(`/api/v1/classes/${classroom.id}/my-dashboard`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.recentScores).toHaveLength(0);
    });

    it("returns at most 10 recent scores", async () => {
      const teacherToken = await signup("t-dash-limit");
      const studentToken = await signup("s-dash-limit", "student");
      const classroom = await createClass(teacherToken);
      await joinClass(studentToken, classroom.joinCode);
      const topic = await createTopic(teacherToken, classroom.id);

      // Create 12 MCQ items and submit all
      for (let i = 0; i < 12; i++) {
        const item = await createItem(teacherToken, classroom.id, topic.id, {
          type: "quiz",
          title: `Quiz ${i}`,
          quizSubtype: "mcq",
          quizQuestion: "Q?",
          quizOptions: ["A", "B"],
          quizAnswer: "A",
        });
        await submitAttempt(studentToken, classroom.id, item.id, "A");
      }

      const res = await request(app)
        .get(`/api/v1/classes/${classroom.id}/my-dashboard`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.recentScores.length).toBeLessThanOrEqual(10);
    });
  });

  describe("upcomingDeadlines", () => {
    it("returns items with future deadlines sorted by deadline ASC", async () => {
      const teacherToken = await signup("t-dash-deadlines");
      const studentToken = await signup("s-dash-deadlines", "student");
      const classroom = await createClass(teacherToken);
      await joinClass(studentToken, classroom.joinCode);
      const topic = await createTopic(teacherToken, classroom.id);

      const future1 = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days
      const future2 = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days

      await createItem(teacherToken, classroom.id, topic.id, {
        type: "quiz",
        title: "Far Quiz",
        quizSubtype: "mcq",
        quizQuestion: "Q?",
        quizOptions: ["A", "B"],
        quizAnswer: "A",
        deadline: future2,
      });

      await createItem(teacherToken, classroom.id, topic.id, {
        type: "quiz",
        title: "Near Quiz",
        quizSubtype: "mcq",
        quizQuestion: "Q?",
        quizOptions: ["A", "B"],
        quizAnswer: "A",
        deadline: future1,
      });

      const res = await request(app)
        .get(`/api/v1/classes/${classroom.id}/my-dashboard`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      const deadlines = res.body.data.upcomingDeadlines;
      expect(deadlines).toHaveLength(2);
      // sorted ASC: Near Quiz (2 days) first, Far Quiz (5 days) second
      expect(deadlines[0].title).toBe("Near Quiz");
      expect(deadlines[1].title).toBe("Far Quiz");
    });

    it("includes daysLeft on each deadline item", async () => {
      const teacherToken = await signup("t-dash-daysleft");
      const studentToken = await signup("s-dash-daysleft", "student");
      const classroom = await createClass(teacherToken);
      await joinClass(studentToken, classroom.joinCode);
      const topic = await createTopic(teacherToken, classroom.id);

      const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

      await createItem(teacherToken, classroom.id, topic.id, {
        type: "quiz",
        title: "3-Day Quiz",
        quizSubtype: "mcq",
        quizQuestion: "Q?",
        quizOptions: ["A", "B"],
        quizAnswer: "A",
        deadline: future,
      });

      const res = await request(app)
        .get(`/api/v1/classes/${classroom.id}/my-dashboard`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      const deadline = res.body.data.upcomingDeadlines[0];
      expect(deadline.daysLeft).toBeGreaterThanOrEqual(2);
      expect(deadline.daysLeft).toBeLessThanOrEqual(4);
    });

    it("does not include past deadlines", async () => {
      const teacherToken = await signup("t-dash-past");
      const studentToken = await signup("s-dash-past", "student");
      const classroom = await createClass(teacherToken);
      await joinClass(studentToken, classroom.joinCode);
      const topic = await createTopic(teacherToken, classroom.id);

      const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

      await createItem(teacherToken, classroom.id, topic.id, {
        type: "quiz",
        title: "Past Quiz",
        quizSubtype: "mcq",
        quizQuestion: "Q?",
        quizOptions: ["A", "B"],
        quizAnswer: "A",
        deadline: past,
      });

      const res = await request(app)
        .get(`/api/v1/classes/${classroom.id}/my-dashboard`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.upcomingDeadlines).toHaveLength(0);
    });

    it("does not include unpublished items in deadlines", async () => {
      const teacherToken = await signup("t-dash-unpub-dl");
      const studentToken = await signup("s-dash-unpub-dl", "student");
      const classroom = await createClass(teacherToken);
      await joinClass(studentToken, classroom.joinCode);
      const topic = await createTopic(teacherToken, classroom.id);

      const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

      await createItem(teacherToken, classroom.id, topic.id, {
        type: "quiz",
        title: "Hidden Deadline Quiz",
        quizSubtype: "mcq",
        quizQuestion: "Q?",
        quizOptions: ["A", "B"],
        quizAnswer: "A",
        deadline: future,
        isPublished: false,
      });

      const res = await request(app)
        .get(`/api/v1/classes/${classroom.id}/my-dashboard`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.upcomingDeadlines).toHaveLength(0);
    });
  });

  describe("updates feed", () => {
    it("includes items created in the last 7 days", async () => {
      const teacherToken = await signup("t-dash-updates");
      const studentToken = await signup("s-dash-updates", "student");
      const classroom = await createClass(teacherToken);
      await joinClass(studentToken, classroom.joinCode);
      const topic = await createTopic(teacherToken, classroom.id);

      await createItem(teacherToken, classroom.id, topic.id, {
        type: "learning",
        title: "New Lesson",
        practiceBody: "Content here",
      });

      const res = await request(app)
        .get(`/api/v1/classes/${classroom.id}/my-dashboard`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      const updates = res.body.data.updates;
      expect(updates.length).toBeGreaterThanOrEqual(1);
      const newLesson = updates.find((u) => u.title === "New Lesson");
      expect(newLesson).toBeDefined();
      expect(newLesson.type).toBe("learning");
    });

    it("does not include unpublished items in updates", async () => {
      const teacherToken = await signup("t-dash-unpub-upd");
      const studentToken = await signup("s-dash-unpub-upd", "student");
      const classroom = await createClass(teacherToken);
      await joinClass(studentToken, classroom.joinCode);
      const topic = await createTopic(teacherToken, classroom.id);

      await createItem(teacherToken, classroom.id, topic.id, {
        type: "learning",
        title: "Draft Lesson",
        practiceBody: "Draft content",
        isPublished: false,
      });

      const res = await request(app)
        .get(`/api/v1/classes/${classroom.id}/my-dashboard`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      const updates = res.body.data.updates;
      const draftItem = updates.find((u) => u.title === "Draft Lesson");
      expect(draftItem).toBeUndefined();
    });
  });

  describe("isPublished filtering in topics list", () => {
    it("student cannot see unpublished items in topics list", async () => {
      const teacherToken = await signup("t-unpub-topics");
      const studentToken = await signup("s-unpub-topics", "student");
      const classroom = await createClass(teacherToken);
      await joinClass(studentToken, classroom.joinCode);
      const topic = await createTopic(teacherToken, classroom.id);

      await createItem(teacherToken, classroom.id, topic.id, {
        type: "learning",
        title: "Published Lesson",
        practiceBody: "Visible content",
        isPublished: true,
      });

      await createItem(teacherToken, classroom.id, topic.id, {
        type: "learning",
        title: "Draft Lesson",
        practiceBody: "Hidden content",
        isPublished: false,
      });

      const res = await request(app)
        .get(`/api/v1/classes/${classroom.id}/topics`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      const items = res.body.data.topics[0].items;
      expect(items.some((i) => i.title === "Published Lesson")).toBe(true);
      expect(items.some((i) => i.title === "Draft Lesson")).toBe(false);
    });

    it("teacher can see unpublished items in topics list", async () => {
      const teacherToken = await signup("t-unpub-teacher");
      const classroom = await createClass(teacherToken);
      const topic = await createTopic(teacherToken, classroom.id);

      await createItem(teacherToken, classroom.id, topic.id, {
        type: "learning",
        title: "Hidden Item",
        practiceBody: "Draft",
        isPublished: false,
      });

      const res = await request(app)
        .get(`/api/v1/classes/${classroom.id}/topics`)
        .set("Authorization", `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      const items = res.body.data.topics[0].items;
      expect(items.some((i) => i.title === "Hidden Item")).toBe(true);
    });
  });
});
