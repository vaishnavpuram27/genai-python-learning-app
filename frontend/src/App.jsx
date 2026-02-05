import { useEffect, useMemo, useRef, useState } from "react";

const initialLesson = {
  unit: "Hello World",
  heading: "Comments",
  duration: "3 min",
  body:
    "Comments help you explain what your code does. Python ignores anything after a # on a line.",
  instructions:
    "Write a comment describing the first program you want to build.",
  question: "Explain in one sentence what your first Python project will do.",
  hints: [
    "Keep it short and clear.",
    "Mention the goal of your program.",
    "Use a # to start your comment.",
  ],
  codeStarter: "",
};

const API_BASE = (import.meta.env.VITE_API_BASE || "/api/v1").replace(/\/$/, "");
const AUTH_TOKEN_KEY = "authToken";

function createLessonId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `lesson-${Date.now()}`;
}

function mapLessonFromApi(lesson) {
  if (!lesson) return null;
  const id = lesson.id || lesson._id;
  return { ...lesson, id: id ? id.toString() : createLessonId() };
}

function authHeaders() {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function isMongoObjectId(value) {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginConfirmPassword, setLoginConfirmPassword] = useState("");
  const [loginRole, setLoginRole] = useState("student");
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [viewRole, setViewRole] = useState("student");

  const [lessons, setLessons] = useState([]);
  const [activeLessonId, setActiveLessonId] = useState(null);
  const [teacherPage, setTeacherPage] = useState("workspace");
  const [studentPage, setStudentPage] = useState("dashboard");
  const [toast, setToast] = useState(null);
  const [progress, setProgress] = useState(null);


  const editorRef = useRef(null);
  const activeLessonIdRef = useRef(activeLessonId);
  const fallbackLessonRef = useRef({ id: createLessonId(), ...initialLesson });

  const lesson = useMemo(() => {
    return (
      lessons.find((item) => item.id === activeLessonId) || lessons[0] || fallbackLessonRef.current
    );
  }, [lessons, activeLessonId]);

  const [lessonJson, setLessonJson] = useState(
    JSON.stringify(lesson, null, 2)
  );

  const codeStarterRef = useRef(lesson.codeStarter);


  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function fetchLessons() {
      try {
        const res = await fetch(`${API_BASE}/lessons`, {
          headers: { ...authHeaders() },
        });
        if (!res.ok) return;
        const data = await res.json();
        const apiLessons = data?.data?.lessons;
        if (!apiLessons?.length || cancelled) return;
        const mapped = apiLessons.map(mapLessonFromApi);
        setLessons(mapped);
        setActiveLessonId(mapped[0].id);
      } catch {
        // Fall back to localStorage when the API or DB is not ready yet.
      }
    }

    fetchLessons();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    setLessonJson(JSON.stringify(lesson, null, 2));
  }, [lesson]);

  useEffect(() => {
    activeLessonIdRef.current = activeLessonId;
  }, [activeLessonId]);

  useEffect(() => {
    if (!user || !activeLessonId || !isMongoObjectId(activeLessonId)) {
      setProgress(null);
      return;
    }

    let cancelled = false;

    async function fetchProgress() {
      try {
        const res = await fetch(`${API_BASE}/progress/${activeLessonId}`, {
          headers: { ...authHeaders() },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const apiProgress = data?.data?.progress || null;
        setProgress(apiProgress);

        if (apiProgress?.lastCode && editorRef.current?.setValue) {
          editorRef.current.setValue(apiProgress.lastCode);
          codeStarterRef.current = apiProgress.lastCode;
        }
      } catch {
        // Ignore progress fetch failures.
      }
    }

    fetchProgress();
    return () => {
      cancelled = true;
    };
  }, [user, activeLessonId]);

  useEffect(() => {
    if (!user) return;
    if (user.role === "teacher") {
      setTeacherPage("dashboard");
      setViewRole("teacher");
      setStudentPage("dashboard");
    } else {
      setTeacherPage("workspace");
      setViewRole("student");
      setStudentPage("dashboard");
    }
  }, [user]);

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;
    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const apiUser = data?.data?.user;
        if (apiUser) {
          setUser(apiUser);
          setViewRole(apiUser.role);
        } else {
          localStorage.removeItem(AUTH_TOKEN_KEY);
        }
      })
      .catch(() => {
        localStorage.removeItem(AUTH_TOKEN_KEY);
      });
  }, []);

  useEffect(() => {
    if (!user) return;
    const isTeacher = user.role === "teacher";
    if (isTeacher && teacherPage !== "workspace") return;
    if (!isTeacher && studentPage !== "workspace") return;
    let editor;
    let currentTheme = "vs-dark";
    let fallbackTimer;
    let fallbackTextarea;

    const outputEl = document.getElementById("output");
    const runBtn = document.getElementById("run-btn");
    const themeBtn = document.getElementById("theme-toggle");
    const editorHost = document.getElementById("editor");

    if (!outputEl || !runBtn || !themeBtn || !editorHost) return;

    function outf(text) {
      outputEl.textContent += text;
    }

    function builtinRead(x) {
      if (
        window.Sk?.builtinFiles === undefined ||
        window.Sk?.builtinFiles?.files?.[x] === undefined
      ) {
        throw new Error(`File not found: '${x}'`);
      }
      return window.Sk.builtinFiles.files[x];
    }

    function runCode() {
      if (!editor) {
        outputEl.textContent = "Editor is still loading. Try again in a moment.";
        return;
      }
      if (!window.Sk) {
        outputEl.textContent = "Skulpt failed to load. Check the browser console.";
        return;
      }
      outputEl.textContent = "";
      const code =
        typeof editor.getValue === "function"
          ? editor.getValue()
          : editor.getModel?.()?.getValue?.() ?? "";
      if (!code) {
        outputEl.textContent = "Editor has no code loaded yet.";
        return;
      }
      persistProgress(code);
      if (window.Sk?.builtin?.dict) {
        window.Sk.sysmodules = new window.Sk.builtin.dict([]);
      }
      window.Sk.globals = {};
      window.Sk.configure({ output: outf, read: builtinRead });
      window.Sk.misceval
        .asyncToPromise(() =>
          window.Sk.importMainWithBody("<stdin>", false, code, true)
        )
        .then(() => {
          if (!outputEl.textContent.trim()) {
            outputEl.textContent = "(no output)";
          }
        })
        .catch((err) => {
          outputEl.textContent += `\nError: ${err.toString()}`;
        });
    }

    runBtn.addEventListener("click", runCode);

    function attachFallbackEditor() {
      if (editor || fallbackTextarea) return;
      fallbackTextarea = document.createElement("textarea");
      fallbackTextarea.className = "editor-fallback";
      fallbackTextarea.spellcheck = false;
      fallbackTextarea.value = codeStarterRef.current;
      editorHost.appendChild(fallbackTextarea);
      editor = {
        getValue: () => fallbackTextarea.value,
        dispose: () => {},
      };
      editorRef.current = editor;
    }

    function initMonaco(retries = 0) {
      if (!window.require) {
        if (retries < 20) {
          setTimeout(() => initMonaco(retries + 1), 150);
        } else {
          attachFallbackEditor();
        }
        return;
      }

      window.require.config({
        paths: {
          vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.0/min/vs",
        },
      });

      window.require(["vs/editor/editor.main"], () => {
        if (fallbackTextarea) {
          fallbackTextarea.remove();
          fallbackTextarea = null;
        }
        if (!window.monaco) {
          attachFallbackEditor();
          return;
        }
        editorHost.innerHTML = "";
        editor = window.monaco.editor.create(editorHost, {
          value: codeStarterRef.current,
          language: "python",
          theme: "vs-dark",
          automaticLayout: true,
          minimap: { enabled: false },
          fontSize: 14,
          roundedSelection: true,
          scrollBeyondLastLine: false,
          wordWrap: "on",
          lineNumbers: "on",
          glyphMargin: true,
          quickSuggestions: { other: true, comments: false, strings: true },
          suggestOnTriggerCharacters: true,
          readOnly: false,
        });
        editorRef.current = editor;
        editor.focus();

        if (
          !window.monaco.languages
            .getLanguages()
            .some((lang) => lang.id === "python")
        ) {
          window.monaco.languages.register({ id: "python" });
        }

        editor.addCommand(
          window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.Enter,
          runCode
        );

        const keywords = [
          {
            label: "print",
            kind: window.monaco.languages.CompletionItemKind.Function,
            insertText: "print(${1:object})",
            insertTextRules:
              window.monaco.languages.CompletionItemInsertTextRule
                .InsertAsSnippet,
            documentation: "Print object to standard output.",
          },
          {
            label: "for",
            kind: window.monaco.languages.CompletionItemKind.Keyword,
            insertText: "for ${1:i} in ${2:range(10)}:\n\t$0",
            insertTextRules:
              window.monaco.languages.CompletionItemInsertTextRule
                .InsertAsSnippet,
            documentation: "For loop.",
          },
          {
            label: "if",
            kind: window.monaco.languages.CompletionItemKind.Keyword,
            insertText: "if ${1:condition}:\n\t$0",
            insertTextRules:
              window.monaco.languages.CompletionItemInsertTextRule
                .InsertAsSnippet,
            documentation: "If statement.",
          },
          {
            label: "def",
            kind: window.monaco.languages.CompletionItemKind.Keyword,
            insertText: "def ${1:func_name}(${2:args}):\n\t$0",
            insertTextRules:
              window.monaco.languages.CompletionItemInsertTextRule
                .InsertAsSnippet,
            documentation: "Define a function.",
          },
          {
            label: "class",
            kind: window.monaco.languages.CompletionItemKind.Class,
            insertText:
              "class ${1:ClassName}:\n\tdef __init__(self, ${2:args}):\n\t\t$0",
            insertTextRules:
              window.monaco.languages.CompletionItemInsertTextRule
                .InsertAsSnippet,
            documentation: "Define a class.",
          },
        ];

        window.monaco.languages.registerCompletionItemProvider("python", {
          provideCompletionItems() {
            return { suggestions: keywords };
          },
        });
      });
    }

    initMonaco();
    fallbackTimer = setTimeout(attachFallbackEditor, 2000);

    function toggleTheme() {
      if (currentTheme === "vs-dark") {
        currentTheme = "vs";
        window.monaco?.editor.setTheme("vs");
        themeBtn.textContent = "Switch to Dark";
        document.body.style.background = "#ffffff";
        document.body.style.color = "#000000";
        outputEl.style.background = "#f3f3f3";
        outputEl.style.color = "#000000";
      } else {
        currentTheme = "vs-dark";
        window.monaco?.editor.setTheme("vs-dark");
        themeBtn.textContent = "Switch to Light";
        document.body.style.background = "#1e1e1e";
        document.body.style.color = "#dddddd";
        outputEl.style.background = "#1e1e1e";
        outputEl.style.color = "#eaeaea";
      }
    }

    themeBtn.addEventListener("click", toggleTheme);

    return () => {
      runBtn.removeEventListener("click", runCode);
      themeBtn.removeEventListener("click", toggleTheme);
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }
      editor?.dispose();
    };
  }, [user, teacherPage, studentPage, viewRole]);

  useEffect(() => {
    codeStarterRef.current = lesson.codeStarter;
    if (viewRole === "teacher" && editorRef.current?.setValue) {
      editorRef.current.setValue(lesson.codeStarter);
    }
  }, [lesson.codeStarter, viewRole]);

  function updateActiveLesson(updater) {
    setLessons((prev) =>
      prev.map((item) => {
        if (item.id !== activeLessonId) return item;
        if (typeof updater === "function") return updater(item);
        return { ...item, ...updater };
      })
    );
  }

  function handleSelectLesson(id, nextPage = "workspace") {
    setActiveLessonId(id);
    setTeacherPage(nextPage);
    setStudentPage(nextPage);
    if (user?.role === "teacher") {
      setViewRole("teacher");
    }
  }

  function handleAddLesson() {
    const newLesson = {
      id: createLessonId(),
      ...initialLesson,
      unit: "New Unit",
      heading: "New Lesson",
      duration: "5 min",
    };

    async function createLesson() {
      try {
        const res = await fetch(`${API_BASE}/lessons`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify(newLesson),
        });
        if (!res.ok) throw new Error("create_failed");
        const data = await res.json();
        const created = mapLessonFromApi(data?.data?.lesson);
        if (!created) throw new Error("create_failed");
        setLessons((prev) => [created, ...prev]);
        setActiveLessonId(created.id);
      } catch {
        setLessons((prev) => [newLesson, ...prev]);
        setActiveLessonId(newLesson.id);
      } finally {
        setTeacherPage("workspace");
        setViewRole("teacher");
      }
    }

    createLesson();
  }

  async function handleAuth(event) {
    event.preventDefault();
    setAuthError("");
    setAuthNotice("");
    if (!loginName.trim() || !loginPassword.trim()) {
      setAuthError("Please enter a name and password.");
      return;
    }
    if (authMode === "signup" && loginPassword !== loginConfirmPassword) {
      setAuthError("Passwords do not match.");
      return;
    }

    const payload = {
      name: loginName.trim(),
      password: loginPassword.trim(),
    };

    if (authMode === "signup") {
      payload.role = loginRole;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data?.error?.message || "Authentication failed.");
        return;
      }
      localStorage.setItem(AUTH_TOKEN_KEY, data.data.token);
      setUser(data.data.user);
      setViewRole(data.data.user.role);
    } catch {
      setAuthError("Server not reachable.");
    }
  }

  function handleLogout() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setUser(null);
    setTeacherPage("workspace");
    setViewRole("student");
    setAuthNotice("You have been logged out.");
    setLoginName("");
    setLoginPassword("");
    setLoginConfirmPassword("");
  }

  async function persistProgress(code) {
    const lessonId = activeLessonIdRef.current;
    if (!user || !lessonId || !isMongoObjectId(lessonId)) return;

    try {
      await fetch(`${API_BASE}/progress/${lessonId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          status: "in_progress",
          lastCode: code,
          lastRunAt: new Date().toISOString(),
        }),
      });
    } catch {
      // Ignore progress persistence failures for now.
    }
  }

  async function submitLesson() {
    const lessonId = activeLessonIdRef.current;
    if (!user || !lessonId || !isMongoObjectId(lessonId)) return;

    try {
      await fetch(`${API_BASE}/progress/${lessonId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          status: "completed",
          completedAt: new Date().toISOString(),
        }),
      });
      setToast({ type: "success", message: "Lesson submitted" });
    } catch {
      setToast({ type: "error", message: "Submission failed" });
    }
  }

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  function handleSaveJson() {
    setLessonJson(JSON.stringify(lesson, null, 2));
    if (!user || user.role !== "teacher") return;

    const { id: lessonId, _id: _ignoredMongoId, createdBy: _ignoredCreatedBy, ...payload } = lesson;

    async function persistLesson() {
      try {
        if (!lessonId || !isMongoObjectId(lessonId)) {
          const res = await fetch(`${API_BASE}/lessons`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...authHeaders(),
            },
            body: JSON.stringify(payload),
          });
          if (!res.ok) return;
          const data = await res.json();
          const created = mapLessonFromApi(data?.data?.lesson);
          if (!created) return;
          setLessons((prev) =>
            prev.map((item) => (item.id === lesson.id ? created : item))
          );
          setActiveLessonId(created.id);
          return;
        }

        await fetch(`${API_BASE}/lessons/${lessonId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify(payload),
        });
      } catch {
        // Ignore API failures for now; local state remains the source of truth.
      }
    }

    persistLesson();
  }

  function handleLoadJson() {
    try {
      const parsed = JSON.parse(lessonJson);
      const { id: _ignoredId, ...rest } = parsed;
      const mergedLesson = { ...initialLesson, ...rest, id: lesson.id };
      updateActiveLesson(mergedLesson);

      if (user?.role === "teacher") {
        const { id: lessonId, _id: _ignoredMongoId, ...payload } = mergedLesson;
        fetch(`${API_BASE}/lessons/${lessonId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify(payload),
        }).catch(() => {});
      }
    } catch {
      alert("Invalid JSON. Fix errors and try again.");
    }
  }

  if (!user) {
    return (
      <main className="login-shell">
        <section className="login-split">
          <div className="login-hero">
            <p className="login-tag">Python Learning Studio</p>
            <h1>Teach and learn Python with live practice.</h1>
            <p className="login-copy">
              Teachers craft lessons, hints, and starter code. Students run
              Python instantly and get feedback in one workspace.
            </p>
            <div className="login-highlights">
              <div>
                <h3>Teacher tools</h3>
                <p>Edit headings, instructions, and hints in seconds.</p>
              </div>
              <div>
                <h3>Student focus</h3>
                <p>Distraction-free editor and console output.</p>
              </div>
            </div>
          </div>
          <form className="login-card" onSubmit={handleAuth}>
            <div className="auth-tabs">
              <button
                type="button"
                className={authMode === "login" ? "active" : ""}
                onClick={() => setAuthMode("login")}
              >
                Log in
              </button>
              <button
                type="button"
                className={authMode === "signup" ? "active" : ""}
                onClick={() => setAuthMode("signup")}
              >
                Sign up
              </button>
            </div>
            <h2>{authMode === "login" ? "Welcome back" : "Create account"}</h2>
            <p>
              {authMode === "login"
                ? "Sign in to enter your classroom."
                : "Create a new student or teacher account."}
            </p>
            <label className="login-field">
              Full name
              <input
                type="text"
                value={loginName}
                onChange={(event) => setLoginName(event.target.value)}
                placeholder="Alex Kim"
              />
            </label>
            <label className="login-field">
              Password
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                placeholder="........"
              />
            </label>
            {authMode === "signup" && (
              <label className="login-field">
                Confirm password
                <input
                  type="password"
                  value={loginConfirmPassword}
                  onChange={(event) =>
                    setLoginConfirmPassword(event.target.value)
                  }
                  placeholder="........"
                />
              </label>
            )}
            {authMode === "signup" && (
              <label className="login-field">
                Role
                <select
                  value={loginRole}
                  onChange={(event) => setLoginRole(event.target.value)}
                >
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                </select>
              </label>
            )}
            {authError && <p className="auth-error">{authError}</p>}
            {authNotice && <p className="auth-notice">{authNotice}</p>}
            <button className="accent-button login-button" type="submit">
              {authMode === "login" ? "Enter Workspace" : "Create Account"}
            </button>
            {authMode === "login" && (
              <button type="button" className="forgot-link">
                Forgot password?
              </button>
            )}
          </form>
        </section>
      </main>
    );
  }

  const isTeacher = user.role === "teacher";
  const isTeacherView = viewRole === "teacher";

  if (isTeacher && teacherPage === "dashboard") {
    return (
      <main className="teacher-dashboard">
        <header className="teacher-topbar">
          <div>
            <p className="teacher-eyebrow">Teacher Workspace</p>
            <h1>Lessons</h1>
          </div>
          <div className="teacher-actions">
            <button className="accent-button" type="button" onClick={handleAddLesson}>
              Add lesson
            </button>
            <span className="user-pill">{user.name}</span>
            <span className="role-pill">{user.role}</span>
            <button className="ghost-button" type="button" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </header>

        <section className="teacher-content">
          <div className="teacher-summary">
            <div className="teacher-stat">
              <p>Total lessons</p>
              <strong>{lessons.length}</strong>
            </div>
            <div className="teacher-stat">
              <p>Last edited</p>
              <strong>{lesson.heading}</strong>
            </div>
          </div>

          <div className="lesson-grid">
            {lessons.map((item) => (
              <article key={item.id} className="lesson-card">
                <div className="lesson-card-head">
                  <p className="lesson-card-unit">{item.unit}</p>
                  <span className="lesson-card-duration">{item.duration}</span>
                </div>
                <h3>{item.heading}</h3>
                <p className="lesson-card-body">{item.body}</p>
                <div className="lesson-card-actions">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => handleSelectLesson(item.id, "workspace")}
                  >
                    Edit lesson
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    );
  }

  if (!isTeacher && studentPage === "dashboard") {
    return (
      <main className="student-dashboard">
        <header className="teacher-topbar">
          <div>
            <p className="teacher-eyebrow">Student Workspace</p>
            <h1>Lessons</h1>
          </div>
          <div className="teacher-actions">
            <span className="user-pill">{user.name}</span>
            <span className="role-pill">{user.role}</span>
            <button className="ghost-button" type="button" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </header>

        <section className="teacher-content">
          <div className="teacher-summary">
            <div className="teacher-stat">
              <p>Total lessons</p>
              <strong>{lessons.length}</strong>
            </div>
            <div className="teacher-stat">
              <p>Last accessed</p>
              <strong>{lesson.heading}</strong>
            </div>
          </div>

          <div className="lesson-grid">
            {lessons.map((item) => (
              <article key={item.id} className="lesson-card">
                <div className="lesson-card-head">
                  <p className="lesson-card-unit">{item.unit}</p>
                  <span className="lesson-card-duration">{item.duration}</span>
                </div>
                <h3>{item.heading}</h3>
                <p className="lesson-card-body">{item.body}</p>
                <div className="lesson-card-actions">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => handleSelectLesson(item.id, "workspace")}
                  >
                    Start lesson
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="workspace">
      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.message}</div>
      )}
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">P</span>
          <div>
            <p className="brand-label">{lesson.unit}</p>
            <p className="brand-subtitle">Python Playground</p>
          </div>
        </div>
        <div className="topbar-actions">
          {!isTeacher && (
            <button
              className="ghost-button"
              type="button"
              onClick={() => setStudentPage("dashboard")}
            >
              Lessons
            </button>
          )}
          {isTeacher && (
            <button
              className="ghost-button"
              type="button"
              onClick={() => setTeacherPage("dashboard")}
            >
              Lessons
            </button>
          )}
          {isTeacher && (
            <button
              className="ghost-button"
              type="button"
              onClick={() =>
                setViewRole((prev) => (prev === "teacher" ? "student" : "teacher"))
              }
            >
              Switch to {isTeacherView ? "Student" : "Teacher"}
            </button>
          )}
          <span className="user-pill">{user.name}</span>
          <span className="role-pill">{user.role}</span>
          <button className="ghost-button" type="button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <section className="workspace-grid">
        <aside className="panel lesson-panel">
          <div className="lesson-list">
            <p className="lesson-list-title">Lessons</p>
            <div className="lesson-list-items">
              {lessons.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={
                    item.id === activeLessonId
                      ? "lesson-list-item active"
                      : "lesson-list-item"
                  }
                  onClick={() => handleSelectLesson(item.id, "workspace")}
                >
                  <span>{item.heading}</span>
                  <small>{item.duration}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="lesson-header">
            {isTeacherView ? (
              <>
                <input
                  className="lesson-input lesson-eyebrow-input"
                  value={lesson.unit}
                  onChange={(event) => updateActiveLesson({ unit: event.target.value })}
                />
                <input
                  className="lesson-input lesson-title-input"
                  value={lesson.heading}
                  onChange={(event) => updateActiveLesson({ heading: event.target.value })}
                />
                <input
                  className="lesson-input lesson-duration-input"
                  value={lesson.duration}
                  onChange={(event) => updateActiveLesson({ duration: event.target.value })}
                />
              </>
            ) : (
              <>
                <p className="lesson-eyebrow">{lesson.unit}</p>
                <h2>{lesson.heading}</h2>
                <span className="lesson-duration">{lesson.duration}</span>
              </>
            )}
          </div>
          {isTeacherView ? (
            <>
              <div className="teacher-json">
                <div className="teacher-json-header">
                  <p>Lesson JSON</p>
                  <div className="teacher-json-actions">
                    <button type="button" onClick={handleSaveJson}>
                      Save JSON
                    </button>
                    <button type="button" onClick={handleLoadJson}>
                      Load JSON
                    </button>
                  </div>
                </div>
                <textarea
                  value={lessonJson}
                  onChange={(event) => setLessonJson(event.target.value)}
                />
              </div>
              <label className="lesson-field">
                Lesson text
                <textarea
                  value={lesson.body}
                  onChange={(event) => updateActiveLesson({ body: event.target.value })}
                />
              </label>
              <label className="lesson-field">
                Question
                <textarea
                  value={lesson.question}
                  onChange={(event) => updateActiveLesson({ question: event.target.value })}
                />
              </label>
              <label className="lesson-field">
                Instructions
                <textarea
                  value={lesson.instructions}
                  onChange={(event) => updateActiveLesson({ instructions: event.target.value })}
                />
              </label>
              <label className="lesson-field">
                Hints (one per line)
                <textarea
                  value={lesson.hints.join("\n")}
                  onChange={(event) =>
                    updateActiveLesson((prev) => ({
                      ...prev,
                      hints: event.target.value
                        .split("\n")
                        .map((hint) => hint.trim())
                        .filter(Boolean),
                    }))
                  }
                />
              </label>
              <label className="lesson-field">
                Code starter
                <textarea
                  value={lesson.codeStarter}
                  onChange={(event) => updateActiveLesson({ codeStarter: event.target.value })}
                  placeholder="# Start your lesson code here"
                />
              </label>
            </>
          ) : (
            <>
              <p className="lesson-body">{lesson.body}</p>
              <div className="lesson-callout">
                <p>Hints</p>
                <ul>
                  {lesson.hints.map((hint) => (
                    <li key={hint}>{hint}</li>
                  ))}
                </ul>
              </div>
              <div className="lesson-task">
                <p className="task-title">Instructions</p>
                <p>{lesson.instructions}</p>
              </div>
            </>
          )}
        </aside>

        <article className="panel editor-panel">
          <div className="editor-header">
            <div className="file-pill">
              <span className="file-dot" />
              <span>script.py</span>
            </div>
            <div className="editor-actions">
              <button id="theme-toggle" type="button">
                Switch to Light
              </button>
            </div>
          </div>
          <div id="editor" className="editor-host" />
          <div className="editor-footer">
            <button className="run-pill" type="button" id="run-btn">
              Run
            </button>
            <button className="ghost-button" type="button" onClick={submitLesson}>
              Submit
            </button>
            <span className="footer-hint">Ctrl/Cmd + Enter</span>
          </div>
        </article>

        <aside className="panel output-panel">
          <div className="output-header">
            <h2>Console</h2>
            <span className="output-status">Ready</span>
          </div>
          <div className="output-shell">
            <pre id="output" className="output-body" />
          </div>
        </aside>
      </section>
    </main>
  );
}
