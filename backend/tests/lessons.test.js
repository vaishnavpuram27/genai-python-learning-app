import request from "supertest";
import app from "../app.js";

async function signup(role = "teacher") {
  const res = await request(app)
    .post("/api/v1/auth/signup")
    .send({ name: `${role}-user`, password: "pass1234", role });
  return res.body.data.token;
}

describe("Lessons API", () => {
  it("allows a teacher to create and fetch lessons", async () => {
    const token = await signup("teacher");

    const createRes = await request(app)
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

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.lesson.id).toBeTruthy();

    const listRes = await request(app)
      .get("/api/v1/lessons")
      .set("Authorization", `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.lessons.length).toBe(1);

    const lessonId = createRes.body.data.lesson.id;
    const getRes = await request(app)
      .get(`/api/v1/lessons/${lessonId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.lesson.heading).toBe("Intro");
  });

  it("prevents students from creating lessons", async () => {
    const token = await signup("student");

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
        hints: [],
        codeStarter: "",
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});
