import { forwardRef, useImperativeHandle, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { API_BASE, authHeaders } from '../utils/api';
import { LearningBodyEditor, PlanLearningEditor } from './NotebookEditor';

const ImportModals = forwardRef(function ImportModals(
  { activeClassId, topics, setTopics, setToast, setConfirmDialog },
  ref
) {
  // MCQ
  const [importMcq, setImportMcq] = useState(null);
  const [importMcqTopicId, setImportMcqTopicId] = useState("");
  const [importMcqTitle, setImportMcqTitle] = useState("");
  const [importMcqSaving, setImportMcqSaving] = useState(false);
  const [importMcqError, setImportMcqError] = useState("");
  const [importMcqNewTopic, setImportMcqNewTopic] = useState("");
  // SA
  const [importSa, setImportSa] = useState(null);
  const [importSaTopicId, setImportSaTopicId] = useState("");
  const [importSaSaving, setImportSaSaving] = useState(false);
  const [importSaError, setImportSaError] = useState("");
  const [importSaNewTopic, setImportSaNewTopic] = useState("");
  // Practice
  const [importPractice, setImportPractice] = useState(null);
  const [importPracticeTopicId, setImportPracticeTopicId] = useState("");
  const [importPracticeNewTopic, setImportPracticeNewTopic] = useState("");
  const [importPracticeSaving, setImportPracticeSaving] = useState(false);
  const [importPracticeError, setImportPracticeError] = useState("");
  // Plan
  const [importPlan, setImportPlan] = useState(null);
  const [importPlanSaving, setImportPlanSaving] = useState(false);
  const [importPlanError, setImportPlanError] = useState("");
  const [importPlanSelected, setImportPlanSelected] = useState(new Set());
  const [importPlanExpanded, setImportPlanExpanded] = useState(new Set());
  const [importPlanTopicMap, setImportPlanTopicMap] = useState({});
  // Learning
  const [importLearning, setImportLearning] = useState(null);
  const [importLearningTopicId, setImportLearningTopicId] = useState("");
  const [importLearningNewTopic, setImportLearningNewTopic] = useState("");
  const [importLearningSaving, setImportLearningSaving] = useState(false);
  const [importLearningError, setImportLearningError] = useState("");
  const [importLearningBodyEdit, setImportLearningBodyEdit] = useState(false);
  // LearningAll
  const [importLearningAll, setImportLearningAll] = useState(null);
  const [importLearningAllTopicId, setImportLearningAllTopicId] = useState("");
  const [importLearningAllNewTopic, setImportLearningAllNewTopic] = useState("");
  const [importLearningAllSaving, setImportLearningAllSaving] = useState(false);
  const [importLearningAllError, setImportLearningAllError] = useState("");

  useImperativeHandle(ref, () => ({
    openMcq(mcq, topicsSnap) {
      setImportMcq(mcq);
      setImportMcqTopicId(topicsSnap[0]?.id || "__new__");
      setImportMcqTitle(mcq.title || mcq.question.slice(0, 60));
      setImportMcqError("");
      setImportMcqNewTopic("");
    },
    openSa(sa, topicsSnap) {
      setImportSa(sa);
      setImportSaTopicId(topicsSnap[0]?.id || "__new__");
      setImportSaError("");
      setImportSaNewTopic("");
    },
    openPractice(ex, topicsSnap) {
      setImportPractice(ex);
      setImportPracticeTopicId(topicsSnap[0]?.id || "__new__");
      setImportPracticeError("");
      setImportPracticeNewTopic("");
    },
    openPlan(plan) {
      setImportPlan(plan);
      setImportPlanError("");
      const allKeys = new Set();
      (plan.topics || []).forEach((t, ti) =>
        (t.items || []).forEach((_, ii) => allKeys.add(`${ti}-${ii}`))
      );
      setImportPlanSelected(allKeys);
      setImportPlanExpanded(new Set());
      const topicMap = {};
      (plan.topics || []).forEach((_, ti) => { topicMap[ti] = "__new__"; });
      setImportPlanTopicMap(topicMap);
    },
    setPlanExpanded: setImportPlanExpanded,
    getPlan: () => importPlan,
    setPlan: setImportPlan,
    openLearning(item, topicsSnap) {
      setImportLearning(item);
      setImportLearningTopicId(topicsSnap[0]?.id || "__new__");
      setImportLearningError("");
      setImportLearningNewTopic("");
      setImportLearningBodyEdit(false);
    },
    openLearningAll(items, topicsSnap) {
      setImportLearningAll(items);
      setImportLearningAllTopicId(topicsSnap[0]?.id || "__new__");
      setImportLearningAllError("");
      setImportLearningAllNewTopic("");
    },
  }));

  // ─── MCQ save ────────────────────────────────────────────────────────────────
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

  // ─── SA save ─────────────────────────────────────────────────────────────────
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

  // ─── Practice save ───────────────────────────────────────────────────────────
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

  // ─── Plan save ───────────────────────────────────────────────────────────────
  async function handleImportPlanSave() {
    if (!activeClassId || !importPlan) return;
    setImportPlanError("");
    if (!importPlan.planTitle?.trim()) { setImportPlanError("Plan title is required."); return; }
    const selectedCount = importPlanSelected.size;
    if (selectedCount === 0) { setImportPlanError("Select at least one item to import."); return; }
    setImportPlanSaving(true);
    try {
      for (const [ti, topic] of (importPlan.topics || []).entries()) {
        const selectedItems = (topic.items || []).filter((_, ii) => importPlanSelected.has(`${ti}-${ii}`));
        if (selectedItems.length === 0) continue;
        const mappedTopicId = importPlanTopicMap[ti];
        let topicId;
        if (mappedTopicId && mappedTopicId !== "__new__") {
          topicId = mappedTopicId;
        } else {
          const topicRes = await fetch(`${API_BASE}/classes/${activeClassId}/topics`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ title: topic.title }),
          });
          const topicData = await topicRes.json();
          if (!topicRes.ok) { setImportPlanError(topicData?.error?.message || "Failed to create topic."); setImportPlanSaving(false); return; }
          const createdTopic = topicData?.data?.topic;
          topicId = createdTopic?.id || createdTopic?._id;
          setTopics((prev) => [...prev, createdTopic]);
        }
        for (const item of selectedItems) {
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
      setToast({ type: "success", message: `Imported ${selectedCount} item(s)!` });
    } catch {
      setImportPlanError("Server not reachable.");
    } finally {
      setImportPlanSaving(false);
    }
  }

  // ─── Learning save ───────────────────────────────────────────────────────────
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

  // ─── LearningAll save ────────────────────────────────────────────────────────
  async function handleImportLearningAllSave() {
    if (!activeClassId || !importLearningAll?.length) return;
    setImportLearningAllError("");
    setImportLearningAllSaving(true);
    try {
      let topicId = importLearningAllTopicId;
      if (topicId === "__new__") {
        if (!importLearningAllNewTopic.trim()) {
          setImportLearningAllError("New topic title is required.");
          setImportLearningAllSaving(false);
          return;
        }
        const topicRes = await fetch(`${API_BASE}/classes/${activeClassId}/topics`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ title: importLearningAllNewTopic.trim() }),
        });
        const topicData = await topicRes.json();
        if (!topicRes.ok) { setImportLearningAllError(topicData?.error?.message || "Failed to create topic."); setImportLearningAllSaving(false); return; }
        const created = topicData?.data?.topic;
        topicId = created?.id || created?._id;
        setTopics((prev) => [...prev, created]);
      }
      const savedItems = [];
      for (const item of importLearningAll) {
        const itemRes = await fetch(`${API_BASE}/classes/${activeClassId}/topics/${topicId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            title: item.title.trim(),
            type: "learning",
            practiceBody: item.body || "",
            practiceInstructions: item.instructions || "",
            practiceHints: Array.isArray(item.hints) ? item.hints : [],
            practiceCodeStarter: item.codeStarter || "",
          }),
        });
        const itemData = await itemRes.json();
        if (itemRes.ok && itemData?.data?.item) savedItems.push({ topicId, item: itemData.data.item });
      }
      setTopics((prev) =>
        prev.map((t) => {
          const newItems = savedItems.filter((s) => s.topicId === (t.id || t._id?.toString())).map((s) => s.item);
          return newItems.length ? { ...t, items: [...(t.items || []), ...newItems] } : t;
        })
      );
      setImportLearningAll(null);
      setToast({ type: "success", message: `${savedItems.length} lessons imported!` });
    } catch {
      setImportLearningAllError("Server not reachable.");
    } finally {
      setImportLearningAllSaving(false);
    }
  }

  // ─── MCQ modal ───────────────────────────────────────────────────────────────
  function renderImportMcqModal() {
    if (!importMcq) return null;
    return (
      <div className="modal-overlay" onClick={() => setImportMcq(null)}>
        <div className="modal-content mcq-modal" onClick={(e) => e.stopPropagation()}>
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
            {(() => {
              const q = importMcq.question || "";
              const codeMatch = q.match(/^([\s\S]*?)```(\w*)\n([\s\S]*?)```([\s\S]*)$/);
              if (codeMatch) {
                const [, textBefore, lang, code, textAfter] = codeMatch;
                return (
                  <div className="mcq-question-split">
                    {textBefore.trim() && (
                      <textarea
                        value={textBefore.trim()}
                        rows={2}
                        onChange={(e) => setImportMcq({ ...importMcq, question: `${e.target.value}\n\`\`\`${lang}\n${code}\`\`\`${textAfter}` })}
                      />
                    )}
                    <div className="mcq-code-window">
                      <div className="mcq-code-window-bar">
                        <span className="mcq-code-window-lang">{lang || "code"}</span>
                        <div className="mcq-code-window-dots"><span /><span /><span /></div>
                      </div>
                      <textarea
                        className="mcq-code-window-editor"
                        value={code}
                        spellCheck={false}
                        onChange={(e) => setImportMcq({ ...importMcq, question: `${textBefore}\`\`\`${lang}\n${e.target.value}\`\`\`${textAfter}` })}
                      />
                    </div>
                    {textAfter.trim() && (
                      <textarea
                        value={textAfter.trim()}
                        rows={2}
                        onChange={(e) => setImportMcq({ ...importMcq, question: `${textBefore}\`\`\`${lang}\n${code}\`\`\`\n${e.target.value}` })}
                      />
                    )}
                  </div>
                );
              }
              return (
                <textarea
                  value={q}
                  onChange={(e) => setImportMcq({ ...importMcq, question: e.target.value })}
                  rows={3}
                />
              );
            })()}
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
            <select value={importMcqTopicId} onChange={(e) => setImportMcqTopicId(e.target.value)}>
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

  // ─── SA modal ────────────────────────────────────────────────────────────────
  function renderImportSaModal() {
    if (!importSa) return null;
    const question = importSa.questions?.[0];
    if (!question) return null;
    return (
      <div className="modal-overlay" onClick={() => setImportSa(null)}>
        <div className="modal-content mcq-modal" onClick={(e) => e.stopPropagation()}>
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
            <select value={importSaTopicId} onChange={(e) => setImportSaTopicId(e.target.value)}>
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

  // ─── Practice modal ──────────────────────────────────────────────────────────
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
            <select value={importPracticeTopicId} onChange={(e) => setImportPracticeTopicId(e.target.value)}>
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

  // ─── Plan modal ──────────────────────────────────────────────────────────────
  function renderImportPlanModal() {
    if (!importPlan) return null;

    const toggleItem = (key) => {
      setImportPlanSelected((prev) => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
      });
    };

    const toggleTopic = (ti, items) => {
      const keys = (items || []).map((_, ii) => `${ti}-${ii}`);
      const allSelected = keys.every((k) => importPlanSelected.has(k));
      setImportPlanSelected((prev) => {
        const next = new Set(prev);
        keys.forEach((k) => allSelected ? next.delete(k) : next.add(k));
        return next;
      });
    };

    const toggleExpand = (key) => {
      setImportPlanExpanded((prev) => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
      });
    };

    const selectedCount = importPlanSelected.size;

    const updatePlanItem = (ti, ii, patch) => {
      setImportPlan((prev) => {
        const updatedTopics = prev.topics.map((t, tIdx) =>
          tIdx !== ti ? t : {
            ...t,
            items: t.items.map((itm, iIdx) =>
              iIdx !== ii ? itm : { ...itm, ...patch }
            ),
          }
        );
        return { ...prev, topics: updatedTopics };
      });
    };

    const renderItemEdit = (item, ti, ii) => {
      if (item.type === "learning") {
        return (
          <PlanLearningEditor
            item={item}
            onUpdate={(patch) => updatePlanItem(ti, ii, patch)}
          />
        );
      }
      if (item.type === "quiz") {
        return (
          <div className="plan-edit-fields">
            <label className="plan-edit-label">Question</label>
            <textarea
              className="plan-edit-textarea"
              rows={4}
              value={item.quizQuestion || ""}
              onChange={(e) => updatePlanItem(ti, ii, { quizQuestion: e.target.value })}
            />
            {item.quizSubtype === "mcq" && Array.isArray(item.quizOptions) && (
              <div>
                <label className="plan-edit-label">Options — select correct answer</label>
                {item.quizOptions.map((opt, oi) => {
                  const letter = String.fromCharCode(65 + oi);
                  const correctIdx = "ABCDEFGHIJ".indexOf((item.quizAnswer || "").toUpperCase());
                  const isCorrect = oi === correctIdx || opt === item.quizAnswer;
                  return (
                    <div key={oi} className="plan-edit-option-row">
                      <input
                        type="radio"
                        name={`quiz-answer-${ti}-${ii}`}
                        checked={isCorrect}
                        onChange={() => updatePlanItem(ti, ii, { quizAnswer: letter })}
                        style={{ cursor: "pointer", flexShrink: 0 }}
                      />
                      <span className="plan-edit-option-letter">{letter}</span>
                      <input
                        className="plan-edit-option-input"
                        value={opt}
                        onChange={(e) => {
                          const opts = [...item.quizOptions];
                          opts[oi] = e.target.value;
                          updatePlanItem(ti, ii, { quizOptions: opts });
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            <label className="plan-edit-label">Explanation (optional)</label>
            <textarea
              className="plan-edit-textarea"
              rows={2}
              value={item.explanation || ""}
              onChange={(e) => updatePlanItem(ti, ii, { explanation: e.target.value })}
            />
          </div>
        );
      }
      if (item.type === "practice") {
        const testCases = item.testCases || [];
        return (
          <div className="plan-edit-fields">
            <label className="plan-edit-label">Instructions</label>
            <textarea
              className="plan-edit-textarea"
              rows={3}
              value={item.instructions || ""}
              onChange={(e) => updatePlanItem(ti, ii, { instructions: e.target.value })}
            />
            <label className="plan-edit-label">Starter Code</label>
            <textarea
              className="plan-edit-code"
              rows={6}
              spellCheck={false}
              value={item.codeStarter || ""}
              onChange={(e) => updatePlanItem(ti, ii, { codeStarter: e.target.value })}
            />
            <label className="plan-edit-label">Model Answer</label>
            <textarea
              className="plan-edit-code"
              rows={6}
              spellCheck={false}
              value={item.modelAnswer || ""}
              onChange={(e) => updatePlanItem(ti, ii, { modelAnswer: e.target.value })}
            />
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
              <input
                type="checkbox"
                id={`plan-testmode-${ti}-${ii}`}
                checked={!!item.testMode}
                onChange={(e) => updatePlanItem(ti, ii, { testMode: e.target.checked })}
                style={{ width: "auto", cursor: "pointer" }}
              />
              <label htmlFor={`plan-testmode-${ti}-${ii}`} style={{ margin: 0, textTransform: "none", letterSpacing: 0, fontSize: "0.82rem", fontWeight: 600, cursor: "pointer" }}>
                LeetCode-style test cases
              </label>
            </div>
            {item.testMode && (
              <div className="plan-edit-fields" style={{ marginTop: "0.25rem" }}>
                {testCases.map((tc, tci) => (
                  <div key={tci} className="test-case-row" style={{ marginBottom: "0.5rem" }}>
                    <input
                      className="test-case-label-input"
                      placeholder={`Test ${tci + 1} label`}
                      value={tc.label || ""}
                      onChange={(e) => {
                        const next = testCases.map((t, i) => i === tci ? { ...t, label: e.target.value } : t);
                        updatePlanItem(ti, ii, { testCases: next });
                      }}
                    />
                    <div className="test-case-fields">
                      <textarea
                        className="test-case-input"
                        placeholder="Input (one value per line)"
                        rows={2}
                        value={tc.input || ""}
                        onChange={(e) => {
                          const next = testCases.map((t, i) => i === tci ? { ...t, input: e.target.value } : t);
                          updatePlanItem(ti, ii, { testCases: next });
                        }}
                      />
                      <textarea
                        className="test-case-expected"
                        placeholder="Expected output"
                        rows={2}
                        value={tc.expectedOutput || ""}
                        onChange={(e) => {
                          const next = testCases.map((t, i) => i === tci ? { ...t, expectedOutput: e.target.value } : t);
                          updatePlanItem(ti, ii, { testCases: next });
                        }}
                      />
                      <button
                        type="button"
                        className="ghost-button"
                        style={{ padding: "4px 8px", fontSize: "0.75rem", color: "var(--danger-text)" }}
                        onClick={() => updatePlanItem(ti, ii, { testCases: testCases.filter((_, i) => i !== tci) })}
                      >✕</button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="ghost-button test-case-add"
                  onClick={() => updatePlanItem(ti, ii, { testCases: [...testCases, { label: "", input: "", expectedOutput: "" }] })}
                >
                  + Add Test Case
                </button>
              </div>
            )}
          </div>
        );
      }
      return null;
    };

    return (
      <div className="modal-overlay" onClick={() => {
        if (importPlanSelected.size > 0) {
          setConfirmDialog({
            message: `You have ${importPlanSelected.size} item${importPlanSelected.size !== 1 ? "s" : ""} selected. Close without importing?`,
            danger: false,
            onConfirm: () => setImportPlan(null),
          });
        } else {
          setImportPlan(null);
        }
      }}>
        <div className="modal-content plan-modal" onClick={(e) => e.stopPropagation()}>

          {/* ── Header ── */}
          <div className="plan-modal-header">
            <div>
              <p className="plan-modal-eyebrow">AI Generated</p>
              <h3 className="plan-modal-title">Import Lesson Plan</h3>
            </div>
            <button type="button" className="plan-modal-close" onClick={() => setImportPlan(null)}>✕</button>
          </div>

          {/* ── Plan title field ── */}
          <div className="plan-modal-title-field">
            <span className="plan-modal-title-label">Plan Title</span>
            <input
              className="plan-modal-title-input"
              value={importPlan.planTitle}
              onChange={(e) => setImportPlan({ ...importPlan, planTitle: e.target.value })}
              placeholder="Enter a title for this lesson plan…"
            />
          </div>

          {/* ── Scrollable body ── */}
          <div className="plan-modal-body">
            {importPlanError && <p className="plan-modal-error">{importPlanError}</p>}
            <div className="plan-preview">
              {(importPlan.topics || []).map((topic, ti) => {
                const topicKeys = (topic.items || []).map((_, ii) => `${ti}-${ii}`);
                const allTopicSelected = topicKeys.length > 0 && topicKeys.every((k) => importPlanSelected.has(k));
                const someTopicSelected = topicKeys.some((k) => importPlanSelected.has(k));
                const selectedInTopic = topicKeys.filter((k) => importPlanSelected.has(k)).length;
                return (
                  <div key={ti} className="plan-topic-block">
                    {/* Topic header row */}
                    <div className="plan-topic-title">
                      <input
                        type="checkbox"
                        checked={allTopicSelected}
                        ref={(el) => { if (el) el.indeterminate = someTopicSelected && !allTopicSelected; }}
                        onChange={() => toggleTopic(ti, topic.items)}
                        style={{ cursor: "pointer" }}
                      />
                      <span className="plan-topic-title-text">{topic.title}</span>
                      <span className="plan-topic-count">{selectedInTopic} / {topicKeys.length} selected</span>
                    </div>
                    {/* Save-to-topic select */}
                    <div className="plan-topic-save-row">
                      <label className="plan-topic-save-label">Save to</label>
                      <select
                        value={importPlanTopicMap[ti] || "__new__"}
                        onChange={(e) => setImportPlanTopicMap((prev) => ({ ...prev, [ti]: e.target.value }))}
                        className="plan-topic-save-select"
                      >
                        <option value="__new__">+ Create "{topic.title}"</option>
                        {topics.map((t) => <option key={t.id || t._id} value={t.id || t._id}>{t.title}</option>)}
                      </select>
                    </div>
                    {/* Items list */}
                    <div className="plan-items-list">
                      {(topic.items || []).map((item, ii) => {
                        const key = `${ti}-${ii}`;
                        const isSelected = importPlanSelected.has(key);
                        const isExpanded = importPlanExpanded.has(key);
                        return (
                          <div key={ii}>
                            <div className="plan-item-row">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleItem(key)}
                                style={{ cursor: "pointer" }}
                              />
                              <span className={`topic-type type-${item.type}`}>{item.type}</span>
                              <input
                                className="plan-item-title-input"
                                value={item.title || ""}
                                onChange={(e) => updatePlanItem(ti, ii, { title: e.target.value })}
                              />
                              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                {item.testMode && <span className="teacher-only-badge">Tests</span>}
                                <button
                                  type="button"
                                  className="ghost-button"
                                  style={{ padding: "2px 8px", fontSize: "0.75rem", whiteSpace: "nowrap" }}
                                  onClick={() => toggleExpand(key)}
                                >
                                  {isExpanded ? "▲ Hide" : "▼ Edit"}
                                </button>
                              </div>
                            </div>
                            {isExpanded && (
                              <div className="plan-item-preview">
                                {renderItemEdit(item, ti, ii)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Sticky footer ── */}
          <div className="plan-modal-footer">
            <span className={`plan-modal-count${selectedCount === 0 ? " error" : ""}`}>
              {selectedCount === 0
                ? "No items selected"
                : <><strong>{selectedCount}</strong> item{selectedCount !== 1 ? "s" : ""} selected</>}
            </span>
            <div className="plan-modal-actions">
              <button className="ghost-button" onClick={() => setImportPlan(null)}>Cancel</button>
              <button className="tp-action-btn tp-action-btn--primary" disabled={importPlanSaving || selectedCount === 0} onClick={handleImportPlanSave}>
                {importPlanSaving ? "Importing…" : `Import ${selectedCount > 0 ? selectedCount : ""} item${selectedCount !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Learning modal ──────────────────────────────────────────────────────────
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, marginBottom: 5 }}>
              <label style={{ margin: 0 }}>Body / Explanation</label>
              <button
                type="button"
                className="ghost-button"
                style={{ padding: "2px 10px", fontSize: "0.75rem" }}
                onClick={() => setImportLearningBodyEdit((v) => !v)}
              >
                {importLearningBodyEdit ? "Edit" : "Preview"}
              </button>
            </div>
            {importLearningBodyEdit ? (
              <div className="import-learning-body-preview plan-learning-preview">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                  {importLearning.body || ""}
                </ReactMarkdown>
              </div>
            ) : (
              <LearningBodyEditor
                body={importLearning.body || ""}
                onChange={(body) => setImportLearning({ ...importLearning, body })}
              />
            )}
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
            <select value={importLearningTopicId} onChange={(e) => setImportLearningTopicId(e.target.value)}>
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

  // ─── LearningAll modal ───────────────────────────────────────────────────────
  function renderImportLearningAllModal() {
    if (!importLearningAll?.length) return null;
    return (
      <div className="modal-overlay" onClick={() => setImportLearningAll(null)}>
        <div className="modal-content mcq-modal" onClick={(e) => e.stopPropagation()}>
          <div className="mcq-modal-header">
            <div>
              <p className="mcq-modal-eyebrow">AI Generated</p>
              <h3 className="mcq-modal-title">Import {importLearningAll.length} Lessons</h3>
            </div>
            <button type="button" className="mcq-modal-close" onClick={() => setImportLearningAll(null)}>✕</button>
          </div>
          <div className="mcq-modal-body">
            {importLearningAllError && <p className="mcq-modal-error">{importLearningAllError}</p>}
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: 10 }}>
              The following {importLearningAll.length} lessons will be imported:
            </p>
            <ul style={{ fontSize: "0.85rem", paddingLeft: 18, marginBottom: 14, display: "flex", flexDirection: "column", gap: 4 }}>
              {importLearningAll.map((item, i) => (
                <li key={i} style={{ color: "var(--text-primary)" }}>{item.title}</li>
              ))}
            </ul>
            <label>Save to Topic</label>
            <select value={importLearningAllTopicId} onChange={(e) => setImportLearningAllTopicId(e.target.value)}>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
              <option value="__new__">+ Create new topic...</option>
            </select>
            {importLearningAllTopicId === "__new__" && (
              <input
                placeholder="New topic title"
                value={importLearningAllNewTopic}
                onChange={(e) => setImportLearningAllNewTopic(e.target.value)}
                style={{ marginTop: 6 }}
              />
            )}
          </div>
          <div className="mcq-modal-footer">
            <button className="primary-button" disabled={importLearningAllSaving} onClick={handleImportLearningAllSave}>
              {importLearningAllSaving ? "Importing..." : `Import All ${importLearningAll.length} Lessons`}
            </button>
            <button className="ghost-button" onClick={() => setImportLearningAll(null)}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {renderImportMcqModal()}
      {renderImportSaModal()}
      {renderImportPracticeModal()}
      {renderImportPlanModal()}
      {renderImportLearningModal()}
      {renderImportLearningAllModal()}
    </>
  );
});

export default ImportModals;
