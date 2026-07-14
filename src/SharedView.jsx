import { useState, useEffect } from "react";
import { getSharedSet } from "./api.js";

function SharedQuestion({ q, index }) {
  const [showSolution, setShowSolution] = useState(false);
  return (
    <div className="booklet">
      <span className="qtopic">{q.topic}</span>
      <div className="qhead">
        <span className="qnum">Question {index + 1}</span>
        <span className="qmarks">({q.marks} marks)</span>
      </div>
      <p className="qtext">{q.text}</p>
      <button
        className="btn ghost sm"
        style={{ marginTop: 12 }}
        onClick={() => setShowSolution(!showSolution)}
      >
        {showSolution ? "Hide solution" : "Show worked solution"}
      </button>
      {showSolution && (
        <div className="solution">
          <span className="label">Model solution</span>
          {q.solution}
        </div>
      )}
    </div>
  );
}

export default function SharedView({ shareId, onSignup }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getSharedSet(shareId)
      .then((d) => {
        if (d?.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Couldn't load this question set."));
  }, [shareId]);

  if (error) {
    return (
      <div style={{ maxWidth: 680, margin: "60px auto", padding: "0 20px", textAlign: "center" }}>
        <h1 className="wordmark" style={{ fontSize: 32 }}>Cram<span className="red">Forge</span></h1>
        <p style={{ color: "var(--ink-soft)", marginTop: 24 }}>{error}</p>
        <button className="btn" style={{ marginTop: 16 }} onClick={onSignup}>Go to CramForge →</button>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ maxWidth: 680, margin: "60px auto", padding: "0 20px", textAlign: "center" }}>
        <p className="mono small"><span className="spin">◌</span> Loading question set…</p>
      </div>
    );
  }

  const questions = data.questions || [];

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px 80px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 6, flexWrap: "wrap" }}>
        <h1 className="wordmark" style={{ fontSize: 28 }}>Cram<span className="red">Forge</span></h1>
        <span className="eyebrow">shared practice set</span>
      </div>
      <h2 className="h-display" style={{ marginBottom: 4 }}>{data.unit_name}</h2>
      <p className="small muted" style={{ marginBottom: 32 }}>
        {questions.length} question{questions.length !== 1 ? "s" : ""} · {data.views || 0} views
      </p>

      {/* Questions */}
      {questions.map((q, i) => (
        <SharedQuestion key={i} q={q} index={i} />
      ))}

      {/* CTA */}
      <div style={{
        background: "var(--paper)",
        border: "2px solid var(--ink)",
        borderRadius: 10,
        padding: "28px 26px",
        marginTop: 32,
        textAlign: "center",
        boxShadow: "4px 4px 0 rgba(26,34,56,.1)"
      }}>
        <h3 style={{ fontFamily: "var(--display)", fontSize: 22, fontWeight: 700, margin: "0 0 10px" }}>
          Practise with your own notes
        </h3>
        <p className="small" style={{ color: "var(--ink-soft)", margin: "0 0 18px", lineHeight: 1.6 }}>
          Upload your lecture notes and get unlimited exam-style questions — then have your working marked with partial credit, just like a real exam. Free.
        </p>
        <button className="btn" style={{ marginRight: 10 }} onClick={onSignup}>
          Try CramForge free →
        </button>
      </div>
    </div>
  );
}
