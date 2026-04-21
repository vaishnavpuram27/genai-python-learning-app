import { forwardRef, useImperativeHandle, useState } from "react";
import { API_BASE, authHeaders } from '../utils/api';
import { useAppContext } from '../contexts/AppContext';

const PublishModal = forwardRef(function PublishModal(_, ref) {
  const { setToast } = useAppContext();
  const [open, setOpen] = useState(false);
  const [classId, setClassId] = useState("");
  const [topics, setTopics] = useState([]);
  const [templateTitle, setTemplateTitle] = useState("");
  const [templateDesc, setTemplateDesc] = useState("");
  const [templateTags, setTemplateTags] = useState("");
  const [selectedTopicIds, setSelectedTopicIds] = useState(new Set());
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [templateId, setTemplateId] = useState(null);

  useImperativeHandle(ref, () => ({
    open(cId, topicList, existingTemplate = null) {
      setClassId(cId);
      setTopics(topicList || []);
      setSelectedTopicIds(new Set((topicList || []).map(t => t.id || t._id?.toString())));
      setPublishError("");
      if (existingTemplate) {
        setTemplateId(existingTemplate.id);
        setTemplateTitle(existingTemplate.title || "");
        setTemplateDesc(existingTemplate.description || "");
        setTemplateTags((existingTemplate.tags || []).join(", "));
      } else {
        setTemplateId(null);
        setTemplateTitle("");
        setTemplateDesc("");
        setTemplateTags("");
      }
      setOpen(true);
    },
  }));

  function toggleTopic(id) {
    setSelectedTopicIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handlePublish() {
    if (!templateTitle.trim()) { setPublishError("Title is required."); return; }
    if (selectedTopicIds.size === 0) { setPublishError("Select at least one topic."); return; }
    setPublishing(true);
    setPublishError("");
    try {
      const tags = templateTags.split(",").map(t => t.trim()).filter(Boolean);
      const body = {
        title: templateTitle.trim(),
        description: templateDesc.trim(),
        tags,
        sourceClassId: classId,
        topicIds: [...selectedTopicIds],
      };
      const url = templateId ? `${API_BASE}/hub/${templateId}` : `${API_BASE}/hub`;
      const method = templateId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setPublishError(data?.error?.message || "Failed to publish.");
        return;
      }
      setOpen(false);
      setToast({ type: "success", message: templateId ? "Hub template updated!" : "Published to Hub!" });
    } catch {
      setPublishError("Server error.");
    } finally {
      setPublishing(false);
    }
  }

  if (!open) return null;

  const allSelected = topics.length > 0 && topics.every(t => selectedTopicIds.has(t.id || t._id?.toString()));

  return (
    <div className="modal-overlay" onClick={() => setOpen(false)}>
      <div className="modal-content hub-publish-modal" onClick={e => e.stopPropagation()}>
        <div className="mcq-modal-header">
          <div>
            <p className="mcq-modal-eyebrow">Teacher Hub</p>
            <h2 className="mcq-modal-title">{templateId ? "Update Template" : "Publish Template"}</h2>
          </div>
          <button className="mcq-modal-close" type="button" onClick={() => setOpen(false)}>✕</button>
        </div>
        <div className="mcq-modal-body">
          <label className="form-label">Template title *</label>
          <input className="class-input" style={{ width: "100%", marginBottom: "0.75rem" }} value={templateTitle} onChange={e => setTemplateTitle(e.target.value)} placeholder="e.g. Python Loops Basics" />

          <label className="form-label">Description</label>
          <textarea className="class-input" style={{ width: "100%", minHeight: 72, marginBottom: "0.75rem", resize: "vertical" }} value={templateDesc} onChange={e => setTemplateDesc(e.target.value)} placeholder="What will teachers get from this template?" />

          <label className="form-label">Tags (comma-separated)</label>
          <input className="class-input" style={{ width: "100%", marginBottom: "1rem" }} value={templateTags} onChange={e => setTemplateTags(e.target.value)} placeholder="e.g. loops, beginner, functions" />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <label className="form-label" style={{ margin: 0 }}>Topics to include</label>
            <button type="button" className="ghost-button" style={{ fontSize: "0.75rem", padding: "2px 8px" }}
              onClick={() => setSelectedTopicIds(allSelected ? new Set() : new Set(topics.map(t => t.id || t._id?.toString())))}>
              {allSelected ? "Deselect all" : "Select all"}
            </button>
          </div>
          <div className="hub-topic-list">
            {topics.map(t => {
              const id = t.id || t._id?.toString();
              const checked = selectedTopicIds.has(id);
              return (
                <label key={id} className={`hub-topic-row${checked ? " selected" : ""}`}>
                  <input type="checkbox" className="hub-topic-checkbox" checked={checked} onChange={() => toggleTopic(id)} />
                  <div className="hub-topic-info">
                    <span className="hub-topic-name">{t.title}</span>
                    <span className="hub-topic-count">{(t.items || []).length} item{(t.items || []).length !== 1 ? "s" : ""}</span>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
        <div className="hub-publish-footer">
          {publishError && <span className="auth-error" style={{ marginRight: "auto" }}>{publishError}</span>}
          <button className="ghost-button" type="button" onClick={() => setOpen(false)}>Cancel</button>
          <button className="accent-button" type="button" disabled={publishing} onClick={handlePublish}>
            {publishing ? "Publishing…" : (templateId ? "Update" : "Publish")}
          </button>
        </div>
      </div>
    </div>
  );
});

export default PublishModal;
