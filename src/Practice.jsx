import { useState } from "react";
import { generateQuestions, gradeAttempt } from "./api.js";
import { recordResult } from "./storage.js";

export function QuestionCard({ q, index, onGraded, mode }) {
  const [attempt, setAttempt] = useState("");
  const [result, setResult] = useState(null);
  const [showSolution, setShowSolution] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const mark = async () => {
    if (!attempt.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await gradeAttempt({
        question: q.text,
        solution: q.solution,
        marks: q.marks,
        attempt: attempt.trim(),
      });
      setResult(r);
      setShowSolution(true);
      onGraded && onGraded(q, r);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const tone =
    result?.verdict === "correct" ? "green" : result?.verdict === "partial" ? "amber" : "";

  return (
    <div className="booklet">
      <span className="qtopic">{q.topic}</span>
      <div className="qhead">
        <span className="qnum">Question {index + 1}</span>
        <span className="qmarks">({q.marks} marks)</span>
      </div>
      <p className="qtext">{q.text}</p>

      {!result && (
        <>
          <label className="eyebrow" htmlFor={`a-${mode}-${index}`} style={{ marginTop: 14 }}>
            Your working
          </label>
          <textarea
            id={`a-${mode}-${index}`}
            rows={5}
            value={attempt}
            onChange={(e) => setAttempt(e.target.value)}
            placeholder="Show your steps — method marks are real. Plain text math is fine (x^2, sqrt, etc.)"
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn red" onClick={mark} disabled={busy || !attempt.trim()}>
              {busy ? "Marking…" : "Mark my attempt"}
            </button>
            <button className="btn ghost" onClick={() => setShowSolution(!showSolution)}>
              {showSolution ? "Hide solution" : "Show solution"}
            </button>
          </div>
          {error && <p className="error-text">{error}</p>}
        </>
      )}

      {result && (
        <div style={{ marginTop: 16, display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <span className={`stamp ${tone}`}>
            {result.score}/{result.maxMarks}
          </span>
          <div className={`marking ${tone}`} style={{ flex: 1, minWidth: 240, marginTop: 0 }}>
            <span className="who">
              Examiner's note{result.errorType !== "none" ? ` · ${result.errorType} error` : ""}
            </span>
            {result.feedback}
          </div>
        </div>
      )}

      {showSolution && (
        <div className="solution">
          <span className="label">Model solution</span>
          {q.solution}
        </div>
      )}
    </div>
  );
}

export default function Practice({ unit, updateUnit, topics, notes, weak }) {
  const [selected, setSelected] = useState([]);
  const [difficulty, setDifficulty] = useState("medium");
  const [count, setCount] = useState(3);
  const [questions, setQuestions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = (t) =>
    setSelected((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));

  const generate = async () => {
    setBusy(true);
    setError("");
    setQuestions([]);
    try {
      const out = await generateQuestions({
        unitName: unit.name,
        notes,
        topics: selected.length ? selected : topics,
        difficulty,
        count,
        weakTopics: weak,
      });
      setQuestions(out.questions || []);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const onGraded = (q, r) => {
    updateUnit(
      recordResult(unit, {
        topic: q.topic,
        score: r.score,
        max: r.maxMarks,
        errorType: r.errorType,
        mode: "practice",
      })
    );
  };

  if (!notes) {
    return (
      <div className="notice">
        Upload some course materials first — head to the <strong>Materials</strong> tab. Questions
        are generated from your actual content, not generic textbook problems.
      </div>
    );
  }

  return (
    <>
      <h2 className="h-display">Practice — {unit.name}</h2>

      <div className="booklet">
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Topics {selected.length ? `(${selected.length} selected)` : "(all)"}
          {weak.length > 0 && (
            <span style={{ color: "var(--red)" }}> · red outline = your weak spots</span>
          )}
        </div>
        <div className="chips" style={{ marginBottom: 18 }}>
          {topics.map((t) => (
            <button
              key={t}
              className={
                "chip" + (selected.includes(t) ? " on" : "") + (weak.includes(t) ? " weak" : "")
              }
              onClick={() => toggle(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="row">
          <div>
            <label className="eyebrow" htmlFor="diff">
              Difficulty
            </label>
            <select id="diff" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="easy">Easy — single concept</option>
              <option value="medium">Medium — multi-step</option>
              <option value="hard">Hard — exam finisher</option>
            </select>
          </div>
          <div>
            <label className="eyebrow" htmlFor="count">
              Questions
            </label>
            <select id="count" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: "0 0 auto" }}>
            <button className="btn" onClick={generate} disabled={busy}>
              {busy ? "Writing questions…" : "Generate questions"}
            </button>
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}
      </div>

      {busy && (
        <p className="mono small">
          <span className="spin">◌</span> The examiner is writing… ~30 seconds
        </p>
      )}

      {questions.map((q, i) => (
        <QuestionCard key={i} q={q} index={i} onGraded={onGraded} mode="practice" />
      ))}
    </>
  );
}
