import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, ArrowRight, ChevronDown, LogOut, Play, Send } from 'lucide-react';
import OpenMoji from '../components/OpenMoji';
import Celebration from '../components/Celebration';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from '../contexts/RouterContext';
import PageShell from '../components/PageShell';
import { NotebookEditor, MD_COMPONENTS } from '../components/NotebookEditor';
import { serializeCellsToBody } from '../utils/parsers';

export default function PracticePage({
  lesson,
  activeClass,
  navIndex, navPrev, navNext, itemNavList,
  workspaceTab, setWorkspaceTab,
  toast,
  updateActiveLesson,
  nbCells, setNbCells,
  practiceDraft,
  practiceSubmitted,
  testRunning, testResults, setTestResults,
  runTestCases,
  submitLesson,
  errorExplaining, errorExplanation,
  handleSaveJson,
  handleDeleteClass,
  handleLogout,
  chatBot,
  onStuck,
}) {
  const { user, isTeacher, isTeacherView, setViewRole, userMenuOpen, setUserMenuOpen } = useAuth();
  const { route, pageTransition, activeClassId, navigateToClass, navigateToClasses, navigateToItem } = useRouter();

  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const hints = lesson?.hints || [];
  const prevSubmittedRef = useRef(false);

  // Resizable panels
  const [lessonWidth, setLessonWidth] = useState(360);
  const [outputWidth, setOutputWidth] = useState(320);
  const workspaceRef = useRef(null);

  function startResizeLesson(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = lessonWidth;
    function onMove(ev) {
      const delta = ev.clientX - startX;
      setLessonWidth(Math.max(200, Math.min(600, startW + delta)));
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function startResizeOutput(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = outputWidth;
    function onMove(ev) {
      const delta = startX - ev.clientX;
      setOutputWidth(Math.max(180, Math.min(600, startW + delta)));
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  useEffect(() => {
    if (practiceSubmitted && !prevSubmittedRef.current) {
      prevSubmittedRef.current = true;
      setShowCelebration(true);
    }
  }, [practiceSubmitted]);

  if (!lesson) return null;

  // ── Teacher / teacher-view layout (unchanged) ──
  if (isTeacherView) {
    return (
      <PageShell className={`page-shell ${pageTransition}`}>
        <main className="workspace">
          {toast && (
            <div className={`toast toast-${toast.type}`} role="status" aria-live="polite" aria-atomic="true">{toast.message}</div>
          )}
          <header className="tp-topbar">
            <button className="lp-back-btn" type="button" onClick={() => activeClassId ? navigateToClass(activeClassId) : navigateToClasses()}>
              <ArrowLeft size={16} className="sketch-sm" /> Back to Class
            </button>
            <div className="tp-topbar-center">
              <span className="tp-topbar-eyebrow">Teacher Workspace</span>
              <span className="tp-topbar-title">{lesson.heading || "Practice"}</span>
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
                  {isTeacher && (
                    <button className="user-menu-item" type="button" role="menuitem"
                      onClick={() => setViewRole(prev => prev === "teacher" ? "student" : "teacher")}>
                      Switch to {isTeacherView ? "Student" : "Teacher"}
                    </button>
                  )}
                  <button className="user-menu-item user-menu-item--danger" type="button" role="menuitem" onClick={handleLogout}>Log out</button>
                </div>
              )}
            </div>
          </header>
          {navIndex >= 0 && (
            <nav className="item-pagination-bar item-pagination-bar--workspace">
              <button className="ghost-button" type="button" disabled={!navPrev} onClick={() => navigateToItem(activeClassId, navPrev)}>← Prev</button>
              <span className="item-pagination-pos">{navIndex + 1} / {itemNavList.length}</span>
              <button className="ghost-button" type="button" disabled={!navNext} onClick={() => navigateToItem(activeClassId, navNext)}>Next →</button>
            </nav>
          )}
          <nav className="workspace-tab-bar" aria-label="Workspace panels">
            {[{ key: "lesson", label: "Lesson" }, { key: "editor", label: "Code" }, { key: "console", label: "Output" }].map(({ key, label }) => (
              <button key={key} type="button" className={`workspace-tab-btn${workspaceTab === key ? " active" : ""}`} onClick={() => setWorkspaceTab(key)}>{label}</button>
            ))}
          </nav>
          <section className="workspace-grid">
            <aside className={`panel lesson-panel panel-animate${workspaceTab !== "lesson" ? " workspace-panel-hidden" : ""}`}>
              <div className="lesson-header">
                <input className="lesson-input lesson-eyebrow-input" value={lesson.unit} onChange={e => updateActiveLesson({ unit: e.target.value })} />
                <input className="lesson-input lesson-title-input" value={lesson.heading} onChange={e => updateActiveLesson({ heading: e.target.value })} />
              </div>
              <label className="lesson-field">Instructions<textarea value={lesson.instructions} onChange={e => updateActiveLesson({ instructions: e.target.value })} /></label>
              {route.page === "practice" ? (
                <>
                  <label className="lesson-field">Lesson Content</label>
                  <NotebookEditor cells={nbCells} onChange={next => { setNbCells(next); const { body: nb, hints: nh } = serializeCellsToBody(next); updateActiveLesson({ body: nb, hints: nh }); }} withHints />
                </>
              ) : (
                <>
                  <label className="lesson-field">Lesson text<textarea value={lesson.body} onChange={e => updateActiveLesson({ body: e.target.value })} /></label>
                  <label className="lesson-field">Hints (one per line)<textarea value={lesson.hints.join("\n")} onChange={e => updateActiveLesson(prev => ({ ...prev, hints: e.target.value.split("\n").map(h => h.trim()).filter(Boolean) }))} /></label>
                </>
              )}
              {route.page !== "practice" && (
                <label className="lesson-field">Question<textarea value={lesson.question} onChange={e => updateActiveLesson({ question: e.target.value })} /></label>
              )}
              <label className="lesson-field">Code starter<textarea value={lesson.codeStarter} onChange={e => updateActiveLesson({ codeStarter: e.target.value })} placeholder="# Start your lesson code here" /></label>
              {route.page === "practice" && (
                <>
                  <label className="lesson-field lesson-model-answer">
                    <span>Model Answer <span className="teacher-only-badge">Teacher only</span></span>
                    <textarea value={lesson.modelAnswer || ""} onChange={e => updateActiveLesson({ modelAnswer: e.target.value })} placeholder="# Write the correct solution here" className="model-answer-editor" spellCheck={false} />
                  </label>
                  <div className="test-cases-section">
                    <label className="test-cases-toggle">
                      <input type="checkbox" checked={lesson.testMode || false} onChange={e => updateActiveLesson({ testMode: e.target.checked })} />
                      <span>Enable LeetCode-style test cases</span>
                    </label>
                    {lesson.testMode && (
                      <>
                        {(lesson.testCases || []).map((tc, i) => (
                          <div key={i} className="test-case-row">
                            <input className="test-case-label-input" placeholder={`Test ${i + 1} label`} value={tc.label || ""} onChange={e => { const next = [...(lesson.testCases || [])]; next[i] = { ...tc, label: e.target.value }; updateActiveLesson({ testCases: next }); }} />
                            <div className="test-case-fields">
                              <textarea className="test-case-input" placeholder="Input (one value per line)" value={tc.input || ""} rows={2} onChange={e => { const next = [...(lesson.testCases || [])]; next[i] = { ...tc, input: e.target.value }; updateActiveLesson({ testCases: next }); }} />
                              <textarea className="test-case-expected" placeholder="Expected output" value={tc.expectedOutput || ""} rows={2} onChange={e => { const next = [...(lesson.testCases || [])]; next[i] = { ...tc, expectedOutput: e.target.value }; updateActiveLesson({ testCases: next }); }} />
                            </div>
                            <button type="button" className="test-case-remove" onClick={() => updateActiveLesson({ testCases: (lesson.testCases || []).filter((_, idx) => idx !== i) })}>✕</button>
                          </div>
                        ))}
                        <button type="button" className="ghost-button test-case-add" onClick={() => updateActiveLesson({ testCases: [...(lesson.testCases || []), { label: "", input: "", expectedOutput: "" }] })}>+ Add Test Case</button>
                      </>
                    )}
                  </div>
                </>
              )}
              <div className="lesson-save-row">
                <button className="primary-button" type="button" onClick={handleSaveJson}>Save</button>
              </div>
            </aside>
            <article className={`panel editor-panel panel-animate${workspaceTab !== "editor" ? " workspace-panel-hidden" : ""}`}>
              <div className="editor-header">
                <div className="file-pill"><span className="file-dot" /><span>script.py</span></div>
                <div className="editor-actions"><button id="theme-toggle" type="button">Switch to Light</button></div>
              </div>
              <div id="editor" className="editor-host" />
              <div className="editor-footer">
                <button className="run-pill" type="button" id="run-btn">Run</button>
                {route.page === "practice" && practiceDraft.testMode && (
                  <button className="run-pill test-pill" type="button" onClick={runTestCases} disabled={testRunning}>{testRunning ? "Running…" : "Run Tests"}</button>
                )}
                <button className="ghost-button" type="button" onClick={submitLesson}>Submit</button>
                {practiceSubmitted && <span className="submit-confirm">✓ Submitted</span>}
                <span className="footer-hint">Ctrl/Cmd + Enter</span>
              </div>
            </article>
            <aside className={`panel output-panel panel-animate${workspaceTab !== "console" ? " workspace-panel-hidden" : ""}`}>
              <div className="output-header"><h2>Console</h2><span className="output-status">Ready</span></div>
              <div className="output-shell">
                <pre id="output" className="output-body" />
                {(errorExplaining || errorExplanation) && (
                  <div className="error-explain-box">
                    <span className="error-explain-label">What does this mean?</span>
                    {errorExplaining ? <span className="error-explain-loading">Figuring it out…</span> : <span className="error-explain-text">{errorExplanation}</span>}
                  </div>
                )}
              </div>
              {testResults && (
                <div className="test-results-panel">
                  <div className="test-results-header">
                    <span>Test Results</span>
                    <div className="test-results-header-right">
                      <span className={`test-score ${testResults.every(r => r.passed) ? "test-score-pass" : "test-score-fail"}`}>{testResults.filter(r => r.passed).length} / {testResults.length} passed</span>
                      <button className="test-results-close" onClick={() => setTestResults(null)}>✕</button>
                    </div>
                  </div>
                  {testResults.map((r, i) => (
                    <div key={i} className={`test-result-row ${r.passed ? "pass" : "fail"}`}>
                      <span className="test-result-icon">{r.passed ? "✓" : "✗"}</span>
                      <span className="test-result-label">{r.label || `Test ${i + 1}`}</span>
                      {!r.passed && <div className="test-result-detail"><span>Expected: <code>{r.expected}</code></span><span>Got: <code>{r.actual}</code></span></div>}
                    </div>
                  ))}
                </div>
              )}
            </aside>
          </section>
        </main>
        {chatBot}
      </PageShell>
    );
  }

  // ── Student redesign ──
  return (
    <PageShell className={`page-shell ${pageTransition}`}>
      <main className="pp-page">
        {toast && <div className={`toast toast-${toast.type}`} role="status">{toast.message}</div>}
        {showCelebration && <Celebration type="done" onClose={() => setShowCelebration(false)} />}

        {/* Topbar */}
        <header className="lp-topbar pp-topbar">
          <button className="lp-back-btn" type="button" onClick={() => navigateToClass(activeClassId)}>
            <ArrowLeft size={16} className="sketch-sm" /> Back
          </button>
          <div className="lp-topbar-center">
            <OpenMoji hex="1F4BB" size={24} />
            <span className="lp-topbar-title">{lesson?.heading || "Practice"}</span>
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
                {isTeacher && (
                  <button className="user-menu-item" type="button" role="menuitem"
                    onClick={() => setViewRole(prev => prev === "teacher" ? "student" : "teacher")}>
                    Switch to Teacher
                  </button>
                )}
                <button className="user-menu-item user-menu-item--danger" type="button" role="menuitem" onClick={handleLogout}>
                  <LogOut size={14} /> Log out
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Progress nav */}
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

        {/* Mobile tab bar */}
        <nav className="pp-tab-bar">
          {[{ key: "lesson", label: "📖 Lesson" }, { key: "editor", label: "💻 Code" }, { key: "console", label: "📟 Output" }].map(({ key, label }) => (
            <button key={key} type="button" className={`pp-tab-btn${workspaceTab === key ? " active" : ""}`} onClick={() => setWorkspaceTab(key)}>{label}</button>
          ))}
        </nav>

        {/* Main workspace */}
        <div className="pp-workspace" ref={workspaceRef}>

          {/* ── Left: Lesson panel ── */}
          <aside className={`pp-lesson-panel${workspaceTab !== "lesson" ? " pp-panel-hidden" : ""}`}
            style={{ width: lessonWidth, flexShrink: 0 }}>

            {/* Lesson body */}
            {lesson.body && (
              <div className="pp-lesson-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{lesson.body}</ReactMarkdown>
              </div>
            )}

            {/* Task callout */}
            {lesson.instructions && (
              <div className="pp-task-card">
                <div className="pp-task-header">
                  <span className="pp-task-emoji">🚀</span>
                  <span className="pp-task-badge">Your Task</span>
                </div>
                <p className="pp-task-text">{lesson.instructions}</p>
              </div>
            )}

            {/* Progressive hints */}
            {hints.length > 0 && (
              <div className="pp-hints-wrap">
                {hints.slice(0, hintsRevealed).map((h, i) => (
                  <div key={i} className="pp-hint-item">
                    <span className="pp-hint-num">💡 Hint {i + 1}</span>
                    <span>{h}</span>
                  </div>
                ))}
                {hintsRevealed < hints.length && (
                  <button className="pp-hint-btn" type="button" onClick={() => setHintsRevealed(n => n + 1)}>
                    {hintsRevealed === 0 ? "🔍 Need a hint?" : "➕ Another hint"}
                  </button>
                )}
                {hintsRevealed >= hints.length && hints.length > 0 && (
                  <button className="pp-hint-btn" type="button" onClick={() => setHintsRevealed(0)}>Hide hints</button>
                )}
              </div>
            )}

            {/* Stuck button in lesson panel */}
            {onStuck && (
              <button className="stuck-btn pp-stuck-lesson" type="button"
                onClick={() => onStuck(`I'm stuck on this coding exercise: "${lesson?.heading || "practice"}". Can you help me figure out what to do next?`)}>
                😕 I'm stuck — help me!
              </button>
            )}
          </aside>

          {/* Lesson ↔ Editor resize handle */}
          <div className="pp-resize-handle pp-resize-h-lesson" onMouseDown={startResizeLesson} />

          {/* ── Right: Editor + Output ── */}
          <div className={`pp-editor-col${workspaceTab === "lesson" ? " pp-panel-hidden" : ""}`}>

            {/* Editor panel */}
            <article className={`pp-editor-panel${workspaceTab === "console" ? " pp-panel-hidden" : ""}`}>
              <div className="pp-editor-topbar">
                <div className="pp-file-pill">
                  <span className="pp-file-dot" />
                  <span>script.py</span>
                </div>
              </div>
              <div id="editor" className="pp-ace-host" />
              <div className="pp-editor-footer">
                <button className="pp-run-btn" type="button" id="run-btn">
                  <Play size={14} /> Run
                </button>
                {practiceDraft?.testMode && (
                  <button className="pp-test-btn" type="button" onClick={runTestCases} disabled={testRunning}>
                    {testRunning ? "⏳ Running…" : "🧪 Run Tests"}
                  </button>
                )}
                <button className="pp-submit-btn" type="button" onClick={submitLesson}>
                  <Send size={13} /> Submit
                </button>
                {practiceSubmitted && <span className="pp-submitted-badge">✓ Submitted!</span>}
                {onStuck && (
                  <button className="qp-stuck-btn" type="button"
                    onClick={() => onStuck(`I'm stuck on this coding exercise: "${lesson?.heading || "practice"}". My code isn't working — can you help?`)}>
                    😕 I'm stuck
                  </button>
                )}
              </div>
            </article>

            {/* Editor ↔ Output resize handle */}
            <div className="pp-resize-handle pp-resize-h-output" onMouseDown={startResizeOutput} />

            {/* Output panel */}
            <aside className={`pp-output-panel${workspaceTab === "editor" ? " pp-output-collapsed" : ""}`}
              style={{ width: outputWidth, flexShrink: 0 }}>
              <div className="pp-output-header">
                <span className="pp-output-title">📟 Output</span>
                <span className="pp-output-status">Ready</span>
              </div>
              <div className="pp-output-body">
                <pre id="output" className="pp-output-pre" />
                {(errorExplaining || errorExplanation) && (
                  <div className="pp-error-explain">
                    <span className="pp-error-label">🤔 What does this mean?</span>
                    {errorExplaining
                      ? <span className="pp-error-loading">Figuring it out…</span>
                      : <span className="pp-error-text">{errorExplanation}</span>
                    }
                  </div>
                )}
              </div>
              {testResults && (
                <div className="test-results-panel">
                  <div className="test-results-header">
                    <span>Test Results</span>
                    <div className="test-results-header-right">
                      <span className={`test-score ${testResults.every(r => r.passed) ? "test-score-pass" : "test-score-fail"}`}>
                        {testResults.filter(r => r.passed).length} / {testResults.length} passed
                      </span>
                      <button className="test-results-close" onClick={() => setTestResults(null)}>✕</button>
                    </div>
                  </div>
                  {testResults.map((r, i) => (
                    <div key={i} className={`test-result-row ${r.passed ? "pass" : "fail"}`}>
                      <span className="test-result-icon">{r.passed ? "✓" : "✗"}</span>
                      <span className="test-result-label">{r.label || `Test ${i + 1}`}</span>
                      {!r.passed && <div className="test-result-detail"><span>Expected: <code>{r.expected}</code></span><span>Got: <code>{r.actual}</code></span></div>}
                    </div>
                  ))}
                </div>
              )}
            </aside>
          </div>
        </div>
      </main>
      {chatBot}
    </PageShell>
  );
}
