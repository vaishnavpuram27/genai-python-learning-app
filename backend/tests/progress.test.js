import request from "supertest";
import app from "../app.js";

async function signup(role = "teacher") {
  const res = await request(app)
    .post("/api/v1/auth/signup")
    .send({ name: `${role}-user`, password: "pass1234", role });
  return res.body.data.token;
}

async function createLesson(token) {
  const res = await request(app)
    .post("/api/v1/lessons")
    .set("Authorization", `Bearer ${token}`)
    .send({
      unit: "Basics",
      heading: "Intro",
      duration: "5 min",
      body: "Learn the basics",
      instructions: "Run the code",
      question: "What is Python?",
      hints: ["It is a language"],
      codeStarter: "print('hi')",
    });
  return res.body.data.lesson.id;
}

describe("Progress API", () => {
  it("lets a student update and fetch progress", async () => {
    const teacherToken = await signup("teacher");
    const studentToken = await signup("student");
    const lessonId = await createLesson(teacherToken);

    const updateRes = await request(app)
      .put(`/api/v1/progress/${lessonId}`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        status: "in_progress",
        lastCode: "print('hi')",
        attempts: 1,
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.progress.lessonId).toBe(lessonId);

    const getRes = await request(app)
      .get(`/api/v1/progress/${lessonId}`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.progress.status).toBe("in_progress");

    const listRes = await request(app)
      .get("/api/v1/progress")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.progress.length).toBe(1);
  });
});
