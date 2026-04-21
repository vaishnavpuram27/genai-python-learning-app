import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, authHeaders, mapClassFromApi } from '../utils/api';
import { createTopicItemDraft } from '../utils/lessonHelpers';
import { useAuth } from './AuthContext';
import { useRouter } from './RouterContext';
import { useAppContext } from './AppContext';

const ClassContext = createContext(null);

export function ClassProvider({ children }) {
  const { user, viewRole, setViewRole } = useAuth();
  const { route, activeClassId, navigateToClass, navigateToClasses, navigateToStudent, navigateToItemResponse } = useRouter();
  const { setToast, setConfirmDialog } = useAppContext();

  // ── Class list ──────────────────────────────────────────────────────────────
  const [classes, setClasses] = useState([]);
  const [className, setClassName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [classError, setClassError] = useState("");
  const [classNotice, setClassNotice] = useState("");

  // ── Class detail ────────────────────────────────────────────────────────────
  const [classStudents, setClassStudents] = useState([]);
  const [studentsRefreshKey, setStudentsRefreshKey] = useState(0);
  const [classTab, setClassTab] = useState("topics");
  const [classStats, setClassStats] = useState(null);
  const [classStatsLoading, setClassStatsLoading] = useState(false);

  // ── Topics ───────────────────────────────────────────────────────────────────
  const [topics, setTopics] = useState([]);
  const [topicTitle, setTopicTitle] = useState("");
  const [topicError, setTopicError] = useState("");
  const [topicItemDrafts, setTopicItemDrafts] = useState({});

  // ── Editing ──────────────────────────────────────────────────────────────────
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
  const [editingItemMaxPoints, setEditingItemMaxPoints] = useState(0);
  const [editingItemDeadline, setEditingItemDeadline] = useState("");
  const [editingItemIsPublished, setEditingItemIsPublished] = useState(true);

  // ── Drag ─────────────────────────────────────────────────────────────────────
  const [dragOverItemId, setDragOverItemId] = useState(null);
  const dragItemRef = useRef(null);
  const dragFromHandleRef = useRef(false);
  const [dragOverTopicId, setDragOverTopicId] = useState(null);
  const dragTopicRef = useRef(null);
  const dragTopicFromHandleRef = useRef(false);

  // ── Student grading ──────────────────────────────────────────────────────────
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
  const [quizGradeScore, setQuizGradeScore] = useState("");

  // ── Stats / AI log ───────────────────────────────────────────────────────────
  const [studentStatsData, setStudentStatsData] = useState(null);
  const [studentStatsLoading, setStudentStatsLoading] = useState(false);
  const [studentAILog, setStudentAILog] = useState(null);
  const [studentAILogLoading, setStudentAILogLoading] = useState(false);
  const [itemResponseData, setItemResponseData] = useState(null);

  // ── Student progress cards ────────────────────────────────────────────────────
  const [myDashboard, setMyDashboard] = useState(null);
  const [myDashboardLoading, setMyDashboardLoading] = useState(false);
  const [myClassProgress, setMyClassProgress] = useState(null);
  const [myProgressRefreshKey, setMyProgressRefreshKey] = useState(0);
  const [allClassProgress, setAllClassProgress] = useState({});

  // ── Computed ──────────────────────────────────────────────────────────────────
  const activeClass = useMemo(
    () => classes.find((c) => c.id === activeClassId) || classes[0] || null,
    [classes, activeClassId]
  );

  const itemNavList = useMemo(
    () => topics.flatMap((t) => (t.items || []).map((item) => ({ id: item.id, type: item.type, topicId: t.id }))),
    [topics]
  );

  // ── Route-driven resets ───────────────────────────────────────────────────────
  useEffect(() => {
    if (route.page === "class") {
      setSelectedStudentId(null);
      setSelectedStudentName("");
      setStudentProgress([]);
      setTopicError("");
    } else if (route.page === "student") {
      setSelectedStudentId(route.studentId || null);
      setSelectedProgress(null);
    }
  }, [route.page, route.studentId]);

  useEffect(() => {
    setClassTab("topics");
    setClassStats(null);
    setMyClassProgress(null);
  }, [activeClassId]);

  // ── Effects ───────────────────────────────────────────────────────────────────

  // Fetch classes
  async function refreshClasses() {
    try {
      const res = await fetch(`${API_BASE}/classes`, { headers: { ...authHeaders() } });
      if (!res.ok) return;
      const data = await res.json();
      const apiClasses = data?.data?.classes;
      if (!apiClasses) return;
      setClasses(apiClasses.map(mapClassFromApi));
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function fetchClasses() {
      try {
        const res = await fetch(`${API_BASE}/classes`, { headers: { ...authHeaders() } });
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
      } catch { /* ignore */ }
    }
    fetchClasses();
    return () => { cancelled = true; };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch students
  useEffect(() => {
    if (!user || !activeClassId || route.page !== "class" || user.role !== "teacher") {
      setClassStudents([]);
      return;
    }
    let cancelled = false;
    async function fetchStudents() {
      try {
        const res = await fetch(`${API_BASE}/classes/${activeClassId}/students`, { headers: { ...authHeaders() } });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setClassStudents(data?.data?.students || []);
      } catch { /* ignore */ }
    }
    fetchStudents();
    return () => { cancelled = true; };
  }, [user, activeClassId, route.page, studentsRefreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch topics
  useEffect(() => {
    const itemPages = ["class", "learn", "quiz", "practice"];
    if (!user || !activeClassId || !itemPages.includes(route.page)) {
      setTopics([]);
      return;
    }
    let cancelled = false;
    async function fetchTopics() {
      try {
        const res = await fetch(`${API_BASE}/classes/${activeClassId}/topics`, { headers: { ...authHeaders() } });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setTopics(data?.data?.topics || []);
      } catch { /* ignore */ }
    }
    fetchTopics();
    return () => { cancelled = true; };
  }, [user, activeClassId, route.page]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch class stats
  useEffect(() => {
    if (!user || user.role !== "teacher" || !activeClassId || classTab !== "stats") return;
    let cancelled = false;
    setClassStatsLoading(true);
    async function fetchStats() {
      try {
        const res = await fetch(`${API_BASE}/classes/${activeClassId}/stats`, { headers: { ...authHeaders() } });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setClassStats(data?.data || null);
      } catch { /* ignore */ } finally {
        if (!cancelled) setClassStatsLoading(false);
      }
    }
    fetchStats();
    return () => { cancelled = true; };
  }, [user, activeClassId, classTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch student stats
  useEffect(() => {
    if (!user || route.page !== "student-stats" || !activeClassId || !route.studentId) {
      setStudentStatsData(null);
      return;
    }
    let cancelled = false;
    setStudentStatsLoading(true);
    async function fetchStudentStats() {
      try {
        const res = await fetch(`${API_BASE}/classes/${activeClassId}/students/${route.studentId}/stats`, { headers: { ...authHeaders() } });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setStudentStatsData(data?.data || null);
      } catch { /* ignore */ } finally {
        if (!cancelled) setStudentStatsLoading(false);
      }
    }
    fetchStudentStats();
    return () => { cancelled = true; };
  }, [user, route.page, activeClassId, route.studentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch AI log
  useEffect(() => {
    if (!user || !["student-stats", "ai-log"].includes(route.page) || !activeClassId || !route.studentId) {
      setStudentAILog(null);
      return;
    }
    let cancelled = false;
    setStudentAILogLoading(true);
    async function fetchAILog() {
      try {
        const res = await fetch(`${API_BASE}/classes/${activeClassId}/students/${route.studentId}/ai-interactions`, { headers: { ...authHeaders() } });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setStudentAILog(data?.data?.interactions || []);
      } catch { /* ignore */ } finally {
        if (!cancelled) setStudentAILogLoading(false);
      }
    }
    fetchAILog();
    return () => { cancelled = true; };
  }, [user, route.page, activeClassId, route.studentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch my class progress (student)
  useEffect(() => {
    if (!user || user.role !== "student" || !activeClassId || route.page !== "class") return;
    let cancelled = false;
    async function fetchMyProgress() {
      try {
        const res = await fetch(`${API_BASE}/classes/${activeClassId}/my-progress`, { headers: { ...authHeaders() } });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setMyClassProgress(data?.data || null);
      } catch { /* ignore */ }
    }
    fetchMyProgress();
    return () => { cancelled = true; };
  }, [user, activeClassId, route.page, myProgressRefreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch my dashboard (student)
  useEffect(() => {
    if (!user || user.role !== "student" || !activeClassId || route.page !== "dashboard") return;
    let cancelled = false;
    setMyDashboardLoading(true);
    async function fetchDashboard() {
      try {
        const res = await fetch(`${API_BASE}/classes/${activeClassId}/my-dashboard`, { headers: { ...authHeaders() } });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setMyDashboard(data?.data || null);
      } catch { /* ignore */ } finally {
        if (!cancelled) setMyDashboardLoading(false);
      }
    }
    fetchDashboard();
    return () => { cancelled = true; };
  }, [user, activeClassId, route.page]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch all class progress (student classes page)
  useEffect(() => {
    if (!user || user.role !== "student" || route.page !== "classes" || !classes.length) return;
    let cancelled = false;
    async function fetchAll() {
      const results = await Promise.allSettled(
        classes.map((c) =>
          fetch(`${API_BASE}/classes/${c.id}/my-progress`, { headers: { ...authHeaders() } })
            .then((r) => r.ok ? r.json() : null)
            .then((d) => ({ classId: c.id, data: d?.data || null }))
            .catch(() => ({ classId: c.id, data: null }))
        )
      );
      if (cancelled) return;
      const map = {};
      for (const r of results) {
        if (r.status === "fulfilled" && r.value?.data) map[r.value.classId] = r.value.data;
      }
      setAllClassProgress(map);
    }
    fetchAll();
    return () => { cancelled = true; };
  }, [user, route.page, classes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch student progress
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
    return () => { cancelled = true; };
  }, [user, activeClassId, route.page, route.studentId, classStudents]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──────────────────────────────────────────────────────────────────

  function resetClassState() {
    setClasses([]);
    setClassError("");
    setClassNotice("");
    setJoinCode("");
    setClassName("");
  }

  function navigateToItemResponseWithData(classId, studentId, item) {
    setItemResponseData(item);
    navigateToItemResponse(classId, studentId);
  }

  function handleSelectClass(id) {
    if (user?.role === "teacher") setViewRole("teacher");
    navigateToClass(id);
  }

  async function handleCreateClass() {
    setClassError("");
    setClassNotice("");
    if (!className.trim()) { setClassError("Enter a class name."); return; }
    try {
      const res = await fetch(`${API_BASE}/classes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ name: className.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setClassError(data?.error?.message || "Unable to create class."); return; }
      const created = mapClassFromApi(data?.data?.classroom);
      if (created) {
        setClasses((prev) => [created, ...prev]);
        setClassNotice(`Class created. Join code: ${created.joinCode}`);
        setClassName("");
        navigateToClass(created.id);
      }
    } catch { setClassError("Class server not reachable."); }
  }

  async function handleJoinClass() {
    setClassError("");
    setClassNotice("");
    if (!joinCode.trim()) { setClassError("Enter a join code."); return; }
    try {
      const res = await fetch(`${API_BASE}/classes/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ joinCode: joinCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setClassError(data?.error?.message || "Unable to join class."); return; }
      const joined = mapClassFromApi(data?.data?.classroom);
      if (joined) {
        setClasses((prev) => prev.some((item) => item.id === joined.id) ? prev : [joined, ...prev]);
        setClassNotice("Class joined.");
        setJoinCode("");
        navigateToClass(joined.id);
      }
    } catch { setClassError("Class server not reachable."); }
  }

  async function handleDeleteClass() {
    if (!activeClassId) return;
    setConfirmDialog({
      message: "Delete this class and all its lessons? This cannot be undone.",
      danger: true,
      onConfirm: async () => {
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
          navigateToClasses();
        } catch { setClassError("Class server not reachable."); }
      },
    });
  }

  function handleRefreshStudents() {
    setStudentsRefreshKey((prev) => prev + 1);
  }

  async function handleCreateTopic() {
    if (!activeClassId) return;
    setTopicError("");
    if (!topicTitle.trim()) { setTopicError("Enter a topic title."); return; }
    try {
      const res = await fetch(`${API_BASE}/classes/${activeClassId}/topics`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ title: topicTitle.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setTopicError(data?.error?.message || "Unable to create topic."); return; }
      const created = data?.data?.topic;
      if (created) { setTopics((prev) => [created, ...prev]); setTopicTitle(""); }
    } catch { setTopicError("Topic server not reachable."); }
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
    if (!draft.title.trim()) { setTopicError("Enter a title for the topic item."); return; }
    if (draft.type === "quiz" && !draft.quizQuestion.trim()) { setTopicError("Enter a quiz question."); return; }
    if (draft.type === "quiz" && draft.quizSubtype === "mcq" && (draft.quizOptions || []).length < 2) { setTopicError("MCQ needs at least two options."); return; }
    if (draft.type === "quiz" && !draft.quizAnswer.trim()) { setTopicError("Set the expected answer."); return; }
    setTopicError("");
    const payload = { title: draft.title.trim(), type: draft.type };
    if (draft.type === "quiz" || draft.type === "practice") payload.maxPoints = Number(draft.maxPoints) || 0;
    if (draft.type === "quiz") {
      payload.quizSubtype = draft.quizSubtype;
      payload.quizQuestion = draft.quizQuestion.trim();
      payload.quizOptions = draft.quizSubtype === "mcq" ? (draft.quizOptions || []) : [];
      payload.quizAnswer = draft.quizAnswer.trim();
    }
    try {
      const res = await fetch(`${API_BASE}/classes/${activeClassId}/topics/${topicId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setTopicError(data?.error?.message || "Unable to add item."); return; }
      const created = data?.data?.item;
      if (created) {
        setTopics((prev) =>
          prev.map((topic) =>
            topic.id === topicId
              ? { ...topic, items: [...(topic.items || []), created].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) }
              : topic
          )
        );
        updateTopicDraft(topicId, createTopicItemDraft({ type: draft.type }));
      }
    } catch { setTopicError("Topic item server not reachable."); }
  }

  function beginEditTopic(topic) {
    setEditingTopicId(topic.id);
    setEditingTopicTitle(topic.title);
  }

  async function saveEditTopic(topicId) {
    if (!activeClassId || !topicId) return;
    if (!editingTopicTitle.trim()) { setTopicError("Topic title is required."); return; }
    try {
      const res = await fetch(`${API_BASE}/classes/${activeClassId}/topics/${topicId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ title: editingTopicTitle.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setTopicError(data?.error?.message || "Unable to update topic."); return; }
      const updated = data?.data?.topic;
      if (updated) {
        setTopics((prev) => prev.map((topic) => topic.id === topicId ? { ...topic, title: updated.title } : topic));
      }
      setEditingTopicId(null);
      setEditingTopicTitle("");
      setTopicError("");
    } catch { setTopicError("Topic server not reachable."); }
  }

  async function deleteTopic(topicId) {
    if (!activeClassId || !topicId) return;
    const msg = classStudents.length > 0
      ? "Students are enrolled. Deleting this topic will remove it for all students."
      : "Delete this topic? This cannot be undone.";
    setConfirmDialog({
      message: msg,
      danger: true,
      onConfirm: async () => {
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
        } catch { setTopicError("Topic server not reachable."); }
      },
    });
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
    setEditingItemMaxPoints(item.maxPoints ?? 0);
    setEditingItemDeadline(item.deadline ? new Date(item.deadline).toISOString().slice(0, 16) : "");
    setEditingItemIsPublished(item.isPublished !== false);
  }

  async function saveEditItem(topicId, itemId) {
    if (!activeClassId || !topicId || !itemId) return;
    if (!editingItemTitle.trim()) { setTopicError("Item title is required."); return; }
    if (editingItemType === "quiz" && !editingItemQuizQuestion.trim()) { setTopicError("Quiz question is required."); return; }
    if (editingItemType === "quiz" && editingItemQuizSubtype === "mcq" && editingItemQuizOptions.length < 2) { setTopicError("MCQ needs at least two options."); return; }
    if (editingItemType === "quiz" && !editingItemQuizAnswer.trim()) { setTopicError("Set the expected answer."); return; }
    const payload = { title: editingItemTitle.trim(), type: editingItemType };
    if (editingItemType === "quiz" || editingItemType === "practice") payload.maxPoints = Number(editingItemMaxPoints) || 0;
    payload.deadline = editingItemDeadline ? new Date(editingItemDeadline).toISOString() : null;
    payload.isPublished = editingItemIsPublished;
    if (editingItemType === "learning") {
      payload.practiceBody = editingItemBody;
      payload.practiceInstructions = editingItemInstructions;
      payload.practiceCodeStarter = editingItemCodeStarter;
    }
    if (editingItemType === "quiz") {
      payload.quizSubtype = editingItemQuizSubtype;
      payload.quizQuestion = editingItemQuizQuestion.trim();
      payload.quizOptions = editingItemQuizSubtype === "mcq" ? editingItemQuizOptions : [];
      payload.quizAnswer = editingItemQuizAnswer.trim();
    }
    try {
      const res = await fetch(`${API_BASE}/classes/${activeClassId}/topics/${topicId}/items/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setTopicError(data?.error?.message || "Unable to update item."); return; }
      const updated = data?.data?.item;
      if (updated) {
        setTopics((prev) =>
          prev.map((topic) =>
            topic.id === topicId
              ? { ...topic, items: (topic.items || []).map((item) => item.id === itemId ? { ...item, ...updated } : item) }
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
    } catch { setTopicError("Item server not reachable."); }
  }

  async function handleItemReorder(topicId, draggedId, targetId) {
    if (draggedId === targetId) return;
    const currentTopic = topics.find((t) => t.id === topicId);
    if (!currentTopic) return;
    const items = [...(currentTopic.items || [])];
    const fromIdx = items.findIndex((i) => i.id === draggedId);
    const toIdx = items.findIndex((i) => i.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);
    setTopics((prev) => prev.map((t) => (t.id === topicId ? { ...t, items } : t)));
    try {
      const res = await fetch(`${API_BASE}/classes/${activeClassId}/topics/${topicId}/items/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ itemIds: items.map((i) => i.id) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setToast({ type: "error", message: `Reorder failed (${res.status}): ${data?.error?.message || "unknown error"}` });
      }
    } catch { setToast({ type: "error", message: "Reorder failed: network error" }); }
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
    } catch { setToast({ type: "error", message: "Reorder failed: network error" }); }
  }

  async function deleteItem(topicId, itemId) {
    if (!activeClassId || !topicId || !itemId) return;
    const msg = classStudents.length > 0
      ? "Students are enrolled. Deleting this item will remove it for all students."
      : "Delete this item? This cannot be undone.";
    setConfirmDialog({
      message: msg,
      danger: true,
      onConfirm: async () => {
        try {
          const res = await fetch(`${API_BASE}/classes/${activeClassId}/topics/${topicId}/items/${itemId}`, {
            method: "DELETE",
            headers: { ...authHeaders() },
          });
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
        } catch { setTopicError("Item server not reachable."); }
      },
    });
  }

  function handleSelectStudent(student) {
    if (!activeClassId || !student?.id) return;
    setSelectedStudentName(student.name || "Student");
    navigateToStudent(activeClassId, student.id);
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
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            isCorrect,
            feedback: quizGradeFeedback.trim(),
            ...(quizGradeScore !== "" && { score: Number(quizGradeScore) }),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) { setStudentProgressError(data?.error?.message || "Unable to grade quiz attempt."); return; }
      const updated = data?.data?.attempt;
      if (!updated) return;
      setStudentQuizAttempts((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      setSelectedQuizAttempt((prev) => (prev ? { ...prev, ...updated } : prev));
      setToast({ type: "success", message: "Quiz graded" });
    } catch { setStudentProgressError("Unable to grade quiz attempt."); }
    finally { setQuizGrading(false); }
  }

  return (
    <ClassContext.Provider value={{
      // Class list
      classes, setClasses, className, setClassName, joinCode, setJoinCode,
      classError, classNotice, allClassProgress,
      // Class detail
      classStudents, classTab, setClassTab, classStats, classStatsLoading,
      // Topics
      topics, setTopics, topicTitle, setTopicTitle, topicError, topicItemDrafts,
      // Editing topic
      editingTopicId, setEditingTopicId, editingTopicTitle, setEditingTopicTitle,
      // Editing item
      editingItemId, setEditingItemId, editingItemTitle, setEditingItemTitle,
      editingItemType, setEditingItemType, editingItemBody, setEditingItemBody,
      editingItemInstructions, setEditingItemInstructions,
      editingItemCodeStarter, setEditingItemCodeStarter,
      editingItemQuizSubtype, setEditingItemQuizSubtype,
      editingItemQuizQuestion, setEditingItemQuizQuestion,
      editingItemQuizOptions, setEditingItemQuizOptions,
      editingItemQuizOptionInput, setEditingItemQuizOptionInput,
      editingItemQuizOptionEditIndex, setEditingItemQuizOptionEditIndex,
      editingItemQuizAnswer, setEditingItemQuizAnswer,
      editingItemMaxPoints, setEditingItemMaxPoints,
      editingItemDeadline, setEditingItemDeadline,
      editingItemIsPublished, setEditingItemIsPublished,
      // Drag
      dragOverItemId, setDragOverItemId, dragItemRef, dragFromHandleRef,
      dragOverTopicId, setDragOverTopicId, dragTopicRef, dragTopicFromHandleRef,
      // Student
      selectedStudentId, selectedStudentName,
      studentProgress, studentQuizAttempts, studentProgressError, studentProgressLoading,
      selectedProgress, setSelectedProgress,
      selectedQuizAttempt, setSelectedQuizAttempt,
      quizGradeFeedback, setQuizGradeFeedback,
      quizGrading, quizGradeScore, setQuizGradeScore,
      // Stats / AI log
      studentStatsData, studentStatsLoading, studentAILog, studentAILogLoading,
      itemResponseData, setItemResponseData,
      // Progress
      myDashboard, myDashboardLoading, myClassProgress, setMyClassProgress, setMyProgressRefreshKey,
      // Computed
      activeClass, itemNavList,
      // Handlers
      refreshClasses,
      resetClassState,
      navigateToItemResponseWithData,
      handleSelectClass, handleCreateClass, handleJoinClass, handleDeleteClass,
      handleRefreshStudents,
      handleCreateTopic, updateTopicDraft, handleCreateTopicItem,
      beginEditTopic, saveEditTopic, deleteTopic,
      beginEditItem, saveEditItem, deleteItem,
      handleItemReorder, handleTopicReorder,
      handleSelectStudent,
      gradeSelectedQuizAttempt,
    }}>
      {children}
    </ClassContext.Provider>
  );
}

export function useClassContext() {
  return useContext(ClassContext);
}
