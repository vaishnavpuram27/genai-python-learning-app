import { Trophy, ArrowLeft, ArrowRight, LogOut, Hash, ChevronDown, Plus } from 'lucide-react';
import OpenMoji from '../components/OpenMoji';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from '../contexts/RouterContext';
import { useClassContext } from '../contexts/ClassContext';
import PageShell from '../components/PageShell';
import EmptyState from '../components/EmptyState';

const CLASS_COLORS = [
  { bg: "#EDE9FE", border: "#7C3AED", text: "#5B21B6", emoji: "1F680" }, // rocket
  { bg: "#CCFBF1", border: "#0D9488", text: "#0F766E", emoji: "26A1"  }, // lightning
  { bg: "#FEF9C3", border: "#CA8A04", text: "#92400E", emoji: "1F31F" }, // star
  { bg: "#DBEAFE", border: "#2563EB", text: "#1D4ED8", emoji: "1F3AE" }, // controller
  { bg: "#FCE7F3", border: "#DB2777", text: "#9D174D", emoji: "1F3AF" }, // target
  { bg: "#D1FAE5", border: "#059669", text: "#047857", emoji: "1F40D" }, // snake
];

export default function ClassesPage({ handleLogout, chatBot }) {
  const {
    classes, className, setClassName,
    joinCode, setJoinCode,
    classError, classNotice,
    allClassProgress,
    handleCreateClass, handleJoinClass, handleSelectClass,
  } = useClassContext();
  const { user, isTeacher, userMenuOpen, setUserMenuOpen } = useAuth();
  const { pageTransition, navigateToClass, navigateToHub } = useRouter();

  // ── Teacher layout ──
  if (isTeacher) {
    return (
      <PageShell className={`page-shell ${pageTransition}`}>
        <main className="student-classes-page">

          {/* Header — same structure as student side */}
          <header className="student-classes-header">
            <div className="student-classes-greeting">
              <span className="student-greeting-wave">👋</span>
              <div>
                <h1>Hey, {user.name.split(" ")[0]}!</h1>
                <p className="student-greeting-sub">Teacher Workspace · My Classes</p>
              </div>
            </div>
            <div className="student-header-actions" style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              {navigateToHub && (
                <button className="tp-action-btn" type="button" onClick={navigateToHub}>Browse Hub</button>
              )}
              <button className="student-user-btn" type="button" onClick={() => setUserMenuOpen(o => !o)}>
                <span className="student-user-avatar">{user.name[0].toUpperCase()}</span>
                <span>{user.name}</span>
                <ChevronDown size={16} />
              </button>
              {userMenuOpen && (
                <div className="user-menu-dropdown" role="menu" onClick={() => setUserMenuOpen(false)}>
                  <span className="user-menu-role">{user.role}</span>
                  <button className="user-menu-item user-menu-item--danger" type="button" role="menuitem" onClick={handleLogout}>Log out</button>
                </div>
              )}
            </div>
          </header>

          {/* Create class bar */}
          <div className="tp-create-bar">
            <input className="tp-create-input" type="text" value={className}
              onChange={e => setClassName(e.target.value)} placeholder="New class name…"
              onKeyDown={e => e.key === "Enter" && handleCreateClass()} />
            <button className="tp-action-btn tp-action-btn--primary" type="button" onClick={handleCreateClass}>
              + Create class
            </button>
          </div>
          {classError && <p className="auth-error">{classError}</p>}
          {classNotice && <p className="auth-notice">{classNotice}</p>}

          {/* Class cards */}
          <div className="tp-class-grid">
            {classes.map((item, idx) => {
              const color = CLASS_COLORS[idx % CLASS_COLORS.length];
              return (
                <div key={item.id} className="tp-class-card"
                  style={{ "--card-bg": color.bg, "--card-border": color.border, "--card-text": color.text }}
                  onClick={() => handleSelectClass(item.id)}>
                  <div className="tp-class-card-stripe" />
                  <div className="tp-class-card-icon">
                    <OpenMoji hex={color.emoji} size={36} />
                  </div>
                  <div className="tp-class-card-info">
                    <span className="tp-class-card-name">{item.name}</span>
                    <span className="tp-class-card-code">Code: {item.joinCode}</span>
                  </div>
                  <ArrowRight size={18} className="tp-class-card-arrow sketch-sm" />
                </div>
              );
            })}
            {!classes.length && <EmptyState icon="🏫" title="No classes yet" body="Create your first class to start building lessons." />}
          </div>

        </main>
        {chatBot}
      </PageShell>
    );
  }

  // ── Student redesign ──
  const totAttempted = Object.values(allClassProgress).reduce((s, p) => s + (p?.attemptedItems || 0), 0);
  const totGraded    = Object.values(allClassProgress).reduce((s, p) => s + (p?.gradedItems    || 0), 0);
  const overallPct   = totGraded > 0 ? Math.round((totAttempted / totGraded) * 100) : 0;

  return (
    <PageShell className={`page-shell ${pageTransition}`}>
      <main className="student-classes-page">

        {/* ── Header ── */}
        <header className="student-classes-header">
          <div className="student-classes-greeting">
            <span className="student-greeting-wave">👋</span>
            <div>
              <h1>Hey, {user.name.split(" ")[0]}!</h1>
              <p className="student-greeting-sub">Ready to keep learning today?</p>
            </div>
          </div>
          <div className="student-header-actions">
            <button className="student-user-btn" type="button" onClick={() => setUserMenuOpen(o => !o)}>
              <span className="student-user-avatar">{user.name[0].toUpperCase()}</span>
              <span>{user.name}</span>
              <ChevronDown size={16} />
            </button>
            {userMenuOpen && (
              <div className="user-menu-dropdown" role="menu" onClick={() => setUserMenuOpen(false)}>
                <span className="user-menu-role">{user.role}</span>
                <button className="user-menu-item user-menu-item--danger" type="button" role="menuitem" onClick={handleLogout}>
                  <LogOut size={14} /> Log out
                </button>
              </div>
            )}
          </div>
        </header>

        {/* ── Overall progress banner ── */}
        {totGraded > 0 && (
          <div className="student-overall-banner">
            <OpenMoji hex="1F3C6" size={36} />
            <div className="student-banner-text">
              <strong>Overall Progress</strong>
              <span>{totAttempted}/{totGraded} items across {classes.length} class{classes.length !== 1 ? "es" : ""}</span>
            </div>
            <div className="student-banner-bar">
              <div className="student-banner-fill" style={{ width: `${overallPct}%` }} />
            </div>
            <span className="student-banner-pct">{overallPct}%</span>
          </div>
        )}

        {/* ── Join class bar ── */}
        <div className="student-join-bar">
          <div className="student-join-input-wrap">
            <Hash size={16} className="student-join-icon sketch-sm" />
            <input
              className="student-join-input"
              type="text"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value)}
              placeholder="Enter join code"
              onKeyDown={e => e.key === "Enter" && handleJoinClass()}
            />
          </div>
          <button className="student-join-btn" type="button" onClick={handleJoinClass}>
            <Plus size={16} /> Join class
          </button>
        </div>
        {classError && <p className="auth-error">{classError}</p>}
        {classNotice && <p className="auth-notice">{classNotice}</p>}

        {/* ── Class grid ── */}
        <div className="student-class-grid">
          {classes.map((item, idx) => {
            const color    = CLASS_COLORS[idx % CLASS_COLORS.length];
            const prog     = allClassProgress[item.id];
            const pct      = prog?.gradedItems > 0 ? Math.round((prog.attemptedItems / prog.gradedItems) * 100) : null;
            const done     = pct === 100 && prog?.gradedItems > 0;
            const nextItem = prog?.items?.find(i => !i.attempted);
            return (
              <div key={item.id} className="student-class-card"
                style={{ "--card-bg": color.bg, "--card-border": color.border, "--card-text": color.text }}>
                <button className="student-class-card-body" type="button" onClick={() => handleSelectClass(item.id)}>
                  <div className="student-class-emoji">
                    <OpenMoji hex={done ? "1F3C6" : color.emoji} size={34} />
                  </div>
                  <div className="student-class-info">
                    <h2 className="student-class-name">{item.name}</h2>
                    {pct !== null ? (
                      <>
                        <div className="student-class-bar">
                          <div className="student-class-bar-fill" style={{ width: `${pct}%`, background: color.border }} />
                        </div>
                        <span className="student-class-stat">
                          {done ? "All done! 🎉" : `${prog.attemptedItems}/${prog.gradedItems} items · ${pct}%`}
                        </span>
                      </>
                    ) : (
                      <span className="student-class-stat">Tap to start →</span>
                    )}
                  </div>
                  <ArrowRight size={20} className="student-class-arrow sketch-sm" />
                </button>
                {nextItem && (
                  <button className="student-continue-btn" type="button"
                    style={{ background: color.border }} onClick={() => navigateToClass(item.id)}>
                    Continue <ArrowRight size={14} className="sketch-sm" />
                  </button>
                )}
              </div>
            );
          })}
          {!classes.length && (
            <EmptyState icon="🎒" title="Not in a class yet" body="Ask your teacher for a join code to get started!" />
          )}
        </div>

      </main>
      {chatBot}
    </PageShell>
  );
}
