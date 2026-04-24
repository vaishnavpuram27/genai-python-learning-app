import { useEffect, useRef, useState } from "react";

export default function StudentExplainPopup({ children, onExplain }) {
  const [popup, setPopup] = useState(null); // { x, y, text }
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
          setPopup({ x: rect.left + rect.width / 2, y: rect.top, text });
        } catch { setPopup(null); }
      }, 10);
    }

    function onMouseDown(e) {
      if (!e.target.closest(".stu-explain-popup")) setPopup(null);
    }

    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, []);

  function handleExplain() {
    if (!popup) return;
    onExplain?.(`Can you explain this to me in simple terms: "${popup.text}"`);
    setPopup(null);
    window.getSelection()?.removeAllRanges();
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {children}

      {popup && (
        <div
          className="stu-explain-popup"
          style={{ position: "fixed", left: popup.x, top: popup.y, transform: "translate(-50%, calc(-100% - 10px))", zIndex: 3000 }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button type="button" className="stu-explain-btn" onClick={handleExplain}>
            💡 Explain this
          </button>
          <div className="stu-explain-arrow" />
        </div>
      )}
    </div>
  );
}
