import { useEffect, useRef, useState } from "react";
import { API_BASE, authHeaders } from "../utils/api";
import { stripMachineBlocks } from "../utils/parsers";

function isCodeLike(text) {
  return /^\s*(def |class |if |for |while |import |from |print\(|#)/.test(text) || text.includes("\n    ") || text.includes(":\n");
}

const ACTION_CONFIG = {
  change: {
    label: "Make changes to this",
    color: "#7C3AED",
    firstMessage: (text) => isCodeLike(text)
      ? `Please improve this Python code to make it clearer or more beginner-friendly for middle school students. Keep it simple and working:\n\n\`\`\`python\n${text}\n\`\`\`\n\nReply with ONLY the replacement Python code (no fences, no explanation).`
      : `Please improve and rewrite this lesson text to make it clearer and more engaging for middle school students:\n\n"${text}"\n\nReply with ONLY the replacement text — no explanation, no preamble.`,
  },
  different: {
    label: "Try something different",
    color: "#0D9488",
    firstMessage: (text) => isCodeLike(text)
      ? `Please suggest a completely different Python code example that demonstrates the same concept, suitable for middle school beginners:\n\n\`\`\`python\n${text}\n\`\`\`\n\nReply with ONLY the replacement Python code (no fences, no explanation).`
      : `Please suggest a completely different way to express this concept in the lesson:\n\n"${text}"\n\nReply with ONLY the replacement text — no explanation, no preamble.`,
  },
  discuss: {
    label: "Discuss this",
    color: "#2563EB",
    firstMessage: (text) => isCodeLike(text)
      ? `Let's discuss this Python code from my lesson:\n\n\`\`\`python\n${text}\n\`\`\``
      : `Let's discuss this part of my lesson. Here's the text:\n\n"${text}"`,
  },
};

export default function InlineChatWindow({
  selectedText,
  action,
  rect,          // DOMRect of the original selection
  classId,
  itemId,
  onImport,
  onClose,
}) {
  const cfg = ACTION_CONFIG[action] || ACTION_CONFIG.change;
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const didInitRef = useRef(false);

  // Position: below selection, clamped to viewport
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  const W = 380;
  const H = 440;
  const rawLeft = rect.left + rect.width / 2 - W / 2;
  const left = Math.max(12, Math.min(rawLeft, winW - W - 12));
  const top = rect.bottom + 10 + H > winH
    ? Math.max(12, rect.top - H - 10)
    : rect.bottom + 10;

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    streamMessage(cfg.firstMessage(selectedText), []);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function streamMessage(text, prevMessages) {
    const userMsg = { role: "user", content: text };
    const history = [...prevMessages, userMsg];
    setMessages(history);
    setLoading(true);

    try {
      const res = await fetch(API_BASE + "/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          context: { classId, itemId, inlineEdit: true, editAction: action },
        }),
      });
      if (!res.ok) throw new Error("Chat failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let aiContent = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.done) break;
            if (data.content) {
              aiContent += data.content;
              setMessages((prev) => {
                const u = [...prev];
                u[u.length - 1] = { role: "assistant", content: aiContent };
                return u;
              });
            }
          } catch { /* ignore partial */ }
        }
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  function handleSend() {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput("");
    streamMessage(text, messages);
  }

  return (
    <div
      className="icw"
      style={{ position: "fixed", left, top, width: W, zIndex: 3000 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="icw-header" style={{ "--icw-color": cfg.color }}>
        <div className="icw-header-info">
          <span className="icw-action-label" style={{ color: cfg.color }}>{cfg.label}</span>
          <p className="icw-selected-preview">
            "{selectedText.length > 70 ? selectedText.slice(0, 70) + "…" : selectedText}"
          </p>
        </div>
        <button className="icw-close" type="button" onClick={onClose}>✕</button>
      </div>

      {/* Messages */}
      <div className="icw-messages">
        {messages.map((m, i) => (
          <div key={i} className={`icw-msg icw-msg-${m.role}`}>
            {m.role === "assistant" && (
              <div className="icw-msg-avatar" style={{ background: cfg.color }}>AI</div>
            )}
            <div className="icw-msg-body">
              <p className="icw-msg-text">{m.role === "assistant" ? (stripMachineBlocks(m.content) || (loading && i === messages.length - 1 ? "…" : "")) : (m.content || "")}</p>
              {m.role === "assistant" && m.content && action !== "discuss" && (
                <button
                  className="icw-import-btn"
                  type="button"
                  onClick={() => { onImport(stripMachineBlocks(m.content)); onClose(); }}
                >
                  ↩ Import this
                </button>
              )}
            </div>
          </div>
        ))}
        {loading && (messages.length === 0 || messages[messages.length - 1].role === "user") && (
          <div className="icw-msg icw-msg-assistant">
            <div className="icw-msg-avatar" style={{ background: cfg.color }}>AI</div>
            <div className="icw-msg-body"><p className="icw-msg-text icw-thinking">Thinking…</p></div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="icw-input-row">
        <input
          ref={inputRef}
          className="icw-input"
          placeholder="Ask a follow-up…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
        />
        <button className="icw-send-btn" type="button" onClick={handleSend} disabled={loading || !input.trim()}
          style={{ background: cfg.color }}>
          ↑
        </button>
      </div>
    </div>
  );
}
