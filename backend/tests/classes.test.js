import request from "supertest";
import { vi } from "vitest";
import app from "../app.js";

// Mock OpenAI-backed grading so tests never call the real API
vi.mock("../services/chatService.js", () => ({
  gradeShortAnswer: vi.fn().mockResolvedValue({
    isCorrect: true,
    feedback: "Good answer!",
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

async function createClass(token, name = "Test Class") {
  const res = await request(app)
    .post("/api/v1/classes")
    .set("Authorization", `Bearer ${token}`)
    .send({ name });
  return res.body.data.classroom;
}

async function createTopic(token, classId, title = "Test Topic") {
  const res = await request(app)
    .post(`/api/v1/classes/${classId}/topics`)
    .set("Authorization", `Bearer ${token}`)
    .send({ title, concepts: ["variables", "loops"] });
  return res.body.data.topic;
}

async function createItem(token, classId, topicId, overrides = {}) {
  const body = {
    type: "learning",
    title: "Test Item",
    body: "Learn something",
    ...overrides,
  };
  const res = await request(app)
    .post(`/api/v1/classes/${classId}/topics/${topicId}/items`)
    .set("Authorization", `Bearer ${token}`)
    .send(body);
  return res.body.data.item;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Classes API", () => {
  describe("POST /api/v1/classes", () => {
    it("teacher can create a class and receives a join code", async () => {
      const token = await signup("t-create");
      const res = await request(app)
        .post("/api/v1/classes")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Python 101" });

      expect(res.status).toBe(201);
      expect(res.body.data.classroom.name).toBe("Python 101");
      expect(res.body.data.classroom.joinCode).toHaveLength(6);
    });

    it("student cannot create a class", async () => {
      const token = await signup("s-create", "student");
      const res = await request(app)
        .post("/api/v1/classes")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Student Class" });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it("rejects class creation with missing name", async () => {
      const token = await signup("t-noname");
      const res = await request(app)
        .post("/api/v1/classes")
        .set("Authorization", `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/v1/classes", () => {
    it("teacher sees their own classes", async () => {
      const token = await signup("t-list");
      await createClass(token, "Class A");
      await createClass(token, "Class B");

      const res = await request(app)
        .get("/api/v1/classes")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.classes).toHaveLength(2);
    });

    it("student sees no classes before joining", async () => {
      const token = await signup("s-list", "student");
      const res = await request(app)
        .get("/api/v1/classes")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.classes).toHaveLength(0);
    });
  });

  describe("POST /api/v1/classes/join", () => {
    it("student can join a class with valid join code", async () => {
      const teacherToken = await signup("t-join");
      const classroom = await createClass(teacherToken, "Joinable Class");

      const studentToken = await signup("s-join", "student");
      const res = await request(app)
        .post("/api/v1/classes/join")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ joinCode: classroom.joinCode });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it("returns error for invalid join code", async () => {
      const studentToken = await signup("s-badjoin", "student");
      const res = await request(app)
        .post("/api/v1/classes/join")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ joinCode: "XXXXXX" });

      expect(res.status).toBe(404);
    });

    it("student appears in class after joining", async () => {
      const teacherToken = await signup("t-joincheck");
      const classroom = await createClass(teacherToken, "Check Class");

      const studentToken = await signup("s-joincheck", "student");
      await request(app)
        .post("/api/v1/classes/join")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ joinCode: classroom.joinCode });

      const studentsRes = await request(app)
        .get(`/api/v1/classes/${classroom.id}/students`)
        .set("Authorization", `Bearer ${teacherToken}`);

      expect(studentsRes.status).toBe(200);
      expect(studentsRes.body.data.students.some((s) => s.name === "s-joincheck")).toBe(true);
    });
  });

  describe("Topics CRUD", () => {
    it("teacher can create, update, and delete a topic", async () => {
      const token = await signup("t-topic");
      const classroom = await createClass(token);

      // Create
      const createRes = await request(app)
        .post(`/api/v1/classes/${classroom.id}/topics`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Variables", concepts: ["let", "const"] });

      expect(createRes.status).toBe(201);
      const topicId = createRes.body.data.topic.id;

      // Update
      const updateRes = await request(app)
        .put(`/api/v1/classes/${classroom.id}/topics/${topicId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Variables & Types" });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.topic.title).toBe("Variables & Types");

      // Delete
      const deleteRes = await request(app)
        .delete(`/api/v1/classes/${classroom.id}/topics/${topicId}`)
        .set("Authorization", `Bearer ${token}`);

      expect(deleteRes.status).toBe(200);
    });

    it("student cannot create a topic", async () => {
      const teacherToken = await signup("t-topicauth");
      const classroom = await createClass(teacherToken);
      const studentToken = await signup("s-topicauth", "student");

      const res = await request(app)
        .post(`/api/v1/classes/${classroom.id}/topics`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ title: "Sneaky Topic" });

      expect(res.status).toBe(403);
    });
  });

  describe("Topic Items CRUD", () => {
    let teacherToken, classId, topicId;

    beforeEach(async () => {
      teacherToken = await signup("t-items");
      const classroom = await createClass(teacherToken);
      classId = classroom.id;
      const topic = await createTopic(teacherToken, classId);
      topicId = topic.id;
    });

    it("teacher can create a learning item", async () => {
      const res = await request(app)
        .post(`/api/v1/classes/${classId}/topics/${topicId}/items`)
        .set("Authorization", `Bearer ${teacherToken}`)
        .send({ type: "learning", title: "Intro to Python", body: "Python is..." });

      expect(res.status).toBe(201);
      expect(res.body.data.item.type).toBe("learning");
      expect(res.body.data.item.title).toBe("Intro to Python");
    });

    it("teacher can create an MCQ quiz item", async () => {
      const res = await request(app)
        .post(`/api/v1/classes/${classId}/topics/${topicId}/items`)
        .set("Authorization", `Bearer ${teacherToken}`)
        .send({
          type: "quiz",
          title: "Python Quiz",
          quizSubtype: "mcq",
          quizQuestion: "What does print() do?",
          quizOptions: ["Prints to console", "Reads input", "Loops", "Nothing"],
          quizAnswer: "Prints to console",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.item.quizSubtype).toBe("mcq");
    });

    it("teacher can create a short-answer quiz item", async () => {
      const res = await request(app)
        .post(`/api/v1/classes/${classId}/topics/${topicId}/items`)
        .set("Authorization", `Bearer ${teacherToken}`)
        .send({
          type: "quiz",
          title: "SA Quiz",
          quizSubtype: "short_answer",
          quizQuestion: "Explain a variable.",
          quizAnswer: "A variable stores a value.",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.item.quizSubtype).toBe("short_answer");
    });

    it("teacher can create a practice item", async () => {
      const res = await request(app)
        .post(`/api/v1/classes/${classId}/topics/${topicId}/items`)
        .set("Authorization", `Bearer ${teacherToken}`)
        .send({
          type: "practice",
          title: "Hello World Practice",
          practiceQuestion: "Print Hello World",
          practiceInstructions: "Use print()",
          practiceCodeStarter: "# your code here",
          practiceModelAnswer: "print('Hello World')",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.item.type).toBe("practice");
    });

    it("teacher can update a topic item", async () => {
      const item = await createItem(teacherToken, classId, topicId);

      const res = await request(app)
        .put(`/api/v1/classes/${classId}/topics/${topicId}/items/${item.id}`)
        .set("Authorization", `Bearer ${teacherToken}`)
        .send({ title: "Updated Title" });

      expect(res.status).toBe(200);
      expect(res.body.data.item.title).toBe("Updated Title");
    });

    it("teacher can delete a topic item", async () => {
      const item = await createItem(teacherToken, classId, topicId);

      const res = await request(app)
        .delete(`/api/v1/classes/${classId}/topics/${topicId}/items/${item.id}`)
        .set("Authorization", `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
    });

    it("student cannot create a topic item", async () => {
      const studentToken = await signup("s-item-auth", "student");

      const res = await request(app)
        .post(`/api/v1/classes/${classId}/topics/${topicId}/items`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ type: "learning", title: "Sneaky Item", body: "..." });

      expect(res.status).toBe(403);
    });
  });

  describe("Fetching Content Items", () => {
    let teacherToken, studentToken, classId, topicId;

    beforeEach(async () => {
      teacherToken = await signup("t-content");
      studentToken = await signup("s-content", "student");
      const classroom = await createClass(teacherToken);
      classId = classroom.id;

      // Student joins the class
      await request(app)
        .post("/api/v1/classes/join")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ joinCode: classroom.joinCode });

      const topic = await createTopic(teacherToken, classId);
      topicId = topic.id;
    });

    it("student can fetch a learning item", async () => {
      const item = await createItem(teacherToken, classId, topicId, {
        type: "learning",
        title: "Learn Variables",
        body: "Variables store data.",
      });

      const res = await request(app)
        .get(`/api/v1/classes/${classId}/learn/${item.id}`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.item.title).toBe("Learn Variables");
    });

    it("student can fetch a quiz item", async () => {
      const item = await createItem(teacherToken, classId, topicId, {
        type: "quiz",
        title: "Quiz 1",
        quizSubtype: "mcq",
        quizQuestion: "What is 2+2?",
        quizOptions: ["3", "4", "5", "6"],
        quizAnswer: "4",
      });

      const res = await request(app)
        .get(`/api/v1/classes/${classId}/quiz/${item.id}`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.item.title).toBe("Quiz 1");
    });

    it("student can fetch a practice item", async () => {
      const item = await createItem(teacherToken, classId, topicId, {
        type: "practice",
        title: "Practice 1",
        practiceQuestion: "Write a loop",
        practiceInstructions: "Use for loop",
        practiceCodeStarter: "for i in range(5):",
        practiceModelAnswer: "for i in range(5): print(i)",
      });

      const res = await request(app)
        .get(`/api/v1/classes/${classId}/practice/${item.id}`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.item.title).toBe("Practice 1");
    });
  });

  describe("Quiz Attempts", () => {
    let teacherToken, studentToken, classId, topicId, mcqItemId;

    beforeEach(async () => {
      teacherToken = await signup("t-quiz");
      studentToken = await signup("s-quiz", "student");
      const classroom = await createClass(teacherToken);
      classId = classroom.id;

      await request(app)
        .post("/api/v1/classes/join")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ joinCode: classroom.joinCode });

      const topic = await createTopic(teacherToken, classId);
      topicId = topic.id;

      const item = await createItem(teacherToken, classId, topicId, {
        type: "quiz",
        title: "MCQ Quiz",
        quizSubtype: "mcq",
        quizQuestion: "What is 2+2?",
        quizOptions: ["3", "4", "5", "6"],
        quizAnswer: "4",
      });
      mcqItemId = item.id;
    });

    it("student can submit a correct MCQ answer and it is auto-graded", async () => {
      const res = await request(app)
        .put(`/api/v1/classes/${classId}/quiz/${mcqItemId}/attempt`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ responseText: "4" });

      expect(res.status).toBe(200);
      expect(res.body.data.attempt.isCorrect).toBe(true);
    });

    it("student gets isCorrect=false for a wrong MCQ answer", async () => {
      const res = await request(app)
        .put(`/api/v1/classes/${classId}/quiz/${mcqItemId}/attempt`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ responseText: "3" });

      expect(res.status).toBe(200);
      expect(res.body.data.attempt.isCorrect).toBe(false);
    });

    it("teacher can grade a quiz attempt", async () => {
      // Student submits
      const attemptRes = await request(app)
        .put(`/api/v1/classes/${classId}/quiz/${mcqItemId}/attempt`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ responseText: "4" });

      const attemptId = attemptRes.body.data.attempt.id;

      // Get student id from the attempt
      const studentsRes = await request(app)
        .get(`/api/v1/classes/${classId}/students`)
        .set("Authorization", `Bearer ${teacherToken}`);
      const studentId = studentsRes.body.data.students.find((s) => s.name === "s-quiz")?.id;

      // Teacher grades
      const gradeRes = await request(app)
        .put(`/api/v1/classes/${classId}/students/${studentId}/quiz-attempts/${attemptId}/grade`)
        .set("Authorization", `Bearer ${teacherToken}`)
        .send({ isCorrect: true, score: 10, feedback: "Well done!" });

      expect(gradeRes.status).toBe(200);
      expect(gradeRes.body.data.attempt.gradingStatus).toBe("manual_graded");
    });
  });

  describe("Class Stats", () => {
    it("teacher can fetch class stats", async () => {
      const token = await signup("t-stats");
      const classroom = await createClass(token);

      const res = await request(app)
        .get(`/api/v1/classes/${classroom.id}/stats`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it("student cannot fetch class stats", async () => {
      const teacherToken = await signup("t-statsauth");
      const classroom = await createClass(teacherToken);
      const studentToken = await signup("s-statsauth", "student");

      await request(app)
        .post("/api/v1/classes/join")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ joinCode: classroom.joinCode });

      const res = await request(app)
        .get(`/api/v1/classes/${classroom.id}/stats`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe("Student Progress (my-progress)", () => {
    it("student can fetch their own class progress", async () => {
      const teacherToken = await signup("t-progress");
      const classroom = await createClass(teacherToken);
      const studentToken = await signup("s-progress", "student");

      await request(app)
        .post("/api/v1/classes/join")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ joinCode: classroom.joinCode });

      const res = await request(app)
        .get(`/api/v1/classes/${classroom.id}/my-progress`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("teacher cannot use the student my-progress endpoint", async () => {
      const token = await signup("t-myprog");
      const classroom = await createClass(token);

      const res = await request(app)
        .get(`/api/v1/classes/${classroom.id}/my-progress`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  describe("Class Deletion", () => {
    it("teacher can delete their own class", async () => {
      const token = await signup("t-delete");
      const classroom = await createClass(token);

      const res = await request(app)
        .delete(`/api/v1/classes/${classroom.id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it("a different teacher cannot delete another teacher's class", async () => {
      const owner = await signup("t-owner");
      const other = await signup("t-other");
      const classroom = await createClass(owner);

      const res = await request(app)
        .delete(`/api/v1/classes/${classroom.id}`)
        .set("Authorization", `Bearer ${other}`);

      expect(res.status).toBe(403);
    });
  });
});
