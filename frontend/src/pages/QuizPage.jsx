import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { ArrowLeft, ArrowRight, ChevronDown, LogOut } from 'lucide-react';
import OpenMoji from '../components/OpenMoji';
import Celebration from '../components/Celebration';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from '../contexts/RouterContext';
import { useClassContext } from '../contexts/ClassContext';
import PageShell from '../components/PageShell';
import SkeletonCards from '../components/SkeletonCards';
import { MD_COMPONENTS } from '../components/NotebookEditor';
import { API_BASE, authHeaders } from '../utils/api';

export default function QuizPage({
  quizMeta, setQuizMeta, quizError, quizLoading,
  quizResponse, setQuizResponse,
  quizAttempt, setQuizAttempt, quizJustSubmitted, setQuizJustSubmitted,
  quizSubmitting, submitQuiz,
  handleLogout,
  setToast,
  chatBot,
  onStuck,
}) {
  const { user, isTeacher, userMenuOpen, setUserMenuOpen } = useAuth();
  const { route, pageTransition, activeClassId, navigateToClass, navigateToClasses, navigateToItem } = useRouter();
  const { activeClass, itemNavList } = useClassContext();
  const navIndex = route.itemId ? itemNavList.findIndex((i) => i.id === route.itemId) : -1;
  const navPrev = navIndex > 0 ? itemNavList[navIndex - 1] : null;
  const navNext = navIndex >= 0 && navIndex < itemNavList.length - 1 ? itemNavList[navIndex + 1] : null;
  const isMcq = quizMeta?.quizSubtype === "mcq";
  const hints = Array.isArray(quizMeta?.hints) ? quizMeta.hints : [];

  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);

  // Teacher: inline deadline + maxPoints editing
  const toLocalDatetimeString = (d) => {
    if (!d) return "";
    const dt = new Date(d);
    const pad = (n) => String(n).padStart(2, "0");
    return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  };
  const [settingsMaxPoints, setSettingsMaxPoints] = useState(() => quizMeta?.maxPoints ?? 0);
  const [settingsDeadline, setSettingsDeadline] = useState(() => toLocalDatetimeString(quizMeta?.deadline));
  const [settingsSaving, setSettingsSaving] = useState(false);

  useEffect(() => {
    setSettingsMaxPoints(quizMeta?.maxPoints ?? 0);
    setSettingsDeadline(toLocalDatetimeString(quizMeta?.deadline));
  }, [quizMeta?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveQuizSettings() {
    if (!quizMeta || !activeClassId) return;
    setSettingsSaving(true);
    try {
      const res = await fetch(
        `${API_BASE}/classes/${activeClassId}/topics/${quizMeta.topic?.id}/items/${quizMeta.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            title: quizMeta.title,
            type: quizMeta.type,
            maxPoints: Number(settingsMaxPoints) || 0,
            deadline: settingsDeadline ? new Date(settingsDeadline).toISOString() : null,
          }),
        }
      );
      if (res.ok) {
        setQuizMeta?.(prev => ({ ...prev, maxPoints: Number(settingsMaxPoints) || 0, deadline: settingsDeadline ? new Date(settingsDeadline).toISOString() : null }));
        setToast?.({ type: "success", message: "Quiz settings saved!" });
      } else {
        setToast?.({ type: "error", message: "Failed to save settings." });
      }
    } catch {
      setToast?.({ type: "error", message: "Server not reachable." });
    } finally {
      setSettingsSaving(false);
    }
  }

  useEffect(() => {
    if (!quizAttempt || !quizJustSubmitted) return;
    if (quizAttempt.isCorrect === true) {
      setShowCelebration(true);
      setQuizJustSubmitted(false);
    }
  }, [quizAttempt, quizJustSubmitted]);

  async function handleSubmit() {
    await submitQuiz();
  }

  // ── Teacher layout ──
  if (isTeacher) {
    return (
      <PageShell className={`page-shell ${pageTransition}`}>
        <main className="tp-page">
          <header className="tp-topbar">
            <button className="lp-back-btn" type="button" onClick={() => navigateToClass(activeClassId)}>
              <ArrowLeft size={16} className="sketch-sm" /> Back to Class
            </button>
            <div className="tp-topbar-center">
              <span className="tp-topbar-eyebrow">Teacher Workspace</span>
              <span className="tp-topbar-title">{quizMeta?.title || "Quiz"}</span>
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
          <section className="class-detail-panel tp-content panel-animate">
            {quizLoading && <SkeletonCards count={3} />}
            {quizError && <p className="auth-error">{quizError}</p>}
            {!quizLoading && !quizError && quizMeta && (
              <div className="quiz-layout">
                <p className="progress-meta">{quizMeta.topic?.title || "Topic"} · {isMcq ? "MCQ" : "Short answer"}</p>
                <div className="quiz-question-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={MD_COMPONENTS}>{quizMeta.quizQuestion || "No question set yet."}</ReactMarkdown>
                </div>
                {isMcq ? (
                  <div className="quiz-options">
                    {(quizMeta.quizOptions || []).map(option => {
                      const backtickWrapped = /^`([^`]+)`$/.test(option.trim());
                      const fenceWrapped = /^```[\w]*\n?([\s\S]*?)```$/.test(option.trim());
                      const displayText = backtickWrapped
                        ? option.trim().slice(1, -1)
                        : fenceWrapped
                        ? option.trim().replace(/^```[\w]*\n?/, "").replace(/```$/, "")
                        : option;
                      const isCode = fenceWrapped || backtickWrapped || displayText.includes("\n") || /^(for|if|elif|else|while|def|class|import|from|try|with|return|print)\b/.test(displayText.trim()) || /^\w+\s*[=(]/.test(displayText.trim());
                      return (
                        <label key={option} className={`quiz-option${isCode ? " quiz-option-code" : ""}`}>
                          <input type="radio" name="quiz-option" value={option} checked={quizResponse === option}
                            onChange={e => setQuizResponse(e.target.value)} disabled={quizSubmitting || user.role !== "student"} />
                          {isCode ? <pre className="quiz-option-pre"><code>{displayText}</code></pre> : <span>{displayText}</span>}
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <textarea className="lesson-textarea" value={quizResponse} onChange={e => setQuizResponse(e.target.value)}
                    placeholder="Write your answer..." rows={6} disabled={quizSubmitting || user.role !== "student"} />
                )}
              </div>
            )}
            {!quizLoading && !quizError && quizMeta && (
              <div className="quiz-settings-panel">
                <h4 className="quiz-settings-title">Quiz Settings</h4>
                <div className="quiz-settings-row">
                  <label className="quiz-settings-label">
                    Max Points
                    <input
                      className="class-input quiz-settings-input"
                      type="number" min="0"
                      value={settingsMaxPoints}
                      onChange={e => setSettingsMaxPoints(e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value, 10) || 0))}
                    />
                  </label>
                  <label className="quiz-settings-label">
                    Deadline
                    <input
                      className="class-input quiz-settings-input"
                      type="datetime-local"
                      value={settingsDeadline}
                      onChange={e => setSettingsDeadline(e.target.value)}
                    />
                  </label>
                  <button className="primary-button quiz-settings-save" type="button" onClick={saveQuizSettings} disabled={settingsSaving}>
                    {settingsSaving ? "Saving…" : "Save Settings"}
                  </button>
                  {settingsDeadline && (
                    <button className="ghost-button" type="button" onClick={() => setSettingsDeadline("")} title="Clear deadline">✕ Clear deadline</button>
                  )}
                </div>
                {quizMeta.maxPoints > 0 && (
                  <p className="quiz-settings-hint">Currently worth <strong>{quizMeta.maxPoints} pts</strong>{quizMeta.deadline ? ` · due ${new Date(quizMeta.deadline).toLocaleString()}` : ""}</p>
                )}
              </div>
            )}
          </section>
        </main>
        {chatBot}
      </PageShell>
    );
  }

  // ── Student redesign ──
  const isSubmitted = !!quizAttempt;
  const isCorrect = quizAttempt?.isCorrect;

  return (
    <PageShell className={`page-shell ${pageTransition}`}>
      <main className="qp-page">

        {/* Celebration overlay */}
        {showCelebration && <Celebration type="correct" onClose={() => setShowCelebration(false)} />}

        {/* Topbar */}
        <header className="lp-topbar">
          <button className="lp-back-btn" type="button" onClick={() => navigateToClass(activeClassId)}>
            <ArrowLeft size={16} className="sketch-sm" /> Back
          </button>
          <div className="lp-topbar-center">
            <OpenMoji hex="1F4DD" size={24} />
            <span className="lp-topbar-title">{quizMeta?.title || "Quiz"}</span>
            {activeClass && <span className="lp-topbar-class">{activeClass.name}</span>}
          </div>
          <div className="lp-topbar-right">
            <button className="student-user-btn" type="button" onClick={() => setUserMenuOpen(o => !o)}>
              <span className="student-user-avatar">{user.name[0].toUpperCase()}</span>
              <ChevronDown size={14} />
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

        {/* Progress dots */}
        {navIndex >= 0 && (
          <div className="lp-nav-strip">
            <button className="lp-nav-btn" type="button" disabled={!navPrev} onClick={() => navigateToItem(activeClassId, navPrev)}>
              <ArrowLeft size={15} className="sketch-sm" /> Prev
            </button>
            <div className="lp-nav-progress">
              <div className="lp-nav-dots">
                {itemNavList.map((_, i) => (
                  <div key={i} className={`lp-nav-dot${i === navIndex ? " active" : i < navIndex ? " done" : ""}`} />
                ))}
              </div>
              <span className="lp-nav-pos">{navIndex + 1} of {itemNavList.length}</span>
            </div>
            <button className="lp-nav-btn" type="button" disabled={!navNext} onClick={() => navigateToItem(activeClassId, navNext)}>
              Next <ArrowRight size={15} className="sketch-sm" />
            </button>
          </div>
        )}

        {quizLoading && <SkeletonCards count={3} />}
        {quizError && <p className="auth-error" style={{ margin: "1rem 1.5rem" }}>{quizError}</p>}

        {!quizLoading && !quizError && quizMeta && (
          <div className="qp-content-wrap">

            {/* Topic chip */}
            {quizMeta.topic?.title && (
              <div className="lv-topic-chip">📂 {quizMeta.topic.title} · {isMcq ? "Multiple Choice" : "Short Answer"}</div>
            )}

            {/* Question card */}
            <div className="qp-question-card">
              <div className="qp-question-icon">
                <OpenMoji hex="1F4DD" size={32} />
              </div>
              <div className="qp-question-text">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={MD_COMPONENTS}>
                  {quizMeta.quizQuestion || "No question set yet."}
                </ReactMarkdown>
              </div>
              {quizMeta.codeSnippet && (
                <pre className="qp-code-snippet"><code>{quizMeta.codeSnippet}</code></pre>
              )}
            </div>

            {/* MCQ options — always visible (read-only after submit) */}
            {isMcq && (
              <div className="qp-options">
                {(quizMeta.quizOptions || []).map((option, idx) => {
                  const letters = ["A", "B", "C", "D", "E"];
                  const backtickWrapped = /^`([^`]+)`$/.test(option.trim());
                  const fenceWrapped = /^```[\w]*\n?([\s\S]*?)```$/.test(option.trim());
                  const displayText = backtickWrapped
                    ? option.trim().slice(1, -1)
                    : fenceWrapped
                    ? option.trim().replace(/^```[\w]*\n?/, "").replace(/```$/, "")
                    : option;
                  const isCode = fenceWrapped || backtickWrapped || displayText.includes("\n") || /^(for|if|elif|else|while|def|class|import|from|try|with|return|print)\b/.test(displayText.trim());
                  const isSelected = quizResponse === option;
                  let stateClass = isSelected ? " selected" : "";
                  if (isSubmitted && isSelected) stateClass = isCorrect ? " qp-option-correct" : " qp-option-wrong";
                  return (
                    <label key={option} className={`qp-option${stateClass}${isCode ? " qp-option-code" : ""}${isSubmitted ? " qp-option-readonly" : ""}`}>
                      <input type="radio" name="quiz-option" value={option} checked={isSelected}
                        onChange={e => !isSubmitted && setQuizResponse(e.target.value)} disabled={quizSubmitting || isSubmitted} />
                      <span className="qp-option-letter">{letters[idx] || idx + 1}</span>
                      {isCode
                        ? <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={{ pre: ({ node, ...p }) => <pre className="qp-option-pre" {...p} />, code: ({ node, ...p }) => <code {...p} /> }}>{`\`\`\`python\n${displayText}\n\`\`\``}</ReactMarkdown>
                        : <span className="qp-option-text">{displayText}</span>
                      }
                    </label>
                  );
                })}
              </div>
            )}

            {/* Short answer — textarea before submit, submitted view after */}
            {!isMcq && !isSubmitted && (
              <textarea className="qp-textarea" value={quizResponse} onChange={e => setQuizResponse(e.target.value)}
                placeholder="Type your answer here... 📝" rows={5} disabled={quizSubmitting} />
            )}
            {!isMcq && isSubmitted && quizResponse && (
              <div className="qp-sa-submitted">
                <span className="qp-sa-label">✏️ Your answer</span>
                <p className="qp-sa-text">{quizResponse}</p>
              </div>
            )}

            {/* Hints + actions (before submit) */}
            {!isSubmitted && (
              <>
                {hints.length > 0 && (
                  <div className="qp-hints-wrap">
                    {hints.slice(0, hintsRevealed).map((h, i) => (
                      <div key={i} className="qp-hint-item">
                        <span className="qp-hint-num">💡 Hint {i + 1}</span>
                        <span>{h}</span>
                      </div>
                    ))}
                    {hintsRevealed < hints.length && (
                      <button className="qp-hint-btn" type="button" onClick={() => setHintsRevealed(n => n + 1)}>
                        {hintsRevealed === 0 ? "🔍 Need a hint?" : "➕ Another hint"}
                      </button>
                    )}
                  </div>
                )}
                <div className="qp-actions">
                  <button className="qp-submit-btn" type="button" onClick={handleSubmit}
                    disabled={quizSubmitting || !quizResponse.trim()}>
                    {quizSubmitting ? "Submitting…" : "Submit Answer 🚀"}
                  </button>
                  <button className="qp-stuck-btn" type="button"
                    onClick={() => onStuck && onStuck(`I'm stuck on this quiz question: "${quizMeta.quizQuestion}"`)}>
                    😕 I'm stuck
                  </button>
                </div>
              </>
            )}

            {/* Result card (after submit) */}
            {isSubmitted && (
              <div className={`qp-result-card${isCorrect ? " correct" : isCorrect === false ? " incorrect" : " pending"}`}>
                <div className="qp-result-icon">
                  {isCorrect === true ? "🎉" : isCorrect === false ? "💪" : "⏳"}
                </div>
                <div className="qp-result-body">
                  <p className="qp-result-title">
                    {isCorrect === true ? "Correct!" : isCorrect === false ? "Not quite — keep going!" : "Submitted!"}
                  </p>
                  {typeof quizAttempt.score === "number" && quizMeta?.item?.maxPoints > 0 && (
                    <p className="qp-result-score">{quizAttempt.score} / {quizMeta.item.maxPoints} pts</p>
                  )}
                  {quizAttempt.feedback && (
                    <p className="qp-result-feedback">{quizAttempt.feedback}</p>
                  )}
                  <p className="qp-result-attempts">Attempts: {quizAttempt.attempts || 1}</p>
                </div>
                {isCorrect === false && (
                  <div className="qp-retry-wrap">
                    <button className="qp-retry-btn" type="button" onClick={() => { setQuizResponse(""); setHintsRevealed(0); setQuizAttempt(null); }}>
                      Try Again 🔄
                    </button>
                    <button className="qp-stuck-btn" type="button"
                      onClick={() => onStuck && onStuck(`I'm stuck on this quiz question: "${quizMeta.quizQuestion}". I answered "${quizResponse}" but it was wrong.`)}>
                      😕 I'm stuck
                    </button>
                  </div>
                )}
                {navNext && (
                  <button className="qp-next-btn" type="button" onClick={() => navigateToItem(activeClassId, navNext)}>
                    Next item <ArrowRight size={15} className="sketch-sm" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </main>
      {chatBot}
    </PageShell>
  );
}
