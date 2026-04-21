import { useState, useEffect } from "react";
import { API_BASE, authHeaders } from '../utils/api';
import { useAppContext } from '../contexts/AppContext';
import { useRouter } from '../contexts/RouterContext';
import { useClassContext } from '../contexts/ClassContext';

/**
 * HubImportModal
 * Props:
 *   template  — { id, title } (minimal) or full template object with snapshot.topics
 *   onClose   — called when modal should close
 * On successful import, navigates to the new class automatically.
 */
export default function HubImportModal({ template, onClose }) {
  const { setToast } = useAppContext();
  const { navigateToClass } = useRouter();
  const { refreshClasses } = useClassContext();

  const [topics, setTopics] = useState(null);        // null = loading, [] = loaded
  const [selectedIndices, setSelectedIndices] = useState(new Set());
  const [className, setClassName] = useState(template?.title || "");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");

  // Fetch full template if we don't already have snapshot topics
  useEffect(() => {
    if (!template?.id) return;
    if (template.snapshot?.topics) {
      // Full template already provided
      const t = template.snapshot.topics;
      setTopics(t);
      setSelectedIndices(new Set(t.map((_, i) => i)));
    } else {
      // Only id+title provided — fetch full template
      fetch(`${API_BASE}/hub/${template.id}`, { headers: authHeaders() })
        .then(r => r.json())
        .then(d => {
          const t = d?.data?.template?.snapshot?.topics || [];
          setTopics(t);
          setSelectedIndices(new Set(t.map((_, i) => i)));
        })
        .catch(() => setTopics([]));
    }
    setClassName(template.title || "");
  }, [template?.id]);

  function toggleIndex(i) {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  const allSelected = topics?.length > 0 && topics.every((_, i) => selectedIndices.has(i));

  async function handleImport() {
    if (!template?.id) return;
    if (selectedIndices.size === 0) { setImportError("Select at least one topic."); return; }
    setImporting(true);
    setImportError("");
    try {
      const res = await fetch(`${API_BASE}/hub/${template.id}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          className: className.trim() || template.title,
          selectedTopicIndices: [...selectedIndices],
        }),
      });
      const data = await res.json();
      if (!res.ok) { setImportError(data?.error?.message || "Import failed."); return; }
      const { newClassId, newClassName, importedTopicCount, importedItemCount } = data.data;
      setToast({ type: "success", message: `Imported ${importedTopicCount} topics, ${importedItemCount} items into "${newClassName}"!` });
      await refreshClasses();
      onClose();
      navigateToClass(newClassId);
    } catch {
      setImportError("Server error. Try again.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content hub-import-modal hub-import-modal--select" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="hub-import-modal-header">
          <div>
            <p className="mcq-modal-eyebrow" style={{ marginBottom: "0.2rem" }}>Teacher Hub</p>
            <h3 className="modal-title" style={{ margin: 0 }}>Import Template</h3>
          </div>
          <button className="mcq-modal-close" type="button" onClick={onClose}>✕</button>
        </div>

        <div className="hub-import-modal-body">
          {/* Class name */}
          <label className="hub-import-label">New class name</label>
          <input
            className="class-input"
            style={{ width: "100%", boxSizing: "border-box", marginBottom: "1rem" }}
            value={className}
            onChange={e => setClassName(e.target.value)}
            placeholder={template?.title}
          />

          {/* Topic selection */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <label className="hub-import-label" style={{ margin: 0 }}>Select topics to import</label>
            {topics && topics.length > 0 && (
              <button type="button" className="ghost-button" style={{ fontSize: "0.72rem", padding: "2px 8px" }}
                onClick={() => setSelectedIndices(allSelected ? new Set() : new Set(topics.map((_, i) => i)))}>
                {allSelected ? "Deselect all" : "Select all"}
              </button>
            )}
          </div>

          {topics === null ? (
            <div className="hub-topic-list">
              {[1, 2, 3].map(i => <div key={i} className="hub-topic-row" style={{ opacity: 0.4, pointerEvents: "none" }}>Loading…</div>)}
            </div>
          ) : topics.length === 0 ? (
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>No topics in this template.</p>
          ) : (
            <div className="hub-topic-list">
              {topics.map((t, i) => {
                const checked = selectedIndices.has(i);
                return (
                  <label key={i} className={`hub-topic-row${checked ? " selected" : ""}`}>
                    <input type="checkbox" className="hub-topic-checkbox" checked={checked} onChange={() => toggleIndex(i)} />
                    <div className="hub-topic-info">
                      <span className="hub-topic-name">{t.title}</span>
                      <span className="hub-topic-count">
                        {(t.items || []).length} item{(t.items || []).length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="hub-import-modal-footer">
          {importError && <span className="auth-error" style={{ marginRight: "auto", fontSize: "0.8rem" }}>{importError}</span>}
          <button className="ghost-button" type="button" onClick={onClose}>Cancel</button>
          <button
            className="accent-button"
            type="button"
            disabled={importing || topics === null || selectedIndices.size === 0}
            onClick={handleImport}
          >
            {importing ? "Creating class…" : `Import ${selectedIndices.size > 0 ? `${selectedIndices.size} topic${selectedIndices.size !== 1 ? "s" : ""}` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
