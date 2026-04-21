import { useState, useEffect, useRef } from "react";
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from '../contexts/RouterContext';
import { API_BASE, authHeaders } from '../utils/api';
import PageShell from '../components/PageShell';
import HubImportModal from '../components/HubImportModal';

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function wasEdited(t) {
  if (!t.createdAt || !t.updatedAt) return false;
  return new Date(t.updatedAt) - new Date(t.createdAt) > 60_000;
}

export default function HubPage({ handleLogout, chatBot }) {
  const { user, isTeacher, userMenuOpen, setUserMenuOpen } = useAuth();
  const { navigateToClasses, navigateToHubPreview, pageTransition } = useRouter();

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [activeAuthor, setActiveAuthor] = useState("");
  const [importingTemplate, setImportingTemplate] = useState(null); // { id, title }
  const searchTimer = useRef(null);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(fetchTemplates, searchInput ? 300 : 0);
    return () => clearTimeout(searchTimer.current);
  }, [searchInput, activeTag]);

  async function fetchTemplates() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchInput) params.set("search", searchInput);
      if (activeTag) params.set("tags", activeTag);
      const res = await fetch(`${API_BASE}/hub?${params}`, { headers: authHeaders() });
      const data = await res.json();
      setTemplates(data?.data?.templates || []);
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }

  function openImport(t) {
    setImportingTemplate({ id: t.id, title: t.title });
  }

  // Derived filter options
  const allTags = [...new Set(templates.flatMap(t => t.tags || []))].slice(0, 14);
  const allAuthors = [...new Set(templates.map(t => t.authorName).filter(Boolean))];

  // Client-side author filter (server handles tag+search)
  const displayed = activeAuthor ? templates.filter(t => t.authorName === activeAuthor) : templates;

  return (
    <PageShell className={`page-shell ${pageTransition}`}>
      <main className="tp-page">
        <header className="tp-topbar">
          <button className="lp-back-btn" type="button" onClick={navigateToClasses}>
            <ArrowLeft size={16} className="sketch-sm" /> My Classes
          </button>
          <div className="tp-topbar-center">
            <span className="tp-topbar-eyebrow">Teacher Hub</span>
            <span className="tp-topbar-title">Browse Templates</span>
          </div>
          <div className="tp-topbar-right">
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

        <div className="tp-content hub-tp-content">
          {/* Search + filter bar — always visible */}
          <div className="hub-filter-bar2">
            <input
              className="hub-search-input"
              placeholder="🔍  Search templates…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
            />
            {!loading && (allAuthors.length > 1 || allTags.length > 0) && (
              <div className="hub-filter-chips">
                {allAuthors.length > 1 && (
                  <div className="hub-filter-group2">
                    <span className="hub-filter-label2">Author</span>
                    <select className="hub-author-select" value={activeAuthor} onChange={e => setActiveAuthor(e.target.value)}>
                      <option value="">All</option>
                      {allAuthors.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                )}
                {allTags.length > 0 && (
                  <div className="hub-filter-group2">
                    <span className="hub-filter-label2">Tag</span>
                    <button type="button" className={`hub-tag-chip${!activeTag ? " active" : ""}`} onClick={() => setActiveTag("")}>All</button>
                    {allTags.map(tag => (
                      <button key={tag} type="button" className={`hub-tag-chip${activeTag === tag ? " active" : ""}`}
                        onClick={() => setActiveTag(prev => prev === tag ? "" : tag)}>{tag}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {(activeTag || activeAuthor) && (
              <button type="button" className="ghost-button" style={{ fontSize: "0.75rem", padding: "3px 10px" }}
                onClick={() => { setActiveTag(""); setActiveAuthor(""); }}>Clear</button>
            )}
          </div>

          {/* Results count */}
          {!loading && templates.length > 0 && (
            <p className="hub-results-count2">
              {displayed.length} template{displayed.length !== 1 ? "s" : ""}
              {activeAuthor ? ` by ${activeAuthor}` : ""}
              {activeTag ? ` · "${activeTag}"` : ""}
            </p>
          )}

          {/* Cards */}
          {loading ? (
            <div className="hub-card-grid">
              {[1,2,3,4].map(i => <div key={i} className="hub-tpl-card hub-tpl-skeleton" />)}
            </div>
          ) : displayed.length === 0 ? (
            <div className="hub-empty-state">
              <span className="hub-empty-icon">📚</span>
              <p className="hub-empty-title">No templates found</p>
              <p className="hub-empty-body">{isTeacher ? "Be the first to publish one from your class!" : "Check back soon."}</p>
            </div>
          ) : (
            <div className="hub-card-grid">
              {displayed.map((t, idx) => {
                const CARD_ACCENTS = ["#7C3AED","#0D9488","#2563EB","#CA8A04","#DB2777","#059669"];
                const accent = CARD_ACCENTS[idx % CARD_ACCENTS.length];
                return (
                  <div key={t.id} className="hub-tpl-card" style={{ "--hub-accent": accent }}>
                    <div className="hub-tpl-card-stripe" />
                    <div className="hub-tpl-card-body">
                      <div className="hub-tpl-card-top">
                        <h3 className="hub-tpl-title">{t.title}</h3>
                        {t.tags?.length > 0 && (
                          <div className="hub-tpl-tags">
                            {t.tags.slice(0, 3).map(tag => <span key={tag} className="hub-tag">{tag}</span>)}
                          </div>
                        )}
                      </div>
                      {t.description && <p className="hub-tpl-desc">{t.description}</p>}
                      <div className="hub-tpl-meta">
                        <span>by <strong>{t.authorName}</strong></span>
                        <span className="hub-meta-dot">·</span>
                        <span>{t.topicCount} topic{t.topicCount !== 1 ? "s" : ""}</span>
                        <span className="hub-meta-dot">·</span>
                        <span>{t.itemCount} item{t.itemCount !== 1 ? "s" : ""}</span>
                        <span className="hub-meta-dot">·</span>
                        <span>{t.importCount} import{t.importCount !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="hub-tpl-footer">
                        {wasEdited(t) ? (
                          <span className="hub-meta-edited" title={`Originally published ${fmtDate(t.createdAt)}`}>Edited {fmtDate(t.updatedAt)}</span>
                        ) : (
                          <span className="hub-tpl-date">Published {fmtDate(t.createdAt)}</span>
                        )}
                        <div className="hub-tpl-actions">
                          <button className="hub-tpl-btn hub-tpl-btn--ghost" type="button" onClick={() => navigateToHubPreview(t.id)}>Preview</button>
                          {isTeacher && (
                            <button className="hub-tpl-btn hub-tpl-btn--primary" type="button" style={{ background: accent }} onClick={() => openImport(t)}>Import</button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {importingTemplate && (
        <HubImportModal template={importingTemplate} onClose={() => setImportingTemplate(null)} />
      )}

      {chatBot}
    </PageShell>
  );
}
