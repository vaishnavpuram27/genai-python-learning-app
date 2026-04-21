import { useEffect, useRef, useState } from "react";
import { genCellId, parseBodyToCells, serializeCellsToBody } from "../utils/parsers";

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

export const MD_COMPONENTS = { pre: CopyPre };

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

export function NotebookEditor({ cells, onChange, withHints = false }) {
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

export function LearningBodyEditor({ body, onChange }) {
  const [cells, setCells] = useState(() => parseBodyToCells(body || ""));
  function handleCellsChange(nextCells) {
    setCells(nextCells);
    const { body: newBody } = serializeCellsToBody(nextCells);
    onChange(newBody);
  }
  return <NotebookEditor cells={cells} onChange={handleCellsChange} withHints={false} />;
}

export function PlanLearningEditor({ item, onUpdate }) {
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
