import { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, LogOut } from 'lucide-react';
import OpenMoji from '../components/OpenMoji';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from '../contexts/RouterContext';
import { useClassContext } from '../contexts/ClassContext';
import PageShell from '../components/PageShell';
import LearningViewer from '../components/LearningViewer';
import { API_BASE, authHeaders } from '../utils/api';

export default function LearnPage({
  learningMeta, setLearningMeta, learningError,
  handleLogout,
  setToast,
  chatBot,
  onStuck,
  lessonPreview,
  onClearLessonPreview,
}) {
  const { user, isTeacher, userMenuOpen, setUserMenuOpen } = useAuth();
  const { route, pageTransition, activeClassId, navigateToClass, navigateToClasses, navigateToItem } = useRouter();
  const { activeClass, itemNavList, setMyProgressRefreshKey } = useClassContext();
  const [lessonDone, setLessonDone] = useState(false);
  const [markingDone, setMarkingDone] = useState(false);

  // Fetch actual progress for this item every time the item changes
  useEffect(() => {
    if (isTeacher || !route.itemId) return;
    let cancelled = false;
    async function checkProgress() {
      try {
        const res = await fetch(`${API_BASE}/progress/${route.itemId}`, { headers: { ...authHeaders() } });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setLessonDone(data?.data?.progress?.status === "completed");
      } catch { /* ignore */ }
    }
    checkProgress();
    return () => { cancelled = true; };
  }, [route.itemId, isTeacher]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleMarkDone() {
    if (markingDone || lessonDone || !route.itemId) return;
    setMarkingDone(true);
    try {
      const res = await fetch(`${API_BASE}/progress/${route.itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ status: "completed" }),
      });
      if (res.ok) {
        setLessonDone(true);
        setToast?.({ type: "success", message: "Lesson marked as done!" });
        // Trigger a fresh fetch of myClassProgress when student returns to class page
        setMyProgressRefreshKey(k => k + 1);
      }
    } catch { /* ignore */ } finally {
      setMarkingDone(false);
    }
  }
  const navIndex = route.itemId ? itemNavList.findIndex((i) => i.id === route.itemId) : -1;
  const navPrev = navIndex > 0 ? itemNavList[navIndex - 1] : null;
  const navNext = navIndex >= 0 && navIndex < itemNavList.length - 1 ? itemNavList[navIndex + 1] : null;

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
              <span className="tp-topbar-title">{learningMeta?.title || "Lesson"}</span>
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
          <div className="tp-content">
            {learningError && <p className="practice-error">{learningError}</p>}
            {learningMeta && (
              <LearningViewer meta={learningMeta} isTeacher={isTeacher} activeClassId={activeClassId}
                authHeaders={authHeaders} API_BASE={API_BASE}
                onSaved={(updated) => setLearningMeta(prev => ({ ...prev, ...updated }))} setToast={setToast}
                onAskAI={onStuck}
                previewItem={lessonPreview}
                onAcceptPreview={(updated) => { setLearningMeta(prev => ({ ...prev, ...updated })); onClearLessonPreview?.(); }}
                onClearPreview={onClearLessonPreview} />
            )}
          </div>
        </main>
        {chatBot}
      </PageShell>
    );
  }

  // ── Student redesign ──
  return (
    <PageShell className={`page-shell ${pageTransition}`}>
      <main className="lp-page">

        {/* Topbar */}
        <header className="lp-topbar">
          <button className="lp-back-btn" type="button" onClick={() => navigateToClass(activeClassId)}>
            <ArrowLeft size={16} className="sketch-sm" /> Back
          </button>
          <div className="lp-topbar-center">
            <OpenMoji hex="1F4DA" size={24} />
            <span className="lp-topbar-title">{learningMeta?.title || "Lesson"}</span>
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

        {/* Progress strip */}
        {navIndex >= 0 && (
          <div className="lp-nav-strip">
            <button className="lp-nav-btn" type="button" disabled={!navPrev}
              onClick={() => navigateToItem(activeClassId, navPrev)}>
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
            <button className="lp-nav-btn" type="button" disabled={!navNext}
              onClick={() => navigateToItem(activeClassId, navNext)}>
              Next <ArrowRight size={15} className="sketch-sm" />
            </button>
          </div>
        )}

        {learningError && <p className="practice-error">{learningError}</p>}

        {/* Content card */}
        <div className="lp-content-wrap">
          {learningMeta && (
            <LearningViewer meta={learningMeta} isTeacher={false} activeClassId={activeClassId}
              authHeaders={authHeaders} API_BASE={API_BASE}
              onSaved={(updated) => setLearningMeta(prev => ({ ...prev, ...updated }))} setToast={setToast}
              onExplain={onStuck} />
          )}
          {learningMeta && onStuck && (
            <button className="stuck-btn" type="button"
              onClick={() => onStuck(`I'm stuck on this lesson: "${learningMeta.title}". Can you help me understand it better?`)}>
              😕 I'm stuck — help me!
            </button>
          )}
          {learningMeta && !isTeacher && (
            <div className="lp-done-wrap">
              {lessonDone
                ? <div className="lp-done-badge">✅ Lesson complete!</div>
                : <button className="lp-done-btn" type="button" onClick={handleMarkDone} disabled={markingDone}>
                    {markingDone ? "Saving…" : "✅ I'm done reading!"}
                  </button>
              }
            </div>
          )}
        </div>

      </main>
      {chatBot}
    </PageShell>
  );
}
