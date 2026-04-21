import { useEffect, useMemo, useRef, useState } from "react";

import { API_BASE, AUTH_TOKEN_KEY, authHeaders, isMongoObjectId, createLessonId, mapLessonFromApi } from './utils/api';
import { parseBodyToCells, serializeCellsToBody } from './utils/parsers';
import { initialLesson } from './utils/lessonHelpers';
import { useAuth } from './contexts/AuthContext';
import { useRouter } from './contexts/RouterContext';
import { useAppContext } from './contexts/AppContext';
import { useClassContext } from './contexts/ClassContext';
import ChatBot from './components/ChatBot';
import LearnPage from './pages/LearnPage';
import QuizPage from './pages/QuizPage';
import DashboardPage from './pages/DashboardPage';
import AILogPage from './pages/AILogPage';
import ItemResponsePage from './pages/ItemResponsePage';
import StudentStatsPage from './pages/StudentStatsPage';
import StudentPage from './pages/StudentPage';
import ClassesPage from './pages/ClassesPage';
import ClassPage from './pages/ClassPage';
import PracticePage from './pages/PracticePage';
import AuthPage from './pages/AuthPage';
import ImportModals from './components/ImportModals';
import HubPage from './pages/HubPage';
import HubPreviewPage from './pages/HubPreviewPage';


export default function App() {
  const { user, setUser, viewRole, setViewRole } = useAuth();
  const { route, setRoute, activeClassId, setActiveClassId } = useRouter();
  const { toast, setToast, confirmDialog, setConfirmDialog } = useAppContext();
  const {
    topics, setTopics,
    activeClass, itemNavList,
    resetClassState,
    handleDeleteClass,
  } = useClassContext();

  const [authMode, setAuthMode] = useState("login");
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginConfirmPassword, setLoginConfirmPassword] = useState("");
  const [loginRole, setLoginRole] = useState("student");
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");

  const [stuckTrigger, setStuckTrigger] = useState(null);
  const [lessonPreview, setLessonPreview] = useState(null); // parsed item from AI for inline preview

  const [lessons, setLessons] = useState([]);
  const [activeLessonId, setActiveLessonId] = useState(null);
  const [progress, setProgress] = useState(null);
  const [practiceMeta, setPracticeMeta] = useState(null);
  const [practiceError, setPracticeError] = useState("");
  const [quizMeta, setQuizMeta] = useState(null);
  const [quizError, setQuizError] = useState("");
  const [learningMeta, setLearningMeta] = useState(null);
  const [learningError, setLearningError] = useState("");
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizResponse, setQuizResponse] = useState("");
  const [quizAttempt, setQuizAttempt] = useState(null);
  const [quizJustSubmitted, setQuizJustSubmitted] = useState(false);
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [practiceSubmitted, setPracticeSubmitted] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState("lesson"); // "lesson" | "editor" | "console"
  const [testResults, setTestResults] = useState(null);
  const [testRunning, setTestRunning] = useState(false);
  const [errorExplanation, setErrorExplanation] = useState(null);
  const [errorExplaining, setErrorExplaining] = useState(false);

  const [practiceDraft, setPracticeDraft] = useState(() => ({
    id: createLessonId(),
    ...initialLesson,
    modelAnswer: "",
    testMode: false,
    testCases: [],
  }));
  const [nbCells, setNbCells] = useState(() =>
    parseBodyToCells(initialLesson.body || "", initialLesson.hints || [])
  );


  const editorRef = useRef(null);
  const activeLessonIdRef = useRef(activeLessonId);
  const fallbackLessonRef = useRef({ id: createLessonId(), ...initialLesson });
  const importModalsRef = useRef(null);

  const lesson = useMemo(() => {
    if (route.page === "practice") {
      return practiceDraft;
    }
    return (
      lessons.find((item) => item.id === activeLessonId) ||
      lessons[0] ||
      fallbackLessonRef.current
    );
  }, [lessons, activeLessonId, route.page, practiceDraft]);

  const navIndex = route.itemId ? itemNavList.findIndex((i) => i.id === route.itemId) : -1;
  const navPrev = navIndex > 0 ? itemNavList[navIndex - 1] : null;
  const navNext = navIndex >= 0 && navIndex < itemNavList.length - 1 ? itemNavList[navIndex + 1] : null;

  const [lessonJson, setLessonJson] = useState(
    JSON.stringify(lesson, null, 2)
  );

  const codeStarterRef = useRef(lesson.codeStarter);

  const isLessonRoute = route.page === "lesson" || route.page === "practice";

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function fetchLessons() {
      try {
        if (!activeClassId) {
          setLessons([]);
          setActiveLessonId(null);
          return;
        }
        const res = await fetch(`${API_BASE}/lessons?classId=${activeClassId}`, {
          headers: { ...authHeaders() },
        });
        if (!res.ok) return;
        const data = await res.json();
        const apiLessons = data?.data?.lessons;
        if (cancelled) return;
        const mapped = Array.isArray(apiLessons)
          ? apiLessons.map(mapLessonFromApi)
          : [];
        setLessons(mapped);
        if (route.page === "lesson") {
          setActiveLessonId((prev) => {
            if (prev && mapped.some((item) => item.id === prev)) return prev;
            return mapped[0]?.id || null;
          });
        }
      } catch {
        // Fall back to localStorage when the API or DB is not ready yet.
      }
    }

    fetchLessons();
    return () => {
      cancelled = true;
    };
  }, [user, activeClassId, route.page]);

  useEffect(() => {
    setLessonJson(JSON.stringify(lesson, null, 2));
  }, [lesson]);

  useEffect(() => {
    if (route.page !== "practice" || !practiceMeta) return;
    setPracticeDraft((prev) => ({
      ...prev,
      unit: practiceMeta.topicTitle || "Practice",
      heading: practiceMeta.itemTitle || "Practice Item",
    }));
  }, [route.page, practiceMeta]);

  useEffect(() => {
    activeLessonIdRef.current = activeLessonId;
  }, [activeLessonId]);

  useEffect(() => {
    if (route.page === "class") {
      setActiveClassId(route.classId);
      setActiveLessonId(null);
      return;
    }
    if (route.page === "lesson") {
      setActiveClassId(route.classId);
      setActiveLessonId(route.lessonId);
      return;
    }
    if (route.page === "practice") {
      setActiveClassId(route.classId);
      setActiveLessonId(null);
      return;
    }
    if (route.page === "quiz") {
      setActiveClassId(route.classId);
      setActiveLessonId(null);
      return;
    }
    if (route.page === "learn") {
      setActiveClassId(route.classId);
      setActiveLessonId(null);
      return;
    }
    if (route.page === "student") {
      setActiveClassId(route.classId);
      setActiveLessonId(null);
      return;
    }
    if (route.page === "student-stats") {
      setActiveClassId(route.classId);
      setActiveLessonId(null);
      return;
    }
    if (route.page === "dashboard") {
      setActiveClassId(route.classId);
      setActiveLessonId(null);
      return;
    }
    if (route.page === "ai-log") {
      setActiveClassId(route.classId);
      setActiveLessonId(null);
      return;
    }
    if (route.page === "item-response") {
      setActiveClassId(route.classId);
      setActiveLessonId(null);
      return;
    }
    setActiveClassId(null);
    setActiveLessonId(null);
  }, [route]);

  useEffect(() => {
    if (!isLessonRoute || !user || !activeLessonId || !isMongoObjectId(activeLessonId)) {
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
          editorRef.current.setValue(apiProgress.lastCode, -1);
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
    if (!user || route.page !== "practice" || !route.itemId || !activeClassId) {
      setPracticeMeta(null);
      setPracticeError("");
      return;
    }
    setPracticeSubmitted(false);
    let cancelled = false;

    async function fetchPractice() {
      try {
        const res = await fetch(
          `${API_BASE}/classes/${activeClassId}/practice/${route.itemId}`,
          { headers: { ...authHeaders() } }
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setPracticeError(data?.error?.message || "Unable to load practice.");
          setPracticeMeta(null);
          return;
        }
        const item = data?.data?.item;
        setPracticeMeta({
          itemTitle: item?.title || "Practice Item",
          topicTitle: item?.topic?.title || "Practice",
        });
        const submittedCode = item?.submittedCode || null;
        const codeStarter = item?.practiceCodeStarter ?? "";
        console.log("[fetchPractice] submittedCode:", submittedCode ? `${submittedCode.length} chars` : "null", "codeStarter:", codeStarter ? `${codeStarter.length} chars` : "empty");
        setPracticeDraft((prev) => ({
          ...prev,
          unit: item?.topic?.title || prev.unit,
          heading: item?.title || prev.heading,
          body: item?.practiceBody ?? prev.body,
          instructions: item?.practiceInstructions ?? prev.instructions,
          question: item?.practiceQuestion ?? prev.question,
          hints: item?.practiceHints?.length ? item.practiceHints : prev.hints,
          codeStarter: item?.practiceCodeStarter ?? prev.codeStarter,
          modelAnswer: item?.practiceModelAnswer ?? prev.modelAnswer,
          testMode: item?.practiceTestMode ?? prev.testMode,
          testCases: item?.practiceTestCases ?? prev.testCases,
          submittedCode,
          _itemId: item?.id || route.itemId,
          _topicId: item?.topic?.id || "",
        }));
        // Directly set the editor to submitted code if available,
        // bypassing the sync useEffect which may fire before the editor is initialized.
        const editorCode = viewRole === "student" && submittedCode ? submittedCode : codeStarter;
        codeStarterRef.current = editorCode;
        if (editorRef.current?.setValue) {
          editorRef.current.setValue(editorCode, -1);
        }
        if (submittedCode) setPracticeSubmitted(true);
        setTestResults(null);
      } catch {
        if (cancelled) return;
        setPracticeError("Unable to load practice.");
        setPracticeMeta(null);
      }
    }

    fetchPractice();
    return () => {
      cancelled = true;
    };
  }, [user, route.page, route.itemId, activeClassId]);

  // Sync notebook cells when practice item loads from server
  useEffect(() => {
    if (route.page === "practice" && practiceDraft._itemId) {
      setNbCells(parseBodyToCells(practiceDraft.body || "", practiceDraft.hints || []));
    }
  }, [practiceDraft._itemId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user || route.page !== "quiz" || !route.itemId || !activeClassId) {
      setQuizMeta(null);
      setQuizError("");
      setQuizAttempt(null);
      setQuizResponse("");
      setQuizLoading(false);
      return;
    }
    let cancelled = false;
    setQuizLoading(true);
    setQuizError("");

    async function fetchQuiz() {
      try {
        const res = await fetch(
          `${API_BASE}/classes/${activeClassId}/quiz/${route.itemId}`,
          { headers: { ...authHeaders() } }
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setQuizError(data?.error?.message || "Unable to load quiz.");
          setQuizMeta(null);
          setQuizAttempt(null);
          return;
        }
        const item = data?.data?.item || null;
        const attempt = data?.data?.attempt || null;
        setQuizMeta(item);
        setQuizJustSubmitted(false);
        setQuizAttempt(attempt);
        setQuizResponse(attempt?.responseText || "");
      } catch {
        if (cancelled) return;
        setQuizError("Unable to load quiz.");
        setQuizMeta(null);
        setQuizAttempt(null);
      } finally {
        if (!cancelled) setQuizLoading(false);
      }
    }

    fetchQuiz();
    return () => {
      cancelled = true;
    };
  }, [user, route.page, route.itemId, activeClassId]);

  useEffect(() => {
    if (!user || route.page !== "learn" || !route.itemId || !activeClassId) {
      setLearningMeta(null);
      setLearningError("");
      return;
    }
    let cancelled = false;

    async function fetchLearning() {
      try {
        const res = await fetch(
          `${API_BASE}/classes/${activeClassId}/learn/${route.itemId}`,
          { headers: { ...authHeaders() } }
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setLearningError(data?.error?.message || "Unable to load lesson.");
          setLearningMeta(null);
          return;
        }
        setLearningMeta(data?.data?.item || null);
      } catch {
        if (cancelled) return;
        setLearningError("Unable to load lesson.");
        setLearningMeta(null);
      }
    }

    fetchLearning();
    return () => { cancelled = true; };
  }, [user, route.page, route.itemId, activeClassId]);


  useEffect(() => {
    if (!user) return;
    if (!isLessonRoute || !activeClassId) return;
    let editor;

    const outputEl = document.getElementById("output");
    const runBtn = document.getElementById("run-btn");
    const editorHost = document.getElementById("editor");
    if (!outputEl || !runBtn || !editorHost) return;

    function appendText(text) {
      outputEl.appendChild(document.createTextNode(text));
    }

    function outf(text) {
      appendText(text);
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

    let inputResolve = null;

    let activeInput = null;

    function clearInlineInput() {
      if (activeInput) {
        activeInput.remove();
        activeInput = null;
      }
      inputResolve = null;
    }

    function submitInlineInput(span) {
      if (!inputResolve || !span) return;
      const value = span.textContent || "";
      span.remove();
      activeInput = null;
      appendText(`${value}\n`);
      const resolve = inputResolve;
      inputResolve = null;
      resolve(value);
    }

    function requestInput(promptText = "") {
      if (promptText) {
        outf(promptText);
      }
      clearInlineInput();
      const span = document.createElement("span");
      span.className = "console-inline-input";
      span.contentEditable = "true";
      span.spellcheck = false;
      span.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          submitInlineInput(span);
        }
      });
      outputEl.appendChild(span);
      outputEl.scrollTop = outputEl.scrollHeight;
      span.focus();
      activeInput = span;
      return new Promise((resolve) => {
        inputResolve = resolve;
      });
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
      setErrorExplanation(null);
      setErrorExplaining(false);
      const code = editor.getValue();
      if (!code) {
        outputEl.textContent = "Editor has no code loaded yet.";
        return;
      }
      clearInlineInput();
      persistProgress(code);
      if (window.Sk?.builtin?.dict) {
        window.Sk.sysmodules = new window.Sk.builtin.dict([]);
      }
      window.Sk.globals = {};
      window.Sk.configure({
        output: outf,
        read: builtinRead,
        inputfun: (promptText) => requestInput(promptText),
        inputfunTakesPrompt: true,
      });
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
          const errStr = err.toString();
          appendText(`\nError: ${errStr}`);
          clearInlineInput();
          setErrorExplanation(null);
          setErrorExplaining(true);
          fetch(`${API_BASE}/chat/explain-error`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ errorMessage: errStr, code: editor?.getValue() || "" }),
          })
            .then((r) => r.json())
            .then((data) => setErrorExplanation(data?.data?.explanation || null))
            .catch(() => setErrorExplanation(null))
            .finally(() => setErrorExplaining(false));
        });
    }

    runBtn.addEventListener("click", runCode);

    function tryInitAce(retries = 0) {
      if (!window.ace || !editorHost) {
        if (retries < 20) setTimeout(() => tryInitAce(retries + 1), 150);
        return;
      }
      editor = window.ace.edit(editorHost);
      editor.setTheme("ace/theme/monokai");
      editor.session.setMode("ace/mode/python");
      editor.setValue(codeStarterRef.current || "", -1);
      editor.setOptions({
        fontSize: "14px",
        showPrintMargin: false,
        tabSize: 4,
        useSoftTabs: true,
        enableBasicAutocompletion: true,
        enableLiveAutocompletion: false,
        wrap: true,
      });
      editor.commands.addCommand({
        name: "runCode",
        bindKey: { win: "Ctrl-Enter", mac: "Command-Enter" },
        exec: runCode,
      });
      editorRef.current = editor;
      editor.focus();
    }

    tryInitAce();

    return () => {
      runBtn.removeEventListener("click", runCode);
      editor?.destroy();
    };
  }, [user, isLessonRoute, viewRole, activeClassId, route.page]);

  useEffect(() => {
    // For students on the practice page: prefer their submitted code over the starter.
    const editorValue =
      route.page === "practice" && viewRole === "student" && lesson.submittedCode
        ? lesson.submittedCode
        : lesson.codeStarter;
    codeStarterRef.current = editorValue;
    // On the practice page load the code for both teacher and student.
    // On regular lesson pages only sync for the teacher (students keep their own code).
    const shouldSync = viewRole === "teacher" || route.page === "practice";
    if (shouldSync && editorRef.current?.setValue) {
      editorRef.current.setValue(editorValue || "", -1);
    }
  }, [lesson.codeStarter, lesson.submittedCode, viewRole, route.page]);

  function updateActiveLesson(updater) {
    if (route.page === "practice") {
      setPracticeDraft((prev) =>
        typeof updater === "function" ? updater(prev) : { ...prev, ...updater }
      );
      return;
    }
    setLessons((prev) =>
      prev.map((item) => {
        if (item.id !== activeLessonId) return item;
        if (typeof updater === "function") return updater(item);
        return { ...item, ...updater };
      })
    );
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
      if (route.page === "classes") {
        window.history.replaceState({}, "", "/classes");
      }
    } catch {
      setAuthError("Server not reachable.");
    }
  }

  function handleLogout() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setUser(null);
    setViewRole("student");
    setAuthNotice("You have been logged out.");
    setLoginName("");
    setLoginPassword("");
    setLoginConfirmPassword("");
    resetClassState();
    setActiveClassId(null);
    window.history.replaceState({}, "", "/classes");
    setRoute({ page: "classes", classId: null });
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

  async function runTestCases() {
    if (!window.Sk) return;
    const code = editorRef.current?.getValue?.() || "";
    if (!code.trim()) return;
    const cases = practiceDraft.testCases || [];
    if (!cases.length) return;
    setTestRunning(true);
    setTestResults(null);
    const results = [];
    for (const tc of cases) {
      const inputQueue = (tc.input || "").split("\n").map((s) => s.trim());
      let inputIdx = 0;
      let actualOutput = "";
      if (window.Sk?.builtin?.dict) window.Sk.sysmodules = new window.Sk.builtin.dict([]);
      window.Sk.globals = {};
      window.Sk.configure({
        output: (text) => { actualOutput += text; },
        read: (x) => {
          if (window.Sk?.builtinFiles?.files?.[x] === undefined) throw new Error(`File not found: '${x}'`);
          return window.Sk.builtinFiles.files[x];
        },
        inputfun: () => Promise.resolve(inputQueue[inputIdx++] || ""),
        inputfunTakesPrompt: true,
      });
      try {
        await window.Sk.misceval.asyncToPromise(() =>
          window.Sk.importMainWithBody("<stdin>", false, code, true)
        );
        const actual   = actualOutput.trim();
        const expected = (tc.expectedOutput || "").trim();
        results.push({ label: tc.label, input: tc.input, expected, actual, passed: actual === expected });
      } catch (err) {
        results.push({
          label: tc.label, input: tc.input,
          expected: (tc.expectedOutput || "").trim(),
          actual: `Error: ${err.toString()}`, passed: false,
        });
      }
    }
    setTestResults(results);
    setTestRunning(false);
  }

  async function submitLesson() {
    if (!user || !activeClassId || !route.itemId) return;

    const code = editorRef.current?.getValue?.() || "";
    try {
      const res = await fetch(
        `${API_BASE}/classes/${activeClassId}/quiz/${route.itemId}/attempt`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ responseText: code }),
        }
      );
      if (!res.ok) throw new Error("Failed");
      setPracticeSubmitted(true);
      // Immediately update practiceDraft so the submitted code persists
      // in the current session without needing a full page reload.
      if (code) {
        setPracticeDraft((prev) => ({ ...prev, submittedCode: code }));
      }
      setToast({ type: "success", message: "Code submitted!" });
    } catch {
      setToast({ type: "error", message: "Submission failed" });
    }
  }

  async function submitQuiz() {
    if (!user || !activeClassId || !route.itemId || route.page !== "quiz") return;
    if (!quizResponse.trim()) {
      setQuizError("Enter your answer before submitting.");
      return;
    }

    setQuizSubmitting(true);
    setQuizError("");
    try {
      const res = await fetch(
        `${API_BASE}/classes/${activeClassId}/quiz/${route.itemId}/attempt`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify({ responseText: quizResponse.trim() }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setQuizError(data?.error?.message || "Unable to submit quiz.");
        return;
      }
      setQuizJustSubmitted(true);
      setQuizAttempt(data?.data?.attempt || null);
      setToast({ type: "success", message: "Quiz submitted" });
    } catch {
      setQuizError("Unable to submit quiz.");
    } finally {
      setQuizSubmitting(false);
    }
  }

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);


  function chatBotElement() {
    return (
      <>
        <ChatBot
          topics={topics}
          activeClass={activeClass}
          activeLessonId={activeLessonId}
          practiceDraft={practiceDraft}
          learningMeta={learningMeta}
          quizMeta={quizMeta}
          importPlan={importModalsRef.current?.getPlan?.() ?? null}
          setLearningMeta={setLearningMeta}
          setQuizMeta={setQuizMeta}
          setImportPlan={(plan) => importModalsRef.current?.setPlan?.(plan)}
          setImportPlanExpanded={(v) => importModalsRef.current?.setPlanExpanded?.(v)}
          editorRef={editorRef}
          stuckTrigger={stuckTrigger}
          onImportMcq={(mcq) => importModalsRef.current?.openMcq(mcq, topics)}
          onImportSa={(sa) => importModalsRef.current?.openSa(sa, topics)}
          onImportPractice={(ex) => importModalsRef.current?.openPractice(ex, topics)}
          onImportPlan={(plan) => importModalsRef.current?.openPlan(plan)}
          onImportLearning={(item) => importModalsRef.current?.openLearning(item, topics)}
          onImportLearningAll={(items) => importModalsRef.current?.openLearningAll(items, topics)}
          onPreviewLesson={(item) => setLessonPreview(item)}
        />
        <ImportModals
          ref={importModalsRef}
          activeClassId={activeClassId}
          topics={topics}
          setTopics={setTopics}
          setToast={setToast}
          setConfirmDialog={setConfirmDialog}
        />
      </>
    );
  }

  function handleSaveJson() {
    if (route.page === "practice" && isTeacherView && practiceDraft._itemId) {
      const { body: nbBody, hints: nbHints } = serializeCellsToBody(nbCells);
      const draftToSave = { ...practiceDraft, body: nbBody, hints: nbHints };
      setLessonJson(JSON.stringify(draftToSave, null, 2));
      async function persistPractice() {
        try {
          const res = await fetch(
            `${API_BASE}/classes/${activeClassId}/topics/${practiceDraft._topicId}/items/${practiceDraft._itemId}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json", ...authHeaders() },
              body: JSON.stringify({
                title: practiceDraft.heading,
                type: "practice",
                practiceBody: nbBody,
                practiceInstructions: practiceDraft.instructions,
                practiceQuestion: practiceDraft.question,
                practiceHints: nbHints,
                practiceCodeStarter: practiceDraft.codeStarter,
                practiceModelAnswer: practiceDraft.modelAnswer,
                practiceTestMode: practiceDraft.testMode,
                practiceTestCases: practiceDraft.testCases,
              }),
            }
          );
          if (res.ok) {
            setToast({ type: "success", message: "Exercise saved!" });
          } else {
            setToast({ type: "error", message: "Failed to save exercise." });
          }
        } catch {
          setToast({ type: "error", message: "Server not reachable." });
        }
      }
      persistPractice();
      return;
    }
    if (route.page === "practice") {
      setLessonJson(JSON.stringify(lesson, null, 2));
      return;
    }
    setLessonJson(JSON.stringify(lesson, null, 2));
    if (!user || user.role !== "teacher") return;
    if (!activeClassId) {
      return;
    }

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
            body: JSON.stringify({ ...payload, classId: activeClassId }),
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

  if (!user) {
    return (
      <AuthPage
        authMode={authMode}
        setAuthMode={setAuthMode}
        loginName={loginName}
        setLoginName={setLoginName}
        loginPassword={loginPassword}
        setLoginPassword={setLoginPassword}
        loginConfirmPassword={loginConfirmPassword}
        setLoginConfirmPassword={setLoginConfirmPassword}
        loginRole={loginRole}
        setLoginRole={setLoginRole}
        authError={authError}
        authNotice={authNotice}
        handleAuth={handleAuth}
      />
    );
  }

  const isTeacherView = viewRole === "teacher";

  if (route.page === "classes") {
    return <ClassesPage handleLogout={handleLogout} chatBot={chatBotElement()} />;
  }

  if (route.page === "class") {
    return <ClassPage handleLogout={handleLogout} chatBot={chatBotElement()} />;
  }

  if (route.page === "learn") {
    return (
      <LearnPage
        learningMeta={learningMeta}
        setLearningMeta={setLearningMeta}
        learningError={learningError}
        handleLogout={handleLogout}
        setToast={setToast}
        chatBot={chatBotElement()}
        onStuck={(msg) => setStuckTrigger({ msg, ts: Date.now() })}
        lessonPreview={lessonPreview}
        onClearLessonPreview={() => setLessonPreview(null)}
      />
    );
  }

  if (route.page === "quiz") {
    return (
      <QuizPage
        quizMeta={quizMeta}
        setQuizMeta={setQuizMeta}
        quizError={quizError}
        quizLoading={quizLoading}
        quizResponse={quizResponse}
        setQuizResponse={setQuizResponse}
        quizAttempt={quizAttempt}
        setQuizAttempt={setQuizAttempt}
        quizJustSubmitted={quizJustSubmitted}
        setQuizJustSubmitted={setQuizJustSubmitted}
        quizSubmitting={quizSubmitting}
        submitQuiz={submitQuiz}
        handleLogout={handleLogout}
        setToast={setToast}
        chatBot={chatBotElement()}
        onStuck={(msg) => setStuckTrigger({ msg, ts: Date.now() })}
      />
    );
  }

  if (route.page === "dashboard") {
    return <DashboardPage handleLogout={handleLogout} chatBot={chatBotElement()} />;
  }

  if (route.page === "student") {
    return <StudentPage practiceError={practiceError} handleLogout={handleLogout} chatBot={chatBotElement()} />;
  }

  if (route.page === "item-response") {
    return <ItemResponsePage handleLogout={handleLogout} chatBot={chatBotElement()} />;
  }

  if (route.page === "ai-log") {
    return <AILogPage handleLogout={handleLogout} chatBot={chatBotElement()} />;
  }

  if (route.page === "student-stats") {
    return <StudentStatsPage handleLogout={handleLogout} chatBot={chatBotElement()} />;
  }
  if (route.page === "hub") {
    return <HubPage handleLogout={handleLogout} chatBot={chatBotElement()} />;
  }
  if (route.page === "hub-preview") {
    return <HubPreviewPage handleLogout={handleLogout} />;
  }
  return (
    <PracticePage
      lesson={lesson}
      activeClass={activeClass}
      navIndex={navIndex}
      navPrev={navPrev}
      navNext={navNext}
      itemNavList={itemNavList}
      workspaceTab={workspaceTab}
      setWorkspaceTab={setWorkspaceTab}
      toast={toast}
      updateActiveLesson={updateActiveLesson}
      nbCells={nbCells}
      setNbCells={setNbCells}
      practiceDraft={practiceDraft}
      practiceSubmitted={practiceSubmitted}
      testRunning={testRunning}
      testResults={testResults}
      setTestResults={setTestResults}
      runTestCases={runTestCases}
      submitLesson={submitLesson}
      errorExplaining={errorExplaining}
      errorExplanation={errorExplanation}
      handleSaveJson={handleSaveJson}
      handleDeleteClass={handleDeleteClass}
      handleLogout={handleLogout}
      chatBot={chatBotElement()}
      onStuck={(msg) => setStuckTrigger({ msg, ts: Date.now() })}
    />
  );
}
