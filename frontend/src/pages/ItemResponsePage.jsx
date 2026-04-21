import { ArrowLeft, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from '../contexts/RouterContext';
import { useClassContext } from '../contexts/ClassContext';
import PageShell from '../components/PageShell';

export default function ItemResponsePage({ handleLogout, chatBot }) {
  const { itemResponseData, studentStatsData } = useClassContext();
  const { user, userMenuOpen, setUserMenuOpen } = useAuth();
  const { route, pageTransition, activeClassId, navigateToStudentStats } = useRouter();

  const item = itemResponseData;
  const isCode = item?.type === "practice";
  const studentName = studentStatsData?.student?.name || "Student";

  return (
    <PageShell className={`page-shell ${pageTransition}`}>
      <main className="tp-page">
        <header className="tp-topbar">
          <button className="lp-back-btn" type="button" onClick={() => navigateToStudentStats(activeClassId, route.studentId)}>
            <ArrowLeft size={16} className="sketch-sm" /> Back to {studentName}
          </button>
          <div className="tp-topbar-center">
            <span className="tp-topbar-eyebrow">{item ? `${item.type}${item.quizSubtype ? ` · ${item.quizSubtype}` : ""}` : "Response"}</span>
            <span className="tp-topbar-title">{item?.title || "Student Response"}</span>
            {item?.topicTitle && <span className="tp-topbar-code">Topic: {item.topicTitle}</span>}
          </div>
          <div className="tp-topbar-right">
            <button className="student-user-btn" type="button" onClick={() => setUserMenuOpen(o => !o)}>
              <span className="student-user-avatar">{user.name[0].toUpperCase()}</span>
              <ChevronDown size={14} />
            </button>
            {userMenuOpen && (
              <div className="user-menu-dropdown" role="menu" onClick={() => setUserMenuOpen(false)}>
                <span className="user-menu-role">{user.role}</span>
                <button className="user-menu-item user-menu-item--danger" type="button" role="menuitem" onClick={handleLogout}>Log out</button>
              </div>
            )}
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
      {chatBot}
    </PageShell>
  );
}
