export const API_BASE = (import.meta.env.VITE_API_BASE || "/api/v1").replace(/\/$/, "");
export const AUTH_TOKEN_KEY = "authToken";

export function authHeaders() {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function isMongoObjectId(value) {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
}

export function createLessonId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `lesson-${Date.now()}`;
}

export function mapLessonFromApi(lesson) {
  if (!lesson) return null;
  const id = lesson.id || lesson._id;
  return { ...lesson, id: id ? id.toString() : createLessonId() };
}

export function mapClassFromApi(classroom) {
  if (!classroom) return null;
  const id = classroom.id || classroom._id;
  return { ...classroom, id: id ? id.toString() : "" };
}

export function parseRoute() {
  const path = window.location.pathname || "/";
  const ID = "[a-f\\d]{24}";

  let m;
  // /classes/:classId/quiz/:itemId
  if ((m = path.match(new RegExp(`^/classes/(${ID})/quiz/(${ID})$`, "i"))))
    return { page: "quiz", classId: m[1], itemId: m[2], lessonId: null, studentId: null };

  // /classes/:classId/practice/:itemId
  if ((m = path.match(new RegExp(`^/classes/(${ID})/practice/(${ID})$`, "i"))))
    return { page: "practice", classId: m[1], itemId: m[2], lessonId: null, studentId: null };

  // /classes/:classId/learn/:itemId
  if ((m = path.match(new RegExp(`^/classes/(${ID})/learn/(${ID})$`, "i"))))
    return { page: "learn", classId: m[1], itemId: m[2], lessonId: null, studentId: null };

  // /classes/:classId/lessons/:lessonId
  if ((m = path.match(new RegExp(`^/classes/(${ID})/lessons/(${ID})$`, "i"))))
    return { page: "lesson", classId: m[1], lessonId: m[2], studentId: null };

  // /classes/:classId/students/:studentId/stats
  if ((m = path.match(new RegExp(`^/classes/(${ID})/students/(${ID})/stats$`, "i"))))
    return { page: "student-stats", classId: m[1], studentId: m[2], lessonId: null, itemId: null };

  // /classes/:classId/students/:studentId/ai-log
  if ((m = path.match(new RegExp(`^/classes/(${ID})/students/(${ID})/ai-log$`, "i"))))
    return { page: "ai-log", classId: m[1], studentId: m[2], lessonId: null, itemId: null };

  // /classes/:classId/students/:studentId/response
  if ((m = path.match(new RegExp(`^/classes/(${ID})/students/(${ID})/response$`, "i"))))
    return { page: "item-response", classId: m[1], studentId: m[2], lessonId: null, itemId: null };

  // /classes/:classId/students/:studentId
  if ((m = path.match(new RegExp(`^/classes/(${ID})/students/(${ID})$`, "i"))))
    return { page: "student", classId: m[1], studentId: m[2], lessonId: null };

  // /classes/:classId/my-dashboard
  if ((m = path.match(new RegExp(`^/classes/(${ID})/my-dashboard$`, "i"))))
    return { page: "dashboard", classId: m[1], lessonId: null, itemId: null, studentId: null };

  // /classes/:classId
  if ((m = path.match(new RegExp(`^/classes/(${ID})$`, "i"))))
    return { page: "class", classId: m[1], lessonId: null, studentId: null };

  // /hub/:templateId/preview
  if ((m = path.match(new RegExp(`^/hub/(${ID})/preview$`, "i"))))
    return { page: "hub-preview", templateId: m[1], classId: null, lessonId: null, itemId: null, studentId: null };

  if (path === "/hub")
    return { page: "hub", classId: null, lessonId: null, itemId: null, studentId: null };

  return { page: "classes", classId: null, lessonId: null, studentId: null };
}
