import request from "supertest";
import app from "../app.js";

describe("Auth API", () => {
  describe("POST /api/v1/auth/signup", () => {
    it("creates a teacher and returns a JWT token", async () => {
      const res = await request(app)
        .post("/api/v1/auth/signup")
        .send({ name: "teacher1", password: "pass1234", role: "teacher" });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeTruthy();
      expect(res.body.data.user.role).toBe("teacher");
      expect(res.body.data.user.name).toBe("teacher1");
    });

    it("creates a student and returns a JWT token", async () => {
      const res = await request(app)
        .post("/api/v1/auth/signup")
        .send({ name: "student1", password: "pass1234", role: "student" });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeTruthy();
      expect(res.body.data.user.role).toBe("student");
    });

    it("rejects duplicate username", async () => {
      await request(app)
        .post("/api/v1/auth/signup")
        .send({ name: "dup-user", password: "pass1234", role: "student" });

      const res = await request(app)
        .post("/api/v1/auth/signup")
        .send({ name: "dup-user", password: "pass5678", role: "student" });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it("rejects invalid role", async () => {
      const res = await request(app)
        .post("/api/v1/auth/signup")
        .send({ name: "baduser", password: "pass1234", role: "admin" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("rejects missing name", async () => {
      const res = await request(app)
        .post("/api/v1/auth/signup")
        .send({ password: "pass1234", role: "student" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("rejects missing password", async () => {
      const res = await request(app)
        .post("/api/v1/auth/signup")
        .send({ name: "no-pass", role: "student" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe("POST /api/v1/auth/login", () => {
    beforeEach(async () => {
      await request(app)
        .post("/api/v1/auth/signup")
        .send({ name: "login-user", password: "pass1234", role: "teacher" });
    });

    it("returns a token on valid credentials", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ name: "login-user", password: "pass1234" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeTruthy();
    });

    it("returns 401 for wrong password", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ name: "login-user", password: "wrongpass" });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("returns 401 for unknown user", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ name: "nobody", password: "pass1234" });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe("GET /api/v1/auth/me", () => {
    it("returns user info with a valid token", async () => {
      const signupRes = await request(app)
        .post("/api/v1/auth/signup")
        .send({ name: "me-user", password: "pass1234", role: "teacher" });

      const token = signupRes.body.data.token;

      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.user.name).toBe("me-user");
      expect(res.body.data.user.role).toBe("teacher");
    });

    it("returns 401 without a token", async () => {
      const res = await request(app).get("/api/v1/auth/me");
      expect(res.status).toBe(401);
    });

    it("returns 401 with a malformed token", async () => {
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", "Bearer not-a-real-token");

      expect(res.status).toBe(401);
    });
  });
});
