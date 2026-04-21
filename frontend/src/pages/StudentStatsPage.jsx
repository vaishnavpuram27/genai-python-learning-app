import { ArrowLeft, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from '../contexts/RouterContext';
import { useClassContext } from '../contexts/ClassContext';
import PageShell from '../components/PageShell';
import SkeletonRows from '../components/SkeletonRows';
import EmptyState from '../components/EmptyState';

export default function StudentStatsPage({ handleLogout, chatBot }) {
  const {
    studentStatsData, studentStatsLoading,
    studentAILog, studentAILogLoading,
    activeClass,
    navigateToItemResponseWithData,
  } = useClassContext();
  const { user, userMenuOpen, setUserMenuOpen } = useAuth();
  const { route, pageTransition, activeClassId, navigateToClass, navigateToAILog } = useRouter();

  const sd = studentStatsData;

  return (
    <PageShell className={`page-shell ${pageTransition}`}>
      <main className="tp-page">
        <header className="tp-topbar">
          <button className="lp-back-btn" type="button" onClick={() => navigateToClass(activeClassId)}>
            <ArrowLeft size={16} className="sketch-sm" /> Back to Class
          </button>
          <div className="tp-topbar-center">
            <span className="tp-topbar-eyebrow">Student Stats</span>
            <span className="tp-topbar-title">{sd?.student?.name || "Student"}</span>
            {activeClass && <span className="tp-topbar-code">{activeClass.name}</span>}
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

        <div className="tp-content stats-tp-content panel-animate">
          {studentStatsLoading && <SkeletonRows count={6} />}

          {!studentStatsLoading && sd && (
            <>
              {/* ── KPI summary cards ── */}
              <div className="stats-summary-grid">
                {[
                  { n: sd.summary.attempted,   label: "Attempted",    icon: "✅", bg: "#CCFBF1", color: "#0D9488" },
                  { n: sd.summary.correct,      label: "Correct",      icon: "🎯", bg: "#D1FAE5", color: "#059669" },
                  { n: sd.summary.total - sd.summary.attempted, label: "Not done", icon: "⏳", bg: "#FEF9C3", color: "#CA8A04" },
                  {
                    n: sd.summary.totalPoints > 0 ? `${sd.summary.earnedPoints}/${sd.summary.totalPoints}` : "—",
                    label: "Marks", icon: "⭐", bg: "#EDE9FE", color: "#7C3AED"
                  },
                  {
                    n: sd.summary.totalPoints > 0 ? `${Math.round((sd.summary.earnedPoints / sd.summary.totalPoints) * 100)}%` : "—",
                    label: "Score", icon: "📊", bg: "#DBEAFE", color: "#2563EB"
                  },
                ].map(({ n, label, icon, bg, color }) => (
                  <div key={label} className="stats-kpi-card" style={{ "--kpi-bg": bg, "--kpi-color": color }}>
                    <div className="stats-kpi-icon">
                      <span style={{ fontSize: "1.35rem", lineHeight: 1 }}>{icon}</span>
                    </div>
                    <span className="stats-kpi-number">{n}</span>
                    <span className="stats-kpi-label">{label}</span>
                  </div>
                ))}
              </div>

              {/* ── Item breakdown table ── */}
              <div className="stats-card-panel">
                <div className="stats-card-panel-header">
                  <h3 className="stats-card-panel-title">Item Breakdown</h3>
                  <span className="stats-card-panel-badge">{sd.summary.total} gradable items</span>
                </div>
                <div className="stats-table-wrap" style={{ marginTop: 0 }}>
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Topic</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Attempts</th>
                        <th>Marks</th>
                        <th>Feedback</th>
                        <th>Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sd.items.map((item) => (
                        <tr key={item.id}>
                          <td
                            className={`stats-student-name${item.responseText ? " stats-student-link" : ""}`}
                            onClick={item.responseText ? () => navigateToItemResponseWithData(activeClassId, route.studentId, item) : undefined}
                            title={item.responseText ? "View response" : undefined}
                          >
                            {item.title}
                          </td>
                          <td className="stats-meta">{item.topicTitle}</td>
                          <td><span className={`topic-type type-${item.type}`}>{item.type}</span></td>
                          <td>
                            <span className={`sd-status-pill sd-${item.status}`}>
                              {item.status === "attempted" || item.status === "correct" || item.status === "incorrect" ? "Attempted"
                                : item.status === "pending" ? "Pending"
                                : "Not done"}
                            </span>
                          </td>
                          <td>{item.attempts || "—"}</td>
                          <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                            {item.gradingStatus === "pending" ? (
                              <span className="stats-meta">Pending</span>
                            ) : typeof item.score === "number" ? (
                              <span className={item.score > 0 ? "marks-earned" : "marks-zero"}>
                                {item.score} / {item.maxPoints}
                              </span>
                            ) : item.maxPoints > 0 ? (
                              <span className="stats-meta">— / {item.maxPoints}</span>
                            ) : "—"}
                          </td>
                          <td className="stats-meta">{item.feedback || "—"}</td>
                          <td className="stats-meta">
                            {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString() : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {sd.summary.totalPoints > 0 && (
                      <tfoot>
                        <tr className="stats-totals-row">
                          <td colSpan={5} style={{ textAlign: "right", fontWeight: 700, color: "var(--text-muted)", fontSize: "0.8rem", textTransform: "uppercase" }}>Total</td>
                          <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{sd.summary.earnedPoints} / {sd.summary.totalPoints}</td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              {/* ── Gradebook ── */}
              {sd.items.length > 0 && (
                <div className="stats-card-panel">
                  <div className="stats-card-panel-header">
                    <h3 className="stats-card-panel-title">Gradebook</h3>
                    <span className="stats-card-panel-badge">
                      <span className="gb-legend-cell gb-correct" style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", marginRight: 4 }} />Attempted &nbsp;
                      <span className="gb-legend-cell gb-pending" style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", marginRight: 4 }} />Pending
                    </span>
                  </div>
                  <div className="stats-table-wrap" style={{ marginTop: 0 }}>
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

              {/* ── AI Chat Log ── */}
              <div className="stats-card-panel">
                <div className="stats-card-panel-header">
                  <h3 className="stats-card-panel-title">AI Chat Log</h3>
                </div>
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
              </div>
            </>
          )}
        </div>
      </main>
      {chatBot}
    </PageShell>
  );
}
