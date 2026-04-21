import { useEffect, useRef, useState } from "react";
import InlineChatWindow from "./InlineChatWindow";

const ACTIONS = [
  { id: "change",    icon: "✏️", label: "Make changes to this" },
  { id: "different", icon: "🔄", label: "Try something different" },
  { id: "discuss",   icon: "💬", label: "Discuss this" },
];

export default function SelectionPopup({ children, onReplaceText, classId, itemId }) {
  const [popup, setPopup]     = useState(null); // { x, y, text, rect }
  const [chatCtx, setChatCtx] = useState(null); // { selectedText, action, rect }
  const containerRef = useRef(null);

  useEffect(() => {
    function onMouseUp() {
      setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString().trim();
        if (!text || text.length < 4) { setPopup(null); return; }
        if (!containerRef.current) return;
        try {
          const range = sel.getRangeAt(0);
          if (!containerRef.current.contains(range.commonAncestorContainer)) {
            setPopup(null); return;
          }
          const rect = range.getBoundingClientRect();
          setPopup({ x: rect.left + rect.width / 2, y: rect.top, text, rect });
        } catch { setPopup(null); }
      }, 10);
    }

    function onMouseDown(e) {
      if (!e.target.closest(".sel-popup") && !e.target.closest(".icw")) {
        setPopup(null);
      }
    }

    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, []);

  function handleAction(actionId) {
    if (!popup) return;
    setChatCtx({ selectedText: popup.text, action: actionId, rect: popup.rect });
    setPopup(null);
    window.getSelection()?.removeAllRanges();
  }

  function handleImport(newText) {
    if (!chatCtx) return;
    onReplaceText?.(chatCtx.selectedText, newText);
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {children}

      {/* Selection action bar */}
      {popup && !chatCtx && (
        <div
          className="sel-popup"
          style={{ position: "fixed", left: popup.x, top: popup.y, transform: "translate(-50%, calc(-100% - 10px))", zIndex: 3000 }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {ACTIONS.map((a, i) => (
            <button key={a.id} type="button" className={`sel-popup-btn${i === 0 ? " sel-popup-btn--primary" : ""}`}
              onClick={() => handleAction(a.id)}>
              <span className="sel-popup-icon">{a.icon}</span>
              {a.label}
            </button>
          ))}
          <div className="sel-popup-arrow" />
        </div>
      )}

      {/* Inline chat window */}
      {chatCtx && (
        <InlineChatWindow
          selectedText={chatCtx.selectedText}
          action={chatCtx.action}
          rect={chatCtx.rect}
          classId={classId}
          itemId={itemId}
          onImport={handleImport}
          onClose={() => setChatCtx(null)}
        />
      )}
    </div>
  );
}
