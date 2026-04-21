import { ArrowLeft, ArrowRight, ChevronDown, LogOut, Clock, Sparkles, Star } from 'lucide-react';
import OpenMoji from '../components/OpenMoji';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from '../contexts/RouterContext';
import { useClassContext } from '../contexts/ClassContext';
import PageShell from '../components/PageShell';
import SkeletonCards from '../components/SkeletonCards';

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const TYPE_EMOJI = { practice: "1F4BB", quiz: "1F4DD", learning: "1F4DA" };

function ScoreRing({ score, max }) {
  if (max === 0 || score === null) return null;
  const pct = Math.min(100, Math.round((score / max) * 100));
  const r = 16;
  const circ = 2 * Math.PI * r;
  const filled = (pct / 100) * circ;
  const color = pct >= 80 ? "#16A34A" : pct >= 50 ? "#F59E0B" : "#EF4444";
  const bg    = pct >= 80 ? "#DCFCE7"  : pct >= 50 ? "#FEF9C3"  : "#FEE2E2";
  return (
    <div className="db-ring-wrap" style={{ background: bg }}>
      <svg width="44" height="44" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="3.5" />
        <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="3.5"
          strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 22 22)" />
        <text x="22" y="26" textAnchor="middle" fontSize="9" fontWeight="800" fill={color}>{pct}%</text>
      </svg>
    </div>
  );
}

function urgencyColor(daysLeft) {
  if (daysLeft <= 1) return { bg: "#FEE2E2", text: "#991B1B", bar: "#EF4444", label: daysLeft <= 0 ? "Due today! 🔥" : "Tomorrow!" };
  if (daysLeft <= 3) return { bg: "#FEF9C3", text: "#92400E", bar: "#F59E0B", label: `${daysLeft} days left` };
  return { bg: "#DCFCE7", text: "#166534", bar: "#22C55E", label: `${daysLeft} days` };
}

export default function DashboardPage({ handleLogout, chatBot }) {
  const { myDashboard, myDashboardLoading, myClassProgress, activeClass } = useClassContext();
  const { user, userMenuOpen, setUserMenuOpen } = useAuth();
  const { pageTransition, activeClassId, navigateToClass, navigateToPractice, navigateToQuiz, navigateToLearningItem } = useRouter();

  const d = myDashboard;
  const p = myClassProgress;
  const totalPts   = p?.totalPossiblePoints || 0;
  const earnedPts  = p?.pointsEarned || 0;
  const pctScore   = totalPts > 0 ? Math.round((earnedPts / totalPts) * 100) : null;
  const pctComplete = p?.gradedItems > 0 ? Math.round((p.attemptedItems / p.gradedItems) * 100) : null;
  const nextItem   = p?.items?.find(i => i.attempted === false);

  return (
    <PageShell className={`page-shell ${pageTransition}`}>
      <main className="db-page">

        {/* ── Topbar ── */}
        <header className="db-topbar">
          <button className="db-back-btn" type="button" onClick={() => navigateToClass(activeClassId)}>
            <ArrowLeft size={16} className="sketch-sm" /> Back to class
          </button>
          <div className="db-topbar-center">
            <span className="db-topbar-label">My Dashboard</span>
            {activeClass && <span className="db-topbar-class">📚 {activeClass.name}</span>}
          </div>
          <div className="db-topbar-right">
            <button className="student-user-btn" type="button" onClick={() => setUserMenuOpen(o => !o)}>
              <span className="student-user-avatar">{user.name[0].toUpperCase()}</span>
              <span>{user.name}</span>
              <ChevronDown size={15} />
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

        {myDashboardLoading && <SkeletonCards count={4} />}

        {!myDashboardLoading && d && (
          <div className="db-body">

            {/* ── Hero stats ── */}
            {p && (
              <div className="db-hero-strip panel-animate">
                {/* Completed */}
                <div className="db-stat-tile" style={{ "--tile-accent": "#9333EA", "--tile-bg": "#F3E8FF" }}>
                  <OpenMoji hex="1F3AF" size={36} />
                  <div className="db-stat-info">
                    <span className="db-stat-num">{p.attemptedItems}<span className="db-stat-denom">/{p.gradedItems}</span></span>
                    <span className="db-stat-label">Completed</span>
                  </div>
                  {pctComplete !== null && (
                    <div className="db-stat-bar-wrap">
                      <div className="db-stat-bar" style={{ width: `${pctComplete}%`, background: "#9333EA" }} />
                    </div>
                  )}
                </div>

                {/* Marks */}
                <div className="db-stat-tile" style={{ "--tile-accent": "#F97316", "--tile-bg": "#FFF7ED" }}>
                  <OpenMoji hex="1F31F" size={36} />
                  <div className="db-stat-info">
                    <span className="db-stat-num">{earnedPts}<span className="db-stat-denom">/{totalPts}</span></span>
                    <span className="db-stat-label">Marks earned</span>
                  </div>
                  {pctScore !== null && (
                    <div className="db-stat-bar-wrap">
                      <div className="db-stat-bar" style={{ width: `${pctScore}%`, background: "#F97316" }} />
                    </div>
                  )}
                </div>

                {/* Score */}
                <div className="db-stat-tile" style={{ "--tile-accent": "#0D9488", "--tile-bg": "#F0FDFA" }}>
                  <OpenMoji hex="1F3C6" size={36} />
                  <div className="db-stat-info">
                    <span className="db-stat-num">{pctScore !== null ? `${pctScore}%` : "—"}</span>
                    <span className="db-stat-label">Overall score</span>
                  </div>
                </div>

                {/* Up next CTA */}
                {nextItem && (
                  <div className="db-stat-tile db-cta-tile" style={{ "--tile-accent": "#2563EB", "--tile-bg": "#EFF6FF" }}>
                    <div className="db-cta-inner">
                      <span className="db-cta-eyebrow">Up next 👇</span>
                      <span className="db-cta-title">{nextItem.title}</span>
                    </div>
                    <button className="db-cta-btn" type="button"
                      onClick={() => {
                        if (nextItem.type === "practice") navigateToPractice(activeClassId, nextItem.id);
                        else if (nextItem.type === "quiz") navigateToQuiz(activeClassId, nextItem.id);
                        else navigateToLearningItem(activeClassId, nextItem.id);
                      }}>
                      Go! <ArrowRight size={14} className="sketch-sm" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Three cards ── */}
            <div className="db-cards-grid panel-animate">

              {/* Recent Scores */}
              <div className="db-card">
                <div className="db-card-header" style={{ "--card-color": "#9333EA", "--card-bg": "#F3E8FF" }}>
                  <OpenMoji hex="1F31F" size={28} />
                  <h2 className="db-card-title">Recent Scores</h2>
                  {d.recentScores.length > 0 && <span className="db-card-badge">{d.recentScores.length}</span>}
                </div>
                {d.recentScores.length === 0 ? (
                  <div className="db-empty-state">
                    <OpenMoji hex="1F3AE" size={48} />
                    <p>No scores yet — go complete something!</p>
                  </div>
                ) : (
                  <div className="db-list">
                    {d.recentScores.map(s => (
                      <div key={s.attemptId} className="db-score-row">
                        <ScoreRing score={s.score} max={s.maxPoints} />
                        <div className="db-score-info">
                          <span className="db-score-title">{s.title}</span>
                          <div className="db-score-meta">
                            {TYPE_EMOJI[s.type] && <OpenMoji hex={TYPE_EMOJI[s.type]} size={14} />}
                            <span className={`db-result-pill ${s.isCorrect ? "correct" : "incorrect"}`}>
                              {s.isCorrect ? "✓ Correct" : "✗ Try again"}
                            </span>
                            {s.gradedAt && <span className="db-meta-date">{fmtDate(s.gradedAt)}</span>}
                          </div>
                        </div>
                        {s.maxPoints > 0 && (
                          <span className="db-pts-pill">{typeof s.score === "number" ? s.score : "—"}/{s.maxPoints}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Deadlines */}
              <div className="db-card">
                <div className="db-card-header" style={{ "--card-color": "#F97316", "--card-bg": "#FFF7ED" }}>
                  <Clock size={22} className="sketch-md" style={{ color: "#F97316" }} />
                  <h2 className="db-card-title">Deadlines</h2>
                  {d.upcomingDeadlines.filter(x => x.daysLeft <= 3).length > 0 && (
                    <span className="db-card-badge urgent">
                      {d.upcomingDeadlines.filter(x => x.daysLeft <= 3).length} soon!
                    </span>
                  )}
                </div>
                {d.upcomingDeadlines.length === 0 ? (
                  <div className="db-empty-state">
                    <OpenMoji hex="1F389" size={48} />
                    <p>You're all caught up! 🎉</p>
                  </div>
                ) : (
                  <div className="db-list">
                    {d.upcomingDeadlines.map(dl => {
                      const u = urgencyColor(dl.daysLeft);
                      return (
                        <div key={dl.id} className="db-deadline-row" style={{ "--dl-bg": u.bg, "--dl-text": u.text, "--dl-bar": u.bar }}>
                          <div className="db-dl-bar" />
                          <div className="db-dl-info">
                            <span className="db-dl-title">{dl.title}</span>
                            <span className="db-dl-date">Due {fmtDate(dl.deadline)}</span>
                          </div>
                          <span className="db-dl-badge">{u.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* New This Week */}
              <div className="db-card">
                <div className="db-card-header" style={{ "--card-color": "#0D9488", "--card-bg": "#F0FDFA" }}>
                  <Sparkles size={22} className="sketch-md" style={{ color: "#0D9488" }} />
                  <h2 className="db-card-title">New This Week</h2>
                  {d.updates.length > 0 && <span className="db-card-badge">{d.updates.length}</span>}
                </div>
                {d.updates.length === 0 ? (
                  <div className="db-empty-state">
                    <OpenMoji hex="1F916" size={48} />
                    <p>Nothing new yet — check back soon!</p>
                  </div>
                ) : (
                  <div className="db-list">
                    {d.updates.map(u => (
                      <div key={u.id} className="db-update-row">
                        {TYPE_EMOJI[u.type] && <OpenMoji hex={TYPE_EMOJI[u.type]} size={28} />}
                        <div className="db-update-info">
                          <span className="db-update-title">{u.title}</span>
                          <span className="db-update-date">Added {fmtDate(u.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </main>
      {chatBot}
    </PageShell>
  );
}
