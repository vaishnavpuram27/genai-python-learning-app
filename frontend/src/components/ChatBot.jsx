import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "../contexts/AuthContext";
import { useRouter } from "../contexts/RouterContext";
import { useAppContext } from "../contexts/AppContext";
import { API_BASE, authHeaders } from "../utils/api";
import { MD_COMPONENTS } from "./NotebookEditor";
import {
  stripMachineBlocks,
  parseMcqFromMessage,
  parseSaFromMessage,
  parsePracticeFromMessage,
  parseLessonPlanFromMessage,
  parseLearningFromMessage,
  parseAllLearningFromMessage,
  countFences,
  hasFence,
} from "../utils/parsers";

const THINKING_WORDS = ["Thinking", "Cooking", "Processing", "Almost there", "On it"];

export default function ChatBot({
  topics = [],
  activeClass = null,
  activeLessonId = null,
  practiceDraft = null,
  learningMeta = null,
  quizMeta = null,
  importPlan = null,
  setLearningMeta,
  setQuizMeta,
  setImportPlan,
  setImportPlanExpanded,
  editorRef,
  onImportMcq,
  onImportSa,
  onImportPractice,
  onImportPlan,
  onImportLearning,
  onImportLearningAll,
  onPreviewLesson,
  stuckTrigger = null,
}) {
  const { user } = useAuth();
  const { route, activeClassId } = useRouter();
  const { setToast } = useAppContext();

  const [chatOpen, setChatOpen] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [chatAnimDir, setChatAnimDir] = useState(null);
  const [fabPos, setFabPos] = useState({ right: 24, bottom: 24 });
  const fabDraggingRef = useRef(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [thinkingIdx, setThinkingIdx] = useState(0);
  const [copiedMsgIdx, setCopiedMsgIdx] = useState(null);
  const chatMessagesEndRef = useRef(null);
  const [aiPersonaName, setAiPersonaName] = useState("");
  const processedStuckTsRef = useRef(null);

  const isTeacherView = user?.role === "teacher";

  // Split text that may contain ```lang\ncode\n``` into { text, code } parts
  function splitTextAndCode(str = "") {
    const fenceRe = /```[\w]*\n?([\s\S]*?)```/g;
    const codeBlocks = [];
    let match;
    while ((match = fenceRe.exec(str)) !== null) codeBlocks.push(match[1].trim());
    const plainText = str.replace(/```[\w]*\n?[\s\S]*?```/g, "").trim();
    return { plainText, codeBlocks };
  }

  // Fetch persona name for student view
  useEffect(() => {
    if (isTeacherView || !activeClassId) return;
    fetch(`${API_BASE}/classes/${activeClassId}/ai-config`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setAiPersonaName(d?.data?.aiConfig?.personaName || ""))
      .catch(() => {});
  }, [activeClassId, isTeacherView]);

  // Close chat and clear messages when navigating to a different item/page
  useEffect(() => {
    setChatOpen(false);
    setChatMessages([]);
  }, [route.page, route.itemId]);

  // Scroll to bottom when messages update
  useEffect(() => {
    if (chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  // Auto-send when parent triggers "I'm stuck"
  useEffect(() => {
    if (!stuckTrigger) return;
    const ts = stuckTrigger?.ts ?? stuckTrigger;
    // Skip if this trigger was already processed (prevents re-firing on remount)
    if (processedStuckTsRef.current === ts) return;
    processedStuckTsRef.current = ts;
    const text = stuckTrigger.msg || stuckTrigger;
    setChatOpen(true);
    const t = setTimeout(() => {
      const userMessage = { role: "user", content: text };
      const updatedMessages = [...chatMessages, userMessage];
      setChatMessages(updatedMessages);
      setChatLoading(true);
      setChatError("");
      sendChatMessageWithText(text, updatedMessages);
    }, 150);
    return () => clearTimeout(t);
  }, [stuckTrigger?.ts ?? stuckTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cycle thinking words while loading
  useEffect(() => {
    if (!chatLoading) return;
    setThinkingIdx(0);
    const id = setInterval(() => {
      setThinkingIdx((prev) => (prev + 1) % THINKING_WORDS.length);
    }, 1800);
    return () => clearInterval(id);
  }, [chatLoading]);

  async function repairAndImport(content, contentType, parseFn, onSuccess) {
    const direct = parseFn(content);
    if (direct) { onSuccess(direct); return; }
    setToast({ type: "success", message: "Fixing JSON…" });
    try {
      const res = await fetch(`${API_BASE}/chat/repair-json`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ brokenContent: content, contentType }),
      });
      if (!res.ok) throw new Error("Repair failed");
      const { data } = await res.json();
      const fixed = parseFn(data.fixed);
      if (fixed) { onSuccess(fixed); return; }
      throw new Error("Still invalid after repair");
    } catch {
      setToast({ type: "error", message: "Could not parse AI response. Try asking again." });
    }
  }

  async function sendChatMessageWithText(text, updatedMessages) {
    const context = {};
    if (activeClassId) {
      context.classId = activeClassId;
      context.className = activeClass?.name || "";
    }
    if (activeLessonId) context.lessonId = activeLessonId;
    if (route.itemId) context.itemId = route.itemId;
    // When teacher is on a lesson page, send the full lesson content so the AI can reference/edit it
    if (user.role === "teacher" && route.page === "learn" && learningMeta) {
      context.lessonHeading = learningMeta.title || "";
      if (learningMeta.practiceBody) context.lessonBody = learningMeta.practiceBody;
      if (learningMeta.practiceInstructions) context.lessonInstructions = learningMeta.practiceInstructions;
      if (learningMeta.topic?.title) context.lessonTopic = learningMeta.topic.title;
    }
    // When teacher is on a quiz page, send quiz context so AI can set deadline/marks
    if (user.role === "teacher" && route.page === "quiz" && quizMeta) {
      context.quizTitle = quizMeta.title || "";
      context.quizCurrentMaxPoints = quizMeta.maxPoints ?? 0;
      context.quizCurrentDeadline = quizMeta.deadline || null;
      context.quizItemId = quizMeta.id || route.itemId;
      context.quizTopicId = quizMeta.topic?.id || "";
    }
    if (editorRef?.current) {
      try { context.studentCode = editorRef.current.getValue(); } catch { /* not mounted */ }
    }
    const outputEl = document.getElementById("output");
    if (outputEl?.textContent) context.codeOutput = outputEl.textContent;
    if (user.role === "teacher" && topics.length > 0) {
      context.classTopics = topics.map((t) => ({
        title: t.title,
        items: (t.items || []).map((i) => ({ title: i.title, type: i.type })),
      }));
    }
    // Mark stuck messages so backend can switch to scaffolded mode
    if (text.toLowerCase().includes("i'm stuck") || text.toLowerCase().includes("im stuck")) {
      context.isStuck = true;
    }
    try {
      const res = await fetch(API_BASE + "/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ messages: updatedMessages.map(m => ({ role: m.role, content: m.content })), context }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err?.error?.message || "Chat request failed"); }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      setChatMessages(prev => [...prev, { role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.done) break;
              if (data.error) throw new Error(data.error);
              if (data.content) {
                assistantContent += data.content;
                setChatMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: "assistant", content: assistantContent }; return u; });
              }
            } catch (e) { if (e.message !== "Unexpected end of JSON input") throw e; }
          }
        }
      }
    } catch (err) {
      setChatError(err.message || "Something went wrong.");
    } finally {
      setChatLoading(false);
    }
  }

  async function sendChatMessage() {
    if (!chatInput.trim() || chatLoading) return;

    const userMessage = { role: "user", content: chatInput.trim() };
    const updatedMessages = [...chatMessages, userMessage];
    setChatMessages(updatedMessages);
    setChatInput("");
    setChatLoading(true);
    setChatError("");

    const context = {};
    if (activeClassId) {
      context.classId = activeClassId;
      context.className = activeClass?.name || "";
    }
    if (activeLessonId) context.lessonId = activeLessonId;
    if (route.itemId) context.itemId = route.itemId;

    if (editorRef?.current) {
      try { context.studentCode = editorRef.current.getValue(); } catch { /* not mounted */ }
    }
    const outputEl = document.getElementById("output");
    if (outputEl?.textContent) context.codeOutput = outputEl.textContent;

    if (user.role === "teacher" && topics.length > 0) {
      context.classTopics = topics.map((t) => ({
        title: t.title,
        items: (t.items || []).map((i) => ({ title: i.title, type: i.type })),
      }));
    }

    try {
      const res = await fetch(API_BASE + "/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          context,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.error?.message || "Chat request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

      setChatMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split("\n")) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.done) break;
              if (data.error) throw new Error(data.error);
              if (data.content) {
                assistantContent += data.content;
                setChatMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: assistantContent };
                  return updated;
                });
              }
            } catch (parseErr) {
              if (parseErr.message && parseErr.message !== "Unexpected end of JSON input") throw parseErr;
            }
          }
        }
      }

      // 1B: Student guardrail
      if (user?.role === "student" && assistantContent) {
        const offTopicPatterns = [
          /how about (we|you) (explore|try|learn)/i,
          /let('s| us) (explore|try something|learn)/i,
          /you could also (try|learn|explore)/i,
          /why not (try|explore|learn)/i,
        ];
        if (offTopicPatterns.some((re) => re.test(assistantContent))) {
          fetch(`${API_BASE}/chat/validate-student-response`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ response: assistantContent, lessonContext: practiceDraft?.heading || "" }),
          })
            .then((r) => r.json())
            .then(({ data }) => {
              if (!data?.onTopic && data?.correctedResponse) {
                setChatMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: data.correctedResponse };
                  return updated;
                });
              }
            })
            .catch(() => {});
        }
      }

      // 1C: Teacher quality badge
      if (user?.role === "teacher" && assistantContent) {
        const rateableFences = ["practice-json", "mcq-json", "learning-json", "sa-json", "lesson-plan-json"];
        if (rateableFences.some((f) => assistantContent.includes("```" + f))) {
          fetch(`${API_BASE}/chat/rate-content`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ contentBlock: assistantContent }),
          })
            .then((r) => r.json())
            .then(({ data }) => {
              if (data?.quality) {
                setChatMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant") updated[updated.length - 1] = { ...last, qualityRating: data };
                  return updated;
                });
              }
            })
            .catch(() => {});
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

  function collapseChat() {
    if (chatExpanded) {
      setChatAnimDir("collapsing");
      setTimeout(() => {
        setChatExpanded(false);
        setChatAnimDir("fadein");
        setTimeout(() => setChatAnimDir(null), 200);
      }, 180);
    }
  }

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

  if (!user) return null;

  const aiName = isTeacherView ? "Teaching Assistant" : (aiPersonaName || "Learning Buddy");

  // When teacher is viewing a specific lesson, show lesson-specific prompts
  const onLessonPage = route.page === "learn" && isTeacherView && learningMeta;
  const onQuizPage = route.page === "quiz" && isTeacherView && quizMeta;
  const lessonTitle = learningMeta?.title || "this lesson";
  const quizTitle = quizMeta?.title || "this quiz";
  const TEACHER_SIDEBAR = onQuizPage ? [
    { label: "⚙️ Quiz Settings", prompts: [
      `Set the total marks for "${quizTitle}" to 10`,
      `Set the deadline for "${quizTitle}" to tomorrow at 11:59 PM`,
      `Remove the deadline for "${quizTitle}"`,
      `Set max points to 5 for "${quizTitle}"`,
    ]},
    { label: "📝 Improve This Quiz", prompts: [
      `Suggest a better version of this quiz question: "${(quizMeta?.quizQuestion || "").slice(0, 60)}"`,
      `Is this a good quiz question for middle schoolers?`,
    ]},
  ] : onLessonPage ? [
    { label: "✏️ Edit This Lesson", prompts: [
      `Rewrite the entire lesson "${lessonTitle}" to be simpler and more engaging for middle schoolers`,
      `Add more relatable real-world examples to the lesson "${lessonTitle}"`,
      `Make the lesson "${lessonTitle}" shorter and punchier`,
      `Add a key concept callout block to "${lessonTitle}"`,
    ]},
    { label: "📝 Generate from This Lesson", prompts: [
      `Generate a quiz question based on "${lessonTitle}"`,
      `Create a coding practice exercise based on "${lessonTitle}"`,
      `Suggest 3 improvements to make "${lessonTitle}" better`,
    ]},
  ] : [
    { label: "✏️ Generate Content", prompts: [
      "Generate a beginner MCQ about for loops with 4 options",
      "Create a practice exercise where students print numbers 1 to 10",
      "Create a learning lesson explaining Python lists for beginners",
    ]},
    { label: "📋 Lesson Planning", prompts: [
      "Create a 3-topic lesson plan for introducing Python to middle schoolers",
      "Write a lesson plan covering functions and return values",
    ]},
    { label: "🎓 Grading Help", prompts: [
      "What feedback would you give a student who answered: [paste answer]?",
      "Does this code correctly solve: [paste problem]? Code: [paste code]",
    ]},
  ];

  // Build student sidebar from actual page context
  function buildStudentSidebar() {
    const page = route.page;

    if (page === "quiz" && quizMeta) {
      const isMcq = quizMeta.quizSubtype === "mcq";
      return {
        contextTitle: "📝 Current Question",
        contextBody: quizMeta.quizQuestion || "",
        contextOptions: isMcq ? (quizMeta.quizOptions || []).map((o, i) => ({ letter: ["A","B","C","D"][i] || String(i+1), text: o })) : null,
        prompts: [
          "Can you give me a hint without telling me the answer?",
          "I don't understand this question — can you rephrase it?",
          "What concept do I need to know to answer this?",
        ],
      };
    }

    if (page === "practice" && practiceDraft) {
      return {
        contextTitle: "💻 Your Task",
        contextBody: practiceDraft.instructions || practiceDraft.heading || "",
        contextOptions: null,
        prompts: [
          "Can you give me a hint without telling me the answer?",
          "Why is my code not working?",
          "Can you check my logic?",
        ],
      };
    }

    if (page === "learn" && learningMeta) {
      return {
        contextTitle: "📖 Current Lesson",
        contextBody: learningMeta.title || "",
        contextOptions: null,
        prompts: [
          "Can you explain this concept in simpler terms?",
          "Can you give me an example?",
          "What should I try or remember from this lesson?",
        ],
      };
    }

    return {
      contextTitle: null,
      contextBody: null,
      contextOptions: null,
      prompts: [
        "Can you give me a hint without telling me the answer?",
        "I don't understand the task — can you explain it differently?",
        "What should I try first?",
        "Why is my code not working?",
        "Explain what a for loop does with an example",
      ],
    };
  }

  const studentSidebar = buildStudentSidebar();

  function renderImportButtons(msg, i) {
    if (!msg.content) return null;
    return (
      <div className="cb-import-row">
        <button type="button" className="cb-copy-btn" title="Copy"
          onClick={() => { navigator.clipboard.writeText(msg.content); setCopiedMsgIdx(i); setTimeout(() => setCopiedMsgIdx(null), 2000); }}>
          {copiedMsgIdx === i ? "✓ Copied" : "Copy"}
        </button>
        {msg.role === "assistant" && isTeacherView && activeClassId && hasFence(msg.content, "mcq-json") && (
          <button type="button" className="cb-import-btn" onClick={() => { collapseChat(); repairAndImport(msg.content, "mcq-json", parseMcqFromMessage, (mcq) => onImportMcq?.(mcq, topics)); }}>Import MCQ</button>
        )}
        {msg.role === "assistant" && isTeacherView && activeClassId && hasFence(msg.content, "sa-json") && (
          <button type="button" className="cb-import-btn" onClick={() => { collapseChat(); repairAndImport(msg.content, "sa-json", parseSaFromMessage, (sa) => onImportSa?.(sa, topics)); }}>Import SA</button>
        )}
        {msg.role === "assistant" && isTeacherView && activeClassId && hasFence(msg.content, "practice-json") && (
          <button type="button" className="cb-import-btn" onClick={() => { collapseChat(); repairAndImport(msg.content, "practice-json", parsePracticeFromMessage, (ex) => onImportPractice?.(ex, topics)); }}>Import Exercise</button>
        )}
        {msg.role === "assistant" && isTeacherView && activeClassId && hasFence(msg.content, "lesson-plan-json") && (
          <button type="button" className="cb-import-btn" onClick={() => { collapseChat(); repairAndImport(msg.content, "lesson-plan-json", parseLessonPlanFromMessage, (plan) => onImportPlan?.(plan)); }}>Import Plan</button>
        )}
        {msg.role === "assistant" && isTeacherView && activeClassId && hasFence(msg.content, "learning-json") && (() => {
          const count = countFences(msg.content, "learning-json");
          if (count > 1) return (
            <button type="button" className="cb-import-btn" onClick={() => { collapseChat(); const items = parseAllLearningFromMessage(msg.content); if (items.length) onImportLearningAll?.(items, topics); }}>Import All ({count})</button>
          );
          return (
            <button type="button" className="cb-import-btn" onClick={() => {
              repairAndImport(msg.content, "learning-json", parseLearningFromMessage, (item) => {
                if (route.page === "learn" && isTeacherView && learningMeta) {
                  // Show inline preview instead of direct save
                  if (onPreviewLesson) { setChatOpen(false); setChatExpanded(false); onPreviewLesson(item); return; }
                  // Fallback: direct save (if no preview handler)
                  const topicId = learningMeta.topic?.id; const itemId = learningMeta.id;
                  fetch(`${API_BASE}/classes/${activeClassId}/topics/${topicId}/items/${itemId}`, {
                    method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() },
                    body: JSON.stringify({ title: item.title || learningMeta.title, type: "learning", practiceBody: item.body || "", practiceInstructions: item.instructions || "", practiceHints: item.hints || [], practiceCodeStarter: item.codeStarter || "" }),
                  }).then((res) => {
                    if (res.ok) { setLearningMeta?.((prev) => ({ ...prev, title: item.title || prev.title, practiceBody: item.body || "", practiceInstructions: item.instructions || "", practiceHints: item.hints || [], practiceCodeStarter: item.codeStarter || "" })); setToast({ type: "success", message: "Lesson updated!" }); }
                    else setToast({ type: "error", message: "Failed to update lesson." });
                  }).catch(() => setToast({ type: "error", message: "Server not reachable." }));
                  return;
                }
                if (importPlan) {
                  let matchTi = -1, matchIi = -1;
                  importPlan.topics.forEach((topic, ti) => { topic.items.forEach((planItem, ii) => { if (matchTi === -1 && planItem.type === "learning") { const a = (planItem.title || "").toLowerCase(); const b = (item.title || "").toLowerCase(); if (a === b || a.includes(b) || b.includes(a)) { matchTi = ti; matchIi = ii; } } }); });
                  if (matchTi !== -1) {
                    setImportPlan?.((prev) => ({ ...prev, topics: prev.topics.map((topic, ti) => ({ ...topic, items: topic.items.map((planItem, ii) => ti === matchTi && ii === matchIi ? { ...planItem, title: item.title, body: item.body, instructions: item.instructions, hints: item.hints } : planItem) })) }));
                    setImportPlanExpanded?.((prev) => { const next = new Set(prev); next.add(`${matchTi}-${matchIi}`); return next; });
                    setToast({ type: "success", message: `Updated "${item.title}" in the lesson plan.` }); return;
                  }
                }
                collapseChat(); onImportLearning?.(item, topics);
              });
            }}>Import Learning</button>
          );
        })()}
        {msg.role === "assistant" && isTeacherView && activeClassId && hasFence(msg.content, "quiz-config-json") && route.page === "quiz" && quizMeta && (() => {
          const match = msg.content.match(/```quiz-config-json\s*\n([\s\S]*?)```/);
          if (!match) return null;
          let cfg;
          try { cfg = JSON.parse(match[1].trim()); } catch { return null; }
          return (
            <button type="button" className="cb-import-btn" onClick={async () => {
              collapseChat();
              const topicId = quizMeta.topic?.id;
              const itemId = quizMeta.id || route.itemId;
              if (!topicId || !itemId) { setToast({ type: "error", message: "Cannot find quiz item." }); return; }
              try {
                const res = await fetch(`${API_BASE}/classes/${activeClassId}/topics/${topicId}/items/${itemId}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json", ...authHeaders() },
                  body: JSON.stringify({
                    title: quizMeta.title,
                    type: quizMeta.type,
                    ...(typeof cfg.maxPoints === "number" ? { maxPoints: cfg.maxPoints } : {}),
                    ...(cfg.deadline !== undefined ? { deadline: cfg.deadline ? new Date(cfg.deadline).toISOString() : null } : {}),
                  }),
                });
                if (res.ok) {
                  setQuizMeta?.((prev) => ({
                    ...prev,
                    ...(typeof cfg.maxPoints === "number" ? { maxPoints: cfg.maxPoints } : {}),
                    ...(cfg.deadline !== undefined ? { deadline: cfg.deadline ? new Date(cfg.deadline).toISOString() : null } : {}),
                  }));
                  setToast({ type: "success", message: "Quiz settings updated!" });
                } else {
                  setToast({ type: "error", message: "Failed to update quiz settings." });
                }
              } catch { setToast({ type: "error", message: "Server not reachable." }); }
            }}>Apply Settings</button>
          );
        })()}
        {msg.role === "assistant" && msg.qualityRating && (
          <span className={`quality-badge quality-${msg.qualityRating.quality === "needs_review" ? "review" : msg.qualityRating.quality}`}>
            {msg.qualityRating.quality === "good" ? "✓ Good" : msg.qualityRating.quality === "fair" ? "~ Fair" : "⚠ Review"}
          </span>
        )}
      </div>
    );
  }

  return (
    <>
      {/* FAB */}
      {!chatOpen && (
        <button className="cb-fab" type="button" onMouseDown={onFabMouseDown}
          style={{ right: fabPos.right, bottom: fabPos.bottom }} title="Open AI Assistant">
          <span className="cb-fab-icon">🤖</span>
          <span className="cb-fab-label">AI</span>
        </button>
      )}

      {/* Full-window chat */}
      {chatOpen && (
        <div className="cb-overlay">
          {/* Sidebar */}
          <aside className="cb-sidebar">
            <div className="cb-sidebar-header">
              <div className="cb-sidebar-avatar">🤖</div>
              <div>
                <p className="cb-sidebar-name">{aiName}</p>
                <p className="cb-sidebar-sub">{isTeacherView ? "Teacher AI" : "Learning AI"} · beta</p>
              </div>
            </div>
            {/* Teacher: prompt suggestions */}
            {isTeacherView && (
              <>
                {onLessonPage ? (
                  <>
                    <div className="cb-ctx-box">
                      <p className="cb-ctx-label">📖 Current Lesson</p>
                      <p className="cb-ctx-body" style={{ fontWeight: 700, marginBottom: "0.15rem" }}>{learningMeta.title}</p>
                      {learningMeta.topic?.title && <p className="cb-ctx-body" style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.45)", margin: 0 }}>Topic: {learningMeta.topic.title}</p>}
                    </div>
                    <p className="cb-sidebar-intro">Ask about or edit this lesson:</p>
                  </>
                ) : (
                  <p className="cb-sidebar-intro">Let's build great lessons together! Try one of these:</p>
                )}
                {TEACHER_SIDEBAR.map(({ label, prompts }) => (
                  <div key={label} className="cb-sidebar-group">
                    <p className="cb-sidebar-group-label">{label}</p>
                    {prompts.map((p) => (
                      <button key={p} type="button" className="cb-sidebar-prompt" onClick={() => setChatInput(p)}>{p}</button>
                    ))}
                  </div>
                ))}
              </>
            )}

            {/* Student: current page context */}
            {!isTeacherView && (
              <>
                {studentSidebar.contextTitle && (
                  <div className="cb-ctx-box">
                    <p className="cb-ctx-label">{studentSidebar.contextTitle}</p>
                    {studentSidebar.contextBody && (() => {
                      const { plainText, codeBlocks } = splitTextAndCode(studentSidebar.contextBody);
                      return (
                        <>
                          {plainText && <p className="cb-ctx-body">{plainText}</p>}
                          {codeBlocks.map((code, i) => (
                            <pre key={i} className="cb-ctx-code">{code}</pre>
                          ))}
                        </>
                      );
                    })()}
                    {studentSidebar.contextOptions && (
                      <div className="cb-ctx-options">
                        {studentSidebar.contextOptions.map(({ letter, text }) => (
                          <div key={letter} className="cb-ctx-option">
                            <span className="cb-ctx-option-letter">{letter}</span>
                            <span className="cb-ctx-option-text">{text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="cb-sidebar-group">
                  <p className="cb-sidebar-group-label">💬 Ask about this</p>
                  {studentSidebar.prompts.map((p) => (
                    <button key={p} type="button" className="cb-sidebar-prompt" onClick={() => setChatInput(p)}>{p}</button>
                  ))}
                </div>
              </>
            )}
            <div className="cb-sidebar-footer">
              <button type="button" className="cb-sidebar-clear" onClick={clearChat}>🗑 Clear chat</button>
            </div>
          </aside>

          {/* Main chat */}
          <div className="cb-main">
            {/* Header */}
            <div className="cb-main-header">
              <div className="cb-header-left">
                <div className="cb-header-avatar">🤖</div>
                <div>
                  <p className="cb-header-name">{aiName}</p>
                  {!isTeacherView && <p className="cb-header-notice">This conversation may be viewable by your teacher.</p>}
                </div>
              </div>
              <button type="button" className="cb-close-btn" onClick={() => setChatOpen(false)} title="Close">✕</button>
            </div>

            {/* Messages */}
            <div className="cb-messages">
              {chatMessages.length === 0 && (
                <div className="cb-welcome">
                  <div className="cb-welcome-avatar">🤖</div>
                  <p className="cb-welcome-title">Hi! I'm {aiName}.</p>
                  <p className="cb-welcome-sub">
                    {isTeacherView
                      ? "I can help you generate quizzes, exercises, lesson plans, and more. Try a prompt from the sidebar!"
                      : "I won't just give you the answer — I'll help you figure it out yourself! Ask me anything."}
                  </p>
                </div>
              )}

              {chatMessages.map((msg, i) => (
                <div key={i} className={`cb-msg cb-msg-${msg.role}`}>
                  <div className="cb-msg-avatar">
                    {msg.role === "assistant" ? "🤖" : user.name?.[0]?.toUpperCase() || "U"}
                  </div>
                  <div className="cb-msg-body">
                    <p className="cb-msg-name">{msg.role === "user" ? "You" : aiName}</p>
                    <div className="cb-msg-content">
                      {chatLoading && i === chatMessages.length - 1 && msg.role === "assistant" ? (
                        <p className="cb-typing">{THINKING_WORDS[thinkingIdx]}…</p>
                      ) : (
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{stripMachineBlocks(msg.content)}</ReactMarkdown>
                      )}
                    </div>
                    {renderImportButtons(msg, i)}
                  </div>
                </div>
              ))}

              {chatLoading && chatMessages[chatMessages.length - 1]?.role !== "assistant" && (
                <div className="cb-msg cb-msg-assistant">
                  <div className="cb-msg-avatar">🤖</div>
                  <div className="cb-msg-body">
                    <p className="cb-msg-name">{aiName}</p>
                    <div className="cb-msg-content"><p className="cb-typing">{THINKING_WORDS[thinkingIdx]}…</p></div>
                  </div>
                </div>
              )}

              {chatError && <p className="cb-error">{chatError}</p>}
              <div ref={chatMessagesEndRef} />
            </div>

            {/* Input bar */}
            <div className="cb-input-bar">
              <input type="text" className="cb-input" value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendChatMessage(); }}
                placeholder={isTeacherView ? "Generate a quiz, lesson, or ask anything…" : "Ask for a hint, explanation, or help…"}
                disabled={chatLoading} />
              <button type="button" className="cb-send-btn" onClick={sendChatMessage} disabled={chatLoading || !chatInput.trim()}>
                ➤
              </button>
            </div>
            <p className="cb-input-notice">AI makes mistakes. Double-check important information.</p>
          </div>
        </div>
      )}
    </>
  );
}
