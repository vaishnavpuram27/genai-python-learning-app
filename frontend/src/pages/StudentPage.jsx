import { ArrowLeft, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from '../contexts/RouterContext';
import { useClassContext } from '../contexts/ClassContext';
import PageShell from '../components/PageShell';
import SkeletonRows from '../components/SkeletonRows';

export default function StudentPage({ practiceError, handleLogout, chatBot }) {
  const {
    selectedStudentName,
    studentProgressLoading, studentProgressError, studentProgress, studentQuizAttempts,
    selectedProgress, setSelectedProgress,
    selectedQuizAttempt, setSelectedQuizAttempt,
    quizGradeFeedback, setQuizGradeFeedback,
    quizGrading,
    quizGradeScore, setQuizGradeScore,
    gradeSelectedQuizAttempt,
    activeClass,
  } = useClassContext();
  const { user, isTeacher, userMenuOpen, setUserMenuOpen } = useAuth();
  const { route, pageTransition, activeClassId, navigateToClass, navigateToClasses, navigateToStudent } = useRouter();

  return (
    <PageShell className={`page-shell ${pageTransition}`}>
      <main className="tp-page">
        <header className="tp-topbar">
          <button className="lp-back-btn" type="button" onClick={() => navigateToClass(activeClassId)}>
            <ArrowLeft size={16} className="sketch-sm" /> Back to Class
          </button>
          <div className="tp-topbar-center">
            <span className="tp-topbar-eyebrow">Teacher Workspace</span>
            <span className="tp-topbar-title">{selectedStudentName || "Student"}</span>
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

        <div className="tp-content" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <section className="class-detail-panel panel-animate">
          {practiceError && <p className="auth-error">{practiceError}</p>}
          {studentProgressLoading && <SkeletonRows count={4} />}
          {studentProgressError && (
            <p className="auth-error">{studentProgressError}</p>
          )}
          {!studentProgressLoading &&
            !studentProgressError &&
            (studentProgress.length ? (
              <div className="progress-list">
                {studentProgress.map((item) => (
                  <div key={item.lessonId} className="progress-row panel-animate">
                    <div>
                      <p className="progress-title">{item.heading}</p>
                      <p className="progress-meta">{item.unit}</p>
                    </div>
                    <div className={`progress-status status-${item.status}`}>
                      {item.status.replace("_", " ")}
                    </div>
                    {item.status === "completed" && item.lastCode && (
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => setSelectedProgress(item)}
                      >
                        View code
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state">No progress yet.</p>
            ))}
        </section>

        <section className="class-detail-panel panel-animate">
          <div className="panel-header">
            <h2>Quiz attempts</h2>
          </div>
          {!studentProgressLoading && !studentProgressError && (
            studentQuizAttempts.length ? (
              <div className="progress-list">
                {studentQuizAttempts.map((item) => (
                  <div key={item.id} className="progress-row panel-animate">
                    <div>
                      <p className="progress-title">{item.itemTitle}</p>
                      <p className="progress-meta">
                        {item.topicTitle || "Topic"} · {item.itemType === "practice" ? "Code submission" : item.quizSubtype === "mcq" ? "MCQ" : "Short answer"}
                      </p>
                    </div>
                    <div className={`progress-status status-${item.gradingStatus}`}>
                      {item.gradingStatus.replace("_", " ")}
                    </div>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => {
                        setSelectedQuizAttempt(item);
                        setQuizGradeFeedback(item.feedback || "");
                      }}
                    >
                      View response
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state">No quiz attempts yet.</p>
            )
          )}
        </section>

        {selectedProgress && (
          <section className="class-detail-panel code-panel panel-animate">
            <div className="panel-header">
              <h2>{selectedProgress.heading}</h2>
              <button
                className="ghost-button"
                type="button"
                onClick={() => setSelectedProgress(null)}
              >
                Close
              </button>
            </div>
            <pre className="code-block">
              <code>{selectedProgress.lastCode}</code>
            </pre>
          </section>
        )}

        {selectedQuizAttempt && (
          <section className="class-detail-panel code-panel panel-animate">
            <div className="panel-header">
              <h2>{selectedQuizAttempt.itemTitle}</h2>
              <button
                className="ghost-button"
                type="button"
                onClick={() => setSelectedQuizAttempt(null)}
              >
                Close
              </button>
            </div>
            {selectedQuizAttempt.itemType !== "practice" && selectedQuizAttempt.quizQuestion && (
              <p className="progress-meta">{selectedQuizAttempt.quizQuestion}</p>
            )}
            <pre className="code-block">
              <code>{selectedQuizAttempt.responseText || "No response recorded."}</code>
            </pre>
            <div className="quiz-grade-panel">
              {/* Status + scores row */}
              <div className="quiz-grade-header">
                <span className={`status-badge status-${selectedQuizAttempt.gradingStatus}`}>
                  {selectedQuizAttempt.gradingStatus.replace(/_/g, " ")}
                </span>
                <div className="quiz-score-row">
                  {typeof selectedQuizAttempt.aiScore === "number" && (
                    <span className="quiz-score-badge quiz-score-ai" title="AI-assigned score">
                      AI: {selectedQuizAttempt.aiScore} pt{selectedQuizAttempt.aiScore !== 1 ? "s" : ""}
                    </span>
                  )}
                  {typeof selectedQuizAttempt.teacherScore === "number" && (
                    <span className="quiz-score-badge quiz-score-teacher" title="Teacher override score">
                      Teacher: {selectedQuizAttempt.teacherScore} pt{selectedQuizAttempt.teacherScore !== 1 ? "s" : ""}
                    </span>
                  )}
                  {typeof selectedQuizAttempt.score === "number" && typeof selectedQuizAttempt.aiScore !== "number" && typeof selectedQuizAttempt.teacherScore !== "number" && (
                    <span className="quiz-score-badge">{selectedQuizAttempt.score} pt{selectedQuizAttempt.score !== 1 ? "s" : ""}</span>
                  )}
                </div>
              </div>

              {/* AI reasoning */}
              {selectedQuizAttempt.reasoning && (
                <div className="quiz-reasoning-box">
                  <p className="quiz-reasoning-label">AI Reasoning</p>
                  <p>{selectedQuizAttempt.reasoning}</p>
                </div>
              )}

              {/* AI feedback shown to student */}
              {selectedQuizAttempt.feedback && !selectedQuizAttempt.teacherFeedback && (
                <div className="quiz-reasoning-box">
                  <p className="quiz-reasoning-label">AI Feedback (shown to student)</p>
                  <p>{selectedQuizAttempt.feedback}</p>
                </div>
              )}

              {/* Teacher override section */}
              <div className="quiz-override-section">
                <p className="quiz-override-label">
                  {selectedQuizAttempt.gradingStatus === "manual_graded" ? "Override (already applied)" : "Override Score"}
                </p>

                <div className="quiz-override-score-row">
                  <label className="ai-tutor-label" style={{ marginBottom: 0, whiteSpace: "nowrap" }}>Score</label>
                  <input
                    className="class-input"
                    type="number"
                    min="0"
                    style={{ width: "90px" }}
                    value={quizGradeScore}
                    onChange={(event) => setQuizGradeScore(event.target.value)}
                    placeholder="pts"
                    disabled={quizGrading}
                  />
                </div>

                <label className="ai-tutor-label" style={{ display: "block", marginTop: "0.75rem", marginBottom: "0.3rem" }}>
                  Feedback for student
                </label>
                <textarea
                  className="ai-tutor-textarea"
                  rows={3}
                  value={quizGradeFeedback}
                  onChange={(event) => setQuizGradeFeedback(event.target.value)}
                  placeholder="Optional note shown to the student…"
                  disabled={quizGrading}
                />

                <div className="quiz-override-actions">
                  <button
                    className="accent-button"
                    type="button"
                    onClick={() => gradeSelectedQuizAttempt(true)}
                    disabled={quizGrading}
                  >
                    {quizGrading ? "Saving…" : "✓ Save as Correct"}
                  </button>
                  <button
                    className="ghost-button danger"
                    type="button"
                    onClick={() => gradeSelectedQuizAttempt(false)}
                    disabled={quizGrading}
                  >
                    ✗ Mark Incorrect
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
        </div>
      </main>
      {chatBot}
    </PageShell>
  );
}
