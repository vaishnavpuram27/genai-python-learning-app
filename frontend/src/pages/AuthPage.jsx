import { GraduationCap, BookOpen, User, Lock, Eye, EyeOff, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from '../contexts/RouterContext';
import PageShell from '../components/PageShell';

const FLOATERS = [
  { emoji: "🐍", style: { top: "8%",  left: "10%", animationDelay: "0s",    animationDuration: "6s"  } },
  { emoji: "💻", style: { top: "18%", left: "72%", animationDelay: "1.2s",  animationDuration: "7s"  } },
  { emoji: "⚡", style: { top: "40%", left: "5%",  animationDelay: "0.5s",  animationDuration: "5.5s"} },
  { emoji: "🏆", style: { top: "62%", left: "80%", animationDelay: "2s",    animationDuration: "8s"  } },
  { emoji: "🎯", style: { top: "75%", left: "20%", animationDelay: "0.8s",  animationDuration: "6.5s"} },
  { emoji: "🚀", style: { top: "30%", left: "85%", animationDelay: "1.8s",  animationDuration: "7.5s"} },
  { emoji: "🌟", style: { top: "85%", left: "60%", animationDelay: "0.3s",  animationDuration: "5s"  } },
  { emoji: "🎮", style: { top: "52%", left: "45%", animationDelay: "2.5s",  animationDuration: "9s"  } },
];

export default function AuthPage({
  authMode, setAuthMode,
  loginName, setLoginName,
  loginPassword, setLoginPassword,
  loginConfirmPassword, setLoginConfirmPassword,
  loginRole, setLoginRole,
  authError, authNotice,
  handleAuth,
}) {
  const { pageTransition } = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);

  return (
    <PageShell className={`page-shell ${pageTransition}`}>
      <main className="auth-shell">

        {/* ── Left hero panel ── */}
        <div className="auth-hero">
          {FLOATERS.map((f, i) => (
            <span key={i} className="auth-floater" style={f.style}>{f.emoji}</span>
          ))}
          <div className="auth-hero-content">
            <div className="auth-hero-badge">
              <Sparkles size={16} className="sketch-sm" />
              <span>AI-Powered Learning</span>
            </div>
            <h1 className="auth-hero-title">Python<br />Learning<br />Studio</h1>
            <p className="auth-hero-tagline">Write code. Solve puzzles.<br />Level up every day! 🚀</p>
            <div className="auth-hero-chips">
              <span className="auth-chip">🐍 Live Python editor</span>
              <span className="auth-chip">🤖 AI tutor</span>
              <span className="auth-chip">🏆 Track progress</span>
            </div>
          </div>
        </div>

        {/* ── Right form panel ── */}
        <div className="auth-form-panel">
          <form className="auth-form-card" onSubmit={handleAuth}>

            {/* Mode toggle */}
            <div className="auth-mode-toggle">
              <button type="button"
                className={`auth-mode-btn ${authMode === "login" ? "active" : ""}`}
                onClick={() => setAuthMode("login")}>
                Log in
              </button>
              <button type="button"
                className={`auth-mode-btn ${authMode === "signup" ? "active" : ""}`}
                onClick={() => setAuthMode("signup")}>
                Sign up
              </button>
            </div>

            <h2 className="auth-form-title">
              {authMode === "login" ? "Hey, welcome back! 👋" : "Join the adventure! 🎉"}
            </h2>
            <p className="auth-form-sub">
              {authMode === "login"
                ? "Great to see you again — let's keep learning!"
                : "Create your account and start coding today."}
            </p>

            {/* Name */}
            <div className="auth-field">
              <label className="auth-field-label">Your name</label>
              <div className="auth-input-wrap">
                <User size={16} className="auth-input-icon sketch-sm" />
                <input type="text" className="auth-input" value={loginName}
                  onChange={e => setLoginName(e.target.value)}
                  placeholder="e.g. Alex Kim" autoComplete="name" />
              </div>
            </div>

            {/* Password */}
            <div className="auth-field">
              <label className="auth-field-label">Password</label>
              <div className="auth-input-wrap">
                <Lock size={16} className="auth-input-icon sketch-sm" />
                <input type={showPassword ? "text" : "password"} className="auth-input"
                  value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
                  placeholder="Your secret password" autoComplete={authMode === "login" ? "current-password" : "new-password"} />
                <button type="button" className="auth-eye-btn sketch-sm" onClick={() => setShowPassword(v => !v)}>
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            {authMode === "signup" && (
              <div className="auth-field">
                <label className="auth-field-label">Confirm password</label>
                <div className="auth-input-wrap">
                  <Lock size={16} className="auth-input-icon sketch-sm" />
                  <input type={showConfirm ? "text" : "password"} className="auth-input"
                    value={loginConfirmPassword} onChange={e => setLoginConfirmPassword(e.target.value)}
                    placeholder="Same password again" autoComplete="new-password" />
                  <button type="button" className="auth-eye-btn sketch-sm" onClick={() => setShowConfirm(v => !v)}>
                    {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            )}

            {/* Role picker */}
            {authMode === "signup" && (
              <div className="auth-field">
                <label className="auth-field-label">I am a…</label>
                <div className="auth-role-grid">
                  <button type="button"
                    className={`auth-role-card ${loginRole === "student" ? "selected" : ""}`}
                    onClick={() => setLoginRole("student")}>
                    <span className="auth-role-emoji">🎒</span>
                    <span className="auth-role-label">Student</span>
                    <span className="auth-role-desc">I'm here to learn</span>
                  </button>
                  <button type="button"
                    className={`auth-role-card ${loginRole === "teacher" ? "selected" : ""}`}
                    onClick={() => setLoginRole("teacher")}>
                    <span className="auth-role-emoji">📚</span>
                    <span className="auth-role-label">Teacher</span>
                    <span className="auth-role-desc">I create lessons</span>
                  </button>
                </div>
              </div>
            )}

            {authError  && <p className="auth-error">{authError}</p>}
            {authNotice && <p className="auth-notice">{authNotice}</p>}

            <button className="auth-submit-btn" type="submit">
              {authMode === "login" ? "Let's go! 🚀" : "Create my account"}
            </button>

          </form>
        </div>

      </main>
    </PageShell>
  );
}
