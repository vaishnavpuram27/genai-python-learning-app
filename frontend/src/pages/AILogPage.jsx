import { ArrowLeft, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from '../contexts/RouterContext';
import { useClassContext } from '../contexts/ClassContext';
import PageShell from '../components/PageShell';
import SkeletonRows from '../components/SkeletonRows';
import EmptyState from '../components/EmptyState';

export default function AILogPage({ handleLogout, chatBot }) {
  const { studentAILog, studentAILogLoading, activeClass } = useClassContext();
  const { user, userMenuOpen, setUserMenuOpen } = useAuth();
  const { route, pageTransition, activeClassId, navigateToStudentStats } = useRouter();

  const interactions = (studentAILog || []).filter((ix) => {
    const key = ix.itemId?._id || "general";
    return key === route.itemKey;
  });

  return (
    <PageShell className={`page-shell ${pageTransition}`}>
      <main className="tp-page">
        <header className="tp-topbar">
          <button className="lp-back-btn" type="button" onClick={() => navigateToStudentStats(activeClassId, route.studentId)}>
            <ArrowLeft size={16} className="sketch-sm" /> Back to Student
          </button>
          <div className="tp-topbar-center">
            <span className="tp-topbar-eyebrow">{route.itemType ? route.itemType.charAt(0).toUpperCase() + route.itemType.slice(1) : "AI Chat Log"}</span>
            <span className="tp-topbar-title">{route.itemLabel || "Chat Log"}</span>
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
      {chatBot}
    </PageShell>
  );
}
