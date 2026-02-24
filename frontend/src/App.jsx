import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

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

function createTopicItemDraft(overrides = {}) {
  return {
    title: "",
    type: "learning",
    quizSubtype: "mcq",
    quizQuestion: "",
    quizOptions: [],
    quizOptionInput: "",
    quizOptionEditIndex: -1,
    quizAnswer: "",
    ...overrides,
  };
}

function upsertOption(options, index, value) {
  const next = [...(Array.isArray(options) ? options : [])];
  if (index >= 0 && index < next.length) {
    next[index] = value;
  } else {
    next.push(value);
  }
  return next.filter(Boolean);
}

function stripMachineBlocks(content) {
  // Use greedy match so we strip to the LAST closing ``` (handles nested
  // backtick blocks that may appear inside the JSON values).
  return content
    .replace(/```mcq-json[\s\S]*\n```/g, "")
    .replace(/```sa-json[\s\S]*\n```/g, "")
    .replace(/```practice-json[\s\S]*\n```/g, "")
    .replace(/```lesson-plan-json[\s\S]*\n```/g, "")
    .replace(/```learning-json[\s\S]*\n```/g, "")
    .trim();
}

function parseMcqFromMessage(content) {
  // Match from ```mcq-json to the LAST ``` on its own line, to avoid
  // being tripped up by any backtick fences that appear inside the JSON.
  const match = content.match(/```mcq-json\s*\n([\s\S]*)\n```/);
  if (!match) return null;
  try {
    // The greedy [\s\S]* may capture trailing newlines — trim to get clean JSON
    const raw = match[1].trim();
    const parsed = JSON.parse(raw);
    if (!parsed.question || !Array.isArray(parsed.options) || !parsed.answer) return null;
    // Sanitise the question: strip any fenced code blocks and option labels
    // (A), B), 1., etc.) that the AI may have accidentally embedded in it.
    let questionText = parsed.question
      .replace(/```[\s\S]*?```/g, "")            // remove embedded fenced blocks
      .replace(/^\s*[A-Z]\)\s*.*$/gm, "")        // remove "A) ...", "B) ..." lines
      .replace(/^\s*[0-9]+\.\s*.*$/gm, "")       // remove "1. ...", "2. ..." lines
      .trim();
    // If the AI used the codeSnippet field, append it as a proper code block
    const question = parsed.codeSnippet
      ? `${questionText}\n\`\`\`python\n${parsed.codeSnippet}\n\`\`\``
      : questionText;
    // Normalise options: strip surrounding backticks if AI wrapped them anyway,
    // so we always store plain strings (newlines are preserved via JSON \n).
    const options = parsed.options.map((o) =>
      typeof o === "string" ? o.replace(/^`([\s\S]*)`$/, "$1") : String(o)
    );
    return {
      title: parsed.title || "",
      question,
      options,
      answer: parsed.answer,
      explanation: parsed.explanation || "",
    };
  } catch {
    return null;
  }
}

function normalizeSaQuestion(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!raw.question || !raw.answer) return null;
  return {
    title: raw.title || "",
    question: raw.question,
    answer: raw.answer,
    gradingCriteria: raw.gradingCriteria || "",
  };
}

function parseSaFromMessage(content) {
  const match = content.match(/```sa-json\s*\n([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    const questions = Array.isArray(parsed?.questions)
      ? parsed.questions.map(normalizeSaQuestion).filter(Boolean)
      : [normalizeSaQuestion(parsed)].filter(Boolean);
    if (!questions.length) return null;
    return {
      questions,
    };
  } catch {
    return null;
  }
}

function parsePracticeFromMessage(content) {
  const match = content.match(/```practice-json\s*\n([\s\S]*)\n```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (!parsed.title || !parsed.instructions) return null;
    return {
      title: parsed.title || "",
      body: parsed.body || "",
      instructions: parsed.instructions || "",
      hints: Array.isArray(parsed.hints) ? parsed.hints : [],
      codeStarter: parsed.codeStarter || "",
      modelAnswer: parsed.modelAnswer || "",
      testMode: !!parsed.testMode,
      testCases: Array.isArray(parsed.testCases) ? parsed.testCases : [],
    };
  } catch {
    return null;
  }
}

function parseLessonPlanFromMessage(content) {
  const match = content.match(/```lesson-plan-json\s*\n([\s\S]*)\n```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (!parsed.planTitle || !Array.isArray(parsed.topics)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseLearningFromMessage(content) {
  const match = content.match(/```learning-json\s*\n([\s\S]*)\n```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (!parsed.title) return null;
    return {
      title: parsed.title || "",
      body: parsed.body || "",
      instructions: parsed.instructions || "",
      hints: Array.isArray(parsed.hints) ? parsed.hints : [],
      codeStarter: parsed.codeStarter || "",
    };
  } catch {
    return null;
  }
}

function mapLessonFromApi(lesson) {
  if (!lesson) return null;
  const id = lesson.id || lesson._id;
  return { ...lesson, id: id ? id.toString() : createLessonId() };
} 

function mapClassFromApi(classroom) {
  if (!classroom) return null;
  const id = classroom.id || classroom._id;
  return { ...classroom, id: id ? id.toString() : "" };
}

function parseRoute() {
  const path = window.location.pathname || "/";
  const quizMatch = path.match(/^\/classes\/([a-f\d]{24})\/quiz\/([a-f\d]{24})$/i);
  if (quizMatch) {
    return {
      page: "quiz",
      classId: quizMatch[1],
      itemId: quizMatch[2],
      lessonId: null,
      studentId: null,
    };
  }
  const practiceMatch = path.match(/^\/classes\/([a-f\d]{24})\/practice\/([a-f\d]{24})$/i);
  if (practiceMatch) {
    return {
      page: "practice",
      classId: practiceMatch[1],
      itemId: practiceMatch[2],
      lessonId: null,
      studentId: null,
    };
  }
  const studentMatch = path.match(/^\/classes\/([a-f\d]{24})\/students\/([a-f\d]{24})$/i);
  if (studentMatch) {
    return {
      page: "student",
      classId: studentMatch[1],
      studentId: studentMatch[2],
      lessonId: null,
    };
  }
  const lessonMatch = path.match(/^\/classes\/([a-f\d]{24})\/lessons\/([a-f\d]{24})$/i);
  if (lessonMatch) {
    return { page: "lesson", classId: lessonMatch[1], lessonId: lessonMatch[2], studentId: null };
  }
  const classMatch = path.match(/^\/classes\/([a-f\d]{24})$/i);
  if (classMatch) {
    return { page: "class", classId: classMatch[1], lessonId: null, studentId: null };
  }
  return { page: "classes", classId: null, lessonId: null, studentId: null };
}

function authHeaders() {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function isMongoObjectId(value) {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
}

function PageShell({ className, children }) {
  return <div className={className}>{children}</div>;
}

function LearningViewer({ meta, isTeacher, activeClassId, authHeaders, API_BASE, onSaved, setToast }) {
  const hasContent = !!(meta.practiceBody || meta.practiceCodeStarter);
  const hints = Array.isArray(meta.practiceHints) ? meta.practiceHints : [];
  const hasExercise = !!(meta.practiceInstructions);

  // Edit-mode state
  const [editing, setEditing] = useState(!hasContent && isTeacher);
  const [body, setBody] = useState(meta.practiceBody || "");
  const [instructions, setInstructions] = useState(meta.practiceInstructions || "");
  const [codeStarter, setCodeStarter] = useState(meta.practiceCodeStarter || "");
  const [saving, setSaving] = useState(false);

  // Hints reveal state
  const [hintsRevealed, setHintsRevealed] = useState(0); // number of hints shown

  // Mini code editor + console state
  const miniInitialCode = meta.practiceCodeStarter || "# Write your Python code here\n";
  const [miniOutput, setMiniOutput] = useState(null); // null = not run yet
  const [miniRunning, setMiniRunning] = useState(false);
  const [miniError, setMiniError] = useState(false);
  const miniEditorHostRef = useRef(null);
  const miniEditorRef = useRef(null);

  // Initialize Ace editor in the mini host div
  useEffect(() => {
    function mountAce(retries = 0) {
      if (!window.ace || !miniEditorHostRef.current) {
        if (retries < 20) setTimeout(() => mountAce(retries + 1), 150);
        return;
      }
      if (miniEditorRef.current) return; // already mounted
      const editor = window.ace.edit(miniEditorHostRef.current);
      editor.setTheme("ace/theme/monokai");
      editor.session.setMode("ace/mode/python");
      editor.setValue(miniInitialCode, -1); // -1 = move cursor to start
      editor.setOptions({
        fontSize: "13px",
        showPrintMargin: false,
        tabSize: 4,
        useSoftTabs: true,
        wrap: true,
        enableBasicAutocompletion: false,
        enableLiveAutocompletion: false,
      });
      miniEditorRef.current = editor;
    }

    mountAce();

    return () => {
      if (miniEditorRef.current) {
        miniEditorRef.current.destroy();
        miniEditorRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function skRead(x) {
    if (window.Sk?.builtinFiles?.files?.[x] === undefined) throw new Error(`File not found: '${x}'`);
    return window.Sk.builtinFiles.files[x];
  }

  async function runMiniCode() {
    if (!window.Sk) { setMiniOutput("Python runner not available yet. Please wait a moment."); setMiniError(true); return; }
    const code = miniEditorRef.current ? miniEditorRef.current.getValue() : miniInitialCode;
    setMiniRunning(true);
    setMiniError(false);
    let output = "";
    try {
      if (window.Sk?.builtin?.dict) window.Sk.sysmodules = new window.Sk.builtin.dict([]);
      window.Sk.globals = {};
      window.Sk.configure({ output: (t) => { output += t; }, read: skRead, inputfunTakesPrompt: true });
      await window.Sk.misceval.asyncToPromise(() =>
        window.Sk.importMainWithBody("<stdin>", false, code, true)
      );
      setMiniOutput(output || "(no output)");
      setMiniError(false);
    } catch (err) {
      setMiniOutput(String(err));
      setMiniError(true);
    } finally {
      setMiniRunning(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(
        `${API_BASE}/classes/${activeClassId}/topics/${meta.topic?.id}/items/${meta.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            title: meta.title,
            type: "learning",
            practiceBody: body,
            practiceInstructions: instructions,
            practiceCodeStarter: codeStarter,
          }),
        }
      );
      if (res.ok) {
        onSaved({ practiceBody: body, practiceInstructions: instructions, practiceCodeStarter: codeStarter });
        setEditing(false);
        setToast({ type: "success", message: "Lesson content saved!" });
      } else {
        setToast({ type: "error", message: "Failed to save content." });
      }
    } catch {
      setToast({ type: "error", message: "Server not reachable." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="learning-viewer">
      {meta.topic?.title && (
        <p className="learning-topic-label">{meta.topic.title}</p>
      )}

      {isTeacher && editing ? (
        /* ── Teacher edit form ───────────────────────────── */
        <div className="learning-edit-inline">
          <label className="learning-edit-label">Lesson Body</label>
          <textarea
            className="learning-edit-textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Explain the concept in plain language (K-12 friendly)…"
            rows={8}
          />
          <label className="learning-edit-label">Try-it Instructions (optional)</label>
          <input
            className="learning-edit-input"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. Try writing a while loop that prints 1 to 10."
          />
          <label className="learning-edit-label">Starter Code for the mini editor (optional)</label>
          <textarea
            className="learning-edit-code"
            value={codeStarter}
            onChange={(e) => setCodeStarter(e.target.value)}
            placeholder="# Starter code shown in the student editor"
            rows={4}
            spellCheck={false}
          />
          <div className="learning-edit-actions">
            <button className="primary-button" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save Content"}
            </button>
            {hasContent && (
              <button className="ghost-button" onClick={() => setEditing(false)}>Cancel</button>
            )}
          </div>
        </div>
      ) : (
        /* ── View mode ───────────────────────────────────── */
        <>
          {!hasContent ? (
            <div className="learning-empty-state">
              <p>No content has been added to this lesson yet.</p>
              {isTeacher && (
                <button className="ghost-button" onClick={() => setEditing(true)}>+ Add Content</button>
              )}
            </div>
          ) : (
            <>
              {/* Main lesson body */}
              {meta.practiceBody && (
                <div className="learning-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                    {meta.practiceBody}
                  </ReactMarkdown>
                </div>
              )}

              {/* Try-it exercise section */}
              {hasExercise && (
                <div className="learning-exercise">
                  <div className="learning-exercise-header">
                    <span className="learning-exercise-badge">Try it!</span>
                    <p className="learning-exercise-task">{meta.practiceInstructions}</p>
                  </div>

                  {/* Hints */}
                  {hints.length > 0 && (
                    <div className="learning-hints-wrap">
                      {hints.slice(0, hintsRevealed).map((h, i) => (
                        <div key={i} className="learning-hint-item">
                          <span className="learning-hint-num">Hint {i + 1}</span>
                          <span>{h}</span>
                        </div>
                      ))}
                      {hintsRevealed < hints.length && (
                        <button
                          className="ghost-button learning-hint-btn"
                          onClick={() => setHintsRevealed((n) => n + 1)}
                        >
                          {hintsRevealed === 0 ? "Show Hint" : "Show Next Hint"}
                        </button>
                      )}
                      {hintsRevealed >= hints.length && hints.length > 0 && (
                        <button
                          className="ghost-button learning-hint-btn"
                          onClick={() => setHintsRevealed(0)}
                        >
                          Hide Hints
                        </button>
                      )}
                    </div>
                  )}

                  {/* Mini code editor */}
                  <div className="mini-editor-wrap">
                    <div className="mini-editor-topbar">
                      <span className="mini-editor-label">Python Editor</span>
                      <button
                        className="run-pill"
                        onClick={runMiniCode}
                        disabled={miniRunning}
                        type="button"
                      >
                        {miniRunning ? "Running…" : "▶ Run"}
                      </button>
                    </div>
                    <div ref={miniEditorHostRef} className="mini-ace-host" />
                    {miniOutput !== null && (
                      <div className={`mini-console ${miniError ? "mini-console-error" : ""}`}>
                        <span className="mini-console-label">Output</span>
                        <pre>{miniOutput}</pre>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Teacher-only Edit button */}
              {isTeacher && (
                <button className="ghost-button learning-edit-btn" onClick={() => {
                  setBody(meta.practiceBody || "");
                  setInstructions(meta.practiceInstructions || "");
                  setCodeStarter(meta.practiceCodeStarter || "");
                  setEditing(true);
                }}>
                  Edit Content
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
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
  const [route, setRoute] = useState(() => parseRoute());

  const [lessons, setLessons] = useState([]);
  const [activeLessonId, setActiveLessonId] = useState(null);
  const [toast, setToast] = useState(null);
  const [progress, setProgress] = useState(null);
  const [classes, setClasses] = useState([]);
  const [activeClassId, setActiveClassId] = useState(null);
  const [className, setClassName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [classError, setClassError] = useState("");
  const [classNotice, setClassNotice] = useState("");
  const [classStudents, setClassStudents] = useState([]);
  const [studentsRefreshKey, setStudentsRefreshKey] = useState(0);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [selectedStudentName, setSelectedStudentName] = useState("");
  const [studentProgress, setStudentProgress] = useState([]);
  const [studentQuizAttempts, setStudentQuizAttempts] = useState([]);
  const [studentProgressError, setStudentProgressError] = useState("");
  const [studentProgressLoading, setStudentProgressLoading] = useState(false);
  const [selectedProgress, setSelectedProgress] = useState(null);
  const [selectedQuizAttempt, setSelectedQuizAttempt] = useState(null);
  const [quizGradeFeedback, setQuizGradeFeedback] = useState("");
  const [quizGrading, setQuizGrading] = useState(false);
  const [topics, setTopics] = useState([]);
  const [topicTitle, setTopicTitle] = useState("");
  const [topicError, setTopicError] = useState("");
  const [topicItemDrafts, setTopicItemDrafts] = useState({});
  const [editingTopicId, setEditingTopicId] = useState(null);
  const [editingTopicTitle, setEditingTopicTitle] = useState("");
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingItemTitle, setEditingItemTitle] = useState("");
  const [editingItemType, setEditingItemType] = useState("learning");
  const [editingItemBody, setEditingItemBody] = useState("");
  const [editingItemInstructions, setEditingItemInstructions] = useState("");
  const [editingItemCodeStarter, setEditingItemCodeStarter] = useState("");
  const [editingItemQuizSubtype, setEditingItemQuizSubtype] = useState("mcq");
  const [editingItemQuizQuestion, setEditingItemQuizQuestion] = useState("");
  const [editingItemQuizOptions, setEditingItemQuizOptions] = useState([]);
  const [editingItemQuizOptionInput, setEditingItemQuizOptionInput] = useState("");
  const [editingItemQuizOptionEditIndex, setEditingItemQuizOptionEditIndex] = useState(-1);
  const [editingItemQuizAnswer, setEditingItemQuizAnswer] = useState("");
  const [practiceMeta, setPracticeMeta] = useState(null);
  const [practiceError, setPracticeError] = useState("");
  const [quizMeta, setQuizMeta] = useState(null);
  const [quizError, setQuizError] = useState("");
  const [learningMeta, setLearningMeta] = useState(null);
  const [learningError, setLearningError] = useState("");
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizResponse, setQuizResponse] = useState("");
  const [quizAttempt, setQuizAttempt] = useState(null);
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [chatAnimDir, setChatAnimDir] = useState(null); // "expanding" | "collapsing" | "fadein" | null
  const [fabPos, setFabPos] = useState({ right: 24, bottom: 24 });
  const fabDraggingRef = useRef(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [copiedMsgIdx, setCopiedMsgIdx] = useState(null);
  const [importMcq, setImportMcq] = useState(null);
  const [importMcqTopicId, setImportMcqTopicId] = useState("");
  const [importMcqTitle, setImportMcqTitle] = useState("");
  const [importMcqSaving, setImportMcqSaving] = useState(false);
  const [importMcqError, setImportMcqError] = useState("");
  const [importMcqNewTopic, setImportMcqNewTopic] = useState("");
  const [importSa, setImportSa] = useState(null);
  const [importSaTopicId, setImportSaTopicId] = useState("");
  const [importSaSaving, setImportSaSaving] = useState(false);
  const [importSaError, setImportSaError] = useState("");
  const [importSaNewTopic, setImportSaNewTopic] = useState("");
  const [importPractice, setImportPractice] = useState(null);
  const [importPracticeTopicId, setImportPracticeTopicId] = useState("");
  const [importPracticeNewTopic, setImportPracticeNewTopic] = useState("");
  const [importPracticeSaving, setImportPracticeSaving] = useState(false);
  const [importPracticeError, setImportPracticeError] = useState("");
  const [importPlan, setImportPlan] = useState(null);
  const [importPlanSaving, setImportPlanSaving] = useState(false);
  const [importPlanError, setImportPlanError] = useState("");
  const [importLearning, setImportLearning] = useState(null);
  const [importLearningTopicId, setImportLearningTopicId] = useState("");
  const [importLearningNewTopic, setImportLearningNewTopic] = useState("");
  const [importLearningSaving, setImportLearningSaving] = useState(false);
  const [importLearningError, setImportLearningError] = useState("");
  const [testResults, setTestResults] = useState(null);
  const [testRunning, setTestRunning] = useState(false);
  const [errorExplanation, setErrorExplanation] = useState(null);
  const [errorExplaining, setErrorExplaining] = useState(false);
  const [dragOverItemId, setDragOverItemId] = useState(null);
  const dragItemRef = useRef(null);
  const dragFromHandleRef = useRef(false); // true only when drag started from the ⠿ handle
  const [dragOverTopicId, setDragOverTopicId] = useState(null);
  const dragTopicRef = useRef(null);
  const dragTopicFromHandleRef = useRef(false);

  const [pageTransition, setPageTransition] = useState("page-enter");
  const [practiceDraft, setPracticeDraft] = useState(() => ({
    id: createLessonId(),
    ...initialLesson,
    modelAnswer: "",
    testMode: false,
    testCases: [],
  }));


  const editorRef = useRef(null);
  const activeLessonIdRef = useRef(activeLessonId);
  const fallbackLessonRef = useRef({ id: createLessonId(), ...initialLesson });

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

  const activeClass = useMemo(() => {
    return classes.find((item) => item.id === activeClassId) || classes[0] || null;
  }, [classes, activeClassId]);

  const [lessonJson, setLessonJson] = useState(
    JSON.stringify(lesson, null, 2)
  );

  const codeStarterRef = useRef(lesson.codeStarter);

  const isClassRoute =
    route.page === "class" ||
    route.page === "lesson" ||
    route.page === "practice" ||
    route.page === "quiz";
  const isLessonRoute = route.page === "lesson" || route.page === "practice";

  useEffect(() => {
    setPageTransition("page-enter");
    const id = requestAnimationFrame(() =>
      setPageTransition("page-enter page-enter-active")
    );
    return () => cancelAnimationFrame(id);
  }, [route.page, route.classId, route.lessonId, route.studentId]);


  useEffect(() => {
    const handlePopState = () => {
      setRoute(parseRoute());
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);


  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function fetchClasses() {
      try {
        const res = await fetch(`${API_BASE}/classes`, {
          headers: { ...authHeaders() },
        });
        if (!res.ok) return;
        const data = await res.json();
        const apiClasses = data?.data?.classes;
        if (!apiClasses || cancelled) return;
        const mapped = apiClasses.map(mapClassFromApi);
        setClasses(mapped);
        if (route.page === "class") {
          const exists = mapped.some((item) => item.id === route.classId);
          if (!exists) {
            setClassError("Class not found.");
            navigateToClasses();
          }
        }
      } catch {
        // Ignore class loading errors for now.
      }
    }

    fetchClasses();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user || !activeClassId || route.page !== "class") {
      setClassStudents([]);
      return;
    }
    if (user.role !== "teacher") {
      setClassStudents([]);
      return;
    }
    let cancelled = false;

    async function fetchStudents() {
      try {
        const res = await fetch(`${API_BASE}/classes/${activeClassId}/students`, {
          headers: { ...authHeaders() },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setClassStudents(data?.data?.students || []);
      } catch {
        // Ignore student list errors.
      }
    }

    fetchStudents();
    return () => {
      cancelled = true;
    };
  }, [user, activeClassId, route.page, studentsRefreshKey]);

  useEffect(() => {
    if (!user || !activeClassId || route.page !== "class") {
      setTopics([]);
      return;
    }
    let cancelled = false;

    async function fetchTopics() {
      try {
        const res = await fetch(`${API_BASE}/classes/${activeClassId}/topics`, {
          headers: { ...authHeaders() },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setTopics(data?.data?.topics || []);
      } catch {
        // Ignore topic loading errors for now.
      }
    }

    fetchTopics();
    return () => {
      cancelled = true;
    };
  }, [user, activeClassId, route.page]);

  useEffect(() => {
    if (!user || !activeClassId || route.page !== "student" || !route.studentId) {
      setSelectedStudentName("");
      setStudentProgress([]);
      setStudentQuizAttempts([]);
      setStudentProgressError("");
      setStudentProgressLoading(false);
      setSelectedQuizAttempt(null);
      return;
    }
    let cancelled = false;
    setStudentProgressError("");
    setStudentProgressLoading(true);

    async function fetchStudentProgress() {
      try {
        const res = await fetch(
          `${API_BASE}/classes/${activeClassId}/students/${route.studentId}/progress`,
          { headers: { ...authHeaders() } }
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setStudentProgressError(data?.error?.message || "Unable to load progress.");
          setStudentProgress([]);
          setStudentQuizAttempts([]);
          return;
        }
        setStudentProgress(data?.data?.progress || []);
        setStudentQuizAttempts(data?.data?.quizAttempts || []);
        setSelectedProgress(null);
        setSelectedQuizAttempt(null);
        const fromApi = data?.data?.student?.name;
        if (fromApi) {
          setSelectedStudentName(fromApi);
        } else {
          const student = classStudents.find((item) => item.id === route.studentId);
          setSelectedStudentName(student?.name || "Student");
        }
      } catch {
        if (cancelled) return;
        setStudentProgressError("Unable to load progress.");
        setStudentProgress([]);
        setStudentQuizAttempts([]);
      } finally {
        if (!cancelled) setStudentProgressLoading(false);
      }
    }

    fetchStudentProgress();
    return () => {
      cancelled = true;
    };
  }, [user, activeClassId, route.page, route.studentId, classStudents]);

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
      setSelectedStudentId(null);
      setSelectedStudentName("");
      setStudentProgress([]);
      setTopicError("");
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
      setSelectedStudentId(route.studentId);
      setSelectedProgress(null);
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
          _itemId: item?.id || route.itemId,
          _topicId: item?.topic?.id || "",
        }));
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
    if (user.role === "teacher") {
      setViewRole("teacher");
    } else {
      setViewRole("student");
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
    if (!isLessonRoute || !activeClassId) return;
    let editor;
    let currentTheme = "vs-dark";

    const outputEl = document.getElementById("output");
    const runBtn = document.getElementById("run-btn");
    const themeBtn = document.getElementById("theme-toggle");
    const editorHost = document.getElementById("editor");
    if (!outputEl || !runBtn || !themeBtn || !editorHost) return;

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

    function toggleTheme() {
      if (currentTheme === "vs-dark") {
        currentTheme = "vs";
        editor?.setTheme("ace/theme/chrome");
        themeBtn.textContent = "Switch to Dark";
        document.body.style.background = "#ffffff";
        document.body.style.color = "#000000";
        outputEl.style.background = "#f3f3f3";
        outputEl.style.color = "#000000";
      } else {
        currentTheme = "vs-dark";
        editor?.setTheme("ace/theme/monokai");
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
      editor?.destroy();
    };
  }, [user, isLessonRoute, viewRole, activeClassId, route.page]);

  useEffect(() => {
    codeStarterRef.current = lesson.codeStarter;
    // On the practice page load the code starter for both teacher and student.
    // On regular lesson pages only sync for the teacher (students keep their own code).
    const shouldSync = viewRole === "teacher" || route.page === "practice";
    if (shouldSync && editorRef.current?.setValue) {
      editorRef.current.setValue(lesson.codeStarter || "", -1);
    }
  }, [lesson.codeStarter, viewRole, route.page]);

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

  function navigateToClasses() {
    window.history.pushState({}, "", "/classes");
    setRoute({ page: "classes", classId: null, lessonId: null, itemId: null, studentId: null });
  }

  function navigateToClass(id) {
    window.history.pushState({}, "", `/classes/${id}`);
    setRoute({ page: "class", classId: id, lessonId: null, itemId: null, studentId: null });
  }

  function navigateToLesson(classId, lessonId) {
    window.history.pushState({}, "", `/classes/${classId}/lessons/${lessonId}`);
    setRoute({ page: "lesson", classId, lessonId, itemId: null, studentId: null });
  }

  function navigateToStudent(classId, studentId) {
    window.history.pushState({}, "", `/classes/${classId}/students/${studentId}`);
    setRoute({ page: "student", classId, studentId, lessonId: null });
  }

  function navigateToPractice(classId, itemId) {
    window.history.pushState({}, "", `/classes/${classId}/practice/${itemId}`);
    setRoute({ page: "practice", classId, itemId, lessonId: null, studentId: null });
  }

  function navigateToQuiz(classId, itemId) {
    window.history.pushState({}, "", `/classes/${classId}/quiz/${itemId}`);
    setRoute({ page: "quiz", classId, itemId, lessonId: null, studentId: null });
  }

  function navigateToLearningItem(classId, itemId) {
    window.history.pushState({}, "", `/classes/${classId}/learn/${itemId}`);
    setRoute({ page: "learn", classId, itemId, lessonId: null, studentId: null });
  }

  function handleSelectClass(id) {
    if (user?.role === "teacher") {
      setViewRole("teacher");
    }
    navigateToClass(id);
  }

  async function handleCreateClass() {
    setClassError("");
    setClassNotice("");
    if (!className.trim()) {
      setClassError("Enter a class name.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/classes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ name: className.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setClassError(data?.error?.message || "Unable to create class.");
        return;
      }
      const created = mapClassFromApi(data?.data?.classroom);
      if (created) {
        setClasses((prev) => [created, ...prev]);
        setClassNotice(`Class created. Join code: ${created.joinCode}`);
        setClassName("");
        navigateToClass(created.id);
      }
    } catch {
      setClassError("Class server not reachable.");
    }
  }

  async function handleJoinClass() {
    setClassError("");
    setClassNotice("");
    if (!joinCode.trim()) {
      setClassError("Enter a join code.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/classes/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ joinCode: joinCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setClassError(data?.error?.message || "Unable to join class.");
        return;
      }
      const joined = mapClassFromApi(data?.data?.classroom);
      if (joined) {
        setClasses((prev) => {
          if (prev.some((item) => item.id === joined.id)) return prev;
          return [joined, ...prev];
        });
        setClassNotice("Class joined.");
        setJoinCode("");
        navigateToClass(joined.id);
      }
    } catch {
      setClassError("Class server not reachable.");
    }
  }

  async function handleDeleteClass() {
    if (!activeClassId) return;
    if (!window.confirm("Delete this class and all its lessons?")) return;
    setClassError("");
    setClassNotice("");
    try {
      const res = await fetch(`${API_BASE}/classes/${activeClassId}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      });
      if (!res.ok) {
        const data = await res.json();
        setClassError(data?.error?.message || "Unable to delete class.");
        return;
      }
      setClasses((prev) => prev.filter((item) => item.id !== activeClassId));
      setLessons([]);
      setActiveLessonId(null);
      navigateToClasses();
    } catch {
      setClassError("Class server not reachable.");
    }
  }

  function handleRefreshStudents() {
    setStudentsRefreshKey((prev) => prev + 1);
  }

  async function handleCreateTopic() {
    if (!activeClassId) return;
    setTopicError("");
    if (!topicTitle.trim()) {
      setTopicError("Enter a topic title.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/classes/${activeClassId}/topics`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ title: topicTitle.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTopicError(data?.error?.message || "Unable to create topic.");
        return;
      }
      const created = data?.data?.topic;
      if (created) {
        setTopics((prev) => [created, ...prev]);
        setTopicTitle("");
      }
    } catch {
      setTopicError("Topic server not reachable.");
    }
  }

  function updateTopicDraft(topicId, updater) {
    setTopicItemDrafts((prev) => {
      const current = prev[topicId] || createTopicItemDraft();
      const next = typeof updater === "function" ? updater(current) : { ...current, ...updater };
      return { ...prev, [topicId]: next };
    });
  }

  async function handleCreateTopicItem(topicId) {
    if (!activeClassId || !topicId) return;
    const draft = topicItemDrafts[topicId] || createTopicItemDraft();
    if (!draft.title.trim()) {
      setTopicError("Enter a title for the topic item.");
      return;
    }
    if (draft.type === "quiz" && !draft.quizQuestion.trim()) {
      setTopicError("Enter a quiz question.");
      return;
    }
    if (
      draft.type === "quiz" &&
      draft.quizSubtype === "mcq" &&
      (draft.quizOptions || []).length < 2
    ) {
      setTopicError("MCQ needs at least two options.");
      return;
    }
    if (draft.type === "quiz" && !draft.quizAnswer.trim()) {
      setTopicError("Set the expected answer.");
      return;
    }
    setTopicError("");
    const payload = {
      title: draft.title.trim(),
      type: draft.type,
    };
    if (draft.type === "quiz") {
      payload.quizSubtype = draft.quizSubtype;
      payload.quizQuestion = draft.quizQuestion.trim();
      payload.quizOptions = draft.quizSubtype === "mcq" ? (draft.quizOptions || []) : [];
      payload.quizAnswer = draft.quizAnswer.trim();
    }
    try {
      const res = await fetch(
        `${API_BASE}/classes/${activeClassId}/topics/${topicId}/items`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setTopicError(data?.error?.message || "Unable to add item.");
        return;
      }
      const created = data?.data?.item;
      if (created) {
        setTopics((prev) =>
          prev.map((topic) =>
            topic.id === topicId
              ? {
                  ...topic,
                  items: [...(topic.items || []), created].sort(
                    (a, b) =>
                      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                  ),
                }
              : topic
          )
        );
        updateTopicDraft(topicId, createTopicItemDraft({ type: draft.type }));
      }
    } catch {
      setTopicError("Topic item server not reachable.");
    }
  }

  function beginEditTopic(topic) {
    setEditingTopicId(topic.id);
    setEditingTopicTitle(topic.title);
  }

  async function saveEditTopic(topicId) {
    if (!activeClassId || !topicId) return;
    if (!editingTopicTitle.trim()) {
      setTopicError("Topic title is required.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/classes/${activeClassId}/topics/${topicId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ title: editingTopicTitle.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTopicError(data?.error?.message || "Unable to update topic.");
        return;
      }
      const updated = data?.data?.topic;
      if (updated) {
        setTopics((prev) =>
          prev.map((topic) =>
            topic.id === topicId ? { ...topic, title: updated.title } : topic
          )
        );
      }
      setEditingTopicId(null);
      setEditingTopicTitle("");
      setTopicError("");
    } catch {
      setTopicError("Topic server not reachable.");
    }
  }

  async function deleteTopic(topicId) {
    if (!activeClassId || !topicId) return;
    const warn =
      classStudents.length > 0
        ? "Students are enrolled. Deleting this topic will remove it for all students. Continue?"
        : "Delete this topic?";
    if (!window.confirm(warn)) return;
    try {
      const res = await fetch(`${API_BASE}/classes/${activeClassId}/topics/${topicId}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      });
      if (!res.ok) {
        const data = await res.json();
        setTopicError(data?.error?.message || "Unable to delete topic.");
        return;
      }
      setTopics((prev) => prev.filter((topic) => topic.id !== topicId));
    } catch {
      setTopicError("Topic server not reachable.");
    }
  }

  function beginEditItem(item) {
    setEditingItemId(item.id);
    setEditingItemTitle(item.title);
    setEditingItemType(item.type);
    setEditingItemBody(item.practiceBody || "");
    setEditingItemInstructions(item.practiceInstructions || "");
    setEditingItemCodeStarter(item.practiceCodeStarter || "");
    setEditingItemQuizSubtype(item.quizSubtype || "mcq");
    setEditingItemQuizQuestion(item.quizQuestion || "");
    setEditingItemQuizOptions(Array.isArray(item.quizOptions) ? item.quizOptions : []);
    setEditingItemQuizOptionInput("");
    setEditingItemQuizOptionEditIndex(-1);
    setEditingItemQuizAnswer(item.quizAnswer || "");
  }

  async function saveEditItem(topicId, itemId) {
    if (!activeClassId || !topicId || !itemId) return;
    if (!editingItemTitle.trim()) {
      setTopicError("Item title is required.");
      return;
    }
    if (editingItemType === "quiz" && !editingItemQuizQuestion.trim()) {
      setTopicError("Quiz question is required.");
      return;
    }
    if (
      editingItemType === "quiz" &&
      editingItemQuizSubtype === "mcq" &&
      editingItemQuizOptions.length < 2
    ) {
      setTopicError("MCQ needs at least two options.");
      return;
    }
    if (editingItemType === "quiz" && !editingItemQuizAnswer.trim()) {
      setTopicError("Set the expected answer.");
      return;
    }
    const payload = {
      title: editingItemTitle.trim(),
      type: editingItemType,
    };
    if (editingItemType === "learning") {
      payload.practiceBody         = editingItemBody;
      payload.practiceInstructions = editingItemInstructions;
      payload.practiceCodeStarter  = editingItemCodeStarter;
    }
    if (editingItemType === "quiz") {
      payload.quizSubtype = editingItemQuizSubtype;
      payload.quizQuestion = editingItemQuizQuestion.trim();
      payload.quizOptions = editingItemQuizSubtype === "mcq" ? editingItemQuizOptions : [];
      payload.quizAnswer = editingItemQuizAnswer.trim();
    }
    try {
      const res = await fetch(
        `${API_BASE}/classes/${activeClassId}/topics/${topicId}/items/${itemId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setTopicError(data?.error?.message || "Unable to update item.");
        return;
      }
      const updated = data?.data?.item;
      if (updated) {
        setTopics((prev) =>
          prev.map((topic) =>
            topic.id === topicId
              ? {
                  ...topic,
                  items: (topic.items || []).map((item) =>
                    item.id === itemId ? { ...item, ...updated } : item
                  ),
                }
              : topic
          )
        );
      }
      setEditingItemId(null);
      setEditingItemTitle("");
      setEditingItemType("learning");
      setEditingItemBody("");
      setEditingItemInstructions("");
      setEditingItemCodeStarter("");
      setEditingItemQuizSubtype("mcq");
      setEditingItemQuizQuestion("");
      setEditingItemQuizOptions([]);
      setEditingItemQuizOptionInput("");
      setEditingItemQuizOptionEditIndex(-1);
      setEditingItemQuizAnswer("");
      setTopicError("");
    } catch {
      setTopicError("Item server not reachable.");
    }
  }

  async function handleItemReorder(topicId, draggedId, targetId) {
    if (draggedId === targetId) return;

    // Compute reordered list upfront from current state snapshot (don't rely on
    // setState updater being called synchronously in React 18 batching mode).
    const currentTopic = topics.find((t) => t.id === topicId);
    if (!currentTopic) return;
    const items = [...(currentTopic.items || [])];
    const fromIdx = items.findIndex((i) => i.id === draggedId);
    const toIdx = items.findIndex((i) => i.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);

    // Optimistic UI update
    setTopics((prev) =>
      prev.map((t) => (t.id === topicId ? { ...t, items } : t))
    );

    // Persist to backend
    try {
      const res = await fetch(
        `${API_BASE}/classes/${activeClassId}/topics/${topicId}/items/reorder`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ itemIds: items.map((i) => i.id) }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("Reorder failed:", res.status, data);
        setToast({ type: "error", message: `Reorder failed (${res.status}): ${data?.error?.message || "unknown error"}` });
      }
    } catch (err) {
      console.error("Reorder network error:", err);
      setToast({ type: "error", message: "Reorder failed: network error" });
    }
  }

  async function handleTopicReorder(draggedId, targetId) {
    if (draggedId === targetId) return;
    const reordered = [...topics];
    const fromIdx = reordered.findIndex((t) => t.id === draggedId);
    const toIdx = reordered.findIndex((t) => t.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    setTopics(reordered);

    try {
      const res = await fetch(`${API_BASE}/classes/${activeClassId}/topics/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ topicIds: reordered.map((t) => t.id) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setToast({ type: "error", message: `Reorder failed (${res.status}): ${data?.error?.message || "unknown error"}` });
      }
    } catch (err) {
      console.error("Topic reorder network error:", err);
      setToast({ type: "error", message: "Reorder failed: network error" });
    }
  }

  async function deleteItem(topicId, itemId) {
    if (!activeClassId || !topicId || !itemId) return;
    const warn =
      classStudents.length > 0
        ? "Students are enrolled. Deleting this item will remove it for all students. Continue?"
        : "Delete this item?";
    if (!window.confirm(warn)) return;
    try {
      const res = await fetch(
        `${API_BASE}/classes/${activeClassId}/topics/${topicId}/items/${itemId}`,
        {
          method: "DELETE",
          headers: { ...authHeaders() },
        }
      );
      if (!res.ok) {
        const data = await res.json();
        setTopicError(data?.error?.message || "Unable to delete item.");
        return;
      }
      setTopics((prev) =>
        prev.map((topic) =>
          topic.id === topicId
            ? { ...topic, items: (topic.items || []).filter((item) => item.id !== itemId) }
            : topic
        )
      );
    } catch {
      setTopicError("Item server not reachable.");
    }
  }

  function handleSelectStudent(student) {
    if (!activeClassId || !student?.id) return;
    setSelectedStudentName(student.name || "Student");
    navigateToStudent(activeClassId, student.id);
  }

  function handleAddLesson() {
    if (!activeClassId) {
      setClassError("Select a class before creating lessons.");
      return;
    }
    const newLesson = {
      id: createLessonId(),
      classId: activeClassId,
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
          body: JSON.stringify({ ...newLesson, classId: activeClassId }),
        });
        if (!res.ok) throw new Error("create_failed");
        const data = await res.json();
        const created = mapLessonFromApi(data?.data?.lesson);
        if (!created) throw new Error("create_failed");
        setLessons((prev) => [created, ...prev]);
        if (route.page === "lesson") {
          setActiveLessonId(created.id);
          navigateToLesson(activeClassId, created.id);
        }
      } catch {
        setLessons((prev) => [newLesson, ...prev]);
        if (route.page === "lesson") {
          setActiveLessonId(newLesson.id);
          navigateToLesson(activeClassId, newLesson.id);
        }
      } finally {
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
    setClasses([]);
    setActiveClassId(null);
    setClassError("");
    setClassNotice("");
    setJoinCode("");
    setClassName("");
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
      setQuizAttempt(data?.data?.attempt || null);
      setToast({ type: "success", message: "Quiz submitted" });
    } catch {
      setQuizError("Unable to submit quiz.");
    } finally {
      setQuizSubmitting(false);
    }
  }

  async function gradeSelectedQuizAttempt(isCorrect) {
    if (!activeClassId || !route.studentId || !selectedQuizAttempt) return;
    setQuizGrading(true);
    setStudentProgressError("");
    try {
      const res = await fetch(
        `${API_BASE}/classes/${activeClassId}/students/${route.studentId}/quiz-attempts/${selectedQuizAttempt.id}/grade`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify({
            isCorrect,
            feedback: quizGradeFeedback.trim(),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setStudentProgressError(data?.error?.message || "Unable to grade quiz attempt.");
        return;
      }
      const updated = data?.data?.attempt;
      if (!updated) return;
      setStudentQuizAttempts((prev) =>
        prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item))
      );
      setSelectedQuizAttempt((prev) => (prev ? { ...prev, ...updated } : prev));
      setToast({ type: "success", message: "Quiz graded" });
    } catch {
      setStudentProgressError("Unable to grade quiz attempt.");
    } finally {
      setQuizGrading(false);
    }
  }

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  const chatMessagesEndRef = useRef(null);

  useEffect(() => {
    if (chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  async function sendChatMessage() {
    if (!chatInput.trim() || chatLoading) return;

    const userMessage = { role: "user", content: chatInput.trim() };
    const updatedMessages = [...chatMessages, userMessage];
    setChatMessages(updatedMessages);
    setChatInput("");
    setChatLoading(true);
    setChatError("");

    // Build context from current app state
    const context = {};
    if (activeClassId) {
      context.classId = activeClassId;
      context.className = activeClass?.name || "";
    }
    if (activeLessonId) {
      context.lessonId = activeLessonId;
    }

    // Get code from Monaco editor
    if (editorRef.current) {
      try {
        context.studentCode = editorRef.current.getValue();
      } catch {
        // Editor not available
      }
    }

    // Get console output
    const outputEl = document.getElementById("output");
    if (outputEl && outputEl.textContent) {
      context.codeOutput = outputEl.textContent;
    }

    // Teacher: include topics list
    if (user.role === "teacher" && topics.length > 0) {
      context.topics = topics.map((t) => t.title).join(", ");
    }

    try {
      const res = await fetch(API_BASE + "/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          context,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.error?.message || "Chat request failed");
      }

      // Read SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

      // Add empty assistant message to update incrementally
      setChatMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.done) break;
              if (data.error) throw new Error(data.error);
              if (data.content) {
                assistantContent += data.content;
                setChatMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: assistantContent,
                  };
                  return updated;
                });
              }
            } catch (parseErr) {
              if (parseErr.message && parseErr.message !== "Unexpected end of JSON input") {
                throw parseErr;
              }
            }
          }
        }
      }
    } catch (err) {
      setChatError(err.message);
    } finally {
      setChatLoading(false);
    }
  }

  function clearChat() {
    setChatMessages([]);
    setChatError("");
  }

  async function handleImportMcqSave() {
    if (!activeClassId || !importMcq) return;
    setImportMcqError("");
    if (!importMcqTitle.trim()) { setImportMcqError("Title is required."); return; }
    if (!importMcq.question.trim()) { setImportMcqError("Question is required."); return; }
    const validOptions = importMcq.options.filter(Boolean);
    if (validOptions.length < 2) { setImportMcqError("Need at least 2 options."); return; }
    if (!importMcq.answer) { setImportMcqError("Select the correct answer."); return; }

    setImportMcqSaving(true);
    let topicId = importMcqTopicId;

    try {
      if (topicId === "__new__") {
        if (!importMcqNewTopic.trim()) {
          setImportMcqError("Enter new topic title.");
          setImportMcqSaving(false);
          return;
        }
        const res = await fetch(`${API_BASE}/classes/${activeClassId}/topics`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ title: importMcqNewTopic.trim() }),
        });
        const data = await res.json();
        if (!res.ok) {
          setImportMcqError(data?.error?.message || "Failed to create topic.");
          setImportMcqSaving(false);
          return;
        }
        const created = data?.data?.topic;
        topicId = created.id || created._id;
        setTopics((prev) => [created, ...prev]);
      }

      // Map letter answer (A/B/C/D) to the full option text for auto-grading compatibility
      const answerIndex = "ABCDEFGHIJ".indexOf(importMcq.answer.toUpperCase());
      const quizAnswer = answerIndex >= 0 && answerIndex < validOptions.length
        ? validOptions[answerIndex]
        : importMcq.answer;

      const res = await fetch(
        `${API_BASE}/classes/${activeClassId}/topics/${topicId}/items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            title: importMcqTitle.trim(),
            type: "quiz",
            quizSubtype: "mcq",
            quizQuestion: importMcq.question.trim(),
            quizOptions: validOptions,
            quizAnswer,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setImportMcqError(data?.error?.message || "Failed to save quiz.");
        setImportMcqSaving(false);
        return;
      }
      const item = data?.data?.item;
      if (item) {
        setTopics((prev) =>
          prev.map((topic) =>
            topic.id === topicId
              ? { ...topic, items: [...(topic.items || []), item].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) }
              : topic
          )
        );
      }
      setImportMcq(null);
      setToast({ type: "success", message: "MCQ imported as quiz!" });
    } catch {
      setImportMcqError("Server not reachable.");
    } finally {
      setImportMcqSaving(false);
    }
  }

  function renderImportMcqModal() {
    if (!importMcq) return null;
    return (
      <div className="modal-overlay" onClick={() => setImportMcq(null)}>
        <div className="modal-content mcq-modal" onClick={(e) => e.stopPropagation()}>

          {/* Indigo header */}
          <div className="mcq-modal-header">
            <div>
              <p className="mcq-modal-eyebrow">AI Generated</p>
              <h3 className="mcq-modal-title">Import MCQ Question</h3>
            </div>
            <button type="button" className="mcq-modal-close" onClick={() => setImportMcq(null)}>✕</button>
          </div>

          <div className="mcq-modal-body">
            {importMcqError && <p className="mcq-modal-error">{importMcqError}</p>}

            <label>Question Title</label>
            <input
              value={importMcqTitle}
              onChange={(e) => setImportMcqTitle(e.target.value)}
              placeholder="Short label, e.g. Loop Basics"
            />

            <label>Question</label>
            <textarea
              value={importMcq.question}
              onChange={(e) => setImportMcq({ ...importMcq, question: e.target.value })}
              rows={3}
            />

            <label>
              Options
              <span className="mcq-label-hint"> — tap a badge to mark the correct answer</span>
            </label>
            {importMcq.options.length < 2 && (
              <p className="mcq-warning">A quiz needs at least 2 options.</p>
            )}
            {importMcq.options.map((opt, idx) => {
              const letter = String.fromCharCode(65 + idx);
              const isCorrect = importMcq.answer === letter;
              return (
                <div key={idx} className={`mcq-option-row${isCorrect ? " mcq-option-correct" : ""}`}>
                  <button
                    type="button"
                    className="mcq-letter-badge"
                    title={isCorrect ? "Correct answer" : `Mark ${letter} as correct`}
                    onClick={() => setImportMcq({ ...importMcq, answer: letter })}
                  >
                    {letter}
                  </button>
                  <input
                    className="mcq-option-input"
                    value={opt}
                    placeholder={`Option ${letter}`}
                    onChange={(e) => {
                      const next = [...importMcq.options];
                      next[idx] = e.target.value;
                      setImportMcq({ ...importMcq, options: next });
                    }}
                  />
                  {importMcq.options.length > 2 && (
                    <button
                      type="button"
                      className="mcq-option-remove"
                      title="Remove option"
                      onClick={() => {
                        const next = importMcq.options.filter((_, i) => i !== idx);
                        const answerIdx = "ABCDEFGHIJ".indexOf(importMcq.answer);
                        let newAnswer = importMcq.answer;
                        if (idx === answerIdx) newAnswer = "A";
                        else if (idx < answerIdx) newAnswer = String.fromCharCode(64 + answerIdx);
                        setImportMcq({ ...importMcq, options: next, answer: newAnswer });
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              className="mcq-add-option"
              onClick={() => setImportMcq({ ...importMcq, options: [...importMcq.options, ""] })}
            >
              + Add Option
            </button>

            {importMcq.explanation && (
              <div className="mcq-explanation-callout">
                <strong>Explanation:</strong> {importMcq.explanation}
              </div>
            )}

            <label>Save to Topic</label>
            <select
              value={importMcqTopicId}
              onChange={(e) => setImportMcqTopicId(e.target.value)}
            >
              {topics.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
              <option value="__new__">+ Create new topic...</option>
            </select>
            {importMcqTopicId === "__new__" && (
              <input
                placeholder="New topic title"
                value={importMcqNewTopic}
                onChange={(e) => setImportMcqNewTopic(e.target.value)}
                style={{ marginTop: 6 }}
              />
            )}
          </div>

          <div className="mcq-modal-footer">
            <button className="primary-button" disabled={importMcqSaving} onClick={handleImportMcqSave}>
              {importMcqSaving ? "Saving..." : "Save Quiz"}
            </button>
            <button className="ghost-button" onClick={() => setImportMcq(null)}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  async function handleImportSaSave() {
    if (!activeClassId || !importSa) return;
    setImportSaError("");
    const question = importSa.questions?.[0];
    if (!question?.question?.trim()) { setImportSaError("Question text is required."); return; }
    if (!question?.answer?.trim()) { setImportSaError("Expected answer is required."); return; }

    setImportSaSaving(true);
    let topicId = importSaTopicId;

    try {
      if (topicId === "__new__") {
        if (!importSaNewTopic.trim()) {
          setImportSaError("Enter new topic title.");
          setImportSaSaving(false);
          return;
        }
        const res = await fetch(`${API_BASE}/classes/${activeClassId}/topics`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ title: importSaNewTopic.trim() }),
        });
        const data = await res.json();
        if (!res.ok) {
          setImportSaError(data?.error?.message || "Failed to create topic.");
          setImportSaSaving(false);
          return;
        }
        const created = data?.data?.topic;
        topicId = created.id || created._id;
        setTopics((prev) => [created, ...prev]);
      }

      const res = await fetch(
        `${API_BASE}/classes/${activeClassId}/topics/${topicId}/items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            title: (question.title || "").trim() || question.question.trim().slice(0, 60),
            type: "quiz",
            quizSubtype: "short_answer",
            quizQuestion: question.question.trim(),
            quizAnswer: question.answer.trim(),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setImportSaError(data?.error?.message || "Failed to save quiz.");
        setImportSaSaving(false);
        return;
      }
      const item = data?.data?.item;
      if (item) {
        setTopics((prev) =>
          prev.map((topic) =>
            topic.id === topicId
              ? { ...topic, items: [...(topic.items || []), item].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) }
              : topic
          )
        );
      }
      setImportSa(null);
      setToast({ type: "success", message: "Short-answer question imported!" });
    } catch {
      setImportSaError("Server not reachable.");
    } finally {
      setImportSaSaving(false);
    }
  }

  function renderImportSaModal() {
    if (!importSa) return null;
    const question = importSa.questions?.[0];
    if (!question) return null;
    return (
      <div className="modal-overlay" onClick={() => setImportSa(null)}>
        <div className="modal-content mcq-modal" onClick={(e) => e.stopPropagation()}>

          {/* Indigo header */}
          <div className="mcq-modal-header">
            <div>
              <p className="mcq-modal-eyebrow">AI Generated</p>
              <h3 className="mcq-modal-title">Import Short Answer Question</h3>
            </div>
            <button type="button" className="mcq-modal-close" onClick={() => setImportSa(null)}>✕</button>
          </div>

          <div className="mcq-modal-body">
            {importSaError && <p className="mcq-modal-error">{importSaError}</p>}

            <label>Question Title</label>
            <input
              value={question.title || ""}
              onChange={(e) => {
                const next = [...(importSa.questions || [])];
                next[0] = { ...question, title: e.target.value };
                setImportSa({ ...importSa, questions: next });
              }}
              placeholder="Short label, e.g. Variable Types"
            />

            <label>Question</label>
            <textarea
              value={question.question || ""}
              onChange={(e) => {
                const next = [...(importSa.questions || [])];
                next[0] = { ...question, question: e.target.value };
                setImportSa({ ...importSa, questions: next });
              }}
              rows={3}
            />

            <label>Expected Answer</label>
            <textarea
              value={question.answer || ""}
              onChange={(e) => {
                const next = [...(importSa.questions || [])];
                next[0] = { ...question, answer: e.target.value };
                setImportSa({ ...importSa, questions: next });
              }}
              rows={2}
            />

            {question.gradingCriteria && (
              <div className="mcq-explanation-callout">
                <strong>Grading criteria:</strong> {question.gradingCriteria}
              </div>
            )}

            <label>Save to Topic</label>
            <select
              value={importSaTopicId}
              onChange={(e) => setImportSaTopicId(e.target.value)}
            >
              {topics.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
              <option value="__new__">+ Create new topic...</option>
            </select>
            {importSaTopicId === "__new__" && (
              <input
                placeholder="New topic title"
                value={importSaNewTopic}
                onChange={(e) => setImportSaNewTopic(e.target.value)}
                style={{ marginTop: 6 }}
              />
            )}
          </div>

          <div className="mcq-modal-footer">
            <button className="primary-button" disabled={importSaSaving} onClick={handleImportSaSave}>
              {importSaSaving ? "Saving..." : "Save Quiz"}
            </button>
            <button className="ghost-button" onClick={() => setImportSa(null)}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  async function handleImportPracticeSave() {
    if (!activeClassId || !importPractice) return;
    setImportPracticeError("");
    if (!importPractice.title.trim()) { setImportPracticeError("Title is required."); return; }
    if (!importPractice.instructions.trim()) { setImportPracticeError("Instructions are required."); return; }

    setImportPracticeSaving(true);
    let topicId = importPracticeTopicId;

    try {
      if (topicId === "__new__") {
        if (!importPracticeNewTopic.trim()) {
          setImportPracticeError("Enter new topic title.");
          setImportPracticeSaving(false);
          return;
        }
        const res = await fetch(`${API_BASE}/classes/${activeClassId}/topics`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ title: importPracticeNewTopic.trim() }),
        });
        const data = await res.json();
        if (!res.ok) {
          setImportPracticeError(data?.error?.message || "Failed to create topic.");
          setImportPracticeSaving(false);
          return;
        }
        const created = data?.data?.topic;
        topicId = created.id || created._id;
        setTopics((prev) => [created, ...prev]);
      }

      const res = await fetch(
        `${API_BASE}/classes/${activeClassId}/topics/${topicId}/items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            title: importPractice.title.trim(),
            type: "practice",
            practiceBody: importPractice.body,
            practiceInstructions: importPractice.instructions,
            practiceHints: importPractice.hints,
            practiceCodeStarter: importPractice.codeStarter,
            practiceModelAnswer: importPractice.modelAnswer,
            practiceTestMode: !!importPractice.testMode,
            practiceTestCases: Array.isArray(importPractice.testCases) ? importPractice.testCases : [],
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setImportPracticeError(data?.error?.message || "Failed to save exercise.");
        setImportPracticeSaving(false);
        return;
      }
      const item = data?.data?.item;
      if (item) {
        setTopics((prev) =>
          prev.map((topic) =>
            topic.id === topicId
              ? { ...topic, items: [...(topic.items || []), item].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) }
              : topic
          )
        );
      }
      setImportPractice(null);
      setToast({ type: "success", message: "Coding exercise imported!" });
    } catch {
      setImportPracticeError("Server not reachable.");
    } finally {
      setImportPracticeSaving(false);
    }
  }

  function renderImportPracticeModal() {
    if (!importPractice) return null;
    return (
      <div className="modal-overlay" onClick={() => setImportPractice(null)}>
        <div className="modal-content mcq-modal" onClick={(e) => e.stopPropagation()}>

          <div className="mcq-modal-header">
            <div>
              <p className="mcq-modal-eyebrow">AI Generated</p>
              <h3 className="mcq-modal-title">Import Coding Exercise</h3>
            </div>
            <button type="button" className="mcq-modal-close" onClick={() => setImportPractice(null)}>✕</button>
          </div>

          <div className="mcq-modal-body">
            {importPracticeError && <p className="mcq-modal-error">{importPracticeError}</p>}

            <label>Exercise Title</label>
            <input
              value={importPractice.title}
              onChange={(e) => setImportPractice({ ...importPractice, title: e.target.value })}
              placeholder="Short label, e.g. For Loop Practice"
            />

            <label>Body / Theory</label>
            <textarea
              value={importPractice.body}
              onChange={(e) => setImportPractice({ ...importPractice, body: e.target.value })}
              rows={3}
            />

            <label>Instructions</label>
            <textarea
              value={importPractice.instructions}
              onChange={(e) => setImportPractice({ ...importPractice, instructions: e.target.value })}
              rows={2}
            />

            <label>Hints (one per line)</label>
            <textarea
              value={importPractice.hints.join("\n")}
              onChange={(e) =>
                setImportPractice({
                  ...importPractice,
                  hints: e.target.value.split("\n").map((h) => h.trim()).filter(Boolean),
                })
              }
              rows={3}
            />

            <label>Code Starter</label>
            <textarea
              className="practice-modal-code"
              value={importPractice.codeStarter}
              onChange={(e) => setImportPractice({ ...importPractice, codeStarter: e.target.value })}
              rows={4}
              spellCheck={false}
            />

            <label>
              Model Answer{" "}
              <span className="teacher-only-badge">Teacher only</span>
            </label>
            <textarea
              className="practice-modal-code"
              value={importPractice.modelAnswer}
              onChange={(e) => setImportPractice({ ...importPractice, modelAnswer: e.target.value })}
              rows={4}
              spellCheck={false}
            />

            <div className="import-test-cases-section">
              <label className="test-cases-toggle" style={{ marginBottom: "0.5rem" }}>
                <input
                  type="checkbox"
                  checked={!!importPractice.testMode}
                  onChange={(e) => setImportPractice({ ...importPractice, testMode: e.target.checked })}
                />
                <span>LeetCode-style test cases</span>
                {importPractice.testMode && importPractice.testCases?.length > 0 && (
                  <span className="teacher-only-badge" style={{ marginLeft: 8 }}>
                    {importPractice.testCases.length} AI-generated
                  </span>
                )}
              </label>
              {importPractice.testMode && (
                <>
                  {(importPractice.testCases || []).map((tc, i) => (
                    <div key={i} className="import-test-case-row">
                      <div className="import-test-case-header">
                        <input
                          placeholder={`Test ${i + 1} label`}
                          value={tc.label || ""}
                          onChange={(e) => {
                            const next = [...importPractice.testCases];
                            next[i] = { ...tc, label: e.target.value };
                            setImportPractice({ ...importPractice, testCases: next });
                          }}
                        />
                        <button
                          type="button"
                          className="test-case-remove"
                          onClick={() => {
                            const next = importPractice.testCases.filter((_, idx) => idx !== i);
                            setImportPractice({ ...importPractice, testCases: next });
                          }}
                        >✕</button>
                      </div>
                      <div className="test-case-fields">
                        <textarea
                          className="test-case-input practice-modal-code"
                          placeholder="Input (one value per line, leave empty if none)"
                          value={tc.input || ""}
                          rows={2}
                          onChange={(e) => {
                            const next = [...importPractice.testCases];
                            next[i] = { ...tc, input: e.target.value };
                            setImportPractice({ ...importPractice, testCases: next });
                          }}
                        />
                        <textarea
                          className="test-case-expected practice-modal-code"
                          placeholder="Expected output"
                          value={tc.expectedOutput || ""}
                          rows={2}
                          onChange={(e) => {
                            const next = [...importPractice.testCases];
                            next[i] = { ...tc, expectedOutput: e.target.value };
                            setImportPractice({ ...importPractice, testCases: next });
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="ghost-button test-case-add"
                    onClick={() =>
                      setImportPractice({
                        ...importPractice,
                        testCases: [...(importPractice.testCases || []), { label: "", input: "", expectedOutput: "" }],
                      })
                    }
                  >
                    + Add Test Case
                  </button>
                </>
              )}
            </div>

            <label>Save to Topic</label>
            <select
              value={importPracticeTopicId}
              onChange={(e) => setImportPracticeTopicId(e.target.value)}
            >
              {topics.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
              <option value="__new__">+ Create new topic...</option>
            </select>
            {importPracticeTopicId === "__new__" && (
              <input
                placeholder="New topic title"
                value={importPracticeNewTopic}
                onChange={(e) => setImportPracticeNewTopic(e.target.value)}
                style={{ marginTop: 6 }}
              />
            )}
          </div>

          <div className="mcq-modal-footer">
            <button className="primary-button" disabled={importPracticeSaving} onClick={handleImportPracticeSave}>
              {importPracticeSaving ? "Saving..." : "Save Exercise"}
            </button>
            <button className="ghost-button" onClick={() => setImportPractice(null)}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  async function handleImportPlanSave() {
    if (!activeClassId || !importPlan) return;
    setImportPlanError("");
    if (!importPlan.planTitle?.trim()) { setImportPlanError("Plan title is required."); return; }
    if (!importPlan.topics?.length) { setImportPlanError("Plan has no topics."); return; }
    setImportPlanSaving(true);
    try {
      for (const topic of importPlan.topics) {
        const topicRes = await fetch(`${API_BASE}/classes/${activeClassId}/topics`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ title: topic.title }),
        });
        const topicData = await topicRes.json();
        if (!topicRes.ok) { setImportPlanError(topicData?.error?.message || "Failed to create topic."); setImportPlanSaving(false); return; }
        const createdTopic = topicData?.data?.topic;
        const topicId = createdTopic?.id || createdTopic?._id;
        setTopics((prev) => [...prev, createdTopic]);
        for (const item of (topic.items || [])) {
          const answerIndex = "ABCDEFGHIJ".indexOf((item.quizAnswer || "").toUpperCase());
          const quizAnswer = item.quizSubtype === "mcq" && answerIndex >= 0 && Array.isArray(item.quizOptions) && answerIndex < item.quizOptions.length
            ? item.quizOptions[answerIndex]
            : item.quizAnswer || "";
          const itemRes = await fetch(`${API_BASE}/classes/${activeClassId}/topics/${topicId}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({
              title: item.title || "Untitled",
              type: item.type,
              quizSubtype: item.quizSubtype || null,
              quizQuestion: item.quizSubtype
                ? (item.codeSnippet ? `${item.quizQuestion}\n\`\`\`python\n${item.codeSnippet}\n\`\`\`` : item.quizQuestion || "")
                : undefined,
              quizOptions: item.quizOptions || [],
              quizAnswer,
              practiceBody: item.body || "",
              practiceInstructions: item.instructions || "",
              practiceHints: Array.isArray(item.hints) ? item.hints : [],
              practiceCodeStarter: item.codeStarter || "",
              practiceModelAnswer: item.modelAnswer || "",
              practiceTestMode: !!item.testMode,
              practiceTestCases: Array.isArray(item.testCases) ? item.testCases : [],
            }),
          });
          const itemData = await itemRes.json();
          if (itemRes.ok && itemData?.data?.item) {
            setTopics((prev) =>
              prev.map((t) =>
                (t.id === topicId || t._id?.toString() === topicId)
                  ? { ...t, items: [...(t.items || []), itemData.data.item] }
                  : t
              )
            );
          }
        }
      }
      setImportPlan(null);
      setToast({ type: "success", message: "Lesson plan imported!" });
    } catch {
      setImportPlanError("Server not reachable.");
    } finally {
      setImportPlanSaving(false);
    }
  }

  function renderImportPlanModal() {
    if (!importPlan) return null;
    return (
      <div className="modal-overlay" onClick={() => setImportPlan(null)}>
        <div className="modal-content mcq-modal plan-modal" onClick={(e) => e.stopPropagation()}>
          <div className="mcq-modal-header">
            <div>
              <p className="mcq-modal-eyebrow">AI Generated</p>
              <h3 className="mcq-modal-title">Import Lesson Plan</h3>
            </div>
            <button type="button" className="mcq-modal-close" onClick={() => setImportPlan(null)}>✕</button>
          </div>
          <div className="mcq-modal-body">
            {importPlanError && <p className="mcq-modal-error">{importPlanError}</p>}
            <label>Plan Title</label>
            <input
              value={importPlan.planTitle}
              onChange={(e) => setImportPlan({ ...importPlan, planTitle: e.target.value })}
            />
            <div className="plan-preview">
              {(importPlan.topics || []).map((topic, ti) => (
                <div key={ti} className="plan-topic-block">
                  <div className="plan-topic-title">{topic.title}</div>
                  <div className="plan-items-list">
                    {(topic.items || []).map((item, ii) => (
                      <div key={ii} className="plan-item-row">
                        <span className={`topic-type type-${item.type}`}>{item.type}</span>
                        <span className="plan-item-title">{item.title || "Untitled"}</span>
                        {item.testMode && <span className="teacher-only-badge">Tests</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="plan-summary-note">
              This will create <strong>{importPlan.topics?.length || 0}</strong> topic(s) and{" "}
              <strong>{importPlan.topics?.reduce((acc, t) => acc + (t.items?.length || 0), 0)}</strong> item(s) in your class.
            </p>
          </div>
          <div className="mcq-modal-footer">
            <button className="primary-button" disabled={importPlanSaving} onClick={handleImportPlanSave}>
              {importPlanSaving ? "Importing…" : "Import All"}
            </button>
            <button className="ghost-button" onClick={() => setImportPlan(null)}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  async function handleImportLearningSave() {
    if (!activeClassId || !importLearning) return;
    setImportLearningError("");
    if (!importLearning.title.trim()) { setImportLearningError("Title is required."); return; }
    setImportLearningSaving(true);
    try {
      let topicId = importLearningTopicId;
      if (topicId === "__new__") {
        if (!importLearningNewTopic.trim()) {
          setImportLearningError("New topic title is required.");
          setImportLearningSaving(false);
          return;
        }
        const topicRes = await fetch(`${API_BASE}/classes/${activeClassId}/topics`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ title: importLearningNewTopic.trim() }),
        });
        const topicData = await topicRes.json();
        if (!topicRes.ok) { setImportLearningError(topicData?.error?.message || "Failed to create topic."); setImportLearningSaving(false); return; }
        const created = topicData?.data?.topic;
        topicId = created?.id || created?._id;
        setTopics((prev) => [...prev, created]);
      }
      const itemRes = await fetch(`${API_BASE}/classes/${activeClassId}/topics/${topicId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          title: importLearning.title.trim(),
          type: "learning",
          practiceBody: importLearning.body || "",
          practiceInstructions: importLearning.instructions || "",
          practiceHints: Array.isArray(importLearning.hints) ? importLearning.hints : [],
          practiceCodeStarter: importLearning.codeStarter || "",
        }),
      });
      const itemData = await itemRes.json();
      if (!itemRes.ok) { setImportLearningError(itemData?.error?.message || "Failed to save learning item."); setImportLearningSaving(false); return; }
      if (itemData?.data?.item) {
        setTopics((prev) =>
          prev.map((t) =>
            (t.id === topicId || t._id?.toString() === topicId)
              ? { ...t, items: [...(t.items || []), itemData.data.item] }
              : t
          )
        );
      }
      setImportLearning(null);
      setToast({ type: "success", message: "Learning lesson imported!" });
    } catch {
      setImportLearningError("Server not reachable.");
    } finally {
      setImportLearningSaving(false);
    }
  }

  function renderImportLearningModal() {
    if (!importLearning) return null;
    return (
      <div className="modal-overlay" onClick={() => setImportLearning(null)}>
        <div className="modal-content mcq-modal" onClick={(e) => e.stopPropagation()}>
          <div className="mcq-modal-header">
            <div>
              <p className="mcq-modal-eyebrow">AI Generated</p>
              <h3 className="mcq-modal-title">Import Learning Lesson</h3>
            </div>
            <button type="button" className="mcq-modal-close" onClick={() => setImportLearning(null)}>✕</button>
          </div>
          <div className="mcq-modal-body">
            {importLearningError && <p className="mcq-modal-error">{importLearningError}</p>}

            <label>Lesson Title</label>
            <input
              value={importLearning.title}
              onChange={(e) => setImportLearning({ ...importLearning, title: e.target.value })}
              placeholder="Short label, e.g. What is a Loop?"
            />

            <label>Body / Explanation</label>
            <textarea
              value={importLearning.body}
              onChange={(e) => setImportLearning({ ...importLearning, body: e.target.value })}
              rows={4}
            />

            <label>Instructions (optional)</label>
            <textarea
              value={importLearning.instructions}
              onChange={(e) => setImportLearning({ ...importLearning, instructions: e.target.value })}
              rows={2}
            />

            <label>Hints (one per line, optional)</label>
            <textarea
              value={(importLearning.hints || []).join("\n")}
              onChange={(e) =>
                setImportLearning({
                  ...importLearning,
                  hints: e.target.value.split("\n").map((h) => h.trim()).filter(Boolean),
                })
              }
              rows={3}
            />

            <label>Code Example (optional)</label>
            <textarea
              className="practice-modal-code"
              value={importLearning.codeStarter}
              onChange={(e) => setImportLearning({ ...importLearning, codeStarter: e.target.value })}
              rows={4}
              spellCheck={false}
            />

            <label>Save to Topic</label>
            <select
              value={importLearningTopicId}
              onChange={(e) => setImportLearningTopicId(e.target.value)}
            >
              {topics.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
              <option value="__new__">+ Create new topic...</option>
            </select>
            {importLearningTopicId === "__new__" && (
              <input
                placeholder="New topic title"
                value={importLearningNewTopic}
                onChange={(e) => setImportLearningNewTopic(e.target.value)}
                style={{ marginTop: 6 }}
              />
            )}
          </div>
          <div className="mcq-modal-footer">
            <button className="primary-button" disabled={importLearningSaving} onClick={handleImportLearningSave}>
              {importLearningSaving ? "Saving..." : "Save Lesson"}
            </button>
            <button className="ghost-button" onClick={() => setImportLearning(null)}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  function renderChatBot() {
    if (!user) return null;

    function onFabMouseDown(e) {
      if (e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startRight = fabPos.right;
      const startBottom = fabPos.bottom;
      fabDraggingRef.current = false;

      function onMove(ev) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!fabDraggingRef.current && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
        fabDraggingRef.current = true;
        setFabPos({
          right: Math.max(8, Math.min(window.innerWidth - 64, startRight - dx)),
          bottom: Math.max(8, Math.min(window.innerHeight - 64, startBottom - dy)),
        });
      }

      function onUp() {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        if (!fabDraggingRef.current) setChatOpen(true);
        fabDraggingRef.current = false;
      }

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    }

    // When expanded the CSS class centers the panel — don't override with fabPos
    const panelStyle = chatExpanded ? {} : {
      right: fabPos.right,
      bottom: fabPos.bottom + 72,
    };

    return (
      <>
        {!chatOpen && (
          <button
            className="chat-fab"
            type="button"
            onMouseDown={onFabMouseDown}
            title="Open AI Assistant (drag to move)"
            style={{ right: fabPos.right, bottom: fabPos.bottom }}
          >
            AI
          </button>
        )}
        {chatOpen && (
          <>
            {chatExpanded && (
              <div className="chat-expand-backdrop" onClick={() => {
                setChatAnimDir("collapsing");
                setTimeout(() => {
                  setChatExpanded(false);
                  setChatAnimDir("fadein");
                  setTimeout(() => setChatAnimDir(null), 200);
                }, 180);
              }} />
            )}
          <div
            className={[
              "chat-panel",
              chatExpanded ? "chat-panel-expanded" : "",
              chatAnimDir ? `chat-anim-${chatAnimDir}` : "",
            ].filter(Boolean).join(" ")}
            style={panelStyle}
          >
            <div className="chat-header">
              <span>{user.role === "teacher" ? "Teaching Assistant" : "Learning Buddy"}</span>
              <div className="chat-header-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    if (!chatExpanded) {
                      // Expanding: show expanded first, then animate pop-in
                      setChatExpanded(true);
                      setChatAnimDir("expanding");
                      setTimeout(() => setChatAnimDir(null), 300);
                    } else {
                      // Collapsing: fade out while expanded, then snap to collapsed + fade in
                      setChatAnimDir("collapsing");
                      setTimeout(() => {
                        setChatExpanded(false);
                        setChatAnimDir("fadein");
                        setTimeout(() => setChatAnimDir(null), 200);
                      }, 180);
                    }
                  }}
                >
                  {chatExpanded ? "Shrink" : "Expand"}
                </button>
                <button type="button" className="ghost-button" onClick={clearChat}>
                  Clear
                </button>
                <button type="button" className="ghost-button" onClick={() => { setChatOpen(false); setChatExpanded(false); }}>
                  Close
                </button>
              </div>
            </div>
            <div className="chat-messages">
              {chatMessages.length === 0 && (
                <p className="chat-empty">
                  {user.role === "teacher"
                    ? "Ask me to generate exercises, quiz questions, or help grade student submissions based on your lesson content."
                    : "Ask me for hints, help debugging your code, or to explain Python concepts."}
                </p>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`chat-msg chat-msg-${msg.role}`}>
                  <div className="chat-msg-header">
                    <span className="chat-msg-role">{msg.role === "user" ? "You" : "AI"}</span>
                    {msg.content && (
                      <div style={{ display: "flex", gap: "4px" }}>
                        <button
                          type="button"
                          className="chat-copy-btn"
                          title="Copy to clipboard"
                          onClick={() => {
                            navigator.clipboard.writeText(msg.content);
                            setCopiedMsgIdx(i);
                            setTimeout(() => setCopiedMsgIdx(null), 2000);
                          }}
                        >
                          {copiedMsgIdx === i ? "Copied!" : "Copy"}
                        </button>
                        {msg.role === "assistant" &&
                          user.role === "teacher" &&
                          activeClassId &&
                          parseMcqFromMessage(msg.content) && (
                            <button
                              type="button"
                              className="chat-copy-btn chat-import-btn"
                              title="Import as MCQ Quiz"
                              onClick={() => {
                                const mcq = parseMcqFromMessage(msg.content);
                                if (mcq) {
                                  setImportMcq(mcq);
                                  setImportMcqTopicId(topics[0]?.id || "__new__");
                                  setImportMcqTitle(mcq.title || mcq.question.slice(0, 60));
                                  setImportMcqError("");
                                  setImportMcqNewTopic("");
                                }
                              }}
                            >
                              Import MCQ
                            </button>
                          )}
                        {msg.role === "assistant" &&
                          user.role === "teacher" &&
                          activeClassId &&
                          parseSaFromMessage(msg.content) && (
                            <button
                              type="button"
                              className="chat-copy-btn chat-import-btn"
                              title="Import as Short Answer Quiz"
                              onClick={() => {
                                const sa = parseSaFromMessage(msg.content);
                                if (sa) {
                                  setImportSa(sa);
                                  setImportSaTopicId(topics[0]?.id || "__new__");
                                  setImportSaError("");
                                  setImportSaNewTopic("");
                                }
                              }}
                            >
                              Import Short Answer
                            </button>
                          )}
                        {msg.role === "assistant" &&
                          user.role === "teacher" &&
                          activeClassId &&
                          parsePracticeFromMessage(msg.content) && (
                            <button
                              type="button"
                              className="chat-copy-btn chat-import-btn"
                              title="Import as Coding Exercise"
                              onClick={() => {
                                const ex = parsePracticeFromMessage(msg.content);
                                if (ex) {
                                  setImportPractice(ex);
                                  setImportPracticeTopicId(topics[0]?.id || "__new__");
                                  setImportPracticeError("");
                                  setImportPracticeNewTopic("");
                                }
                              }}
                            >
                              Import Exercise
                            </button>
                          )}
                        {msg.role === "assistant" &&
                          user.role === "teacher" &&
                          activeClassId &&
                          parseLessonPlanFromMessage(msg.content) && (
                            <button
                              type="button"
                              className="chat-copy-btn chat-import-btn"
                              title="Import full lesson plan"
                              onClick={() => {
                                const plan = parseLessonPlanFromMessage(msg.content);
                                if (plan) {
                                  setImportPlan(plan);
                                  setImportPlanError("");
                                }
                              }}
                            >
                              Import Lesson Plan
                            </button>
                          )}
                        {msg.role === "assistant" &&
                          user.role === "teacher" &&
                          activeClassId &&
                          parseLearningFromMessage(msg.content) && (
                            <button
                              type="button"
                              className="chat-copy-btn chat-import-btn"
                              title="Import as Learning Lesson"
                              onClick={() => {
                                const item = parseLearningFromMessage(msg.content);
                                if (item) {
                                  setImportLearning(item);
                                  setImportLearningTopicId(topics[0]?.id || "__new__");
                                  setImportLearningError("");
                                  setImportLearningNewTopic("");
                                }
                              }}
                            >
                              Import Learning
                            </button>
                          )}
                      </div>
                    )}
                  </div>
                  <div className="chat-msg-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripMachineBlocks(msg.content)}</ReactMarkdown>
                  </div>
                </div>
              ))}
              {chatLoading && chatMessages[chatMessages.length - 1]?.role !== "assistant" && (
                <div className="chat-msg chat-msg-assistant">
                  <span className="chat-msg-role">AI</span>
                  <p className="chat-msg-content chat-typing">Thinking...</p>
                </div>
              )}
              {chatError && <p className="chat-error">{chatError}</p>}
              <div ref={chatMessagesEndRef} />
            </div>
            <div className="chat-input-bar">
              <input
                type="text"
                className="chat-input"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendChatMessage(); }}
                placeholder={
                  user.role === "teacher"
                    ? "Generate a coding exercise for this lesson..."
                    : "I'm stuck on this code..."
                }
                disabled={chatLoading}
              />
              <button
                type="button"
                className="chat-send"
                onClick={sendChatMessage}
                disabled={chatLoading || !chatInput.trim()}
              >
                Send
              </button>
            </div>
          </div>
          </>
        )}
        {renderImportMcqModal()}
        {renderImportSaModal()}
        {renderImportPracticeModal()}
        {renderImportPlanModal()}
        {renderImportLearningModal()}
      </>
    );
  }

  function handleSaveJson() {
    if (route.page === "practice" && isTeacherView && practiceDraft._itemId) {
      setLessonJson(JSON.stringify(lesson, null, 2));
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
                practiceBody: practiceDraft.body,
                practiceInstructions: practiceDraft.instructions,
                practiceQuestion: practiceDraft.question,
                practiceHints: practiceDraft.hints,
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
      setClassError("Select a class before saving lessons.");
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

  function handleLoadJson() {
    if (route.page === "practice") {
      try {
        const parsed = JSON.parse(lessonJson);
        const { id: _ignoredId, ...rest } = parsed;
        setPracticeDraft((prev) => ({ ...prev, ...rest }));
      } catch {
        alert("Invalid JSON. Fix errors and try again.");
      }
      return;
    }
    try {
      const parsed = JSON.parse(lessonJson);
      const { id: _ignoredId, ...rest } = parsed;
      const mergedLesson = { ...initialLesson, ...rest, id: lesson.id };
      updateActiveLesson(mergedLesson);

      if (user?.role === "teacher") {
        if (!activeClassId) {
          setClassError("Select a class before saving lessons.");
          return;
        }
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
      <PageShell className={`page-shell ${pageTransition}`}>
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
      </PageShell>
    );
  }

  const isTeacher = user.role === "teacher";
  const isTeacherView = viewRole === "teacher";

  if (route.page === "classes") {
    return (
      <PageShell className={`page-shell ${pageTransition}`}>
        <main className={isTeacher ? "teacher-dashboard" : "student-dashboard"}>
          <header className="teacher-topbar">
            <div>
              <p className="teacher-eyebrow">
                {isTeacher ? "Teacher Workspace" : "Student Workspace"}
              </p>
              <h1>Classes</h1>
            </div>
            <div className="teacher-actions">
              <span className="user-pill">{user.name}</span>
              <span className="role-pill">{user.role}</span>
              <button className="ghost-button" type="button" onClick={handleLogout}>
                Log out
              </button>
            </div>
          </header>

          <section className="class-section">
            <div className="class-header">
              <h2>Your classes</h2>
              <div className="class-actions">
                {isTeacher ? (
                  <>
                    <input
                      className="class-input"
                      type="text"
                      value={className}
                      onChange={(event) => setClassName(event.target.value)}
                      placeholder="Class name"
                    />
                    <button className="accent-button" type="button" onClick={handleCreateClass}>
                      Create class
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      className="class-input"
                      type="text"
                      value={joinCode}
                      onChange={(event) => setJoinCode(event.target.value)}
                      placeholder="Join code"
                    />
                    <button className="accent-button" type="button" onClick={handleJoinClass}>
                      Join class
                    </button>
                  </>
                )}
              </div>
            </div>
            {classError && <p className="auth-error">{classError}</p>}
            {classNotice && <p className="auth-notice">{classNotice}</p>}
            <div className="class-grid">
              {classes.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="class-pill panel-animate"
                  onClick={() => handleSelectClass(item.id)}
                >
                  <span>{item.name}</span>
                  <small>{isTeacher ? `Join code: ${item.joinCode}` : "Joined"}</small>
                </button>
              ))}
              {!classes.length && (
                <p className="empty-state">
                  {isTeacher
                    ? "Create a class to start adding lessons."
                    : "Join a class to see lessons."}
                </p>
              )}
            </div>
          </section>
        </main>
        {renderChatBot()}
      </PageShell>
    );
  }

  if (route.page === "class") {
    return (
      <PageShell className={`page-shell ${pageTransition}`}>
        <main className={isTeacher ? "teacher-dashboard" : "student-dashboard"}>
        <header className="teacher-topbar">
          <div>
            <p className="teacher-eyebrow">
              {isTeacher ? "Teacher Workspace" : "Student Workspace"}
            </p>
            <h1>{activeClass ? activeClass.name : "Class"}</h1>
            {activeClass && (
              <p className="class-subtitle">
                {isTeacher ? `Join code: ${activeClass.joinCode}` : "Lessons overview"}
              </p>
            )}
          </div>
          <div className="teacher-actions">
            <button className="ghost-button" type="button" onClick={navigateToClasses}>
              Back to Classes
            </button>
            {isTeacher && (
              <button
                className="accent-button"
                type="button"
                onClick={() => {
                  const input = document.querySelector(".topic-actions input");
                  if (input) input.focus();
                }}
              >
                Add topic
              </button>
            )}
            {isTeacher && activeClass && (
              <button className="ghost-button" type="button" onClick={handleDeleteClass}>
                Delete class
              </button>
            )}
            <span className="user-pill">{user.name}</span>
            <span className="role-pill">{user.role}</span>
            <button className="ghost-button" type="button" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </header>

        <section className="class-detail-grid">
          <div
            className="class-detail-panel panel-animate"
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                (event.target?.tagName === "INPUT" ||
                  event.target?.tagName === "SELECT")
              ) {
                event.preventDefault();
              }
            }}
          >
            <div className="panel-header">
              <h2>Topics</h2>
              {isTeacher && (
                <div className="topic-actions">
                  <input
                    className="class-input"
                    type="text"
                    value={topicTitle}
                    onChange={(event) => setTopicTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleCreateTopic();
                      }
                    }}
                    placeholder="Topic title (e.g., Loops)"
                  />
                  <button className="accent-button" type="button" onClick={handleCreateTopic}>
                    Add topic
                  </button>
                </div>
              )}
            </div>
            {topicError && <p className="auth-error">{topicError}</p>}
            {topics.length === 0 && (
              <p className="empty-state">No topics yet for this class.</p>
            )}
            <div className="topic-grid">
              {topics.map((topic) => (
                <article
                  key={topic.id}
                  className={`topic-card panel-animate${dragOverTopicId === topic.id ? " drag-over-topic" : ""}`}
                  draggable={isTeacher && editingTopicId !== topic.id}
                  onDragStart={(e) => {
                    if (!dragTopicFromHandleRef.current) { e.preventDefault(); return; }
                    dragTopicRef.current = topic.id;
                  }}
                  onDragOver={(e) => { e.preventDefault(); if (dragTopicRef.current) setDragOverTopicId(topic.id); }}
                  onDragLeave={() => setDragOverTopicId(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverTopicId(null);
                    if (dragTopicRef.current) handleTopicReorder(dragTopicRef.current, topic.id);
                    dragTopicRef.current = null;
                  }}
                  onDragEnd={() => { dragTopicRef.current = null; dragTopicFromHandleRef.current = false; setDragOverTopicId(null); }}
                >
                  <div className="topic-header">
                    {editingTopicId === topic.id ? (
                      <div className="topic-edit">
                        <input
                          className="class-input"
                          type="text"
                          value={editingTopicTitle}
                          onChange={(event) => setEditingTopicTitle(event.target.value)}
                        />
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => saveEditTopic(topic.id)}
                        >
                          Save
                        </button>
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => setEditingTopicId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="topic-title-row">
                        {isTeacher && (
                          <span
                            className="topic-drag-handle"
                            title="Drag to reorder"
                            onMouseDown={() => { dragTopicFromHandleRef.current = true; }}
                            onMouseUp={() => { dragTopicFromHandleRef.current = false; }}
                          >⠿</span>
                        )}
                        <h3>{topic.title}</h3>
                        {isTeacher && (
                          <div className="topic-actions-inline">
                            <button
                              className="ghost-button"
                              type="button"
                              onClick={() => beginEditTopic(topic)}
                            >
                              Edit
                            </button>
                            <button
                              className="ghost-button danger"
                              type="button"
                              onClick={() => deleteTopic(topic.id)}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <span className="topic-pill">Topic</span>
                  </div>
                  <div className="topic-sections">
                    {(topic.items || []).length ? (
                      (topic.items || []).map((item) => (
                        <div
                          key={item.id}
                          className={`topic-section-row${dragOverItemId === item.id ? " drag-over" : ""}`}
                          draggable={isTeacher && editingItemId !== item.id}
                          onDragStart={(e) => {
                            e.stopPropagation();
                            if (!dragFromHandleRef.current) { e.preventDefault(); return; }
                            dragItemRef.current = { topicId: topic.id, itemId: item.id };
                          }}
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (dragItemRef.current) setDragOverItemId(item.id); }}
                          onDragLeave={(e) => { e.stopPropagation(); setDragOverItemId(null); }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDragOverItemId(null);
                            const drag = dragItemRef.current;
                            if (drag && drag.topicId === topic.id) {
                              handleItemReorder(topic.id, drag.itemId, item.id);
                            }
                            dragItemRef.current = null;
                          }}
                          onDragEnd={(e) => { e.stopPropagation(); dragItemRef.current = null; dragFromHandleRef.current = false; setDragOverItemId(null); }}
                        >
                          {editingItemId === item.id ? (
                            <div className="topic-item-edit">
                              <input
                                className="class-input"
                                type="text"
                                value={editingItemTitle}
                                onChange={(event) => setEditingItemTitle(event.target.value)}
                                placeholder="Item title"
                              />
                              <div className="topic-type-toggle">
                                <button
                                  className={editingItemType === "learning" ? "ghost-button active" : "ghost-button"}
                                  type="button"
                                  onClick={() => setEditingItemType("learning")}
                                >
                                  Learning
                                </button>
                                <button
                                  className={editingItemType === "quiz" ? "ghost-button active" : "ghost-button"}
                                  type="button"
                                  onClick={() => setEditingItemType("quiz")}
                                >
                                  Quiz
                                </button>
                                <button
                                  className={editingItemType === "practice" ? "ghost-button active" : "ghost-button"}
                                  type="button"
                                  onClick={() => setEditingItemType("practice")}
                                >
                                  Practice
                                </button>
                              </div>
                              {editingItemType === "learning" && (
                                <div className="learning-edit-fields">
                                  <textarea
                                    className="class-input"
                                    value={editingItemBody}
                                    onChange={(e) => setEditingItemBody(e.target.value)}
                                    placeholder="Lesson body — explain the concept in plain language"
                                    rows={4}
                                  />
                                  <input
                                    className="class-input"
                                    type="text"
                                    value={editingItemInstructions}
                                    onChange={(e) => setEditingItemInstructions(e.target.value)}
                                    placeholder="Instructions (optional)"
                                  />
                                  <textarea
                                    className="class-input practice-modal-code"
                                    value={editingItemCodeStarter}
                                    onChange={(e) => setEditingItemCodeStarter(e.target.value)}
                                    placeholder="Code example (optional Python code)"
                                    rows={3}
                                    spellCheck={false}
                                  />
                                </div>
                              )}
                              {editingItemType === "quiz" && (
                                <div className="quiz-builder">
                                  <p className="progress-meta">Question type</p>
                                  <div className="topic-type-toggle">
                                    <button
                                      className={
                                        editingItemQuizSubtype === "mcq"
                                          ? "ghost-button active"
                                          : "ghost-button"
                                      }
                                      type="button"
                                      onClick={() => setEditingItemQuizSubtype("mcq")}
                                    >
                                      MCQ
                                    </button>
                                    <button
                                      className={
                                        editingItemQuizSubtype === "short_answer"
                                          ? "ghost-button active"
                                          : "ghost-button"
                                      }
                                      type="button"
                                      onClick={() => setEditingItemQuizSubtype("short_answer")}
                                    >
                                      Short Answer
                                    </button>
                                  </div>
                                  <input
                                    className="class-input"
                                    type="text"
                                    value={editingItemQuizQuestion}
                                    onChange={(event) =>
                                      setEditingItemQuizQuestion(event.target.value)
                                    }
                                    placeholder="Quiz question"
                                  />
                                  {editingItemQuizSubtype === "mcq" ? (
                                    <div className="quiz-options-builder">
                                      <div className="quiz-option-row">
                                        <input
                                          className="class-input"
                                          type="text"
                                          value={editingItemQuizOptionInput}
                                          onChange={(event) =>
                                            setEditingItemQuizOptionInput(event.target.value)
                                          }
                                          placeholder="Choice text"
                                        />
                                        <button
                                          className="ghost-button"
                                          type="button"
                                          onClick={() => {
                                            const value = editingItemQuizOptionInput.trim();
                                            if (!value) return;
                                            const next = upsertOption(
                                              editingItemQuizOptions,
                                              editingItemQuizOptionEditIndex,
                                              value
                                            );
                                            setEditingItemQuizOptions(next);
                                            if (
                                              editingItemQuizAnswer &&
                                              editingItemQuizOptionEditIndex >= 0 &&
                                              editingItemQuizOptions[editingItemQuizOptionEditIndex] !== value
                                            ) {
                                              setEditingItemQuizAnswer("");
                                            }
                                            setEditingItemQuizOptionInput("");
                                            setEditingItemQuizOptionEditIndex(-1);
                                          }}
                                        >
                                          {editingItemQuizOptionEditIndex >= 0 ? "Update choice" : "Add choice"}
                                        </button>
                                      </div>
                                      <div className="quiz-options-list">
                                        {editingItemQuizOptions.map((option, optionIndex) => (
                                          <div key={`${option}-${optionIndex}`} className="quiz-option-item">
                                            <span>{option}</span>
                                            <div className="topic-item-actions">
                                              <button
                                                className="ghost-button"
                                                type="button"
                                                onClick={() => {
                                                  setEditingItemQuizOptionInput(option);
                                                  setEditingItemQuizOptionEditIndex(optionIndex);
                                                }}
                                              >
                                                Edit
                                              </button>
                                              <button
                                                className="ghost-button danger"
                                                type="button"
                                                onClick={() => {
                                                  const next = editingItemQuizOptions.filter(
                                                    (_, idx) => idx !== optionIndex
                                                  );
                                                  setEditingItemQuizOptions(next);
                                                  if (editingItemQuizAnswer === option) {
                                                    setEditingItemQuizAnswer("");
                                                  }
                                                  if (editingItemQuizOptionEditIndex === optionIndex) {
                                                    setEditingItemQuizOptionEditIndex(-1);
                                                    setEditingItemQuizOptionInput("");
                                                  }
                                                }}
                                              >
                                                Delete
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                      <select
                                        className="class-input"
                                        value={editingItemQuizAnswer}
                                        onChange={(event) =>
                                          setEditingItemQuizAnswer(event.target.value)
                                        }
                                      >
                                        <option value="">Select correct answer</option>
                                        {editingItemQuizOptions.map((option) => (
                                          <option key={option} value={option}>
                                            {option}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  ) : (
                                    <input
                                      className="class-input"
                                      type="text"
                                      value={editingItemQuizAnswer}
                                      onChange={(event) =>
                                        setEditingItemQuizAnswer(event.target.value)
                                      }
                                      placeholder="Expected answer"
                                    />
                                  )}
                                </div>
                              )}
                              <div className="topic-item-actions">
                                <button
                                  className="ghost-button"
                                  type="button"
                                  onClick={() => saveEditItem(topic.id, item.id)}
                                >
                                  Save
                                </button>
                                <button
                                  className="ghost-button"
                                  type="button"
                                  onClick={() => setEditingItemId(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {/* Always render handle col so the grid stays 4-column for both roles */}
                              <span
                                className={`drag-handle${isTeacher ? "" : " drag-handle-hidden"}`}
                                title={isTeacher ? "Drag to reorder" : undefined}
                                onMouseDown={() => { dragFromHandleRef.current = true; }}
                                onMouseUp={() => { dragFromHandleRef.current = false; }}
                              >
                                {isTeacher ? "⠿" : ""}
                              </span>
                              <span className={`topic-type type-${item.type}`}>
                                {item.type}
                              </span>
                              <div className="topic-item-main">
                                <span className="topic-item-title">{item.title}</span>
                                {item.type === "quiz" && item.quizQuestion && (
                                  <span className="topic-item-meta">
                                    {item.quizSubtype === "mcq" ? "MCQ" : "Short answer"}:{" "}
                                    {item.quizQuestion}
                                  </span>
                                )}
                                {item.type === "learning" && item.practiceBody && (
                                  <span className="topic-item-meta">
                                    {item.practiceBody.slice(0, 80)}{item.practiceBody.length > 80 ? "…" : ""}
                                  </span>
                                )}
                              </div>
                              {/* All actions in ONE div so it stays in the 4th grid column */}
                              <div className="topic-item-actions">
                                <button
                                  className="ghost-button"
                                  type="button"
                                  onClick={() => {
                                    if (item.type === "practice") navigateToPractice(activeClassId, item.id);
                                    else if (item.type === "quiz") navigateToQuiz(activeClassId, item.id);
                                    else navigateToLearningItem(activeClassId, item.id);
                                  }}
                                >
                                  Open
                                </button>
                                {isTeacher && (
                                  <>
                                    <button
                                      className="ghost-button"
                                      type="button"
                                      onClick={() => beginEditItem(item)}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      className="ghost-button danger"
                                      type="button"
                                      onClick={() => deleteItem(topic.id, item.id)}
                                    >
                                      Delete
                                    </button>
                                  </>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="empty-state">No learning, quizzes, or practice yet.</p>
                    )}
                  </div>
                  {isTeacher && (
                    <div className="topic-item-form">
                      <input
                        className="class-input"
                        type="text"
                        value={(topicItemDrafts[topic.id]?.title) || ""}
                        onChange={(event) =>
                          updateTopicDraft(topic.id, { title: event.target.value })
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleCreateTopicItem(topic.id);
                          }
                        }}
                        placeholder="Item title"
                      />
                      <div className="topic-type-toggle">
                        <button
                          className={
                            ((topicItemDrafts[topic.id]?.type) || "learning") === "learning"
                              ? "ghost-button active"
                              : "ghost-button"
                          }
                          type="button"
                          onClick={() =>
                            updateTopicDraft(topic.id, { type: "learning" })
                          }
                        >
                          Learning
                        </button>
                        <button
                          className={
                            ((topicItemDrafts[topic.id]?.type) || "learning") === "quiz"
                              ? "ghost-button active"
                              : "ghost-button"
                          }
                          type="button"
                          onClick={() =>
                            updateTopicDraft(topic.id, { type: "quiz" })
                          }
                        >
                          Quiz
                        </button>
                        <button
                          className={
                            ((topicItemDrafts[topic.id]?.type) || "learning") === "practice"
                              ? "ghost-button active"
                              : "ghost-button"
                          }
                          type="button"
                          onClick={() =>
                            updateTopicDraft(topic.id, { type: "practice" })
                          }
                        >
                          Practice
                        </button>
                      </div>
                      {(topicItemDrafts[topic.id]?.type || "learning") === "quiz" && (
                        <div className="quiz-builder">
                          <p className="progress-meta">Question type</p>
                          <div className="topic-type-toggle">
                            <button
                              className={
                                ((topicItemDrafts[topic.id]?.quizSubtype) || "mcq") === "mcq"
                                  ? "ghost-button active"
                                  : "ghost-button"
                              }
                              type="button"
                              onClick={() =>
                                updateTopicDraft(topic.id, { quizSubtype: "mcq" })
                              }
                            >
                              MCQ
                            </button>
                            <button
                              className={
                                ((topicItemDrafts[topic.id]?.quizSubtype) || "mcq") ===
                                "short_answer"
                                  ? "ghost-button active"
                                  : "ghost-button"
                              }
                              type="button"
                              onClick={() =>
                                updateTopicDraft(topic.id, { quizSubtype: "short_answer" })
                              }
                            >
                              Short Answer
                            </button>
                          </div>
                          <input
                            className="class-input"
                            type="text"
                            value={(topicItemDrafts[topic.id]?.quizQuestion) || ""}
                            onChange={(event) =>
                              updateTopicDraft(topic.id, { quizQuestion: event.target.value })
                            }
                            placeholder="Quiz question"
                          />
                          {((topicItemDrafts[topic.id]?.quizSubtype) || "mcq") === "mcq" ? (
                            <div className="quiz-options-builder">
                              <div className="quiz-option-row">
                                <input
                                  className="class-input"
                                  type="text"
                                  value={(topicItemDrafts[topic.id]?.quizOptionInput) || ""}
                                  onChange={(event) =>
                                    updateTopicDraft(topic.id, { quizOptionInput: event.target.value })
                                  }
                                  placeholder="Choice text"
                                />
                                <button
                                  className="ghost-button"
                                  type="button"
                                  onClick={() => {
                                    const draft = topicItemDrafts[topic.id] || createTopicItemDraft();
                                    const value = `${draft.quizOptionInput || ""}`.trim();
                                    if (!value) return;
                                    const nextOptions = upsertOption(
                                      draft.quizOptions,
                                      draft.quizOptionEditIndex,
                                      value
                                    );
                                    const nextAnswer =
                                      draft.quizOptionEditIndex >= 0 &&
                                      draft.quizAnswer === draft.quizOptions?.[draft.quizOptionEditIndex]
                                        ? value
                                        : draft.quizAnswer;
                                    updateTopicDraft(topic.id, {
                                      quizOptions: nextOptions,
                                      quizOptionInput: "",
                                      quizOptionEditIndex: -1,
                                      quizAnswer: nextAnswer,
                                    });
                                  }}
                                >
                                  {((topicItemDrafts[topic.id]?.quizOptionEditIndex) ?? -1) >= 0
                                    ? "Update choice"
                                    : "Add choice"}
                                </button>
                              </div>
                              <div className="quiz-options-list">
                                {((topicItemDrafts[topic.id]?.quizOptions) || []).map((option, optionIndex) => (
                                  <div key={`${option}-${optionIndex}`} className="quiz-option-item">
                                    <span>{option}</span>
                                    <div className="topic-item-actions">
                                      <button
                                        className="ghost-button"
                                        type="button"
                                        onClick={() =>
                                          updateTopicDraft(topic.id, {
                                            quizOptionInput: option,
                                            quizOptionEditIndex: optionIndex,
                                          })
                                        }
                                      >
                                        Edit
                                      </button>
                                      <button
                                        className="ghost-button danger"
                                        type="button"
                                        onClick={() => {
                                          const draft = topicItemDrafts[topic.id] || createTopicItemDraft();
                                          const next = (draft.quizOptions || []).filter(
                                            (_, idx) => idx !== optionIndex
                                          );
                                          updateTopicDraft(topic.id, {
                                            quizOptions: next,
                                            quizOptionInput:
                                              draft.quizOptionEditIndex === optionIndex
                                                ? ""
                                                : draft.quizOptionInput,
                                            quizOptionEditIndex:
                                              draft.quizOptionEditIndex === optionIndex
                                                ? -1
                                                : draft.quizOptionEditIndex,
                                            quizAnswer:
                                              draft.quizAnswer === option ? "" : draft.quizAnswer,
                                          });
                                        }}
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <select
                                className="class-input"
                                value={(topicItemDrafts[topic.id]?.quizAnswer) || ""}
                                onChange={(event) =>
                                  updateTopicDraft(topic.id, { quizAnswer: event.target.value })
                                }
                              >
                                <option value="">Select correct answer</option>
                                {((topicItemDrafts[topic.id]?.quizOptions) || []).map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <input
                              className="class-input"
                              type="text"
                              value={(topicItemDrafts[topic.id]?.quizAnswer) || ""}
                              onChange={(event) =>
                                updateTopicDraft(topic.id, { quizAnswer: event.target.value })
                              }
                              placeholder="Expected answer"
                            />
                          )}
                        </div>
                      )}
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => handleCreateTopicItem(topic.id)}
                      >
                        Add
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>

          {isTeacher && (
            <div className="class-detail-panel student-panel panel-animate">
              <div className="panel-header">
                <h2>Students</h2>
                <button className="ghost-button" type="button" onClick={handleRefreshStudents}>
                  Refresh
                </button>
              </div>
              {classStudents.length === 0 && (
                <p className="empty-state">No students enrolled yet.</p>
              )}
              <div className="student-list">
                {classStudents.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    className={
                      student.id === selectedStudentId
                        ? "student-row selected panel-animate"
                        : "student-row panel-animate"
                    }
                    onClick={() => handleSelectStudent(student)}
                  >
                    <span className="student-avatar">
                      {student.name?.trim?.()[0]?.toUpperCase?.() || "?"}
                    </span>
                    <span className="student-name">{student.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
      {renderChatBot()}
      </PageShell>
    );
  }

  if (route.page === "learn") {
    return (
      <PageShell className={`page-shell ${pageTransition}`}>
        <main className={isTeacher ? "teacher-dashboard" : "student-dashboard"}>
          <header className="teacher-topbar">
            <div>
              <p className="teacher-eyebrow">
                {isTeacher ? "Teacher Workspace" : "Student Workspace"}
              </p>
              <h1>{learningMeta?.title || "Lesson"}</h1>
              {activeClass && (
                <p className="class-subtitle">Class: {activeClass.name}</p>
              )}
            </div>
            <div className="teacher-actions">
              <button className="ghost-button" type="button" onClick={() => navigateToClass(activeClassId)}>
                Back to Class
              </button>
              <button className="ghost-button" type="button" onClick={navigateToClasses}>
                Back to Classes
              </button>
              <span className="user-pill">{user.name}</span>
              <span className="role-pill">{user.role}</span>
              <button className="ghost-button" type="button" onClick={handleLogout}>
                Log out
              </button>
            </div>
          </header>
          {learningError && <p className="practice-error">{learningError}</p>}
          {learningMeta && (
            <LearningViewer
              meta={learningMeta}
              isTeacher={isTeacher}
              activeClassId={activeClassId}
              authHeaders={authHeaders}
              API_BASE={API_BASE}
              onSaved={(updated) => setLearningMeta((prev) => ({ ...prev, ...updated }))}
              setToast={setToast}
            />
          )}
        </main>
        {renderChatBot()}
      </PageShell>
    );
  }

  if (route.page === "quiz") {
    const isMcq = quizMeta?.quizSubtype === "mcq";
    return (
      <PageShell className={`page-shell ${pageTransition}`}>
        <main className={isTeacher ? "teacher-dashboard" : "student-dashboard"}>
          <header className="teacher-topbar">
            <div>
              <p className="teacher-eyebrow">
                {isTeacher ? "Teacher Workspace" : "Student Workspace"}
              </p>
              <h1>{quizMeta?.title || "Quiz"}</h1>
              {activeClass && (
                <p className="class-subtitle">Class: {activeClass.name}</p>
              )}
            </div>
            <div className="teacher-actions">
              <button className="ghost-button" type="button" onClick={() => navigateToClass(activeClassId)}>
                Back to Class
              </button>
              <button className="ghost-button" type="button" onClick={navigateToClasses}>
                Back to Classes
              </button>
              <span className="user-pill">{user.name}</span>
              <span className="role-pill">{user.role}</span>
              <button className="ghost-button" type="button" onClick={handleLogout}>
                Log out
              </button>
            </div>
          </header>

          <section className="class-detail-panel panel-animate">
            {quizLoading && <p className="empty-state">Loading quiz…</p>}
            {quizError && <p className="auth-error">{quizError}</p>}
            {!quizLoading && !quizError && quizMeta && (
              <div className="quiz-layout">
                <p className="progress-meta">
                  {quizMeta.topic?.title || "Topic"} · {isMcq ? "MCQ" : "Short answer"}
                </p>
                <div className="quiz-question-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {quizMeta.quizQuestion || "No question set yet."}
                  </ReactMarkdown>
                </div>
                {isMcq ? (
                  <div className="quiz-options">
                    {(quizMeta.quizOptions || []).map((option) => {
                      // Detect code-like options: has newline OR starts with Python keywords
                      const isCode = option.includes("\n") ||
                        /^(for|if|elif|else|while|def|class|import|from|try|with|return|print)\b/.test(option.trim()) ||
                        /^\w+\s*[=(]/.test(option.trim());
                      return (
                        <label key={option} className={`quiz-option${isCode ? " quiz-option-code" : ""}`}>
                          <input
                            type="radio"
                            name="quiz-option"
                            value={option}
                            checked={quizResponse === option}
                            onChange={(event) => setQuizResponse(event.target.value)}
                            disabled={quizSubmitting || user.role !== "student"}
                          />
                          {isCode ? (
                            <pre className="quiz-option-pre"><code>{option}</code></pre>
                          ) : (
                            <span>{option}</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <textarea
                    className="lesson-textarea"
                    value={quizResponse}
                    onChange={(event) => setQuizResponse(event.target.value)}
                    placeholder="Write your answer..."
                    rows={6}
                    disabled={quizSubmitting || user.role !== "student"}
                  />
                )}

                {user.role === "student" && (
                  <div className="topic-item-actions">
                    <button
                      className="accent-button"
                      type="button"
                      onClick={submitQuiz}
                      disabled={quizSubmitting}
                    >
                      {quizSubmitting ? "Submitting..." : "Submit answer"}
                    </button>
                  </div>
                )}

                {quizAttempt && (
                  <div className="student-progress panel-animate">
                    <div className="progress-row">
                      <div>
                        <p className="progress-title">Latest submission</p>
                        <p className="progress-meta">
                          Attempts: {quizAttempt.attempts || 0}
                        </p>
                      </div>
                      <div className={`progress-status status-${quizAttempt.gradingStatus}`}>
                        {quizAttempt.gradingStatus.replace("_", " ")}
                      </div>
                    </div>
                    {typeof quizAttempt.isCorrect === "boolean" && (
                      <p className="progress-meta">
                        Result: {quizAttempt.isCorrect ? "Correct" : "Incorrect"}
                      </p>
                    )}
                    {quizAttempt.feedback && (
                      <p className="progress-meta">Feedback: {quizAttempt.feedback}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        </main>
        {renderChatBot()}
      </PageShell>
    );
  }

  if (route.page === "student") {
    return (
      <PageShell className={`page-shell ${pageTransition}`}>
        <main className={isTeacher ? "teacher-dashboard" : "student-dashboard"}>
        <header className="teacher-topbar">
          <div>
            <p className="teacher-eyebrow">Teacher Workspace</p>
            <h1>{selectedStudentName || "Student"} progress</h1>
            {activeClass && (
              <p className="class-subtitle">Class: {activeClass.name}</p>
            )}
          </div>
          <div className="teacher-actions">
            <button className="ghost-button" type="button" onClick={() => navigateToClass(activeClassId)}>
              Back to Class
            </button>
            <button className="ghost-button" type="button" onClick={navigateToClasses}>
              Back to Classes
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={() =>
                activeClassId && route.studentId
                  ? navigateToStudent(activeClassId, route.studentId)
                  : null
              }
            >
              Refresh
            </button>
            <span className="user-pill">{user.name}</span>
            <span className="role-pill">{user.role}</span>
            <button className="ghost-button" type="button" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </header>

        <section className="class-detail-panel panel-animate">
          {practiceError && <p className="auth-error">{practiceError}</p>}
          {studentProgressLoading && (
            <p className="empty-state">Loading progress…</p>
          )}
          {studentProgressError && (
            <p className="auth-error">{studentProgressError}</p>
          )}
          {!studentProgressLoading &&
            !studentProgressError &&
            (studentProgress.length ? (
              <div className="progress-list">
                {studentProgress.map((item) => (
                  <div key={item.lessonId} className="progress-row panel-animate">
                    <div>
                      <p className="progress-title">{item.heading}</p>
                      <p className="progress-meta">{item.unit} · {item.duration}</p>
                    </div>
                    <div className={`progress-status status-${item.status}`}>
                      {item.status.replace("_", " ")}
                    </div>
                    {item.status === "completed" && item.lastCode && (
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => setSelectedProgress(item)}
                      >
                        View code
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state">No progress yet.</p>
            ))}
        </section>
        <section className="class-detail-panel panel-animate">
          <div className="panel-header">
            <h2>Quiz attempts</h2>
          </div>
          {!studentProgressLoading && !studentProgressError && (
            studentQuizAttempts.length ? (
              <div className="progress-list">
                {studentQuizAttempts.map((item) => (
                  <div key={item.id} className="progress-row panel-animate">
                    <div>
                      <p className="progress-title">{item.itemTitle}</p>
                      <p className="progress-meta">
                        {item.topicTitle || "Topic"} · {item.quizSubtype === "mcq" ? "MCQ" : "Short answer"}
                      </p>
                    </div>
                    <div className={`progress-status status-${item.gradingStatus}`}>
                      {item.gradingStatus.replace("_", " ")}
                    </div>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => {
                        setSelectedQuizAttempt(item);
                        setQuizGradeFeedback(item.feedback || "");
                      }}
                    >
                      View response
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state">No quiz attempts yet.</p>
            )
          )}
        </section>
        {selectedProgress && (
          <section className="class-detail-panel code-panel panel-animate">
            <div className="panel-header">
              <h2>{selectedProgress.heading}</h2>
              <button
                className="ghost-button"
                type="button"
                onClick={() => setSelectedProgress(null)}
              >
                Close
              </button>
            </div>
            <pre className="code-block">
              <code>{selectedProgress.lastCode}</code>
            </pre>
          </section>
        )}
        {selectedQuizAttempt && (
          <section className="class-detail-panel code-panel panel-animate">
            <div className="panel-header">
              <h2>{selectedQuizAttempt.itemTitle}</h2>
              <button
                className="ghost-button"
                type="button"
                onClick={() => setSelectedQuizAttempt(null)}
              >
                Close
              </button>
            </div>
            {selectedQuizAttempt.quizQuestion && (
              <p className="progress-meta">{selectedQuizAttempt.quizQuestion}</p>
            )}
            <pre className="code-block">
              <code>{selectedQuizAttempt.responseText || "No response recorded."}</code>
            </pre>
            <div className="quiz-grade-panel">
              <p className="progress-meta">
                Current status: {selectedQuizAttempt.gradingStatus.replace("_", " ")}
              </p>
              <textarea
                className="lesson-textarea"
                rows={4}
                value={quizGradeFeedback}
                onChange={(event) => setQuizGradeFeedback(event.target.value)}
                placeholder="Optional feedback for student"
                disabled={quizGrading}
              />
              <div className="topic-item-actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => gradeSelectedQuizAttempt(true)}
                  disabled={quizGrading}
                >
                  Mark correct
                </button>
                <button
                  className="ghost-button danger"
                  type="button"
                  onClick={() => gradeSelectedQuizAttempt(false)}
                  disabled={quizGrading}
                >
                  Mark incorrect
                </button>
              </div>
            </div>
          </section>
        )}
        </main>
        {renderChatBot()}
      </PageShell>
    );
  }

  return (
    <PageShell className={`page-shell ${pageTransition}`}>
      <main className="workspace">
      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.message}</div>
      )}
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">P</span>
          <div>
            <p className="brand-label">{lesson.unit}</p>
            <p className="brand-subtitle">
              {activeClass ? `Class: ${activeClass.name}` : "No class selected"}
            </p>
          </div>
        </div>
        <div className="topbar-actions">
          <button
            className="ghost-button"
            type="button"
            onClick={() => (activeClassId ? navigateToClass(activeClassId) : navigateToClasses())}
          >
            Back to Class
          </button>
          <button className="ghost-button" type="button" onClick={navigateToClasses}>
            Back to Classes
          </button>
          {isTeacher && activeClass && (
            <button className="ghost-button" type="button" onClick={handleDeleteClass}>
              Delete class
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
        <aside className="panel lesson-panel panel-animate">
          <div className="class-summary">
            <p className="class-summary-title">Class</p>
            <strong>{activeClass ? activeClass.name : "Select a class"}</strong>
            {isTeacher && activeClass && (
              <span className="class-summary-code">
                Join code: {activeClass.joinCode}
              </span>
            )}
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
              {route.page !== "practice" && (
                <label className="lesson-field">
                  Question
                  <textarea
                    value={lesson.question}
                    onChange={(event) => updateActiveLesson({ question: event.target.value })}
                  />
                </label>
              )}
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
              {route.page === "practice" && (
                <>
                  <label className="lesson-field lesson-model-answer">
                    <span>
                      Model Answer{" "}
                      <span className="teacher-only-badge">Teacher only</span>
                    </span>
                    <textarea
                      value={lesson.modelAnswer || ""}
                      onChange={(event) => updateActiveLesson({ modelAnswer: event.target.value })}
                      placeholder="# Write the correct solution here"
                      className="model-answer-editor"
                      spellCheck={false}
                    />
                  </label>
                  <div className="test-cases-section">
                    <label className="test-cases-toggle">
                      <input
                        type="checkbox"
                        checked={lesson.testMode || false}
                        onChange={(e) => updateActiveLesson({ testMode: e.target.checked })}
                      />
                      <span>Enable LeetCode-style test cases</span>
                    </label>
                    {lesson.testMode && (
                      <>
                        {(lesson.testCases || []).map((tc, i) => (
                          <div key={i} className="test-case-row">
                            <input
                              className="test-case-label-input"
                              placeholder={`Test ${i + 1} label`}
                              value={tc.label || ""}
                              onChange={(e) => {
                                const next = [...(lesson.testCases || [])];
                                next[i] = { ...tc, label: e.target.value };
                                updateActiveLesson({ testCases: next });
                              }}
                            />
                            <div className="test-case-fields">
                              <textarea
                                className="test-case-input"
                                placeholder={"Input (one value per line)"}
                                value={tc.input || ""}
                                rows={2}
                                onChange={(e) => {
                                  const next = [...(lesson.testCases || [])];
                                  next[i] = { ...tc, input: e.target.value };
                                  updateActiveLesson({ testCases: next });
                                }}
                              />
                              <textarea
                                className="test-case-expected"
                                placeholder={"Expected output"}
                                value={tc.expectedOutput || ""}
                                rows={2}
                                onChange={(e) => {
                                  const next = [...(lesson.testCases || [])];
                                  next[i] = { ...tc, expectedOutput: e.target.value };
                                  updateActiveLesson({ testCases: next });
                                }}
                              />
                            </div>
                            <button
                              type="button"
                              className="test-case-remove"
                              title="Remove test case"
                              onClick={() => {
                                const next = (lesson.testCases || []).filter((_, idx) => idx !== i);
                                updateActiveLesson({ testCases: next });
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="ghost-button test-case-add"
                          onClick={() =>
                            updateActiveLesson({
                              testCases: [...(lesson.testCases || []), { label: "", input: "", expectedOutput: "" }],
                            })
                          }
                        >
                          + Add Test Case
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className="lesson-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{lesson.body || ""}</ReactMarkdown>
              </div>
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

        <article className="panel editor-panel panel-animate">
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
            {route.page === "practice" && practiceDraft.testMode && (
              <button
                className="run-pill test-pill"
                type="button"
                onClick={runTestCases}
                disabled={testRunning}
              >
                {testRunning ? "Running…" : "Run Tests"}
              </button>
            )}
            <button className="ghost-button" type="button" onClick={submitLesson}>
              Submit
            </button>
            <span className="footer-hint">Ctrl/Cmd + Enter</span>
          </div>
        </article>

        <aside className="panel output-panel panel-animate">
          <div className="output-header">
            <h2>Console</h2>
            <span className="output-status">Ready</span>
          </div>
          <div className="output-shell">
            <pre id="output" className="output-body" />
          </div>
          {(errorExplaining || errorExplanation) && (
            <div className="error-explain-box">
              <span className="error-explain-label">What does this mean?</span>
              {errorExplaining
                ? <span className="error-explain-loading">Figuring it out…</span>
                : <span className="error-explain-text">{errorExplanation}</span>
              }
            </div>
          )}
          {testResults && (
            <div className="test-results-panel">
              <div className="test-results-header">
                <span>Test Results</span>
                <div className="test-results-header-right">
                  <span className={`test-score ${testResults.every((r) => r.passed) ? "test-score-pass" : "test-score-fail"}`}>
                    {testResults.filter((r) => r.passed).length} / {testResults.length} passed
                  </span>
                  <button className="test-results-close" onClick={() => setTestResults(null)} title="Close">✕</button>
                </div>
              </div>
              {testResults.map((r, i) => (
                <div key={i} className={`test-result-row ${r.passed ? "pass" : "fail"}`}>
                  <span className="test-result-icon">{r.passed ? "✓" : "✗"}</span>
                  <span className="test-result-label">{r.label || `Test ${i + 1}`}</span>
                  {!r.passed && (
                    <div className="test-result-detail">
                      <span>Expected: <code>{r.expected}</code></span>
                      <span>Got: <code>{r.actual}</code></span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>
      </section>
    </main>

    {renderChatBot()}

    </PageShell>
  );
}
