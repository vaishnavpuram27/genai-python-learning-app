import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { parseBodyToCells, serializeCellsToBody } from "../utils/parsers";
import { NotebookEditor, MD_COMPONENTS } from "./NotebookEditor";
import SelectionPopup from "./SelectionPopup";

export default function LearningViewer({ meta, isTeacher, activeClassId, authHeaders, API_BASE, onSaved, setToast, onAskAI, previewItem, onAcceptPreview, onClearPreview }) {
  const hasContent = !!(meta.practiceBody || meta.practiceCodeStarter);
  const hints = Array.isArray(meta.practiceHints) ? meta.practiceHints : [];
  const hasExercise = !!(meta.practiceInstructions);

  const [editing, setEditing] = useState(!hasContent && isTeacher);
  const [cells, setCells] = useState(() => parseBodyToCells(meta.practiceBody || ""));
  const [instructions, setInstructions] = useState(meta.practiceInstructions || "");
  const [codeStarter, setCodeStarter] = useState(meta.practiceCodeStarter || "");
  const [saving, setSaving] = useState(false);
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [inlineSaving, setInlineSaving] = useState(false);
  const [acceptingSave, setAcceptingSave] = useState(false);

  // AI returns markdown body directly — store as-is for rendering
  const previewMarkdown = previewItem?.body ?? null;

  const viewCells = useMemo(() => parseBodyToCells(meta.practiceBody || ""), [meta.practiceBody]);
  const sectionRefs = useRef({});

  const miniInitialCode = meta.practiceCodeStarter || "# Write your Python code here\n";
  const [miniOutput, setMiniOutput] = useState(null);
  const [miniRunning, setMiniRunning] = useState(false);
  const [miniError, setMiniError] = useState(false);
  const miniEditorHostRef = useRef(null);
  const miniEditorRef = useRef(null);

  useEffect(() => {
    if (editing) return;
    function mountAce(retries = 0) {
      if (!window.ace || !miniEditorHostRef.current) {
        if (retries < 20) setTimeout(() => mountAce(retries + 1), 150);
        return;
      }
      if (miniEditorRef.current) return;
      const editor = window.ace.edit(miniEditorHostRef.current);
      editor.setTheme("ace/theme/monokai");
      editor.session.setMode("ace/mode/python");
      editor.setValue(miniInitialCode, -1);
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

  async function handleInlineReplace(selectedText, newText) {
    const newCells = cells.map((cell) =>
      cell.content.includes(selectedText)
        ? { ...cell, content: cell.content.replace(selectedText, newText.trim()) }
        : cell
    );
    setCells(newCells);
    setInlineSaving(true);
    const { body: newBody } = serializeCellsToBody(newCells);
    try {
      const res = await fetch(
        `${API_BASE}/classes/${activeClassId}/topics/${meta.topic?.id}/items/${meta.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ title: meta.title, type: "learning", practiceBody: newBody,
            practiceInstructions: instructions, practiceCodeStarter: codeStarter }),
        }
      );
      if (res.ok) {
        onSaved({ practiceBody: newBody, practiceInstructions: instructions, practiceCodeStarter: codeStarter });
        setToast({ type: "success", message: "Content updated!" });
      } else {
        setToast({ type: "error", message: "Failed to save." });
      }
    } catch {
      setToast({ type: "error", message: "Server not reachable." });
    } finally {
      setInlineSaving(false);
    }
  }

  async function handleAcceptPreview() {
    if (!previewItem) return;
    setAcceptingSave(true);
    try {
      const res = await fetch(
        `${API_BASE}/classes/${activeClassId}/topics/${meta.topic?.id}/items/${meta.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            title: previewItem.title || meta.title,
            type: "learning",
            practiceBody: previewItem.body || "",
            practiceInstructions: previewItem.instructions || "",
            practiceHints: previewItem.hints || [],
            practiceCodeStarter: previewItem.codeStarter || "",
          }),
        }
      );
      if (res.ok) {
        setCells(parseBodyToCells(previewItem.body || ""));
        setInstructions(previewItem.instructions || "");
        setCodeStarter(previewItem.codeStarter || "");
        setEditing(false);
        onAcceptPreview?.({
          title: previewItem.title || meta.title,
          practiceBody: previewItem.body || "",
          practiceInstructions: previewItem.instructions || "",
          practiceHints: previewItem.hints || [],
          practiceCodeStarter: previewItem.codeStarter || "",
        });
        setToast({ type: "success", message: "Lesson updated!" });
      } else {
        setToast({ type: "error", message: "Failed to save preview." });
      }
    } catch {
      setToast({ type: "error", message: "Server not reachable." });
    } finally {
      setAcceptingSave(false);
    }
  }

  // Render a single cell (shared between preview and live view)
  function renderCell(cell) {
    switch (cell.type) {
      case "h1": return <h1 key={cell.id}>{cell.content}</h1>;
      case "h2": return <h2 key={cell.id} id={`section-${cell.id}`} ref={(el) => { sectionRefs.current[cell.id] = el; }}>{cell.content}</h2>;
      case "h3": return <h3 key={cell.id}>{cell.content}</h3>;
      case "bullet": return <ul key={cell.id}><li>{cell.content}</li></ul>;
      case "code": return (
        <ReactMarkdown key={cell.id} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={MD_COMPONENTS}>
          {`\`\`\`python\n${cell.content}\n\`\`\``}
        </ReactMarkdown>
      );
      case "callout": return (
        <div key={cell.id} className="callout-block">
          <span className="callout-icon">💡</span>
          <div><strong>Key Concept</strong><p>{cell.content}</p></div>
        </div>
      );
      default: return (
        <ReactMarkdown key={cell.id} remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
          {cell.content}
        </ReactMarkdown>
      );
    }
  }

  return (
    <div className={`learning-viewer${!isTeacher ? " lv-student" : ""}`}>
      {isTeacher && meta.topic?.title && (
        <p className="learning-topic-label">{meta.topic.title}</p>
      )}

      {/* ── AI Preview Banner ── */}
      {isTeacher && previewItem && (
        <div className="lv-preview-wrap">
          <div className="lv-preview-banner">
            <div className="lv-preview-banner-left">
              <span className="lv-preview-badge">✨ AI Preview</span>
              <span className="lv-preview-hint">
                {previewItem.title && previewItem.title !== meta.title
                  ? `"${previewItem.title}" — review below`
                  : "Review the suggested rewrite below"}
              </span>
            </div>
            <div className="lv-preview-banner-actions">
              <button type="button" className="lv-preview-discard" onClick={onClearPreview}>✕ Discard</button>
              <button type="button" className="lv-preview-accept" onClick={handleAcceptPreview} disabled={acceptingSave}>
                {acceptingSave ? "Saving…" : "✓ Accept & Save"}
              </button>
            </div>
          </div>
          <div className="learning-body lv-preview-body">
            {previewMarkdown
              ? <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={MD_COMPONENTS}>{previewMarkdown}</ReactMarkdown>
              : <p style={{ color: "var(--text-muted)", fontStyle: "italic" }}>No content in preview.</p>
            }
          </div>
          <div className="lv-preview-divider">
            <span className="lv-preview-divider-label">Current content</span>
          </div>
        </div>
      )}
      {!isTeacher && meta.topic?.title && (
        <div className="lv-topic-chip">📂 {meta.topic.title}</div>
      )}

      {isTeacher && editing ? (
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
              {meta.practiceBody && (() => {
                const bodyContent = (
                  <div className="learning-body">
                    {viewCells.filter((c) => c.type !== "hint").map(renderCell)}
                  </div>
                );
                return isTeacher
                  ? <SelectionPopup onReplaceText={handleInlineReplace} classId={activeClassId} itemId={meta.id}>{bodyContent}</SelectionPopup>
                  : bodyContent;
              })()}

              {hasExercise && (
                <div className={isTeacher ? "learning-exercise" : "lv-exercise"}>
                  <div className={isTeacher ? "learning-exercise-header" : "lv-exercise-header"}>
                    {!isTeacher && <span className="lv-exercise-emoji">🚀</span>}
                    <span className={isTeacher ? "learning-exercise-badge" : "lv-exercise-badge"}>Try it!</span>
                    <p className={isTeacher ? "learning-exercise-task" : "lv-exercise-task"}>{meta.practiceInstructions}</p>
                  </div>

                  {hints.length > 0 && (
                    <div className={isTeacher ? "learning-hints-wrap" : "lv-hints-wrap"}>
                      {hints.slice(0, hintsRevealed).map((h, i) => (
                        <div key={i} className={isTeacher ? "learning-hint-item" : "lv-hint-item"}>
                          <span className={isTeacher ? "learning-hint-num" : "lv-hint-num"}>💡 Hint {i + 1}</span>
                          <span>{h}</span>
                        </div>
                      ))}
                      {hintsRevealed < hints.length && (
                        <button className={isTeacher ? "ghost-button learning-hint-btn" : "lv-hint-btn"}
                          onClick={() => setHintsRevealed((n) => n + 1)}>
                          {hintsRevealed === 0 ? "🔍 Show Hint" : "➕ Next Hint"}
                        </button>
                      )}
                      {hintsRevealed >= hints.length && hints.length > 0 && (
                        <button className={isTeacher ? "ghost-button learning-hint-btn" : "lv-hint-btn"}
                          onClick={() => setHintsRevealed(0)}>
                          Hide Hints
                        </button>
                      )}
                    </div>
                  )}

                  <div className={isTeacher ? "mini-editor-wrap" : "lv-editor-wrap"}>
                    <div className={isTeacher ? "mini-editor-topbar" : "lv-editor-topbar"}>
                      <span className={isTeacher ? "mini-editor-label" : "lv-editor-label"}>🐍 Python Editor</span>
                      <button className={isTeacher ? "run-pill" : "lv-run-btn"}
                        onClick={runMiniCode} disabled={miniRunning} type="button">
                        {miniRunning ? "⏳ Running…" : "▶ Run Code"}
                      </button>
                    </div>
                    <div ref={miniEditorHostRef} className={isTeacher ? "mini-ace-host" : "lv-ace-host"} />
                    {miniOutput !== null && (
                      <div className={isTeacher ? `mini-console ${miniError ? "mini-console-error" : ""}` : `lv-console${miniError ? " lv-console--error" : ""}`}>
                        <span className={isTeacher ? "mini-console-label" : "lv-console-label"}>
                          {miniError ? "❌ Error" : "✅ Output"}
                        </span>
                        <pre>{miniOutput}</pre>
                      </div>
                    )}
                  </div>
                </div>
              )}

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
