import { useState, useEffect } from "react";
import { ArrowLeft, ChevronDown } from 'lucide-react';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from '../contexts/RouterContext';
import { API_BASE, authHeaders } from '../utils/api';
import { parseBodyToCells } from '../utils/parsers';
import PageShell from '../components/PageShell';
import { MD_COMPONENTS } from '../components/NotebookEditor';
import HubImportModal from '../components/HubImportModal';

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function HubPreviewPage({ handleLogout }) {
  const { user, userMenuOpen, setUserMenuOpen, isTeacher } = useAuth();
  const { route, navigateToHub, pageTransition } = useRouter();
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedTopics, setExpandedTopics] = useState(new Set());
  const [importingTemplate, setImportingTemplate] = useState(null);

  useEffect(() => {
    if (!route.templateId) return;
    setLoading(true);
    fetch(`${API_BASE}/hub/${route.templateId}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => {
        const t = d?.data?.template;
        setTemplate(t || null);
        // Expand all topics by default
        if (t?.snapshot?.topics) {
          setExpandedTopics(new Set(t.snapshot.topics.map((_, i) => i)));
        }
      })
      .catch(() => setTemplate(null))
      .finally(() => setLoading(false));
  }, [route.templateId]);

  function toggleTopic(i) {
    setExpandedTopics(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  return (
    <PageShell className={`page-shell ${pageTransition}`}>
      <main className="tp-page">
        <header className="tp-topbar">
          <button className="lp-back-btn" type="button" onClick={navigateToHub}>
            <ArrowLeft size={16} className="sketch-sm" /> Back to Hub
          </button>
          <div className="tp-topbar-center">
            <span className="tp-topbar-eyebrow">Teacher Hub · Preview</span>
            <span className="tp-topbar-title">{loading ? "Loading…" : (template?.title || "Template not found")}</span>
          </div>
          <div className="tp-topbar-right" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {isTeacher && template && (
              <button className="tp-action-btn tp-action-btn--primary" type="button"
                onClick={() => setImportingTemplate({ id: template.id || template._id, title: template.title })}>
                Import template
              </button>
            )}
            <button className="student-user-btn" type="button" onClick={() => setUserMenuOpen(v => !v)}>
              <span className="student-user-avatar">{user?.name?.[0]?.toUpperCase()}</span>
              <ChevronDown size={14} />
            </button>
            {userMenuOpen && (
              <div className="user-menu-dropdown" role="menu" onClick={() => setUserMenuOpen(false)}>
                <span className="user-menu-role">{user?.role}</span>
                <button className="user-menu-item user-menu-item--danger" type="button" role="menuitem" onClick={handleLogout}>Log out</button>
              </div>
            )}
          </div>
        </header>

        <div className="tp-content hub-preview-tp-content">
        {loading ? (
          <div className="hub-preview-page-loading">
            {[1,2,3].map(i => <div key={i} className="hub-list-skeleton" style={{ height: 120, marginBottom: "0.75rem" }} />)}
          </div>
        ) : !template ? (
          <div style={{ textAlign: "center", padding: "4rem 1rem", color: "var(--text-muted)" }}>
            <p style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>🔍</p>
            <p>Template not found.</p>
          </div>
        ) : (
          <>
            {/* Template meta */}
            <div className="hub-preview-page-meta">
              <div className="hub-preview-page-meta-row">
                <span>by <strong>{template.authorName}</strong></span>
                <span className="hub-meta-dot">·</span>
                <span>{template.snapshot?.topicCount} topic{template.snapshot?.topicCount !== 1 ? "s" : ""}</span>
                <span className="hub-meta-dot">·</span>
                <span>{template.snapshot?.itemCount} item{template.snapshot?.itemCount !== 1 ? "s" : ""}</span>
                <span className="hub-meta-dot">·</span>
                <span>{template.importCount} import{template.importCount !== 1 ? "s" : ""}</span>
                <span className="hub-meta-dot">·</span>
                <span>Published {fmtDate(template.createdAt)}</span>
              </div>
              {template.description && <p className="hub-preview-page-desc">{template.description}</p>}
              {template.tags?.length > 0 && (
                <div className="hub-card-tags" style={{ marginTop: "0.5rem" }}>
                  {template.tags.map(tag => <span key={tag} className="hub-tag">{tag}</span>)}
                </div>
              )}
            </div>

            {/* Topics + items */}
            <div className="hub-preview-page-topics">
              {template.snapshot?.topics?.map((topic, ti) => {
                const open = expandedTopics.has(ti);
                return (
                  <div key={ti} className="hub-preview-page-topic">
                    <button
                      type="button"
                      className="hub-preview-page-topic-header"
                      onClick={() => toggleTopic(ti)}
                    >
                      <span className="topic-pill">Topic {ti + 1}</span>
                      <strong className="hub-preview-page-topic-title">{topic.title}</strong>
                      <span className="hub-preview-page-topic-count">{topic.items?.length || 0} items</span>
                      <span className="hub-preview-page-chevron">{open ? "▲" : "▼"}</span>
                    </button>

                    {open && (
                      <div className="hub-preview-page-items">
                        {(topic.items || []).map((item, ii) => (
                          <div key={ii} className={`hub-preview-page-item hub-preview-item-${item.type}`}>
                            <div className="hub-preview-page-item-header">
                              <span className={`topic-type type-${item.type}`}>{item.type}</span>
                              <span className="hub-preview-page-item-title">{item.title}</span>
                            </div>

                            {/* Learning item content */}
                            {item.type === "learning" && item.practiceBody && (
                              <div className="learning-body hub-preview-page-body">
                                {parseBodyToCells(item.practiceBody).filter(c => c.type !== "hint").map((cell) => {
                                  switch (cell.type) {
                                    case "h1": return <h1 key={cell.id}>{cell.content}</h1>;
                                    case "h2": return <h2 key={cell.id}>{cell.content}</h2>;
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
                                })}
                              </div>
                            )}

                            {/* Quiz item content */}
                            {item.type === "quiz" && (
                              <div className="hub-preview-page-body">
                                {item.quizQuestion && (
                                  <div className="quiz-question-body">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={MD_COMPONENTS}>
                                      {item.quizQuestion}
                                    </ReactMarkdown>
                                  </div>
                                )}
                                {item.quizSubtype === "mcq" && item.quizOptions?.length > 0 && (
                                  <div className="hub-preview-quiz-options">
                                    {item.quizOptions.map((opt, oi) => (
                                      <div key={oi} className={`hub-preview-quiz-option${opt === item.quizAnswer ? " correct" : ""}`}>
                                        <span className="hub-preview-quiz-letter">{String.fromCharCode(65 + oi)}</span>
                                        <span>{opt}</span>
                                        {opt === item.quizAnswer && <span className="hub-preview-quiz-badge">✓ Answer</span>}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {item.quizSubtype === "short_answer" && item.quizAnswer && (
                                  <div className="hub-preview-sa-answer">
                                    <span className="hub-preview-sa-label">Sample answer:</span> {item.quizAnswer}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Practice item content */}
                            {item.type === "practice" && (
                              <div className="hub-preview-page-body learning-body">
                                {item.practiceInstructions && (
                                  <div className="learning-instructions" style={{ marginBottom: "0.75rem" }}>
                                    {item.practiceInstructions}
                                  </div>
                                )}
                                {item.practiceCodeStarter && (
                                  <>
                                    <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", margin: "0 0 0.3rem" }}>Starter code</p>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={MD_COMPONENTS}>
                                      {`\`\`\`python\n${item.practiceCodeStarter}\n\`\`\``}
                                    </ReactMarkdown>
                                  </>
                                )}
                                {item.practiceModelAnswer && (
                                  <details className="hub-preview-model-answer">
                                    <summary>Model answer</summary>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={MD_COMPONENTS}>
                                      {`\`\`\`python\n${item.practiceModelAnswer}\n\`\`\``}
                                    </ReactMarkdown>
                                  </details>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
        </div>
      </main>

      {importingTemplate && (
        <HubImportModal template={importingTemplate} onClose={() => setImportingTemplate(null)} />
      )}
    </PageShell>
  );
}
