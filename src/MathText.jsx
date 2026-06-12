// MathText — renders text that may contain KaTeX math expressions.
// Inline math: $...$   |   Display math: $$...$$
//
// Usage:
//   <MathText>{question.text}</MathText>
//   <MathText block className="qtext">{question.text}</MathText>

import { useEffect, useRef } from "react";

const DELIMITERS = [
  { left: "$$", right: "$$", display: true },
  { left: "$", right: "$", display: false },
];

function renderMath(el) {
  if (!el) return;
  if (window.renderMathInElement) {
    window.renderMathInElement(el, { delimiters: DELIMITERS, throwOnError: false });
  } else if (window._katexReady && window.katex) {
    // Fallback: manual scan for $...$ patterns (edge case on slow loads)
    window._katexReady = true;
  }
}

export default function MathText({ children, block, className, style }) {
  const ref = useRef(null);

  useEffect(() => {
    renderMath(ref.current);
  }); // no dep array — re-render on every update so new content is processed

  const Tag = block ? "div" : "span";
  return (
    <Tag ref={ref} className={className} style={style}>
      {children}
    </Tag>
  );
}
