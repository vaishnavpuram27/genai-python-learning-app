import { useEffect, useState } from "react";

const CONFETTI_EMOJIS = ["🎉", "⭐", "🌟", "✨", "🏆", "🎊", "💫", "🚀", "🎯", "💥"];
const COUNT = 18;

function randomBetween(a, b) { return a + Math.random() * (b - a); }

function makeParticle(i) {
  return {
    id: i,
    emoji: CONFETTI_EMOJIS[i % CONFETTI_EMOJIS.length],
    left: randomBetween(5, 95),
    delay: randomBetween(0, 0.5),
    duration: randomBetween(1.0, 1.8),
    size: randomBetween(20, 36),
    rotate: randomBetween(-40, 40),
  };
}

const MESSAGES_CORRECT = [
  { headline: "Nailed it! 🎯", sub: "That's exactly right — you're on fire!" },
  { headline: "Correct! ⭐", sub: "Amazing work — keep that momentum going!" },
  { headline: "You got it! 🚀", sub: "Perfect answer! You really understand this." },
  { headline: "Brilliant! 🌟", sub: "That's 100% correct — you're crushing it!" },
];

const MESSAGES_DONE = [
  { headline: "All done! 🎉", sub: "You completed this item — great effort!" },
  { headline: "Submitted! ✅", sub: "Your answer is in — awesome job!" },
];

export default function Celebration({ type = "correct", onClose }) {
  const [particles] = useState(() => Array.from({ length: COUNT }, (_, i) => makeParticle(i)));
  const msg = type === "correct"
    ? MESSAGES_CORRECT[Math.floor(Math.random() * MESSAGES_CORRECT.length)]
    : MESSAGES_DONE[Math.floor(Math.random() * MESSAGES_DONE.length)];

  useEffect(() => {
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="celeb-overlay" onClick={onClose}>
      <div className="celeb-particles">
        {particles.map(p => (
          <span key={p.id} className="celeb-particle" style={{
            left: `${p.left}%`,
            fontSize: p.size,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            "--rotate": `${p.rotate}deg`,
          }}>{p.emoji}</span>
        ))}
      </div>
      <div className="celeb-card" onClick={e => e.stopPropagation()}>
        <p className="celeb-headline">{msg.headline}</p>
        <p className="celeb-sub">{msg.sub}</p>
        <button className="celeb-btn" type="button" onClick={onClose}>Continue →</button>
      </div>
    </div>
  );
}
