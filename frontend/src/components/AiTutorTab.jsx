import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { API_BASE, authHeaders } from '../utils/api';
import { useAppContext } from '../contexts/AppContext';
import { stripMachineBlocks } from '../utils/parsers';
import { MD_COMPONENTS } from './NotebookEditor';

const TONES = [
  { value: "friendly",    label: "Friendly",     desc: "Warm and approachable",           emoji: "😊" },
  { value: "encouraging", label: "Encouraging",  desc: "Motivating and positive",          emoji: "🚀" },
  { value: "socratic",    label: "Socratic",      desc: "Asks questions, guides discovery", emoji: "🤔" },
  { value: "formal",      label: "Formal",        desc: "Professional and precise",         emoji: "📐" },
];

export default function AiTutorTab({ classId, topics }) {
  const { setToast } = useAppContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [enabled, setEnabled] = useState(true);
  const [personaName, setPersonaName] = useState("");
  const [tone, setTone] = useState("friendly");
  const [instructions, setInstructions] = useState("");
  const [assessmentInstructions, setAssessmentInstructions] = useState("");
  const [topicNotes, setTopicNotes] = useState({});

  // Preview student AI
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMessages, setPreviewMessages] = useState([]);
  const [previewInput, setPreviewInput] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewEndRef = useRef(null);

  useEffect(() => {
    if (!classId) return;
    setLoading(true);
    fetch(`${API_BASE}/classes/${classId}/ai-config`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => {
        const c = d?.data?.aiConfig || {};
        setEnabled(c.enabled ?? true);
        setPersonaName(c.personaName || "");
        setTone(c.tone || "friendly");
        setInstructions(c.instructions || "");
        setAssessmentInstructions(c.assessmentInstructions || "");
        const notes = {};
        (c.topicNotes || []).forEach(tn => { notes[tn.topicId] = tn.notes; });
        setTopicNotes(notes);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [classId]);

  function setTopicNote(topicId, value) {
    setTopicNotes(prev => ({ ...prev, [topicId]: value }));
  }

  async function sendPreviewMessage() {
    const text = previewInput.trim();
    if (!text || previewLoading) return;
    setPreviewInput("");
    const updated = [...previewMessages, { role: "user", content: text }];
    setPreviewMessages(updated);
    setPreviewLoading(true);
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          messages: updated.map(m => ({ role: m.role, content: m.content })),
          context: { classId, previewAsStudent: true },
        }),
      });
      if (!res.ok) throw new Error();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let content = "";
      setPreviewMessages(prev => [...prev, { role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.done) break;
            if (data.content) {
              content += data.content;
              setPreviewMessages(prev => {
                const u = [...prev];
                u[u.length - 1] = { role: "assistant", content };
                return u;
              });
              previewEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }
          } catch { /* ignore */ }
        }
      }
    } catch {
      setPreviewMessages(prev => [...prev, { role: "assistant", content: "Something went wrong." }]);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const topicNotesArr = Object.entries(topicNotes)
        .filter(([, notes]) => notes.trim())
        .map(([topicId, notes]) => ({ topicId, notes }));
      const res = await fetch(`${API_BASE}/classes/${classId}/ai-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ enabled, personaName, tone, instructions, assessmentInstructions, topicNotes: topicNotesArr }),
      });
      if (!res.ok) throw new Error();
      setToast({ type: "success", message: "AI Tutor settings saved." });
    } catch {
      setToast({ type: "error", message: "Failed to save settings." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="ai-tutor-loading">Loading AI settings…</div>;

  return (
    <div className="ai-tutor-tab">

      {/* Enable / disable card */}
      <div className="ait-card ait-enable-card">
        <div className="ait-enable-left">
          <span className="ait-enable-icon">🤖</span>
          <div>
            <p className="ait-card-title">AI Tutor</p>
            <p className="ait-card-desc">Let students chat with an AI assistant while learning in this class.</p>
          </div>
        </div>
        <label className="ai-toggle">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          <span className="ai-toggle-track" />
        </label>
      </div>

      {enabled && (
        <>
          {/* Persona card */}
          <div className="ait-card">
            <p className="ait-card-title">Persona</p>
            <p className="ait-card-desc">How the AI presents itself to students.</p>
            <div className="ait-persona-row">
              <div className="ait-field">
                <label className="ait-label">Name</label>
                <input
                  className="class-input"
                  style={{ width: "100%" }}
                  placeholder="e.g. PyBot, Socrates, Coach…"
                  value={personaName}
                  onChange={e => setPersonaName(e.target.value)}
                />
                <p className="ait-hint">Leave blank to use "AI Assistant".</p>
              </div>
              <div className="ait-field">
                <label className="ait-label">Tone</label>
                <div className="ait-tone-grid">
                  {TONES.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      className={`ait-tone-btn${tone === t.value ? " ait-tone-btn--active" : ""}`}
                      onClick={() => setTone(t.value)}
                    >
                      <span className="ait-tone-emoji">{t.emoji}</span>
                      <span className="ait-tone-label">{t.label}</span>
                      <span className="ait-tone-desc">{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* General instructions card */}
          <div className="ait-card">
            <p className="ait-card-title">General Instructions</p>
            <p className="ait-card-desc">Included in every conversation — both student chats and your Teaching Assistant. Set boundaries, focus areas, or preferred teaching style.</p>
            <textarea
              className="ai-tutor-textarea"
              placeholder={"e.g. Always use Python 3. Never give direct answers, only hints.\nKeep responses under 3 sentences."}
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              rows={4}
            />
          </div>

          {/* Assessment instructions card */}
          <div className="ait-card">
            <p className="ait-card-title">Assessment Instructions</p>
            <p className="ait-card-desc">Used when the AI evaluates student quiz and practice submissions. Defines what counts as correct or partial.</p>
            <textarea
              className="ai-tutor-textarea"
              placeholder={"e.g. A correct answer must include a working loop.\nPartial credit if logic is right but syntax is wrong."}
              value={assessmentInstructions}
              onChange={e => setAssessmentInstructions(e.target.value)}
              rows={4}
            />
          </div>

          {/* Per-topic notes card */}
          {topics && topics.length > 0 && (
            <div className="ait-card">
              <p className="ait-card-title">Topic Context</p>
              <p className="ait-card-desc">Extra context injected when a student is on a specific topic — great for flagging common mistakes.</p>
              <div className="ait-topic-list">
                {topics.map((topic, ti) => (
                  <div key={topic.id} className="ait-topic-row">
                    <div className="ait-topic-label">
                      <span className="ait-topic-num">Topic {ti + 1}</span>
                      <span className="ait-topic-name">{topic.title}</span>
                    </div>
                    <textarea
                      className="ai-tutor-textarea ai-tutor-textarea--sm"
                      placeholder={`Notes for "${topic.title}"… e.g. students often confuse range(n) with range(1,n)`}
                      value={topicNotes[topic.id] || ""}
                      onChange={e => setTopicNote(topic.id, e.target.value)}
                      rows={2}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Preview Student AI */}
      {enabled && (
        <div className="ait-card ait-preview-card">
          <button type="button" className="ait-preview-toggle" onClick={() => { setPreviewOpen(o => !o); setPreviewMessages([]); }}>
            <div>
              <p className="ait-card-title">🧪 Test Student AI</p>
              <p className="ait-card-desc">Chat as a student would — see how your tone and instructions shape the responses.</p>
            </div>
            <span className="ait-preview-chevron">{previewOpen ? "▲" : "▼"}</span>
          </button>
          {previewOpen && (
            <div className="ait-preview-chat">
              <div className="ait-preview-banner">
                Responding as: <strong>{personaName || "AI Assistant"}</strong> · Tone: <strong style={{ textTransform: "capitalize" }}>{tone}</strong>
                <button type="button" className="ait-preview-clear" onClick={() => setPreviewMessages([])}>Clear</button>
              </div>
              <div className="ait-preview-messages">
                {previewMessages.length === 0 && (
                  <p className="ait-preview-empty">Ask anything a student might ask…</p>
                )}
                {previewMessages.map((m, i) => (
                  <div key={i} className={`ait-preview-msg ait-preview-msg--${m.role}`}>
                    <span className="ait-preview-msg-label">{m.role === "user" ? "Student" : (personaName || "AI")}</span>
                    <div className="ait-preview-msg-text">
                      {m.role === "user"
                        ? <p style={{ margin: 0 }}>{m.content}</p>
                        : m.content
                          ? <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={MD_COMPONENTS}>{stripMachineBlocks(m.content)}</ReactMarkdown>
                          : <p style={{ margin: 0 }}>{previewLoading && i === previewMessages.length - 1 ? "…" : ""}</p>
                      }
                    </div>
                  </div>
                ))}
                <div ref={previewEndRef} />
              </div>
              <div className="ait-preview-input-row">
                <input
                  className="class-input ait-preview-input"
                  placeholder="Type a student question…"
                  value={previewInput}
                  onChange={e => setPreviewInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendPreviewMessage()}
                  disabled={previewLoading}
                />
                <button type="button" className="tp-action-btn tp-action-btn--primary" onClick={sendPreviewMessage} disabled={previewLoading || !previewInput.trim()}>
                  {previewLoading ? "…" : "Send"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Save */}
      <div className="ait-save-row">
        <button className="tp-action-btn tp-action-btn--primary" type="button" disabled={saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>
    </div>
  );
}
