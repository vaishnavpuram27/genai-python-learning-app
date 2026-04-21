import { useRef, useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, LogOut, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from '../contexts/RouterContext';
import { useClassContext } from '../contexts/ClassContext';
import PageShell from '../components/PageShell';
import SkeletonRows from '../components/SkeletonRows';
import EmptyState from '../components/EmptyState';
import OpenMoji from '../components/OpenMoji';
import { upsertOption, createTopicItemDraft } from '../utils/lessonHelpers';
import PublishModal from '../components/PublishModal';
import AiTutorTab from '../components/AiTutorTab';
import { API_BASE, authHeaders } from '../utils/api';

const TOPIC_COLORS = [
  { bg: "#F3E8FF", border: "#9333EA", text: "#6B21A8", emoji: "1F680" },
  { bg: "#F0FDFA", border: "#0D9488", text: "#0F766E", emoji: "26A1"  },
  { bg: "#FFF7ED", border: "#F97316", text: "#C2410C", emoji: "1F31F" },
  { bg: "#EFF6FF", border: "#2563EB", text: "#1D4ED8", emoji: "1F3AE" },
  { bg: "#FDF2F8", border: "#EC4899", text: "#9D174D", emoji: "1F3AF" },
  { bg: "#F0FDF4", border: "#16A34A", text: "#166534", emoji: "1F40D" },
];
const TYPE_META = {
  practice: { emoji: "1F4BB", label: "Practice", color: "#2563EB", bg: "#EFF6FF" },
  quiz:     { emoji: "1F4DD", label: "Quiz",     color: "#9333EA", bg: "#F3E8FF" },
  learning: { emoji: "1F4DA", label: "Learn",    color: "#0D9488", bg: "#F0FDFA" },
};

export default function ClassPage({ handleLogout, chatBot }) {
  const {
    activeClass,
    topics, setTopics,
    classTab, setClassTab,
    classStats, classStatsLoading,
    myClassProgress,
    topicTitle, setTopicTitle,
    topicError,
    topicItemDrafts,
    editingTopicId, setEditingTopicId,
    editingTopicTitle, setEditingTopicTitle,
    editingItemId, setEditingItemId,
    editingItemTitle, setEditingItemTitle,
    editingItemType, setEditingItemType,
    editingItemBody, setEditingItemBody,
    editingItemInstructions, setEditingItemInstructions,
    editingItemCodeStarter, setEditingItemCodeStarter,
    editingItemQuizSubtype, setEditingItemQuizSubtype,
    editingItemQuizQuestion, setEditingItemQuizQuestion,
    editingItemQuizOptions, setEditingItemQuizOptions,
    editingItemQuizOptionInput, setEditingItemQuizOptionInput,
    editingItemQuizOptionEditIndex, setEditingItemQuizOptionEditIndex,
    editingItemQuizAnswer, setEditingItemQuizAnswer,
    editingItemMaxPoints, setEditingItemMaxPoints,
    editingItemDeadline, setEditingItemDeadline,
    editingItemIsPublished, setEditingItemIsPublished,
    dragOverItemId, setDragOverItemId,
    dragItemRef, dragFromHandleRef,
    dragOverTopicId, setDragOverTopicId,
    dragTopicRef, dragTopicFromHandleRef,
    classStudents, selectedStudentId,
    handleCreateTopic, handleCreateTopicItem, updateTopicDraft,
    beginEditTopic, saveEditTopic, deleteTopic,
    beginEditItem, saveEditItem, deleteItem,
    handleItemReorder, handleTopicReorder,
    handleRefreshStudents, handleSelectStudent, handleDeleteClass,
  } = useClassContext();
  const { user, isTeacher, isTeacherView, viewRole, setViewRole, userMenuOpen, setUserMenuOpen } = useAuth();
  const { pageTransition, activeClassId, navigateToClasses, navigateToMyDashboard, navigateToPractice, navigateToQuiz, navigateToLearningItem, navigateToStudentStats } = useRouter();
  const publishModalRef = useRef(null);
  const [ownedTemplate, setOwnedTemplate] = useState(null);
  const [openTopics, setOpenTopics] = useState({});
  const [studentsOpen, setStudentsOpen] = useState(false);
  const progressMap = Object.fromEntries((myClassProgress?.items || []).map(i => [i.id, i]));

  const isTopicOpen = (id) => openTopics[id] !== false;
  const toggleTopic = (id) => setOpenTopics(prev => ({ ...prev, [id]: !isTopicOpen(id) }));

  useEffect(() => {
    if (!activeClassId || !user) return;
    async function checkOwnedTemplate() {
      try {
        const params = new URLSearchParams({ mine: "true", sourceClassId: activeClassId });
        const res = await fetch(`${API_BASE}/hub?${params}`, { headers: authHeaders() });
        const data = await res.json();
        const templates = data?.data?.templates || [];
        setOwnedTemplate(templates[0] || null);
      } catch { /* ignore */ }
    }
    checkOwnedTemplate();
  }, [activeClassId, user]);

  return (
    <PageShell className={`page-shell ${pageTransition}`}>
      <main className={isTeacher ? "tp-page" : "sc-page"}>

      {/* ── Teacher header (redesigned) ── */}
      {isTeacher && (
        <>
          <header className="tp-topbar">
            <button className="lp-back-btn" type="button" onClick={navigateToClasses}>
              <ArrowLeft size={16} className="sketch-sm" /> My Classes
            </button>
            <div className="tp-topbar-center">
              <span className="tp-topbar-eyebrow">Teacher Workspace</span>
              <span className="tp-topbar-title">{activeClass ? activeClass.name : "Class"}</span>
              {activeClass && <span className="tp-topbar-code">Code: {activeClass.joinCode}</span>}
            </div>
            <div className="tp-topbar-right">
              <button className="student-user-btn" type="button" onClick={() => setUserMenuOpen(o => !o)}>
                <span className="student-user-avatar">{user.name[0].toUpperCase()}</span>
                <ChevronDown size={14} />
              </button>
              {userMenuOpen && (
                <div className="user-menu-dropdown" role="menu" onClick={() => setUserMenuOpen(false)}>
                  <span className="user-menu-role">{user.role}</span>
                  <button className="user-menu-item" type="button" role="menuitem" onClick={() => setViewRole(v => v === "teacher" ? "student" : "teacher")}>
                    Switch to {isTeacherView ? "Student" : "Teacher"} view
                  </button>
                  <button className="user-menu-item user-menu-item--danger" type="button" role="menuitem" onClick={handleLogout}>Log out</button>
                </div>
              )}
            </div>
          </header>
          <div className="tp-action-bar">
            <button className="tp-action-btn tp-action-btn--primary" type="button"
              onClick={() => { const input = document.querySelector(".topic-actions input"); if (input) input.focus(); }}>
              + Add Topic
            </button>
            {activeClass && (
              <button className="tp-action-btn" type="button"
                onClick={() => publishModalRef.current?.open(activeClassId, topics, ownedTemplate)}>
                {ownedTemplate ? "Update Hub Template" : "Publish to Hub"}
              </button>
            )}
            {activeClass && (
              <button className="tp-action-btn tp-action-btn--danger" type="button" onClick={handleDeleteClass}>
                Delete Class
              </button>
            )}
          </div>
        </>
      )}

      {/* ── Student header ── */}
      {!isTeacher && (
        <header className="sc-topbar">
          <button className="db-back-btn" type="button" onClick={navigateToClasses}>
            <ArrowLeft size={15} className="sketch-sm" /> My Classes
          </button>
          <div className="sc-topbar-title">
            <h1 className="sc-class-name">{activeClass?.name || "Class"}</h1>
            <span className="sc-topbar-sub">Lessons overview</span>
          </div>
          <div className="sc-topbar-right">
            <button className="sc-dashboard-btn" type="button" onClick={() => navigateToMyDashboard(activeClassId)}>
              <LayoutDashboard size={15} className="sketch-sm" /> Dashboard
            </button>
            <div style={{ position: "relative" }}>
              <button className="student-user-btn" type="button" onClick={() => setUserMenuOpen(o => !o)}>
                <span className="student-user-avatar">{user.name[0].toUpperCase()}</span>
                <span>{user.name}</span>
                <ChevronDown size={15} />
              </button>
              {userMenuOpen && (
                <div className="user-menu-dropdown" role="menu" onClick={() => setUserMenuOpen(false)}>
                  <span className="user-menu-role">{user.role}</span>
                  <button className="user-menu-item user-menu-item--danger" type="button" role="menuitem" onClick={handleLogout}><LogOut size={14} /> Log out</button>
                </div>
              )}
            </div>
          </div>
        </header>
      )}

      {isTeacher && (
        <div className="tp-tab-bar">
          <button className={`tp-tab${classTab === "topics" ? " tp-tab--active" : ""}`} type="button" onClick={() => setClassTab("topics")}>
            Topics &amp; Students
          </button>
          <button className={`tp-tab${classTab === "stats" ? " tp-tab--active" : ""}`} type="button" onClick={() => setClassTab("stats")}>
            Class Stats
          </button>
          <button className={`tp-tab${classTab === "ai-tutor" ? " tp-tab--active" : ""}`} type="button" onClick={() => setClassTab("ai-tutor")}>
            AI Tutor
          </button>
        </div>
      )}

      {isTeacher && classTab === "stats" ? (
        <div className="tp-content stats-tp-content panel-animate">
          {classStatsLoading && <SkeletonRows count={5} />}
          {!classStatsLoading && classStats && (
            <>
              {/* ── Summary stat cards ── */}
              <div className="stats-summary-grid">
                {[
                  { n: classStats.studentCount,        label: "Students",  icon: "👥", bg: "#EDE9FE", color: "#7C3AED" },
                  { n: classStats.topicCount,           label: "Topics",    icon: "📚", bg: "#DBEAFE", color: "#2563EB" },
                  { n: classStats.itemCounts.learning,  label: "Lessons",   icon: "📖", bg: "#CCFBF1", color: "#0D9488" },
                  { n: classStats.itemCounts.quiz,      label: "Quizzes",   icon: "❓", bg: "#FEF9C3", color: "#CA8A04" },
                  { n: classStats.itemCounts.practice,  label: "Practice",  icon: "💻", bg: "#FCE7F3", color: "#DB2777" },
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

              {/* ── Overall submission bar ── */}
              <div className="stats-card-panel">
                <div className="stats-card-panel-header">
                  <h3 className="stats-card-panel-title">Overall Submissions</h3>
                  {classStats.quizSummary.total > 0 && (
                    <span className="stats-card-panel-badge">{classStats.quizSummary.total} total</span>
                  )}
                </div>
                {classStats.quizSummary.total === 0 ? (
                  <p className="empty-state" style={{ margin: "0.5rem 0" }}>No submissions yet.</p>
                ) : (
                  <>
                    <div className="stats-bar-wrap" style={{ marginBottom: "0.75rem" }}>
                      <div className="stats-bar-segment stats-bar-correct" style={{ width: `${Math.round((classStats.quizSummary.correct / classStats.quizSummary.total) * 100)}%` }} title={`Correct: ${classStats.quizSummary.correct}`} />
                      <div className="stats-bar-segment stats-bar-incorrect" style={{ width: `${Math.round((classStats.quizSummary.incorrect / classStats.quizSummary.total) * 100)}%` }} title={`Incorrect: ${classStats.quizSummary.incorrect}`} />
                      <div className="stats-bar-segment stats-bar-pending" style={{ width: `${Math.round((classStats.quizSummary.pending / classStats.quizSummary.total) * 100)}%` }} title={`Pending: ${classStats.quizSummary.pending}`} />
                    </div>
                    <div className="stats-legend">
                      <span className="legend-dot legend-correct" /> Correct ({classStats.quizSummary.correct})
                      <span className="legend-dot legend-incorrect" /> Incorrect ({classStats.quizSummary.incorrect})
                      <span className="legend-dot legend-pending" /> Pending ({classStats.quizSummary.pending})
                    </div>
                  </>
                )}
              </div>

              {/* ── Student performance table ── */}
              {classStats.studentBreakdowns?.length > 0 && (
                <div className="stats-card-panel">
                  <div className="stats-card-panel-header">
                    <h3 className="stats-card-panel-title">Student Performance</h3>
                    <span className="stats-card-panel-badge">{classStats.studentBreakdowns.length} student{classStats.studentBreakdowns.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="stats-table-wrap" style={{ marginTop: 0 }}>
                    <table className="stats-table">
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>Attempted</th>
                          <th>Correct</th>
                          <th>Success Rate</th>
                          <th>AI Chats</th>
                          <th>Progress</th>
                          <th>Last Active</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classStats.studentBreakdowns.map((s) => {
                          const pct = s.total > 0 ? Math.round((s.attempted / s.total) * 100) : 0;
                          return (
                            <tr key={s.id}>
                              <td className="stats-student-name stats-student-link" onClick={() => navigateToStudentStats(activeClassId, s.id)} title="View student detail">{s.name}</td>
                              <td>{s.attempted}/{s.total}</td>
                              <td>{s.correct}</td>
                              <td>
                                {s.successRate !== null
                                  ? <span className={`stats-rate-pill ${s.successRate >= 70 ? "rate-good" : s.successRate >= 40 ? "rate-mid" : "rate-low"}`}>{s.successRate}%</span>
                                  : <span className="stats-meta">—</span>}
                              </td>
                              <td>
                                {s.aiInteractions > 0 ? (
                                  <button className="ghost-button" style={{ padding: "2px 8px", fontSize: "0.8rem" }} type="button" onClick={() => navigateToStudentStats(activeClassId, s.id)}>
                                    {s.aiInteractions} chat{s.aiInteractions !== 1 ? "s" : ""}
                                  </button>
                                ) : <span className="stats-meta">—</span>}
                              </td>
                              <td>
                                <div className="stats-mini-bar"><div className="stats-mini-fill" style={{ width: `${pct}%` }} /></div>
                              </td>
                              <td className="stats-meta">{s.lastActivity ? new Date(s.lastActivity).toLocaleDateString() : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Item performance table ── */}
              {classStats.itemBreakdowns?.length > 0 && (
                <div className="stats-card-panel">
                  <div className="stats-card-panel-header">
                    <h3 className="stats-card-panel-title">Item Performance</h3>
                    <span className="stats-card-panel-badge">by topic order</span>
                  </div>
                  <div className="stats-table-wrap" style={{ marginTop: 0 }}>
                    <table className="stats-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Topic</th>
                          <th>Type</th>
                          <th>Attempted</th>
                          <th>Correct Rate</th>
                          <th>Difficulty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classStats.itemBreakdowns.map((item) => {
                          const difficulty = item.correctRate === null ? null
                            : item.correctRate >= 70 ? { label: "Easy", cls: "diff-easy" }
                            : item.correctRate >= 40 ? { label: "Medium", cls: "diff-mid" }
                            : { label: "Hard", cls: "diff-hard" };
                          return (
                            <tr key={item.id}>
                              <td className="stats-student-name">{item.title}</td>
                              <td className="stats-meta">{item.topicTitle}</td>
                              <td><span className={`topic-type type-${item.type}`}>{item.type}</span></td>
                              <td>{item.attempted}/{item.studentCount}</td>
                              <td>
                                {item.correctRate !== null
                                  ? <span className={`stats-rate-pill ${item.correctRate >= 70 ? "rate-good" : item.correctRate >= 40 ? "rate-mid" : "rate-low"}`}>{item.correctRate}%</span>
                                  : <span className="stats-meta">—</span>}
                              </td>
                              <td>
                                {difficulty ? <span className={`diff-badge ${difficulty.cls}`}>{difficulty.label}</span> : <span className="stats-meta">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : isTeacher && classTab === "ai-tutor" ? (
        <div className="tp-content panel-animate">
          <AiTutorTab classId={activeClass?.id} topics={topics} />
        </div>
      ) : (
      <section className="class-detail-grid">
        {!isTeacher && myClassProgress && myClassProgress.gradedItems > 0 && (() => {
          const pct = Math.round((myClassProgress.attemptedItems / myClassProgress.gradedItems) * 100);
          const nextItem = myClassProgress.items?.find(i => i.attempted === false);
          return (
            <div className="sc-progress-banner panel-animate">
              <div className="sc-progress-stats">
                <div className="sc-progress-stat">
                  <OpenMoji hex="1F3AF" size={32} />
                  <div>
                    <span className="sc-progress-num">{myClassProgress.attemptedItems}<span className="sc-progress-denom">/{myClassProgress.gradedItems}</span></span>
                    <span className="sc-progress-lbl">Completed</span>
                  </div>
                </div>
                {myClassProgress.totalPossiblePoints > 0 && (
                  <div className="sc-progress-stat">
                    <OpenMoji hex="1F31F" size={32} />
                    <div>
                      <span className="sc-progress-num">{myClassProgress.pointsEarned}<span className="sc-progress-denom">/{myClassProgress.totalPossiblePoints}</span></span>
                      <span className="sc-progress-lbl">Marks</span>
                    </div>
                  </div>
                )}
                <div className="sc-progress-stat">
                  <OpenMoji hex="1F3C6" size={32} />
                  <div>
                    <span className="sc-progress-num">{pct}%</span>
                    <span className="sc-progress-lbl">Score</span>
                  </div>
                </div>
              </div>
              <div className="sc-progress-bar-wrap">
                <div className="sc-progress-bar-fill" style={{ width: `${pct}%` }} />
              </div>
              {nextItem ? (
                <button className="sc-continue-btn" type="button" onClick={() => {
                  if (nextItem.type === "practice") navigateToPractice(activeClassId, nextItem.id);
                  else if (nextItem.type === "quiz") navigateToQuiz(activeClassId, nextItem.id);
                  else navigateToLearningItem(activeClassId, nextItem.id);
                }}>
                  Continue → {nextItem.title} <ArrowRight size={15} className="sketch-sm" />
                </button>
              ) : (
                <div className="sc-progress-done">🎉 All done — amazing work!</div>
              )}
            </div>
          );
        })()}
        <div
          className="class-detail-panel panel-animate"
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              (event.target?.tagName === "INPUT" ||
                event.target?.tagName === "SELECT")
            ) {
              event.preventDefault();
            }
          }}
        >
          <div className="panel-header">
            <h2>Topics</h2>
            {isTeacher && (
              <div className="topic-actions">
                <input
                  className="class-input"
                  type="text"
                  value={topicTitle}
                  onChange={(event) => setTopicTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleCreateTopic();
                    }
                  }}
                  placeholder="Topic title (e.g., Loops)"
                />
                <button className="accent-button" type="button" onClick={handleCreateTopic}>
                  Add topic
                </button>
              </div>
            )}
          </div>
          {topicError && <p className="auth-error">{topicError}</p>}
          {topics.length === 0 && (
            <EmptyState icon="📚" title="No topics yet" body="Add your first topic to start building the curriculum." />
          )}
          <div className="topic-grid">
            {topics.map((topic, topicIdx) => {
              const tc = TOPIC_COLORS[topicIdx % TOPIC_COLORS.length];
              return (
              <article
                key={topic.id}
                className={`topic-card panel-animate${dragOverTopicId === topic.id ? " drag-over-topic" : ""}${!isTeacher ? " sc-topic-card" : " tc-teacher-card"}`}
                style={{ "--tc-bg": tc.bg, "--tc-border": tc.border, "--tc-text": tc.text }}
                draggable={isTeacher && editingTopicId !== topic.id}
                onDragStart={(e) => {
                  if (!dragTopicFromHandleRef.current) { e.preventDefault(); return; }
                  dragTopicRef.current = topic.id;
                }}
                onDragOver={(e) => { e.preventDefault(); if (dragTopicRef.current) setDragOverTopicId(topic.id); }}
                onDragLeave={() => setDragOverTopicId(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverTopicId(null);
                  if (dragTopicRef.current) handleTopicReorder(dragTopicRef.current, topic.id);
                  dragTopicRef.current = null;
                }}
                onDragEnd={() => { dragTopicRef.current = null; dragTopicFromHandleRef.current = false; setDragOverTopicId(null); }}
              >

                <div className="topic-header">
                  {editingTopicId === topic.id ? (
                    <div className="topic-edit">
                      <input
                        className="class-input"
                        type="text"
                        value={editingTopicTitle}
                        onChange={(event) => setEditingTopicTitle(event.target.value)}
                      />
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => saveEditTopic(topic.id)}
                      >
                        Save
                      </button>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => setEditingTopicId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className={`topic-title-row${!isTeacher ? " sc-topic-title-row" : ""}`}
                      onClick={!isTeacher ? () => toggleTopic(topic.id) : undefined}
                      style={!isTeacher ? { cursor: "pointer" } : undefined}
                    >
                      {isTeacher && (
                        <span
                          className="topic-drag-handle"
                          title="Drag to reorder"
                          onMouseDown={() => { dragTopicFromHandleRef.current = true; }}
                          onMouseUp={() => { dragTopicFromHandleRef.current = false; }}
                        >⠿</span>
                      )}
                      <h3>{topic.title}</h3>
                      {!isTeacher && (
                        <ChevronDown size={18} className={`sc-topic-chevron${isTopicOpen(topic.id) ? " open" : ""}`} style={{ color: tc.text }} />
                      )}
                      {isTeacher && (
                        <div className="topic-actions-inline">
                          <button
                            className="ghost-button"
                            type="button"
                            onClick={() => beginEditTopic(topic)}
                          >
                            Edit
                          </button>
                          <button
                            className="ghost-button danger"
                            type="button"
                            onClick={() => deleteTopic(topic.id)}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {isTeacher && <span className="topic-pill">Topic</span>}
                </div>
                <div className={!isTeacher ? `sc-topic-sections${!isTopicOpen(topic.id) ? " sc-topic-collapsed" : ""}` : "topic-sections"}>
                  {(topic.items || []).length ? (
                    (topic.items || []).map((item) => (
                      <div
                        key={item.id}
                        className={`topic-section-row${dragOverItemId === item.id ? " drag-over" : ""}`}
                        draggable={isTeacher && editingItemId !== item.id}
                        onDragStart={(e) => {
                          e.stopPropagation();
                          if (!dragFromHandleRef.current) { e.preventDefault(); return; }
                          dragItemRef.current = { topicId: topic.id, itemId: item.id };
                        }}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (dragItemRef.current) setDragOverItemId(item.id); }}
                        onDragLeave={(e) => { e.stopPropagation(); setDragOverItemId(null); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragOverItemId(null);
                          const drag = dragItemRef.current;
                          if (drag && drag.topicId === topic.id) {
                            handleItemReorder(topic.id, drag.itemId, item.id);
                          }
                          dragItemRef.current = null;
                        }}
                        onDragEnd={(e) => { e.stopPropagation(); dragItemRef.current = null; dragFromHandleRef.current = false; setDragOverItemId(null); }}
                      >
                        {editingItemId === item.id ? (
                          <div className="topic-item-edit">
                            <input
                              className="class-input"
                              type="text"
                              value={editingItemTitle}
                              onChange={(event) => setEditingItemTitle(event.target.value)}
                              placeholder="Item title"
                            />
                            <div className="topic-type-toggle">
                              <button
                                className={editingItemType === "learning" ? "ghost-button active" : "ghost-button"}
                                type="button"
                                onClick={() => setEditingItemType("learning")}
                              >
                                Learning
                              </button>
                              <button
                                className={editingItemType === "quiz" ? "ghost-button active" : "ghost-button"}
                                type="button"
                                onClick={() => setEditingItemType("quiz")}
                              >
                                Quiz
                              </button>
                              <button
                                className={editingItemType === "practice" ? "ghost-button active" : "ghost-button"}
                                type="button"
                                onClick={() => setEditingItemType("practice")}
                              >
                                Practice
                              </button>
                            </div>
                            {editingItemType === "learning" && (
                              <div className="learning-edit-fields">
                                <textarea
                                  className="class-input"
                                  value={editingItemBody}
                                  onChange={(e) => setEditingItemBody(e.target.value)}
                                  placeholder="Lesson body — explain the concept in plain language"
                                  rows={4}
                                />
                                <input
                                  className="class-input"
                                  type="text"
                                  value={editingItemInstructions}
                                  onChange={(e) => setEditingItemInstructions(e.target.value)}
                                  placeholder="Instructions (optional)"
                                />
                                <textarea
                                  className="class-input practice-modal-code"
                                  value={editingItemCodeStarter}
                                  onChange={(e) => setEditingItemCodeStarter(e.target.value)}
                                  placeholder="Code example (optional Python code)"
                                  rows={3}
                                  spellCheck={false}
                                />
                              </div>
                            )}
                            {editingItemType === "quiz" && (
                              <div className="quiz-builder">
                                <p className="progress-meta">Question type</p>
                                <div className="topic-type-toggle">
                                  <button
                                    className={
                                      editingItemQuizSubtype === "mcq"
                                        ? "ghost-button active"
                                        : "ghost-button"
                                    }
                                    type="button"
                                    onClick={() => setEditingItemQuizSubtype("mcq")}
                                  >
                                    MCQ
                                  </button>
                                  <button
                                    className={
                                      editingItemQuizSubtype === "short_answer"
                                        ? "ghost-button active"
                                        : "ghost-button"
                                    }
                                    type="button"
                                    onClick={() => setEditingItemQuizSubtype("short_answer")}
                                  >
                                    Short Answer
                                  </button>
                                </div>
                                <input
                                  className="class-input"
                                  type="text"
                                  value={editingItemQuizQuestion}
                                  onChange={(event) =>
                                    setEditingItemQuizQuestion(event.target.value)
                                  }
                                  placeholder="Quiz question"
                                />
                                {editingItemQuizSubtype === "mcq" ? (
                                  <div className="quiz-options-builder">
                                    <div className="quiz-option-row">
                                      <input
                                        className="class-input"
                                        type="text"
                                        value={editingItemQuizOptionInput}
                                        onChange={(event) =>
                                          setEditingItemQuizOptionInput(event.target.value)
                                        }
                                        placeholder="Choice text"
                                      />
                                      <button
                                        className="ghost-button"
                                        type="button"
                                        onClick={() => {
                                          const value = editingItemQuizOptionInput.trim();
                                          if (!value) return;
                                          const next = upsertOption(
                                            editingItemQuizOptions,
                                            editingItemQuizOptionEditIndex,
                                            value
                                          );
                                          setEditingItemQuizOptions(next);
                                          if (
                                            editingItemQuizAnswer &&
                                            editingItemQuizOptionEditIndex >= 0 &&
                                            editingItemQuizOptions[editingItemQuizOptionEditIndex] !== value
                                          ) {
                                            setEditingItemQuizAnswer("");
                                          }
                                          setEditingItemQuizOptionInput("");
                                          setEditingItemQuizOptionEditIndex(-1);
                                        }}
                                      >
                                        {editingItemQuizOptionEditIndex >= 0 ? "Update choice" : "Add choice"}
                                      </button>
                                    </div>
                                    <div className="quiz-options-list">
                                      {editingItemQuizOptions.map((option, optionIndex) => (
                                        <div key={`${option}-${optionIndex}`} className="quiz-option-item">
                                          <span>{option}</span>
                                          <div className="topic-item-actions">
                                            <button
                                              className="ghost-button"
                                              type="button"
                                              onClick={() => {
                                                setEditingItemQuizOptionInput(option);
                                                setEditingItemQuizOptionEditIndex(optionIndex);
                                              }}
                                            >
                                              Edit
                                            </button>
                                            <button
                                              className="ghost-button danger"
                                              type="button"
                                              onClick={() => {
                                                const next = editingItemQuizOptions.filter(
                                                  (_, idx) => idx !== optionIndex
                                                );
                                                setEditingItemQuizOptions(next);
                                                if (editingItemQuizAnswer === option) {
                                                  setEditingItemQuizAnswer("");
                                                }
                                                if (editingItemQuizOptionEditIndex === optionIndex) {
                                                  setEditingItemQuizOptionEditIndex(-1);
                                                  setEditingItemQuizOptionInput("");
                                                }
                                              }}
                                            >
                                              Delete
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                    <select
                                      className="class-input"
                                      value={editingItemQuizAnswer}
                                      onChange={(event) =>
                                        setEditingItemQuizAnswer(event.target.value)
                                      }
                                    >
                                      <option value="">Select correct answer</option>
                                      {editingItemQuizOptions.map((option) => (
                                        <option key={option} value={option}>
                                          {option}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                ) : (
                                  <input
                                    className="class-input"
                                    type="text"
                                    value={editingItemQuizAnswer}
                                    onChange={(event) =>
                                      setEditingItemQuizAnswer(event.target.value)
                                    }
                                    placeholder="Expected answer"
                                  />
                                )}
                              </div>
                            )}
                            {(editingItemType === "quiz" || editingItemType === "practice") && (
                              <label className="login-field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
                                <span style={{ whiteSpace: "nowrap" }}>Max points</span>
                                <input
                                  className="class-input"
                                  type="number"
                                  min="0"
                                  style={{ width: "80px" }}
                                  value={editingItemMaxPoints}
                                  onChange={(event) => setEditingItemMaxPoints(event.target.value === "" ? "" : Math.max(0, parseInt(event.target.value, 10) || 0))}
                                />
                              </label>
                            )}
                            <label className="login-field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
                              <span style={{ whiteSpace: "nowrap" }}>Deadline</span>
                              <input
                                className="class-input"
                                type="datetime-local"
                                value={editingItemDeadline}
                                onChange={(event) => setEditingItemDeadline(event.target.value)}
                              />
                            </label>
                            <div className="publish-toggle-row">
                              <label className="publish-toggle">
                                <input
                                  type="checkbox"
                                  checked={editingItemIsPublished}
                                  onChange={(event) => setEditingItemIsPublished(event.target.checked)}
                                />
                                <span className="publish-toggle-track" />
                              </label>
                              <span className="publish-toggle-label">
                                {editingItemIsPublished ? "Published — visible to students" : "Draft — hidden from students"}
                              </span>
                            </div>
                            <div className="topic-item-actions">
                              <button
                                className="ghost-button"
                                type="button"
                                onClick={() => saveEditItem(topic.id, item.id)}
                              >
                                Save
                              </button>
                              <button
                                className="ghost-button"
                                type="button"
                                onClick={() => setEditingItemId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {isTeacher ? (
                              /* ── Teacher item card (redesigned) ── */
                              (() => {
                                const meta = TYPE_META[item.type] || TYPE_META.learning;
                                return (
                                  <div className="tc-item-card" style={{ "--item-color": meta.color, "--item-bg": meta.bg }}>
                                    <span className="drag-handle tc-drag" title="Drag to reorder"
                                      onMouseDown={() => { dragFromHandleRef.current = true; }}
                                      onMouseUp={() => { dragFromHandleRef.current = false; }}>⠿</span>
                                    <div className="tc-item-icon">
                                      <OpenMoji hex={meta.emoji} size={30} />
                                    </div>
                                    <div className="tc-item-body">
                                      <span className="tc-item-title">{item.title}</span>
                                      <div className="tc-item-meta-row">
                                        <span className="tc-item-type-badge" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                                        {item.isPublished === false && <span className="draft-badge">Draft</span>}
                                        {item.type === "quiz" && item.quizQuestion && (
                                          <span className="tc-item-meta">{item.quizSubtype === "mcq" ? "MCQ" : "SA"}: {item.quizQuestion.slice(0, 50)}{item.quizQuestion.length > 50 ? "…" : ""}</span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="tc-item-actions">
                                      <button className="tc-item-btn" type="button" onClick={() => {
                                        if (item.type === "practice") navigateToPractice(activeClassId, item.id);
                                        else if (item.type === "quiz") navigateToQuiz(activeClassId, item.id);
                                        else navigateToLearningItem(activeClassId, item.id);
                                      }}>Open</button>
                                      <button className="tc-item-btn" type="button" onClick={() => beginEditItem(item)}>Edit</button>
                                      <button className="tc-item-btn tc-item-btn--danger" type="button" onClick={() => deleteItem(topic.id, item.id)}>Delete</button>
                                    </div>
                                  </div>
                                );
                              })()
                            ) : (
                              /* ── Student item row (redesigned) ── */
                              (() => {
                                const meta = TYPE_META[item.type] || TYPE_META.learning;
                                const prog = progressMap[item.id];
                                const done = prog?.attempted;
                                return (
                                  <div className={`sc-item-card${done ? " sc-item-card--done" : ""}`}
                                    style={{ "--item-color": meta.color, "--item-bg": meta.bg }}
                                    onClick={() => {
                                      if (item.type === "practice") navigateToPractice(activeClassId, item.id);
                                      else if (item.type === "quiz") navigateToQuiz(activeClassId, item.id);
                                      else navigateToLearningItem(activeClassId, item.id);
                                    }}>
                                    <div className="sc-item-card-strip" />
                                    <div className="sc-item-card-icon">
                                      <OpenMoji hex={meta.emoji} size={38} />
                                    </div>
                                    <div className="sc-item-card-body">
                                      <span className="sc-item-card-title">{item.title}</span>
                                      <span className="sc-item-card-type">{meta.label}</span>
                                    </div>
                                    <div className="sc-item-card-action">
                                      {done
                                        ? <span className="sc-item-card-done">✓ Done</span>
                                        : <span className="sc-item-card-start">Start <ArrowRight size={14} className="sketch-sm" /></span>
                                      }
                                    </div>
                                  </div>
                                );
                              })()
                            )}
                          </>
                        )}
                      </div>
                    ))
                  ) : (
                    <EmptyState icon="📝" title="No items yet" body="Add a learning lesson, quiz, or coding practice." />
                  )}
                </div>
                {isTeacher && (
                  <div className="topic-item-form">
                    <input
                      className="class-input"
                      type="text"
                      value={(topicItemDrafts[topic.id]?.title) || ""}
                      onChange={(event) =>
                        updateTopicDraft(topic.id, { title: event.target.value })
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleCreateTopicItem(topic.id);
                        }
                      }}
                      placeholder="Item title"
                    />
                    <div className="topic-type-toggle">
                      <button
                        className={
                          ((topicItemDrafts[topic.id]?.type) || "learning") === "learning"
                            ? "ghost-button active"
                            : "ghost-button"
                        }
                        type="button"
                        onClick={() =>
                          updateTopicDraft(topic.id, { type: "learning" })
                        }
                      >
                        Learning
                      </button>
                      <button
                        className={
                          ((topicItemDrafts[topic.id]?.type) || "learning") === "quiz"
                            ? "ghost-button active"
                            : "ghost-button"
                        }
                        type="button"
                        onClick={() =>
                          updateTopicDraft(topic.id, { type: "quiz" })
                        }
                      >
                        Quiz
                      </button>
                      <button
                        className={
                          ((topicItemDrafts[topic.id]?.type) || "learning") === "practice"
                            ? "ghost-button active"
                            : "ghost-button"
                        }
                        type="button"
                        onClick={() =>
                          updateTopicDraft(topic.id, { type: "practice" })
                        }
                      >
                        Practice
                      </button>
                    </div>
                    {(topicItemDrafts[topic.id]?.type || "learning") === "quiz" && (
                      <div className="quiz-builder">
                        <p className="progress-meta">Question type</p>
                        <div className="topic-type-toggle">
                          <button
                            className={
                              ((topicItemDrafts[topic.id]?.quizSubtype) || "mcq") === "mcq"
                                ? "ghost-button active"
                                : "ghost-button"
                            }
                            type="button"
                            onClick={() =>
                              updateTopicDraft(topic.id, { quizSubtype: "mcq" })
                            }
                          >
                            MCQ
                          </button>
                          <button
                            className={
                              ((topicItemDrafts[topic.id]?.quizSubtype) || "mcq") ===
                              "short_answer"
                                ? "ghost-button active"
                                : "ghost-button"
                            }
                            type="button"
                            onClick={() =>
                              updateTopicDraft(topic.id, { quizSubtype: "short_answer" })
                            }
                          >
                            Short Answer
                          </button>
                        </div>
                        <input
                          className="class-input"
                          type="text"
                          value={(topicItemDrafts[topic.id]?.quizQuestion) || ""}
                          onChange={(event) =>
                            updateTopicDraft(topic.id, { quizQuestion: event.target.value })
                          }
                          placeholder="Quiz question"
                        />
                        {((topicItemDrafts[topic.id]?.quizSubtype) || "mcq") === "mcq" ? (
                          <div className="quiz-options-builder">
                            <div className="quiz-option-row">
                              <input
                                className="class-input"
                                type="text"
                                value={(topicItemDrafts[topic.id]?.quizOptionInput) || ""}
                                onChange={(event) =>
                                  updateTopicDraft(topic.id, { quizOptionInput: event.target.value })
                                }
                                placeholder="Choice text"
                              />
                              <button
                                className="ghost-button"
                                type="button"
                                onClick={() => {
                                  const draft = topicItemDrafts[topic.id] || createTopicItemDraft();
                                  const value = `${draft.quizOptionInput || ""}`.trim();
                                  if (!value) return;
                                  const nextOptions = upsertOption(
                                    draft.quizOptions,
                                    draft.quizOptionEditIndex,
                                    value
                                  );
                                  const nextAnswer =
                                    draft.quizOptionEditIndex >= 0 &&
                                    draft.quizAnswer === draft.quizOptions?.[draft.quizOptionEditIndex]
                                      ? value
                                      : draft.quizAnswer;
                                  updateTopicDraft(topic.id, {
                                    quizOptions: nextOptions,
                                    quizOptionInput: "",
                                    quizOptionEditIndex: -1,
                                    quizAnswer: nextAnswer,
                                  });
                                }}
                              >
                                {((topicItemDrafts[topic.id]?.quizOptionEditIndex) ?? -1) >= 0
                                  ? "Update choice"
                                  : "Add choice"}
                              </button>
                            </div>
                            <div className="quiz-options-list">
                              {((topicItemDrafts[topic.id]?.quizOptions) || []).map((option, optionIndex) => (
                                <div key={`${option}-${optionIndex}`} className="quiz-option-item">
                                  <span>{option}</span>
                                  <div className="topic-item-actions">
                                    <button
                                      className="ghost-button"
                                      type="button"
                                      onClick={() =>
                                        updateTopicDraft(topic.id, {
                                          quizOptionInput: option,
                                          quizOptionEditIndex: optionIndex,
                                        })
                                      }
                                    >
                                      Edit
                                    </button>
                                    <button
                                      className="ghost-button danger"
                                      type="button"
                                      onClick={() => {
                                        const draft = topicItemDrafts[topic.id] || createTopicItemDraft();
                                        const next = (draft.quizOptions || []).filter(
                                          (_, idx) => idx !== optionIndex
                                        );
                                        updateTopicDraft(topic.id, {
                                          quizOptions: next,
                                          quizOptionInput:
                                            draft.quizOptionEditIndex === optionIndex
                                              ? ""
                                              : draft.quizOptionInput,
                                          quizOptionEditIndex:
                                            draft.quizOptionEditIndex === optionIndex
                                              ? -1
                                              : draft.quizOptionEditIndex,
                                          quizAnswer:
                                            draft.quizAnswer === option ? "" : draft.quizAnswer,
                                        });
                                      }}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <select
                              className="class-input"
                              value={(topicItemDrafts[topic.id]?.quizAnswer) || ""}
                              onChange={(event) =>
                                updateTopicDraft(topic.id, { quizAnswer: event.target.value })
                              }
                            >
                              <option value="">Select correct answer</option>
                              {((topicItemDrafts[topic.id]?.quizOptions) || []).map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <input
                            className="class-input"
                            type="text"
                            value={(topicItemDrafts[topic.id]?.quizAnswer) || ""}
                            onChange={(event) =>
                              updateTopicDraft(topic.id, { quizAnswer: event.target.value })
                            }
                            placeholder="Expected answer"
                          />
                        )}
                      </div>
                    )}
                    {(["quiz", "practice"].includes(topicItemDrafts[topic.id]?.type || "learning")) && (
                      <label className="login-field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ whiteSpace: "nowrap" }}>Max points</span>
                        <input
                          className="class-input"
                          type="number"
                          min="0"
                          style={{ width: "80px" }}
                          value={(topicItemDrafts[topic.id]?.maxPoints) ?? ""}
                          onChange={(event) =>
                            updateTopicDraft(topic.id, { maxPoints: event.target.value === "" ? "" : Math.max(0, parseInt(event.target.value, 10) || 0) })
                          }
                        />
                      </label>
                    )}
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => handleCreateTopicItem(topic.id)}
                    >
                      Add
                    </button>
                  </div>
                )}
              </article>
            );})}
          </div>
        </div>

        {isTeacher && (
          <div className="tc-students-panel panel-animate">
            <button
              type="button"
              className="tc-students-header tc-students-toggle"
              onClick={() => setStudentsOpen(o => !o)}
            >
              <span className="tc-students-title">👩‍🎓 Students <span className="tc-students-count">{classStudents.length}</span></span>
              <div className="tc-students-header-actions">
                <button className="tc-item-btn" type="button" onClick={(e) => { e.stopPropagation(); handleRefreshStudents(); }}>Refresh</button>
                <ChevronDown size={16} className={`tc-students-chevron${studentsOpen ? " tc-students-chevron--open" : ""}`} />
              </div>
            </button>
            {studentsOpen && (
              <>
                {classStudents.length === 0 && (
                  <EmptyState icon="👩‍🎓" title="No students yet" body="Share the join code with your students." />
                )}
                <div className="tc-student-list">
                  {classStudents.map((student) => (
                    <button
                      key={student.id}
                      type="button"
                      className={`tc-student-row${student.id === selectedStudentId ? " tc-student-row--selected" : ""} panel-animate`}
                      onClick={() => handleSelectStudent(student)}
                    >
                      <span className="tc-student-avatar">
                        {student.name?.trim?.()[0]?.toUpperCase?.() || "?"}
                      </span>
                      <span className="tc-student-name">{student.name}</span>
                      <ArrowRight size={14} className="tc-student-arrow sketch-sm" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </section>
      )}
    </main>
    {chatBot}
    <PublishModal ref={publishModalRef} />
    </PageShell>
);
}
