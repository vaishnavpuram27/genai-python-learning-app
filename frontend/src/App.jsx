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
    maxPoints: 0,
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
  const match = content.match(/```learning-json\s*\n([\s\S]*?)\n```/);
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

function parseAllLearningFromMessage(content) {
  const regex = /```learning-json\s*\n([\s\S]*?)\n```/g;
  const items = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.title) {
        items.push({
          title: parsed.title || "",
          body: parsed.body || "",
          instructions: parsed.instructions || "",
          hints: Array.isArray(parsed.hints) ? parsed.hints : [],
          codeStarter: parsed.codeStarter || "",
        });
      }
    } catch { /* skip malformed blocks */ }
  }
  return items;
}

function countFences(content, fenceType) {
  return (content.match(new RegExp("```" + fenceType, "g")) || []).length;
}

// Returns true if a chat message contains a given JSON fence type (even if malformed)
function hasFence(content, fenceType) {
  return typeof content === "string" && content.includes("```" + fenceType);
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

// ── Notebook Editor ─────────────────────────────────────────────────────────

const genCellId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `cell-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function parseBodyToCells(body = "", hints = []) {
  const cells = [];
  const lines = (body || "").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith(":::callout")) {
      const contentLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(":::")) {
        contentLines.push(lines[i]);
        i++;
      }
      i++; // skip closing :::
      cells.push({ id: genCellId(), type: "callout", content: contentLines.join("\n") });
      continue;
    }
    if (line.startsWith("```")) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      cells.push({ id: genCellId(), type: "code", content: codeLines.join("\n") });
      continue;
    }
    if (line.startsWith("### ")) {
      cells.push({ id: genCellId(), type: "h3", content: line.slice(4) });
      i++; continue;
    }
    if (line.startsWith("## ")) {
      cells.push({ id: genCellId(), type: "h2", content: line.slice(3) });
      i++; continue;
    }
    if (line.startsWith("# ")) {
      cells.push({ id: genCellId(), type: "h1", content: line.slice(2) });
      i++; continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      cells.push({ id: genCellId(), type: "bullet", content: line.slice(2) });
      i++; continue;
    }
    if (line.trim() === "") { i++; continue; }
    const textLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith("```") &&
      !lines[i].startsWith(":::") &&
      !lines[i].startsWith("- ") &&
      !lines[i].startsWith("* ")
    ) {
      textLines.push(lines[i]);
      i++;
    }
    if (textLines.length > 0)
      cells.push({ id: genCellId(), type: "text", content: textLines.join("\n") });
  }
  (hints || []).forEach((h) => {
    if (h) cells.push({ id: genCellId(), type: "hint", content: h });
  });
  if (cells.length === 0)
    cells.push({ id: genCellId(), type: "text", content: "" });
  return cells;
}

function serializeCellsToBody(cells) {
  const bodyCells = cells.filter((c) => c.type !== "hint");
  const hintCells = cells.filter((c) => c.type === "hint");
  const parts = bodyCells.map((cell) => {
    switch (cell.type) {
      case "h1": return `# ${cell.content}`;
      case "h2": return `## ${cell.content}`;
      case "h3": return `### ${cell.content}`;
      case "bullet": return `- ${cell.content}`;
      case "code": return `\`\`\`python\n${cell.content}\n\`\`\``;
      case "callout": return `:::callout\n${cell.content}\n:::`;
      default: return cell.content;
    }
  });
  return {
    body: parts.filter((p) => p.trim()).join("\n\n"),
    hints: hintCells.map((c) => c.content).filter(Boolean),
  };
}

function NbCodeCell({ value, onChange }) {
  const containerRef = useRef(null);
  const editorRef = useRef(null);
  useEffect(() => {
    function mount(retries = 0) {
      if (!window.ace || !containerRef.current) {
        if (retries < 20) setTimeout(() => mount(retries + 1), 150);
        return;
      }
      if (editorRef.current) return;
      const ed = window.ace.edit(containerRef.current);
      ed.setTheme("ace/theme/tomorrow_night");
      ed.session.setMode("ace/mode/python");
      ed.setOptions({ minLines: 3, maxLines: 12, showPrintMargin: false, fontSize: "13px", tabSize: 4, useSoftTabs: true, wrap: true });
      ed.setValue(value || "", -1);
      ed.on("change", () => onChange(ed.getValue()));
      editorRef.current = ed;
    }
    mount();
    return () => {
      if (editorRef.current) { editorRef.current.destroy(); editorRef.current = null; }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const ed = editorRef.current;
    if (ed && ed.getValue() !== value) ed.setValue(value || "", -1);
  }, [value]);
  return <div ref={containerRef} className="nb-code-cell" />;
}

// Phase 6 — code block copy button wrapper for ReactMarkdown
function CopyPre({ children, ...props }) {
  const [copied, setCopied] = useState(false);
  const preRef = useRef(null);
  function handleCopy() {
    const text = preRef.current?.innerText || "";
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div className="code-block-wrap">
      <button className="code-copy-btn" type="button" onClick={handleCopy}>
        {copied ? "Copied!" : "Copy"}
      </button>
      <pre ref={preRef} {...props}>{children}</pre>
    </div>
  );
}
const MD_COMPONENTS = { pre: CopyPre };

const NB_PLACEHOLDERS = { text: "Write your explanation here…", h1: "Heading 1", h2: "Heading 2", h3: "Heading 3", bullet: "Bullet point", hint: "Hint text…", callout: "Key concept text…" };
const NB_LABELS = { text: "Text", h1: "H1", h2: "H2", h3: "H3", bullet: "•", code: "Code", hint: "Hint", callout: "Callout" };

function NbCellRow({ cell, isFirst, isLast, onUpdate, onDelete, onMove, onChangeType, availableTypes }) {
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  return (
    <div className={`nb-cell nb-cell-${cell.type}`}>
      <div className="nb-cell-controls">
        <button className="nb-ctrl-btn" disabled={isFirst} onClick={() => onMove(-1)} title="Move up">↑</button>
        <button className="nb-ctrl-btn" disabled={isLast} onClick={() => onMove(1)} title="Move down">↓</button>
        <div className="nb-type-picker-wrap">
          <button
            className="nb-cell-badge nb-cell-badge-btn"
            title="Change block type"
            onClick={() => setTypePickerOpen((o) => !o)}
          >
            {NB_LABELS[cell.type]} ▾
          </button>
          {typePickerOpen && (
            <div className="nb-type-dropdown">
              {availableTypes.map(({ type, label }) => (
                <button
                  key={type}
                  className={`nb-type-option${cell.type === type ? " nb-type-option-active" : ""}`}
                  onClick={() => { onChangeType(type); setTypePickerOpen(false); }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="nb-ctrl-btn nb-delete-btn" onClick={onDelete} title="Delete">×</button>
      </div>
      <div className="nb-cell-content">
        {cell.type === "code" ? (
          <NbCodeCell value={cell.content} onChange={onUpdate} />
        ) : (
          <textarea
            className="nb-cell-input"
            value={cell.content}
            rows={["h1", "h2", "h3"].includes(cell.type) ? 1 : 2}
            placeholder={NB_PLACEHOLDERS[cell.type] || ""}
            onChange={(e) => onUpdate(e.target.value)}
          />
        )}
      </div>
    </div>
  );
}

const NB_BLOCK_TYPES = [
  { type: "text", label: "Text" },
  { type: "h1", label: "H1" },
  { type: "h2", label: "H2" },
  { type: "h3", label: "H3" },
  { type: "bullet", label: "Bullet" },
  { type: "code", label: "Code" },
  { type: "callout", label: "Callout" },
];

// Shared block editor for learning item body (notion-style)
function LearningBodyEditor({ body, onChange }) {
  const [cells, setCells] = useState(() => parseBodyToCells(body || ""));
  function handleCellsChange(nextCells) {
    setCells(nextCells);
    const { body: newBody } = serializeCellsToBody(nextCells);
    onChange(newBody);
  }
  return <NotebookEditor cells={cells} onChange={handleCellsChange} withHints={false} />;
}

function PlanLearningEditor({ item, onUpdate }) {
  return (
    <div className="plan-edit-fields">
      <label className="plan-edit-label">Body / Explanation</label>
      <LearningBodyEditor body={item.body || ""} onChange={(body) => onUpdate({ body })} />
      <label className="plan-edit-label">Instructions (optional)</label>
      <textarea
        className="plan-edit-textarea"
        rows={2}
        value={item.instructions || ""}
        onChange={(e) => onUpdate({ instructions: e.target.value })}
      />
    </div>
  );
}

function NotebookEditor({ cells, onChange, withHints = false }) {
  function addCell(type) { onChange([...cells, { id: genCellId(), type, content: "" }]); }
  function updateCell(id, content) { onChange(cells.map((c) => (c.id === id ? { ...c, content } : c))); }
  function changeType(id, type) { onChange(cells.map((c) => (c.id === id ? { ...c, type } : c))); }
  function deleteCell(id) {
    const next = cells.filter((c) => c.id !== id);
    onChange(next.length ? next : [{ id: genCellId(), type: "text", content: "" }]);
  }
  function moveCell(id, dir) {
    const idx = cells.findIndex((c) => c.id === id);
    if (idx + dir < 0 || idx + dir >= cells.length) return;
    const next = [...cells];
    [next[idx], next[idx + dir]] = [next[idx + dir], next[idx]];
    onChange(next);
  }
  const blockTypes = withHints ? [...NB_BLOCK_TYPES, { type: "hint", label: "Hint" }] : NB_BLOCK_TYPES;
  return (
    <div className="nb-editor">
      {cells.map((cell, idx) => (
        <NbCellRow
          key={cell.id}
          cell={cell}
          isFirst={idx === 0}
          isLast={idx === cells.length - 1}
          onUpdate={(content) => updateCell(cell.id, content)}
          onDelete={() => deleteCell(cell.id)}
          onMove={(dir) => moveCell(cell.id, dir)}
          onChangeType={(type) => changeType(cell.id, type)}
          availableTypes={blockTypes}
        />
      ))}
      <div className="nb-add-bar">
        {blockTypes.map(({ type, label }) => (
          <button key={type} className="nb-add-btn ghost-button" onClick={() => addCell(type)}>
            + {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── End Notebook Editor ──────────────────────────────────────────────────────

function LearningViewer({ meta, isTeacher, activeClassId, authHeaders, API_BASE, onSaved, setToast }) {
  const hasContent = !!(meta.practiceBody || meta.practiceCodeStarter);
  const hints = Array.isArray(meta.practiceHints) ? meta.practiceHints : [];
  const hasExercise = !!(meta.practiceInstructions);

  // Edit-mode state
  const [editing, setEditing] = useState(!hasContent && isTeacher);
  const [cells, setCells] = useState(() => parseBodyToCells(meta.practiceBody || ""));
  const [instructions, setInstructions] = useState(meta.practiceInstructions || "");
  const [codeStarter, setCodeStarter] = useState(meta.practiceCodeStarter || "");
  const [saving, setSaving] = useState(false);

  // Hints reveal state
  const [hintsRevealed, setHintsRevealed] = useState(0); // number of hints shown

  // Phase 6 — view-mode cells (separate from edit cells so they always reflect saved content)
  const viewCells = useMemo(() => parseBodyToCells(meta.practiceBody || ""), [meta.practiceBody]);
  const sectionRefs = useRef({});

  // Mini code editor + console state
  const miniInitialCode = meta.practiceCodeStarter || "# Write your Python code here\n";
  const [miniOutput, setMiniOutput] = useState(null); // null = not run yet
  const [miniRunning, setMiniRunning] = useState(false);
  const [miniError, setMiniError] = useState(false);
  const miniEditorHostRef = useRef(null);
  const miniEditorRef = useRef(null);

  // Initialize Ace editor in the mini host div — re-run when editing toggles
  // so the editor mounts after the host div becomes visible (view mode)
  useEffect(() => {
    if (editing) return; // host div not in DOM while editing
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
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const { body: newBody } = serializeCellsToBody(cells);
    try {
      const res = await fetch(
        `${API_BASE}/classes/${activeClassId}/topics/${meta.topic?.id}/items/${meta.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            title: meta.title,
            type: "learning",
            practiceBody: newBody,
            practiceInstructions: instructions,
            practiceCodeStarter: codeStarter,
          }),
        }
      );
      if (res.ok) {
        onSaved({ practiceBody: newBody, practiceInstructions: instructions, practiceCodeStarter: codeStarter });
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
          <NotebookEditor cells={cells} onChange={setCells} />
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
              {/* Main lesson body — cell-by-cell rendering (Phase 6) */}
              {meta.practiceBody && (
                <div className="learning-body">
                  {viewCells.filter((c) => c.type !== "hint").map((cell) => {
                    switch (cell.type) {
                      case "h1": return <h1 key={cell.id}>{cell.content}</h1>;
                      case "h2": return (
                        <h2
                          key={cell.id}
                          id={`section-${cell.id}`}
                          ref={(el) => { sectionRefs.current[cell.id] = el; }}
                        >
                          {cell.content}
                        </h2>
                      );
                      case "h3": return <h3 key={cell.id}>{cell.content}</h3>;
                      case "bullet": return <ul key={cell.id}><li>{cell.content}</li></ul>;
                      case "code": return (
                        <ReactMarkdown
                          key={cell.id}
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeHighlight]}
                          components={MD_COMPONENTS}
                        >
                          {`\`\`\`python\n${cell.content}\n\`\`\``}
                        </ReactMarkdown>
                      );
                      case "callout": return (
                        <div key={cell.id} className="callout-block">
                          <span className="callout-icon">💡</span>
                          <div>
                            <strong>Key Concept</strong>
                            <p>{cell.content}</p>
                          </div>
                        </div>
                      );
                      default: return (
                        <ReactMarkdown
                          key={cell.id}
                          remarkPlugins={[remarkGfm]}
                          components={MD_COMPONENTS}
                        >
                          {cell.content}
                        </ReactMarkdown>
                      );
                    }
                  })}
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
                  setCells(parseBodyToCells(meta.practiceBody || ""));
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

function EmptyState({ icon, title, body }) {
  return (
    <div className="empty-state-card">
      {icon && <div className="empty-state-icon" aria-hidden="true">{icon}</div>}
      <p className="empty-state-title">{title}</p>
      {body && <p className="empty-state-body">{body}</p>}
    </div>
  );
}

function SkeletonCards({ count = 3 }) {
  return (
    <div className="skeleton-wrap">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton skeleton-card" />
      ))}
    </div>
  );
}

function SkeletonRows({ count = 5 }) {
  return (
    <div className="skeleton-wrap">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton skeleton-row" />
      ))}
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
  const [userMenuOpen, setUserMenuOpen] = useState(false);
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
  // Phase 4 — teacher stats
  const [classTab, setClassTab] = useState("topics");
  const [classStats, setClassStats] = useState(null);
  const [classStatsLoading, setClassStatsLoading] = useState(false);
  const [studentStatsData, setStudentStatsData] = useState(null);
  const [studentStatsLoading, setStudentStatsLoading] = useState(false);
  const [studentAILog, setStudentAILog] = useState(null);
  const [studentAILogLoading, setStudentAILogLoading] = useState(false);
  const [itemResponseData, setItemResponseData] = useState(null); // item from studentStatsData clicked for detail view
  // Phase 3 — student dashboard
  const [myDashboard, setMyDashboard] = useState(null);
  const [myDashboardLoading, setMyDashboardLoading] = useState(false);
  // Phase 5 — student progress
  const [myClassProgress, setMyClassProgress] = useState(null);
  const [allClassProgress, setAllClassProgress] = useState({});
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
  const [editingItemMaxPoints, setEditingItemMaxPoints] = useState(0);
  const [editingItemDeadline, setEditingItemDeadline] = useState("");
  const [editingItemIsPublished, setEditingItemIsPublished] = useState(true);
  const [quizGradeScore, setQuizGradeScore] = useState("");
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
  const [practiceSubmitted, setPracticeSubmitted] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState("lesson"); // "lesson" | "editor" | "console"
  const [chatOpen, setChatOpen] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [chatAnimDir, setChatAnimDir] = useState(null); // "expanding" | "collapsing" | "fadein" | null
  const [fabPos, setFabPos] = useState({ right: 24, bottom: 24 });
  const fabDraggingRef = useRef(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [thinkingIdx, setThinkingIdx] = useState(0);
  const THINKING_WORDS = ["Thinking", "Cooking", "Processing", "Almost there", "On it"];
  const [copiedMsgIdx, setCopiedMsgIdx] = useState(null);
  const [importMcq, setImportMcq] = useState(null);
  const [importMcqTopicId, setImportMcqTopicId] = useState("");
  const [confirmDialog, setConfirmDialog] = useState(null); // { message, onConfirm, danger }
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
  const [importPlanSelected, setImportPlanSelected] = useState(new Set()); // "ti-ii" keys
  const [importPlanExpanded, setImportPlanExpanded] = useState(new Set()); // "ti-ii" keys
  const [importPlanTopicMap, setImportPlanTopicMap] = useState({}); // ti → topicId or "__new__"
  const [importLearning, setImportLearning] = useState(null);
  const [importLearningTopicId, setImportLearningTopicId] = useState("");
  const [importLearningNewTopic, setImportLearningNewTopic] = useState("");
  const [importLearningSaving, setImportLearningSaving] = useState(false);
  const [importLearningError, setImportLearningError] = useState("");
  const [importLearningBodyEdit, setImportLearningBodyEdit] = useState(false);
  const [importLearningAll, setImportLearningAll] = useState(null); // array of items for bulk import
  const [importLearningAllTopicId, setImportLearningAllTopicId] = useState("");
  const [importLearningAllNewTopic, setImportLearningAllNewTopic] = useState("");
  const [importLearningAllSaving, setImportLearningAllSaving] = useState(false);
  const [importLearningAllError, setImportLearningAllError] = useState("");
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
  const [nbCells, setNbCells] = useState(() =>
    parseBodyToCells(initialLesson.body || "", initialLesson.hints || [])
  );


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

  // Phase 7 — flat ordered list of all topic items for Prev/Next pagination
  const itemNavList = useMemo(() => {
    return topics.flatMap((t) =>
      (t.items || []).map((item) => ({ id: item.id, type: item.type, topicId: t.id }))
    );
  }, [topics]);

  const navIndex = route.itemId ? itemNavList.findIndex((i) => i.id === route.itemId) : -1;
  const navPrev = navIndex > 0 ? itemNavList[navIndex - 1] : null;
  const navNext = navIndex >= 0 && navIndex < itemNavList.length - 1 ? itemNavList[navIndex + 1] : null;

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
    const itemPages = ["class", "learn", "quiz", "practice"];
    if (!user || !activeClassId || !itemPages.includes(route.page)) {
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

  // Phase 4 — reset classTab + stats when class changes
  useEffect(() => {
    setClassTab("topics");
    setClassStats(null);
    setMyClassProgress(null);
  }, [activeClassId]);

  // Phase 4 — fetch teacher stats when Stats tab is active
  useEffect(() => {
    if (!user || user.role !== "teacher" || !activeClassId || classTab !== "stats") return;
    let cancelled = false;
    setClassStatsLoading(true);
    async function fetchStats() {
      try {
        const res = await fetch(`${API_BASE}/classes/${activeClassId}/stats`, {
          headers: { ...authHeaders() },
        });
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

  // student-stats page data fetch
  useEffect(() => {
    if (!user || route.page !== "student-stats" || !activeClassId || !route.studentId) {
      setStudentStatsData(null);
      return;
    }
    let cancelled = false;
    setStudentStatsLoading(true);
    async function fetchStudentStats() {
      try {
        const res = await fetch(`${API_BASE}/classes/${activeClassId}/students/${route.studentId}/stats`, {
          headers: { ...authHeaders() },
        });
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

  // student AI interaction log fetch (used by student-stats and ai-log pages)
  useEffect(() => {
    if (!user || !["student-stats", "ai-log"].includes(route.page) || !activeClassId || !route.studentId) {
      setStudentAILog(null);
      return;
    }
    let cancelled = false;
    setStudentAILogLoading(true);
    async function fetchAILog() {
      try {
        const res = await fetch(`${API_BASE}/classes/${activeClassId}/students/${route.studentId}/ai-interactions`, {
          headers: { ...authHeaders() },
        });
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

  // Phase 5 — fetch student's own progress for current class
  useEffect(() => {
    if (!user || user.role !== "student" || !activeClassId || route.page !== "class") {
      return;
    }
    let cancelled = false;
    async function fetchMyProgress() {
      try {
        const res = await fetch(`${API_BASE}/classes/${activeClassId}/my-progress`, {
          headers: { ...authHeaders() },
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setMyClassProgress(data?.data || null);
      } catch { /* ignore */ }
    }
    fetchMyProgress();
    return () => { cancelled = true; };
  }, [user, activeClassId, route.page]); // eslint-disable-line react-hooks/exhaustive-deps

  // Phase 3 — fetch student dashboard
  useEffect(() => {
    if (!user || user.role !== "student" || !activeClassId || route.page !== "dashboard") return;
    let cancelled = false;
    setMyDashboardLoading(true);
    async function fetchDashboard() {
      try {
        const res = await fetch(`${API_BASE}/classes/${activeClassId}/my-dashboard`, {
          headers: { ...authHeaders() },
        });
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

  // Phase 5 — fetch progress for all enrolled classes (student classes page)
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

  function navigateToStudentStats(classId, studentId) {
    window.history.pushState({}, "", `/classes/${classId}/students/${studentId}/stats`);
    setRoute({ page: "student-stats", classId, studentId, lessonId: null, itemId: null });
  }

  function navigateToAILog(classId, studentId, itemKey, itemLabel, itemType) {
    window.history.pushState({}, "", `/classes/${classId}/students/${studentId}/ai-log`);
    setRoute({ page: "ai-log", classId, studentId, itemKey, itemLabel, itemType, lessonId: null, itemId: null });
  }

  function navigateToItemResponse(classId, studentId, item) {
    setItemResponseData(item);
    window.history.pushState({}, "", `/classes/${classId}/students/${studentId}/response`);
    setRoute({ page: "item-response", classId, studentId, lessonId: null, itemId: null });
  }

  function navigateToMyDashboard(classId) {
    window.history.pushState({}, "", `/classes/${classId}/my-dashboard`);
    setRoute({ page: "dashboard", classId, lessonId: null, itemId: null, studentId: null });
  }

  function navigateToItem(classId, navItem) {
    if (!navItem) return;
    if (navItem.type === "practice") navigateToPractice(classId, navItem.id);
    else if (navItem.type === "quiz") navigateToQuiz(classId, navItem.id);
    else navigateToLearningItem(classId, navItem.id);
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
          setLessons([]);
          setActiveLessonId(null);
          navigateToClasses();
        } catch {
          setClassError("Class server not reachable.");
        }
      },
    });
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
    if (draft.type === "quiz" || draft.type === "practice") {
      payload.maxPoints = Number(draft.maxPoints) || 0;
    }
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
        } catch {
          setTopicError("Topic server not reachable.");
        }
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
    if (editingItemType === "quiz" || editingItemType === "practice") {
      payload.maxPoints = Number(editingItemMaxPoints) || 0;
    }
    payload.deadline = editingItemDeadline ? new Date(editingItemDeadline).toISOString() : null;
    payload.isPublished = editingItemIsPublished;
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
    const msg = classStudents.length > 0
      ? "Students are enrolled. Deleting this item will remove it for all students."
      : "Delete this item? This cannot be undone.";
    setConfirmDialog({
      message: msg,
      danger: true,
      onConfirm: async () => {
        try {
          const res = await fetch(
            `${API_BASE}/classes/${activeClassId}/topics/${topicId}/items/${itemId}`,
            { method: "DELETE", headers: { ...authHeaders() } }
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
      },
    });
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
            ...(quizGradeScore !== "" && { score: Number(quizGradeScore) }),
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

  useEffect(() => {
    if (!chatLoading) return;
    setThinkingIdx(0);
    const id = setInterval(() => {
      setThinkingIdx((prev) => (prev + 1) % THINKING_WORDS.length);
    }, 1800);
    return () => clearInterval(id);
  }, [chatLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // 1A: Try to parse import content; if malformed, auto-repair via backend then re-parse
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
    if (route.itemId) {
      context.itemId = route.itemId;
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

    // Teacher: include full curriculum snapshot (topics + items)
    if (user.role === "teacher" && topics.length > 0) {
      context.classTopics = topics.map((t) => ({
        title: t.title,
        items: (t.items || []).map((i) => ({ title: i.title, type: i.type })),
      }));
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

      // 1B: Student guardrail — check if response went off-topic
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
            body: JSON.stringify({
              response: assistantContent,
              lessonContext: practiceDraft?.heading || "",
            }),
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

      // 1C: Teacher quality badge — rate content after stream completes
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
                  if (last?.role === "assistant") {
                    updated[updated.length - 1] = { ...last, qualityRating: data };
                  }
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

  function renderConfirmDialog() {
    if (!confirmDialog) return null;
    return (
      <div className="modal-overlay" onClick={() => setConfirmDialog(null)}>
        <div className="modal-content confirm-dialog" onClick={(e) => e.stopPropagation()}>
          <p className="confirm-dialog-message">{confirmDialog.message}</p>
          <div className="confirm-dialog-actions">
            <button className="ghost-button" type="button" onClick={() => setConfirmDialog(null)}>
              Cancel
            </button>
            <button
              className={`primary-button${confirmDialog.danger ? " danger-button" : ""}`}
              type="button"
              onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    );
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
        const topics = prev.topics.map((t, tIdx) =>
          tIdx !== ti ? t : {
            ...t,
            items: t.items.map((itm, iIdx) =>
              iIdx !== ii ? itm : { ...itm, ...patch }
            ),
          }
        );
        return { ...prev, topics };
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
              {(importPlan.topics || []).map((topic, ti) => {
                const topicKeys = (topic.items || []).map((_, ii) => `${ti}-${ii}`);
                const allTopicSelected = topicKeys.length > 0 && topicKeys.every((k) => importPlanSelected.has(k));
                const someTopicSelected = topicKeys.some((k) => importPlanSelected.has(k));
                return (
                  <div key={ti} className="plan-topic-block">
                    <div className="plan-topic-title">
                      <input
                        type="checkbox"
                        checked={allTopicSelected}
                        ref={(el) => { if (el) el.indeterminate = someTopicSelected && !allTopicSelected; }}
                        onChange={() => toggleTopic(ti, topic.items)}
                        style={{ cursor: "pointer" }}
                      />
                      <span>{topic.title}</span>
                      <span className="stats-meta" style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                        {topicKeys.filter((k) => importPlanSelected.has(k)).length} / {topicKeys.length} selected
                      </span>
                    </div>
                    <div className="plan-topic-save-row">
                      <label className="plan-topic-save-label">Save to Topic</label>
                      <select
                        value={importPlanTopicMap[ti] || "__new__"}
                        onChange={(e) => setImportPlanTopicMap((prev) => ({ ...prev, [ti]: e.target.value }))}
                        className="plan-topic-save-select"
                      >
                        <option value="__new__">+ Create "{topic.title}"</option>
                        {topics.map((t) => <option key={t.id || t._id} value={t.id || t._id}>{t.title}</option>)}
                      </select>
                    </div>
                    <div className="plan-items-list">
                      {(topic.items || []).map((item, ii) => {
                        const key = `${ti}-${ii}`;
                        const isSelected = importPlanSelected.has(key);
                        const isExpanded = importPlanExpanded.has(key);
                        return (
                          <div key={ii} style={{ borderBottom: "1px solid var(--border)" }}>
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
            <p className="plan-summary-note">
              {selectedCount === 0
                ? <span style={{ color: "var(--error, #c62828)" }}>No items selected.</span>
                : <><strong>{selectedCount}</strong> item{selectedCount !== 1 ? "s" : ""} selected for import.</>}
            </p>
          </div>
          <div className="mcq-modal-footer">
            <button className="primary-button" disabled={importPlanSaving || selectedCount === 0} onClick={handleImportPlanSave}>
              {importPlanSaving ? "Importing…" : `Import ${selectedCount} item${selectedCount !== 1 ? "s" : ""}`}
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
              {chatMessages.length === 0 && user.role === "teacher" && (
                <div className="chat-empty-guide">
                  <p className="chat-empty-guide-title">What can I help you with?</p>
                  {[
                    { label: "Generate Content", prompts: [
                      "Generate a beginner MCQ about for loops with 4 options",
                      "Create a practice exercise where students print numbers 1 to 10",
                      "Create a learning lesson explaining Python lists for beginners",
                    ]},
                    { label: "Lesson Planning", prompts: [
                      "Create a 3-topic lesson plan for introducing Python to middle schoolers",
                      "Write a lesson plan covering functions and return values",
                    ]},
                    { label: "Grading Help", prompts: [
                      "What feedback would you give a student who answered: [paste answer]?",
                      "Does this code correctly solve: [paste problem]? Code: [paste code]",
                    ]},
                  ].map(({ label, prompts }) => (
                    <div key={label} className="chat-guide-group">
                      <div className="chat-guide-label">{label}</div>
                      {prompts.map((p) => (
                        <button
                          key={p}
                          type="button"
                          className="chat-guide-prompt"
                          onClick={() => setChatInput(p)}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {chatMessages.length === 0 && user.role === "student" && (
                <p className="chat-empty">Ask me for hints, help debugging your code, or to explain Python concepts.</p>
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
                          hasFence(msg.content, "mcq-json") && (
                            <button
                              type="button"
                              className="chat-copy-btn chat-import-btn"
                              title="Import as MCQ Quiz"
                              onClick={() => {
                                collapseChat();
                                repairAndImport(msg.content, "mcq-json", parseMcqFromMessage, (mcq) => {
                                  setImportMcq(mcq);
                                  setImportMcqTopicId(topics[0]?.id || "__new__");
                                  setImportMcqTitle(mcq.title || mcq.question.slice(0, 60));
                                  setImportMcqError("");
                                  setImportMcqNewTopic("");
                                });
                              }}
                            >
                              Import MCQ
                            </button>
                          )}
                        {msg.role === "assistant" &&
                          user.role === "teacher" &&
                          activeClassId &&
                          hasFence(msg.content, "sa-json") && (
                            <button
                              type="button"
                              className="chat-copy-btn chat-import-btn"
                              title="Import as Short Answer Quiz"
                              onClick={() => {
                                collapseChat();
                                repairAndImport(msg.content, "sa-json", parseSaFromMessage, (sa) => {
                                  setImportSa(sa);
                                  setImportSaTopicId(topics[0]?.id || "__new__");
                                  setImportSaError("");
                                  setImportSaNewTopic("");
                                });
                              }}
                            >
                              Import Short Answer
                            </button>
                          )}
                        {msg.role === "assistant" &&
                          user.role === "teacher" &&
                          activeClassId &&
                          hasFence(msg.content, "practice-json") && (
                            <button
                              type="button"
                              className="chat-copy-btn chat-import-btn"
                              title="Import as Coding Exercise"
                              onClick={() => {
                                collapseChat();
                                repairAndImport(msg.content, "practice-json", parsePracticeFromMessage, (ex) => {
                                  setImportPractice(ex);
                                  setImportPracticeTopicId(topics[0]?.id || "__new__");
                                  setImportPracticeError("");
                                  setImportPracticeNewTopic("");
                                });
                              }}
                            >
                              Import Exercise
                            </button>
                          )}
                        {msg.role === "assistant" &&
                          user.role === "teacher" &&
                          activeClassId &&
                          hasFence(msg.content, "lesson-plan-json") && (
                            <button
                              type="button"
                              className="chat-copy-btn chat-import-btn"
                              title="Import full lesson plan"
                              onClick={() => {
                                collapseChat();
                                repairAndImport(msg.content, "lesson-plan-json", parseLessonPlanFromMessage, (plan) => {
                                  setImportPlan(plan);
                                  setImportPlanError("");
                                  // Select all items by default
                                  const allKeys = new Set();
                                  (plan.topics || []).forEach((t, ti) => (t.items || []).forEach((_, ii) => allKeys.add(`${ti}-${ii}`)));
                                  setImportPlanSelected(allKeys);
                                  setImportPlanExpanded(new Set());
                                  // Default each topic to "__new__" (create from AI name)
                                  const topicMap = {};
                                  (plan.topics || []).forEach((_, ti) => { topicMap[ti] = "__new__"; });
                                  setImportPlanTopicMap(topicMap);
                                });
                              }}
                            >
                              Import Lesson Plan
                            </button>
                          )}
                        {msg.role === "assistant" &&
                          user.role === "teacher" &&
                          activeClassId &&
                          hasFence(msg.content, "learning-json") && (() => {
                            const count = countFences(msg.content, "learning-json");
                            if (count > 1) {
                              return (
                                <button
                                  type="button"
                                  className="chat-copy-btn chat-import-btn"
                                  title={`Import all ${count} lessons`}
                                  onClick={() => {
                                    collapseChat();
                                    const items = parseAllLearningFromMessage(msg.content);
                                    if (items.length) {
                                      setImportLearningAll(items);
                                      setImportLearningAllTopicId(topics[0]?.id || "__new__");
                                      setImportLearningAllError("");
                                      setImportLearningAllNewTopic("");
                                    }
                                  }}
                                >
                                  Import All ({count})
                                </button>
                              );
                            }
                            return (
                              <button
                                type="button"
                                className="chat-copy-btn chat-import-btn"
                                title="Import as Learning Lesson"
                                onClick={() => {
                                  repairAndImport(msg.content, "learning-json", parseLearningFromMessage, (item) => {
                                    // If teacher is viewing a learning lesson, update it directly
                                    if (route.page === "learn" && isTeacherView && learningMeta) {
                                      const topicId = learningMeta.topic?.id;
                                      const itemId = learningMeta.id;
                                      const newBody = item.body || "";
                                      const newInstructions = item.instructions || "";
                                      const newHints = item.hints || [];
                                      const newCodeStarter = item.codeStarter || "";
                                      fetch(
                                        `${API_BASE}/classes/${activeClassId}/topics/${topicId}/items/${itemId}`,
                                        {
                                          method: "PUT",
                                          headers: { "Content-Type": "application/json", ...authHeaders() },
                                          body: JSON.stringify({
                                            title: item.title || learningMeta.title,
                                            type: "learning",
                                            practiceBody: newBody,
                                            practiceInstructions: newInstructions,
                                            practiceHints: newHints,
                                            practiceCodeStarter: newCodeStarter,
                                          }),
                                        }
                                      ).then((res) => {
                                        if (res.ok) {
                                          setLearningMeta((prev) => ({
                                            ...prev,
                                            title: item.title || prev.title,
                                            practiceBody: newBody,
                                            practiceInstructions: newInstructions,
                                            practiceHints: newHints,
                                            practiceCodeStarter: newCodeStarter,
                                          }));
                                          setToast({ type: "success", message: "Lesson updated!" });
                                        } else {
                                          setToast({ type: "error", message: "Failed to update lesson." });
                                        }
                                      }).catch(() => setToast({ type: "error", message: "Server not reachable." }));
                                      return;
                                    }
                                    // If the plan modal is open, try to update the matching item in-place
                                    if (importPlan) {
                                      let matchTi = -1, matchIi = -1;
                                      importPlan.topics.forEach((topic, ti) => {
                                        topic.items.forEach((planItem, ii) => {
                                          if (matchTi === -1 && planItem.type === "learning") {
                                            const a = (planItem.title || "").toLowerCase();
                                            const b = (item.title || "").toLowerCase();
                                            if (a === b || a.includes(b) || b.includes(a)) {
                                              matchTi = ti; matchIi = ii;
                                            }
                                          }
                                        });
                                      });
                                      if (matchTi !== -1) {
                                        setImportPlan((prev) => ({
                                          ...prev,
                                          topics: prev.topics.map((topic, ti) => ({
                                            ...topic,
                                            items: topic.items.map((planItem, ii) =>
                                              ti === matchTi && ii === matchIi
                                                ? { ...planItem, title: item.title, body: item.body, instructions: item.instructions, hints: item.hints }
                                                : planItem
                                            ),
                                          })),
                                        }));
                                        setImportPlanExpanded((prev) => {
                                          const next = new Set(prev);
                                          next.add(`${matchTi}-${matchIi}`);
                                          return next;
                                        });
                                        setToast({ type: "success", message: `Updated "${item.title}" in the lesson plan.` });
                                        return;
                                      }
                                    }
                                    // Fall back: open separate import modal
                                    collapseChat();
                                    setImportLearning(item);
                                    setImportLearningTopicId(topics[0]?.id || "__new__");
                                    setImportLearningError("");
                                    setImportLearningNewTopic("");
                                    setImportLearningBodyEdit(false);
                                  });
                                }}
                              >
                                Import Learning
                              </button>
                            );
                          })()}
                          {msg.role === "assistant" && msg.qualityRating && (
                            <span className={`quality-badge quality-${msg.qualityRating.quality === "needs_review" ? "review" : msg.qualityRating.quality}`}>
                              {msg.qualityRating.quality === "good" ? "✓ Good" : msg.qualityRating.quality === "fair" ? "~ Fair" : "⚠ Review"}
                            </span>
                          )}
                      </div>
                    )}
                  </div>
                  <div className="chat-msg-content">
                    {chatLoading && i === chatMessages.length - 1 && msg.role === "assistant" ? (
                      <p className="chat-typing" style={{ margin: 0 }}>{THINKING_WORDS[thinkingIdx]}…</p>
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{stripMachineBlocks(msg.content)}</ReactMarkdown>
                    )}
                  </div>
                </div>
              ))}
              {chatLoading && chatMessages[chatMessages.length - 1]?.role !== "assistant" && (
                <div className="chat-msg chat-msg-assistant">
                  <span className="chat-msg-role">AI</span>
                  <p className="chat-msg-content chat-typing" style={{ margin: 0 }}>{THINKING_WORDS[thinkingIdx]}…</p>
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
        {renderConfirmDialog()}
        {renderImportMcqModal()}
        {renderImportSaModal()}
        {renderImportPracticeModal()}
        {renderImportPlanModal()}
        {renderImportLearningModal()}
        {renderImportLearningAllModal()}
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
              <div className="user-menu-anchor">
                <button
                  className="ghost-button user-menu-trigger"
                  type="button"
                  onClick={() => setUserMenuOpen((o) => !o)}
                  aria-expanded={userMenuOpen}
                  aria-haspopup="menu"
                >
                  {user.name} ▾
                </button>
                {userMenuOpen && (
                  <div className="user-menu-dropdown" role="menu" onClick={() => setUserMenuOpen(false)}>
                    <span className="user-menu-role">{user.role}</span>
                    <button className="user-menu-item user-menu-item--danger" type="button" role="menuitem" onClick={handleLogout}>
                      Log out
                    </button>
                  </div>
                )}
              </div>
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
            {!isTeacher && Object.keys(allClassProgress).length > 0 && (() => {
              const totAttempted = Object.values(allClassProgress).reduce((s, p) => s + (p?.attemptedItems || 0), 0);
              const totGraded = Object.values(allClassProgress).reduce((s, p) => s + (p?.gradedItems || 0), 0);
              return (
                <div className="dashboard-summary panel-animate">
                  <span className="dashboard-summary-label">Overall progress</span>
                  <strong>{totAttempted}/{totGraded} items attempted across {classes.length} class{classes.length !== 1 ? "es" : ""}</strong>
                </div>
              );
            })()}
            <div className="class-grid">
              {classes.map((item) => {
                const prog = allClassProgress[item.id];
                const pct = prog && prog.gradedItems > 0
                  ? Math.round((prog.attemptedItems / prog.gradedItems) * 100)
                  : null;
                const nextItem = prog?.items?.find((i) => i.attempted === false);
                return isTeacher ? (
                  <button
                    key={item.id}
                    type="button"
                    className="class-pill panel-animate"
                    onClick={() => handleSelectClass(item.id)}
                  >
                    <span>{item.name}</span>
                    <small>Join code: {item.joinCode}</small>
                  </button>
                ) : (
                  <div key={item.id} className={`class-card panel-animate${pct === 100 && prog?.gradedItems > 0 ? " class-card--done" : ""}`}>
                    <div
                      className="class-card-body"
                      role="button"
                      tabIndex={0}
                      aria-label={`Open class ${item.name}`}
                      onClick={() => handleSelectClass(item.id)}
                      onKeyDown={(e) => e.key === "Enter" && handleSelectClass(item.id)}
                    >
                      <span className="class-card-name">{item.name}</span>
                      {prog && prog.gradedItems > 0 ? (
                        <>
                          <div className="class-progress-bar">
                            <div className="class-progress-fill" style={{ width: `${pct}%` }} />
                          </div>
                          <small className="class-progress-label">
                            {pct === 100 ? (
                              <span className="class-done-badge">All done ✓</span>
                            ) : (
                              <>{prog.attemptedItems}/{prog.gradedItems} items attempted · {pct}%</>
                            )}
                          </small>
                        </>
                      ) : (
                        <small>Tap to open</small>
                      )}
                    </div>
                    {nextItem && (
                      <button
                        className="accent-button class-continue-btn"
                        type="button"
                        onClick={() => {
                          if (nextItem.type === "practice") navigateToPractice(item.id, nextItem.id);
                          else if (nextItem.type === "quiz") navigateToQuiz(item.id, nextItem.id);
                          else navigateToLearningItem(item.id, nextItem.id);
                        }}
                      >
                        Continue →
                      </button>
                    )}
                  </div>
                );
              })}
              {!classes.length && (
                <EmptyState
                  icon={isTeacher ? "🏫" : "🎒"}
                  title={isTeacher ? "No classes yet" : "Not in a class yet"}
                  body={isTeacher ? "Create your first class to start building lessons." : "Ask your teacher for a join code."}
                />
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
            {!isTeacher && activeClassId && (
              <button
                className="accent-button"
                type="button"
                onClick={() => navigateToMyDashboard(activeClassId)}
              >
                My Dashboard
              </button>
            )}
            {isTeacher && activeClass && (
              <button className="ghost-button" type="button" onClick={handleDeleteClass}>
                Delete class
              </button>
            )}
            <div className="user-menu-anchor">
              <button
                className="ghost-button user-menu-trigger"
                type="button"
                onClick={() => setUserMenuOpen((o) => !o)}
                aria-expanded={userMenuOpen}
                aria-haspopup="menu"
              >
                {user.name} ▾
              </button>
              {userMenuOpen && (
                <div className="user-menu-dropdown" role="menu" onClick={() => setUserMenuOpen(false)}>
                  <span className="user-menu-role">{user.role}</span>
                  {isTeacher && (
                    <button
                      className="user-menu-item"
                      type="button"
                      role="menuitem"
                      onClick={() => setViewRole(v => v === "teacher" ? "student" : "teacher")}
                    >
                      Switch to {isTeacherView ? "Student" : "Teacher"} view
                    </button>
                  )}
                  <button className="user-menu-item user-menu-item--danger" type="button" role="menuitem" onClick={handleLogout}>
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {isTeacher && (
          <div className="class-tab-bar">
            <button
              className={`class-tab${classTab === "topics" ? " class-tab-active" : ""}`}
              type="button"
              onClick={() => setClassTab("topics")}
            >
              Topics &amp; Students
            </button>
            <button
              className={`class-tab${classTab === "stats" ? " class-tab-active" : ""}`}
              type="button"
              onClick={() => setClassTab("stats")}
            >
              Class Stats
            </button>
          </div>
        )}

        {isTeacher && classTab === "stats" ? (
          <section className="class-stats-section panel-animate">
            {classStatsLoading && <SkeletonRows count={5} />}
            {!classStatsLoading && classStats && (
              <>
                {/* ── Summary cards ── */}
                <div className="stats-cards">
                  {[
                    { n: classStats.studentCount, label: "Students enrolled" },
                    { n: classStats.topicCount, label: "Topics" },
                    { n: classStats.itemCounts.learning, label: "Learning items" },
                    { n: classStats.itemCounts.quiz, label: "Quizzes" },
                    { n: classStats.itemCounts.practice, label: "Practice items" },
                  ].map(({ n, label }) => (
                    <div key={label} className="stat-card">
                      <span className="stat-number">{n}</span>
                      <span className="stat-label">{label}</span>
                    </div>
                  ))}
                </div>

                {/* ── Overall submission bar ── */}
                <div className="stats-quiz-section">
                  <h3>Overall Submissions</h3>
                  {classStats.quizSummary.total === 0 ? (
                    <p className="empty-state">No submissions yet.</p>
                  ) : (
                    <>
                      <p className="stats-meta">{classStats.quizSummary.total} total submissions</p>
                      <div className="stats-bar-wrap">
                        <div className="stats-bar-segment stats-bar-correct" style={{ width: `${Math.round((classStats.quizSummary.correct / classStats.quizSummary.total) * 100)}%` }} title={`Correct: ${classStats.quizSummary.correct}`} />
                        <div className="stats-bar-segment stats-bar-incorrect" style={{ width: `${Math.round((classStats.quizSummary.incorrect / classStats.quizSummary.total) * 100)}%` }} title={`Incorrect: ${classStats.quizSummary.incorrect}`} />
                        <div className="stats-bar-segment stats-bar-pending" style={{ width: `${Math.round((classStats.quizSummary.pending / classStats.quizSummary.total) * 100)}%` }} title={`Pending: ${classStats.quizSummary.pending}`} />
                      </div>
                      <div className="stats-legend">
                        <span className="legend-dot legend-correct" /> Correct ({classStats.quizSummary.correct})
                        <span className="legend-dot legend-incorrect" /> Incorrect ({classStats.quizSummary.incorrect})
                        <span className="legend-dot legend-pending" /> Pending ({classStats.quizSummary.pending})
                      </div>
                    </>
                  )}
                </div>

                {/* ── Student performance table ── */}
                {classStats.studentBreakdowns?.length > 0 && (
                  <div className="stats-table-section">
                    <h3>Student Performance</h3>
                    <p className="stats-meta">{classStats.studentBreakdowns.length} student{classStats.studentBreakdowns.length !== 1 ? "s" : ""} · sorted by activity</p>
                    <div className="stats-table-wrap">
                      <table className="stats-table">
                        <thead>
                          <tr>
                            <th>Student</th>
                            <th>Attempted</th>
                            <th>Correct</th>
                            <th>Success Rate</th>
                            <th>AI Chats</th>
                            <th>Progress</th>
                            <th>Last Active</th>
                          </tr>
                        </thead>
                        <tbody>
                          {classStats.studentBreakdowns.map((s) => {
                            const pct = s.total > 0 ? Math.round((s.attempted / s.total) * 100) : 0;
                            return (
                              <tr key={s.id}>
                                <td
                                  className="stats-student-name stats-student-link"
                                  onClick={() => navigateToStudentStats(activeClassId, s.id)}
                                  title="View student detail"
                                >
                                  {s.name}
                                </td>
                                <td>{s.attempted}/{s.total}</td>
                                <td>{s.correct}</td>
                                <td>
                                  {s.successRate !== null
                                    ? <span className={`stats-rate-pill ${s.successRate >= 70 ? "rate-good" : s.successRate >= 40 ? "rate-mid" : "rate-low"}`}>{s.successRate}%</span>
                                    : <span className="stats-meta">—</span>}
                                </td>
                                <td>
                                  {s.aiInteractions > 0 ? (
                                    <button
                                      className="ghost-button"
                                      style={{ padding: "2px 8px", fontSize: "0.8rem" }}
                                      type="button"
                                      onClick={() => navigateToStudentStats(activeClassId, s.id)}
                                      title="View AI chat log"
                                    >
                                      {s.aiInteractions} chat{s.aiInteractions !== 1 ? "s" : ""}
                                    </button>
                                  ) : <span className="stats-meta">—</span>}
                                </td>
                                <td>
                                  <div className="stats-mini-bar">
                                    <div className="stats-mini-fill" style={{ width: `${pct}%` }} />
                                  </div>
                                </td>
                                <td className="stats-meta">
                                  {s.lastActivity ? new Date(s.lastActivity).toLocaleDateString() : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ── Item performance table ── */}
                {classStats.itemBreakdowns?.length > 0 && (
                  <div className="stats-table-section">
                    <h3>Item Performance</h3>
                    <p className="stats-meta">Sorted by topic order · difficulty based on correct rate</p>
                    <div className="stats-table-wrap">
                      <table className="stats-table">
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th>Topic</th>
                            <th>Type</th>
                            <th>Attempted</th>
                            <th>Correct Rate</th>
                            <th>Difficulty</th>
                          </tr>
                        </thead>
                        <tbody>
                          {classStats.itemBreakdowns.map((item) => {
                            const difficulty = item.correctRate === null ? null
                              : item.correctRate >= 70 ? { label: "Easy", cls: "diff-easy" }
                              : item.correctRate >= 40 ? { label: "Medium", cls: "diff-mid" }
                              : { label: "Hard", cls: "diff-hard" };
                            return (
                              <tr key={item.id}>
                                <td className="stats-student-name">{item.title}</td>
                                <td className="stats-meta">{item.topicTitle}</td>
                                <td><span className={`topic-type type-${item.type}`}>{item.type}</span></td>
                                <td>{item.attempted}/{item.studentCount}</td>
                                <td>
                                  {item.correctRate !== null
                                    ? <span className={`stats-rate-pill ${item.correctRate >= 70 ? "rate-good" : item.correctRate >= 40 ? "rate-mid" : "rate-low"}`}>{item.correctRate}%</span>
                                    : <span className="stats-meta">—</span>}
                                </td>
                                <td>
                                  {difficulty
                                    ? <span className={`diff-badge ${difficulty.cls}`}>{difficulty.label}</span>
                                    : <span className="stats-meta">—</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              </>
            )}
          </section>
        ) : (
        <section className="class-detail-grid">
          {!isTeacher && myClassProgress && myClassProgress.gradedItems > 0 && (
            <div className="class-progress-summary panel-animate">
              <div className="class-progress-summary-header">
                <span className="class-progress-summary-title">Your Progress</span>
                <span className="class-progress-fraction">
                  {myClassProgress.attemptedItems}/{myClassProgress.gradedItems} items attempted
                  {myClassProgress.correctItems > 0 && ` · ${myClassProgress.correctItems} correct`}
                </span>
              </div>
              <div className="class-progress-bar class-progress-bar--lg">
                <div
                  className="class-progress-fill"
                  style={{ width: `${Math.round((myClassProgress.attemptedItems / myClassProgress.gradedItems) * 100)}%` }}
                />
              </div>
              {(() => {
                const nextItem = myClassProgress.items?.find((i) => i.attempted === false);
                return nextItem ? (
                  <button
                    className="accent-button"
                    type="button"
                    onClick={() => {
                      if (nextItem.type === "practice") navigateToPractice(activeClassId, nextItem.id);
                      else if (nextItem.type === "quiz") navigateToQuiz(activeClassId, nextItem.id);
                      else navigateToLearningItem(activeClassId, nextItem.id);
                    }}
                  >
                    Continue → {nextItem.title}
                  </button>
                ) : (
                  <p className="class-progress-done">All items completed! 🎉</p>
                );
              })()}
            </div>
          )}
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
              <EmptyState icon="📚" title="No topics yet" body="Add your first topic to start building the curriculum." />
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
                              {(editingItemType === "quiz" || editingItemType === "practice") && (
                                <label className="login-field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
                                  <span style={{ whiteSpace: "nowrap" }}>Max points</span>
                                  <input
                                    className="class-input"
                                    type="number"
                                    min="0"
                                    style={{ width: "80px" }}
                                    value={editingItemMaxPoints}
                                    onChange={(event) => setEditingItemMaxPoints(Number(event.target.value) || 0)}
                                  />
                                </label>
                              )}
                              <label className="login-field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
                                <span style={{ whiteSpace: "nowrap" }}>Deadline</span>
                                <input
                                  className="class-input"
                                  type="datetime-local"
                                  value={editingItemDeadline}
                                  onChange={(event) => setEditingItemDeadline(event.target.value)}
                                />
                              </label>
                              <label className="login-field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
                                <input
                                  type="checkbox"
                                  checked={editingItemIsPublished}
                                  onChange={(event) => setEditingItemIsPublished(event.target.checked)}
                                />
                                <span>Published</span>
                              </label>
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
                                <span className="topic-item-title">
                                  {item.title}
                                  {item.isPublished === false && <span className="draft-badge">Draft</span>}
                                </span>
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
                      <EmptyState icon="📝" title="No items yet" body="Add a learning lesson, quiz, or coding practice." />
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
                      {(["quiz", "practice"].includes(topicItemDrafts[topic.id]?.type || "learning")) && (
                        <label className="login-field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{ whiteSpace: "nowrap" }}>Max points</span>
                          <input
                            className="class-input"
                            type="number"
                            min="0"
                            style={{ width: "80px" }}
                            value={(topicItemDrafts[topic.id]?.maxPoints) ?? 0}
                            onChange={(event) =>
                              updateTopicDraft(topic.id, { maxPoints: Number(event.target.value) || 0 })
                            }
                          />
                        </label>
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
                <EmptyState icon="👩‍🎓" title="No students yet" body="Share the join code with your students." />
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
        )}
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
              <div className="user-menu-anchor">
                <button className="ghost-button user-menu-trigger" type="button" onClick={() => setUserMenuOpen((o) => !o)} aria-expanded={userMenuOpen} aria-haspopup="menu">
                  {user.name} ▾
                </button>
                {userMenuOpen && (
                  <div className="user-menu-dropdown" role="menu" onClick={() => setUserMenuOpen(false)}>
                    <span className="user-menu-role">{user.role}</span>
                    <button className="user-menu-item user-menu-item--danger" type="button" role="menuitem" onClick={handleLogout}>Log out</button>
                  </div>
                )}
              </div>
            </div>
          </header>
          {navIndex >= 0 && (
            <nav className="item-pagination-bar">
              <button
                className="ghost-button"
                type="button"
                disabled={!navPrev}
                onClick={() => navigateToItem(activeClassId, navPrev)}
              >
                ← Prev
              </button>
              <span className="item-pagination-pos">
                {navIndex + 1} / {itemNavList.length}
              </span>
              <button
                className="ghost-button"
                type="button"
                disabled={!navNext}
                onClick={() => navigateToItem(activeClassId, navNext)}
              >
                Next →
              </button>
            </nav>
          )}
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
              <div className="user-menu-anchor">
                <button className="ghost-button user-menu-trigger" type="button" onClick={() => setUserMenuOpen((o) => !o)} aria-expanded={userMenuOpen} aria-haspopup="menu">
                  {user.name} ▾
                </button>
                {userMenuOpen && (
                  <div className="user-menu-dropdown" role="menu" onClick={() => setUserMenuOpen(false)}>
                    <span className="user-menu-role">{user.role}</span>
                    <button className="user-menu-item user-menu-item--danger" type="button" role="menuitem" onClick={handleLogout}>Log out</button>
                  </div>
                )}
              </div>
            </div>
          </header>
          {navIndex >= 0 && (
            <nav className="item-pagination-bar">
              <button
                className="ghost-button"
                type="button"
                disabled={!navPrev}
                onClick={() => navigateToItem(activeClassId, navPrev)}
              >
                ← Prev
              </button>
              <span className="item-pagination-pos">
                {navIndex + 1} / {itemNavList.length}
              </span>
              <button
                className="ghost-button"
                type="button"
                disabled={!navNext}
                onClick={() => navigateToItem(activeClassId, navNext)}
              >
                Next →
              </button>
            </nav>
          )}

          <section className="class-detail-panel panel-animate">
            {quizLoading && <SkeletonCards count={3} />}
            {quizError && <p className="auth-error">{quizError}</p>}
            {!quizLoading && !quizError && quizMeta && (
              <div className="quiz-layout">
                <p className="progress-meta">
                  {quizMeta.topic?.title || "Topic"} · {isMcq ? "MCQ" : "Short answer"}
                </p>
                <div className="quiz-question-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
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
                        Result: {quizAttempt.isCorrect ? "Correct ✓" : "Incorrect ✗"}
                        {typeof quizAttempt.score === "number" && quizMeta?.item?.maxPoints > 0 && (
                          <span style={{ marginLeft: "0.5rem", fontWeight: 600 }}>
                            ({quizAttempt.score} / {quizMeta.item.maxPoints} pts)
                          </span>
                        )}
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

  if (route.page === "dashboard") {
    return (
      <PageShell className={`page-shell ${pageTransition}`}>
        <main className="student-dashboard">
          <header className="teacher-topbar">
            <div>
              <p className="teacher-eyebrow">Student Workspace</p>
              <h1>My Dashboard</h1>
              {activeClass && <p className="class-subtitle">Class: {activeClass.name}</p>}
            </div>
            <div className="teacher-actions">
              <button className="ghost-button" type="button" onClick={() => navigateToClass(activeClassId)}>
                Back to Class
              </button>
              <div className="user-menu-anchor">
                <button className="ghost-button user-menu-trigger" type="button" onClick={() => setUserMenuOpen((o) => !o)} aria-expanded={userMenuOpen} aria-haspopup="menu">
                  {user.name} ▾
                </button>
                {userMenuOpen && (
                  <div className="user-menu-dropdown" role="menu" onClick={() => setUserMenuOpen(false)}>
                    <span className="user-menu-role">{user.role}</span>
                    <button className="user-menu-item user-menu-item--danger" type="button" role="menuitem" onClick={handleLogout}>Log out</button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {myDashboardLoading && <SkeletonCards count={4} />}
          {!myDashboardLoading && myDashboard && (
            <section className="class-detail-panel panel-animate">
              <div className="dashboard-grid">

              {/* Recent Scores */}
              <div className="dashboard-card">
                <div className="dashboard-card-header">
                  <span className="dashboard-card-icon" aria-hidden="true">📊</span>
                  <h2 className="dashboard-card-title">Recent Scores</h2>
                </div>
                {myDashboard.recentScores.length === 0 ? (
                  <p className="empty-state">No graded submissions yet.</p>
                ) : (
                  <div className="progress-list">
                    {myDashboard.recentScores.map((s) => (
                      <div key={s.attemptId} className="progress-item panel-animate">
                        <div className="progress-item-header">
                          <span className="progress-item-title">{s.title}</span>
                          <span className={`topic-type type-${s.type}`}>{s.type}</span>
                        </div>
                        <p className="progress-meta">
                          {s.isCorrect ? "Correct ✓" : "Incorrect ✗"}
                          {typeof s.score === "number" && (
                            <span style={{ marginLeft: "0.5rem", fontWeight: 600 }}>
                              {s.score}{s.maxPoints > 0 ? ` / ${s.maxPoints} pts` : " pts"}
                            </span>
                          )}
                          {s.gradedAt && (
                            <span style={{ marginLeft: "0.5rem", opacity: 0.6, fontSize: "0.8em" }}>
                              {new Date(s.gradedAt).toLocaleDateString()}
                            </span>
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Upcoming Deadlines */}
              <div className="dashboard-card dashboard-card--urgent">
                <div className="dashboard-card-header">
                  <span className="dashboard-card-icon" aria-hidden="true">⏰</span>
                  <h2 className="dashboard-card-title">Upcoming Deadlines</h2>
                  {myDashboard.upcomingDeadlines.length > 0 && (
                    <span className="dashboard-badge">{myDashboard.upcomingDeadlines.length}</span>
                  )}
                </div>
                {myDashboard.upcomingDeadlines.length === 0 ? (
                  <p className="empty-state">No upcoming deadlines.</p>
                ) : (
                  <div className="progress-list">
                    {myDashboard.upcomingDeadlines.map((d) => (
                      <div key={d.id} className="progress-item panel-animate">
                        <div className="progress-item-header">
                          <span className="progress-item-title">{d.title}</span>
                          <span className={`topic-type type-${d.type}`}>{d.type}</span>
                        </div>
                        <p className="progress-meta">
                          Due: {new Date(d.deadline).toLocaleDateString()}{" "}
                          <span style={{ fontWeight: 600, color: d.daysLeft <= 1 ? "var(--danger-text)" : d.daysLeft <= 3 ? "var(--warning-text)" : "var(--text-primary)" }}>
                            ({d.daysLeft} day{d.daysLeft !== 1 ? "s" : ""} left)
                          </span>
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Updates Feed */}
              <div className="dashboard-card">
                <div className="dashboard-card-header">
                  <span className="dashboard-card-icon" aria-hidden="true">✨</span>
                  <h2 className="dashboard-card-title">New This Week</h2>
                </div>
                {myDashboard.updates.length === 0 ? (
                  <p className="empty-state">Nothing new in the last 7 days.</p>
                ) : (
                  <div className="progress-list">
                    {myDashboard.updates.map((u) => (
                      <div key={u.id} className="progress-item panel-animate">
                        <div className="progress-item-header">
                          <span className="progress-item-title">{u.title}</span>
                          <span className={`topic-type type-${u.type}`}>{u.type}</span>
                        </div>
                        <p className="progress-meta">
                          Added {new Date(u.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              </div>{/* end dashboard-grid */}
            </section>
          )}
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
          {studentProgressLoading && <SkeletonRows count={4} />}
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
                      <p className="progress-meta">{item.unit}</p>
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
                        {item.topicTitle || "Topic"} · {item.itemType === "practice" ? "Code submission" : item.quizSubtype === "mcq" ? "MCQ" : "Short answer"}
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
            {selectedQuizAttempt.itemType !== "practice" && selectedQuizAttempt.quizQuestion && (
              <p className="progress-meta">{selectedQuizAttempt.quizQuestion}</p>
            )}
            <pre className="code-block">
              <code>{selectedQuizAttempt.responseText || "No response recorded."}</code>
            </pre>
            <div className="quiz-grade-panel">
              <div className="quiz-grade-header">
                <span className={`status-badge status-${selectedQuizAttempt.gradingStatus}`}>
                  {selectedQuizAttempt.gradingStatus.replace(/_/g, " ")}
                </span>
                {typeof selectedQuizAttempt.score === "number" && (
                  <span className="quiz-score-badge">{selectedQuizAttempt.score} pt{selectedQuizAttempt.score !== 1 ? "s" : ""}</span>
                )}
              </div>
              {selectedQuizAttempt.gradingStatus === "auto_graded" && selectedQuizAttempt.reasoning && (
                <div className="quiz-reasoning-box">
                  <p className="quiz-reasoning-label">AI Reasoning</p>
                  <p>{selectedQuizAttempt.reasoning}</p>
                </div>
              )}
              <div className="quiz-override-section">
                <p className="quiz-override-label">Teacher Override</p>
                <textarea
                  className="lesson-textarea"
                  rows={3}
                  value={quizGradeFeedback}
                  onChange={(event) => setQuizGradeFeedback(event.target.value)}
                  placeholder="Optional feedback for student"
                  disabled={quizGrading}
                />
                <label className="login-field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem" }}>
                  <span style={{ whiteSpace: "nowrap" }}>Override score</span>
                  <input
                    className="class-input"
                    type="number"
                    min="0"
                    style={{ width: "90px" }}
                    value={quizGradeScore}
                    onChange={(event) => setQuizGradeScore(event.target.value)}
                    placeholder="pts"
                    disabled={quizGrading}
                  />
                </label>
                <div className="topic-item-actions" style={{ marginTop: "0.5rem" }}>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => gradeSelectedQuizAttempt(true)}
                    disabled={quizGrading}
                  >
                    ✓ Save as Correct
                  </button>
                  <button
                    className="ghost-button danger"
                    type="button"
                    onClick={() => gradeSelectedQuizAttempt(false)}
                    disabled={quizGrading}
                  >
                    ✗ Save as Incorrect
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
        </main>
        {renderChatBot()}
      </PageShell>
    );
  }

  if (route.page === "item-response") {
    const item = itemResponseData;
    const isCode = item?.type === "practice";
    const studentName = studentStatsData?.student?.name || "Student";
    return (
      <PageShell className={`page-shell ${pageTransition}`}>
        <main className="teacher-dashboard">
          <header className="teacher-topbar">
            <div>
              <p className="teacher-eyebrow">
                {item ? `${item.type}${item.quizSubtype ? ` · ${item.quizSubtype}` : ""}` : "Response"}
              </p>
              <h1>{item?.title || "Student Response"}</h1>
              {item?.topicTitle && <p className="class-subtitle">Topic: {item.topicTitle}</p>}
            </div>
            <div className="teacher-actions">
              <button className="ghost-button" type="button" onClick={() => navigateToStudentStats(activeClassId, route.studentId)}>
                ← Back to {studentName}
              </button>
              <div className="user-menu-anchor">
                <button className="ghost-button user-menu-trigger" type="button" onClick={() => setUserMenuOpen((o) => !o)} aria-expanded={userMenuOpen} aria-haspopup="menu">
                  {user.name} ▾
                </button>
                {userMenuOpen && (
                  <div className="user-menu-dropdown" role="menu" onClick={() => setUserMenuOpen(false)}>
                    <span className="user-menu-role">{user.role}</span>
                    <button className="user-menu-item user-menu-item--danger" type="button" role="menuitem" onClick={handleLogout}>Log out</button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {item ? (
            <section className="class-stats-section panel-animate">
              {/* Meta row */}
              <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
                <div>
                  <p className="stats-meta" style={{ marginBottom: "0.2rem" }}>Status</p>
                  <span className={`sd-status-pill sd-${item.status}`}>
                    {item.status === "attempted" || item.status === "correct" || item.status === "incorrect" ? "Attempted"
                      : item.status === "pending" ? "Pending"
                      : "Not attempted"}
                  </span>
                </div>
                {item.attempts > 0 && (
                  <div>
                    <p className="stats-meta" style={{ marginBottom: "0.2rem" }}>Attempts</p>
                    <p style={{ margin: 0, fontWeight: 600 }}>{item.attempts}</p>
                  </div>
                )}
                {item.submittedAt && (
                  <div>
                    <p className="stats-meta" style={{ marginBottom: "0.2rem" }}>Submitted</p>
                    <p style={{ margin: 0, fontWeight: 600 }}>{new Date(item.submittedAt).toLocaleString()}</p>
                  </div>
                )}
              </div>

              {/* Response */}
              <div style={{ marginBottom: "1.5rem" }}>
                <p className="stats-meta" style={{ marginBottom: "0.5rem" }}>Response</p>
                {isCode ? (
                  <pre style={{ background: "var(--surface-code, #1e1e1e)", color: "#d4d4d4", borderRadius: "8px", padding: "1rem 1.25rem", overflowX: "auto", fontSize: "0.88rem", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    <code>{item.responseText}</code>
                  </pre>
                ) : (
                  <div style={{ background: "var(--bg-raised)", borderRadius: "8px", padding: "0.9rem 1.1rem" }}>
                    <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{item.responseText}</p>
                  </div>
                )}
              </div>

              {/* Feedback */}
              {item.feedback && (
                <div>
                  <p className="stats-meta" style={{ marginBottom: "0.5rem" }}>Feedback</p>
                  <div style={{ background: "var(--accent-soft, #eef2ff)", borderRadius: "8px", padding: "0.9rem 1.1rem" }}>
                    <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{item.feedback}</p>
                  </div>
                </div>
              )}
            </section>
          ) : (
            <p className="empty-state">No response data available.</p>
          )}
        </main>
        {renderChatBot()}
      </PageShell>
    );
  }

  if (route.page === "ai-log") {
    const interactions = (studentAILog || []).filter((ix) => {
      const key = ix.itemId?._id || "general";
      return key === route.itemKey;
    });
    return (
      <PageShell className={`page-shell ${pageTransition}`}>
        <main className="teacher-dashboard">
          <header className="teacher-topbar">
            <div>
              <p className="teacher-eyebrow">
                {route.itemType ? route.itemType.charAt(0).toUpperCase() + route.itemType.slice(1) : "AI Chat Log"}
              </p>
              <h1>{route.itemLabel || "Chat Log"}</h1>
              {activeClass && <p className="class-subtitle">Class: {activeClass.name}</p>}
            </div>
            <div className="teacher-actions">
              <button className="ghost-button" type="button" onClick={() => navigateToStudentStats(activeClassId, route.studentId)}>
                ← Back to Student
              </button>
              <div className="user-menu-anchor">
                <button className="ghost-button user-menu-trigger" type="button" onClick={() => setUserMenuOpen((o) => !o)} aria-expanded={userMenuOpen} aria-haspopup="menu">
                  {user.name} ▾
                </button>
                {userMenuOpen && (
                  <div className="user-menu-dropdown" role="menu" onClick={() => setUserMenuOpen(false)}>
                    <span className="user-menu-role">{user.role}</span>
                    <button className="user-menu-item user-menu-item--danger" type="button" role="menuitem" onClick={handleLogout}>Log out</button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <section className="class-stats-section panel-animate">
            {studentAILogLoading && <SkeletonRows count={4} />}
            {!studentAILogLoading && interactions.length === 0 && (
              <EmptyState icon="💬" title="No interactions found" body="The student hasn't used the AI tutor on this item yet." />
            )}
            {!studentAILogLoading && interactions.length > 0 && (
              <div className="ai-log-section">
                {interactions.map((ix, idx) => (
                  <div key={ix._id || idx} className="ai-log-entry">
                    <p className="stats-meta ai-log-timestamp">{new Date(ix.createdAt).toLocaleString()}</p>
                    <div className="ai-log-bubble">
                      <span className="ai-log-bubble-role">Student</span>
                      <p className="ai-log-bubble-text">{ix.userMessage || <em style={{ opacity: 0.5 }}>—</em>}</p>
                    </div>
                    {ix.aiResponse && (
                      <div className="ai-log-bubble ai-log-bubble--ai">
                        <span className="ai-log-bubble-role">AI</span>
                        <p className="ai-log-bubble-text">{ix.aiResponse}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
        {renderChatBot()}
      </PageShell>
    );
  }

  if (route.page === "student-stats") {
    const sd = studentStatsData;
    return (
      <PageShell className={`page-shell ${pageTransition}`}>
        <main className="teacher-dashboard">
          <header className="teacher-topbar">
            <div>
              <p className="teacher-eyebrow">Teacher Workspace</p>
              <h1>{sd?.student?.name || "Student"}</h1>
              {activeClass && <p className="class-subtitle">Class: {activeClass.name}</p>}
            </div>
            <div className="teacher-actions">
              <button className="ghost-button" type="button" onClick={() => { navigateToClass(activeClassId); setTimeout(() => setClassTab("stats"), 50); }}>
                ← Back to Stats
              </button>
              <button className="ghost-button" type="button" onClick={() => navigateToClass(activeClassId)}>
                Back to Class
              </button>
              <div className="user-menu-anchor">
                <button className="ghost-button user-menu-trigger" type="button" onClick={() => setUserMenuOpen((o) => !o)} aria-expanded={userMenuOpen} aria-haspopup="menu">
                  {user.name} ▾
                </button>
                {userMenuOpen && (
                  <div className="user-menu-dropdown" role="menu" onClick={() => setUserMenuOpen(false)}>
                    <span className="user-menu-role">{user.role}</span>
                    <button className="user-menu-item user-menu-item--danger" type="button" role="menuitem" onClick={handleLogout}>Log out</button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {studentStatsLoading && <SkeletonRows count={6} />}

          {!studentStatsLoading && sd && (
            <section className="class-stats-section panel-animate">

              {/* Summary cards */}
              <div className="stats-cards">
                {[
                  { n: sd.summary.attempted, label: "Items attempted" },
                  { n: sd.summary.correct, label: "Correct" },
                  { n: sd.summary.total - sd.summary.attempted, label: "Not attempted" },
                  { n: sd.summary.total > 0 ? `${Math.round((sd.summary.correct / sd.summary.total) * 100)}%` : "—", label: "Overall score" },
                ].map(({ n, label }) => (
                  <div key={label} className="stat-card">
                    <span className="stat-number">{n}</span>
                    <span className="stat-label">{label}</span>
                  </div>
                ))}
              </div>

              {/* Item-by-item table */}
              <div className="stats-table-section">
                <h3>Item Breakdown</h3>
                <p className="stats-meta">{sd.summary.total} gradable items across all topics</p>
                <div className="stats-table-wrap">
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Topic</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Attempts</th>
                        <th>Feedback</th>
                        <th>Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sd.items.map((item) => (
                        <tr key={item.id}>
                          <td
                            className={`stats-student-name${item.responseText ? " stats-student-link" : ""}`}
                            onClick={item.responseText ? () => navigateToItemResponse(activeClassId, route.studentId, item) : undefined}
                            title={item.responseText ? "View response" : undefined}
                          >
                            {item.title}
                          </td>
                          <td className="stats-meta">{item.topicTitle}</td>
                          <td><span className={`topic-type type-${item.type}`}>{item.type}</span></td>
                          <td>
                            <span className={`sd-status-pill sd-${item.status}`}>
                              {item.status === "attempted" ? "Attempted"
                                : item.status === "correct" || item.status === "incorrect" ? "Attempted"
                                : item.status === "pending" ? "Pending"
                                : "Not attempted"}
                            </span>
                          </td>
                          <td>{item.attempts || "—"}</td>
                          <td className="stats-meta">{item.feedback || "—"}</td>
                          <td className="stats-meta">
                            {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString() : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Vertical gradebook */}
              {sd.items.length > 0 && (
                <div className="stats-table-section">
                  <h3>Gradebook</h3>
                  <p className="stats-meta">
                    <span className="gb-legend-cell gb-correct" /> Attempted &nbsp;
                    <span className="gb-legend-cell gb-pending" /> Pending &nbsp;
                    <span className="gb-legend-cell gb-none" /> Not attempted
                  </p>
                  <div className="stats-table-wrap">
                    <table className="stats-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Topic</th>
                          <th>Type</th>
                          <th style={{ width: 120 }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sd.items.map((item) => (
                          <tr key={item.id}>
                            <td className="stats-student-name">{item.title}</td>
                            <td className="stats-meta">{item.topicTitle}</td>
                            <td><span className={`topic-type type-${item.type}`}>{item.type}</span></td>
                            <td className={`gb-cell gb-${item.status === "attempted" || item.status === "correct" || item.status === "incorrect" ? "correct" : item.status}`}>
                              {item.status === "attempted" || item.status === "correct" || item.status === "incorrect" ? "Attempted"
                                : item.status === "pending" ? "Pending"
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </section>
          )}

          {/* AI Chat Log — grouped by item */}
          <section className="class-stats-section panel-animate" style={{ marginTop: "1.5rem" }}>
            <h3 style={{ marginBottom: "0.75rem" }}>AI Chat Log</h3>
            {studentAILogLoading && <SkeletonRows count={3} />}
            {!studentAILogLoading && studentAILog !== null && studentAILog.length === 0 && (
              <EmptyState icon="🤖" title="No AI interactions yet" body="This student hasn't used the AI tutor in this class." />
            )}
            {!studentAILogLoading && studentAILog && studentAILog.length > 0 && (() => {
              const groups = new Map();
              for (const ix of studentAILog) {
                const key = ix.itemId?._id || "general";
                if (!groups.has(key)) {
                  groups.set(key, { label: ix.itemId?.title || "General Chat", type: ix.itemId?.type || null, count: 0 });
                }
                groups.get(key).count++;
              }
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {[...groups.entries()].map(([key, group]) => (
                    <button
                      key={key}
                      type="button"
                      className="ghost-button"
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", border: "1px solid var(--border)", borderRadius: "8px", textAlign: "left", width: "100%" }}
                      onClick={() => navigateToAILog(activeClassId, route.studentId, key, group.label, group.type)}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        {group.type && <span className={`topic-type type-${group.type}`}>{group.type}</span>}
                        <span style={{ fontWeight: 600 }}>{group.label}</span>
                      </span>
                      <span className="stats-meta">{group.count} message{group.count !== 1 ? "s" : ""} →</span>
                    </button>
                  ))}
                </div>
              );
            })()}
          </section>

        </main>
        {renderChatBot()}
      </PageShell>
    );
  }

  return (
    <PageShell className={`page-shell ${pageTransition}`}>
      <main className="workspace">
      {toast && (
        <div className={`toast toast-${toast.type}`} role="status" aria-live="polite" aria-atomic="true">{toast.message}</div>
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
          <div className="user-menu-anchor">
            <button className="ghost-button user-menu-trigger" type="button" onClick={() => setUserMenuOpen((o) => !o)} aria-expanded={userMenuOpen} aria-haspopup="menu">
              {user.name} ▾
            </button>
            {userMenuOpen && (
              <div className="user-menu-dropdown" role="menu" onClick={() => setUserMenuOpen(false)}>
                <span className="user-menu-role">{user.role}</span>
                {isTeacher && (
                  <button className="user-menu-item" type="button" role="menuitem"
                    onClick={() => setViewRole((prev) => (prev === "teacher" ? "student" : "teacher"))}
                  >
                    Switch to {isTeacherView ? "Student" : "Teacher"}
                  </button>
                )}
                <button className="user-menu-item user-menu-item--danger" type="button" role="menuitem" onClick={handleLogout}>Log out</button>
              </div>
            )}
          </div>
        </div>
      </header>
      {navIndex >= 0 && (
        <nav className="item-pagination-bar item-pagination-bar--workspace">
          <button
            className="ghost-button"
            type="button"
            disabled={!navPrev}
            onClick={() => navigateToItem(activeClassId, navPrev)}
          >
            ← Prev
          </button>
          <span className="item-pagination-pos">
            {navIndex + 1} / {itemNavList.length}
          </span>
          <button
            className="ghost-button"
            type="button"
            disabled={!navNext}
            onClick={() => navigateToItem(activeClassId, navNext)}
          >
            Next →
          </button>
        </nav>
      )}

      <nav className="workspace-tab-bar" aria-label="Workspace panels">
        {[
          { key: "lesson", label: "Lesson" },
          { key: "editor", label: "Code" },
          { key: "console", label: "Output" },
        ].map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`workspace-tab-btn${workspaceTab === key ? " active" : ""}`}
            onClick={() => setWorkspaceTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="workspace-grid">
        <aside className={`panel lesson-panel panel-animate${workspaceTab !== "lesson" ? " workspace-panel-hidden" : ""}`}>
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
              </>
            ) : (
              <>
                <p className="lesson-eyebrow">{lesson.unit}</p>
                <h2>{lesson.heading}</h2>
              </>
            )}
          </div>
          {isTeacherView ? (
            <>
              <label className="lesson-field">
                Instructions
                <textarea
                  value={lesson.instructions}
                  onChange={(event) => updateActiveLesson({ instructions: event.target.value })}
                />
              </label>
              {route.page === "practice" ? (
                <>
                  <label className="lesson-field">Lesson Content</label>
                  <NotebookEditor
                    cells={nbCells}
                    onChange={(next) => {
                      setNbCells(next);
                      const { body: nb, hints: nh } = serializeCellsToBody(next);
                      updateActiveLesson({ body: nb, hints: nh });
                    }}
                    withHints
                  />
                </>
              ) : (
                <>
                  <label className="lesson-field">
                    Lesson text
                    <textarea
                      value={lesson.body}
                      onChange={(event) => updateActiveLesson({ body: event.target.value })}
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
                </>
              )}
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
              <div className="lesson-save-row">
                <button className="primary-button" type="button" onClick={handleSaveJson}>
                  Save
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="lesson-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{lesson.body || ""}</ReactMarkdown>
              </div>
              <div className="lesson-task">
                <p className="task-title">Instructions</p>
                <p>{lesson.instructions}</p>
              </div>
              <div className="lesson-callout">
                <p>Hints</p>
                <ul>
                  {lesson.hints.map((hint) => (
                    <li key={hint}>{hint}</li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </aside>

        <article className={`panel editor-panel panel-animate${workspaceTab !== "editor" ? " workspace-panel-hidden" : ""}`}>
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
            <button
              className="ghost-button"
              type="button"
              onClick={submitLesson}
            >
              Submit
            </button>
            {practiceSubmitted && (
              <span className="submit-confirm">✓ Submitted</span>
            )}
            <span className="footer-hint">Ctrl/Cmd + Enter</span>
          </div>
        </article>

        <aside className={`panel output-panel panel-animate${workspaceTab !== "console" ? " workspace-panel-hidden" : ""}`}>
          <div className="output-header">
            <h2>Console</h2>
            <span className="output-status">Ready</span>
          </div>
          <div className="output-shell">
            <pre id="output" className="output-body" />
            {(errorExplaining || errorExplanation) && (
              <div className="error-explain-box">
                <span className="error-explain-label">What does this mean?</span>
                {errorExplaining
                  ? <span className="error-explain-loading">Figuring it out…</span>
                  : <span className="error-explain-text">{errorExplanation}</span>
                }
              </div>
            )}
          </div>
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
