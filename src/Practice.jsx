import { useState } from "react";
import { generateQuestions, gradeAttempt, shareSet, exportPDF, explainConcept } from "./api.js";
import { recordResult } from "./storage.js";
import MathText from "./MathText.jsx";

// ── Download a blob as a file ──────────────────────────────────────────────
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href    = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Individual question card ───────────────────────────────────────────────
export function QuestionCard({ q, index, onGraded, mode, isPro }) {
  const [attempt,     setAttempt]     = useState("");
  const [result,      setResult]      = useState(null);
  const [showSol,     setShowSol]     = useState(false);
  const [busy,        setBusy]        = useState(false);
  const [error,       setError]       = useState("");
  // Explain feature
  const [explaining,  setExplaining]  = useState(false);
  const [explanation, setExplanation] = useState(null);
  const [explainErr,  setExplainErr]  = useState("");

  const mark = async () => {
    if (!attempt.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await gradeAttempt({
        question: q.text,
        solution: q.solution,
        marks:    q.marks,
        attempt:  attempt.trim(),
      });
      setResult(r);
      setShowSol(true);
      onGraded && onGraded(q, r);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const explain = async () => {
    if (explaining) return;
    setExplaining(true);
    setExplainErr("");
    try {
      const { explanation: text } = await explainConcept({
        question: q.text,
        attempt:  attempt.trim(),
        solution: q.solution,
        topic:    q.topic,
      });
      setExplanation(text);
    } catch (e) {
      setExplainErr(e.message);
    }
    setExplaining(false);
  };

  const tone = result?.verdict === "correct" ? "green"
             : result?.verdict === "partial"  ? "amber" : "";

  return (
    <div className="booklet">
      <span className="qtopic">{q.topic}</span>
      <div className="qhead">
        <span className="qnum">Question {index + 1}</span>
        <span className="qmarks">({q.marks} marks)</span>
      </div>
      <MathText block className="qtext">{q.text}</MathText>

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
            <button className="btn ghost" onClick={() => setShowSol(!showSol)}>
              {showSol ? "Hide solution" : "Show solution"}
            </button>
          </div>
          {error && <p className="error-text">{error}</p>}
        </>
      )}

      {result && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
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

          {/* Explain button — shown after wrong or partial answers */}
          {result.verdict !== "correct" && !explanation && (
            <div style={{ marginTop: 14 }}>
              {isPro ? (
                <button
                  className="btn ghost sm"
                  style={{ borderColor: "var(--red)", color: "var(--red)" }}
                  onClick={explain}
                  disabled={explaining}
                >
                  {explaining
                    ? <><span className="spin">◌</span> Getting deep explanation…</>
                    : "Explain this concept →"}
                </button>
              ) : (
                <button
                  className="btn ghost sm"
                  style={{ opacity: 0.7 }}
                  onClick={() => window.dispatchEvent(new CustomEvent("cramforge:limit", {
                    detail: { message: "The Explain feature is Pro-only — upgrade for deep concept explanations after wrong answers." }
                  }))}
                >
                  🔒 Explain this concept (Pro)
                </button>
              )}
              {explainErr && <p className="error-text" style={{ marginTop: 6 }}>{explainErr}</p>}
            </div>
          )}

          {/* Explanation panel */}
          {explanation && (
            <div className="solution" style={{ marginTop: 14, background: "var(--red-soft)", borderLeft: "3px solid var(--red)" }}>
              <span className="label" style={{ color: "var(--red)" }}>Deep explanation</span>
              {explanation}
            </div>
          )}
        </div>
      )}

      {showSol && (
        <div className="solution">
          <span className="label">Model solution</span>
          <MathText block>{q.solution}</MathText>
        </div>
      )}
    </div>
  );
}

// ── Practice mode ─────────────────────────────────────────────────────────
export default function Practice({ unit, updateUnit, topics, notes, weak, isPro }) {
  const [selected,   setSelected]   = useState([]);
  const [difficulty, setDifficulty] = useState("medium");
  const [count,      setCount]      = useState(3);
  const [questions,  setQuestions]  = useState([]);
  const [busy,       setBusy]       = useState(false);
  const [error,      setError]      = useState("");
  const [shareUrl,   setShareUrl]   = useState("");
  const [sharing,    setSharing]    = useState(false);
  const [exporting,  setExporting]  = useState(false);
  const [exportMsg,  setExportMsg]  = useState("");

  const toggle = (t) =>
    setSelected((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));

  const share = async () => {
    setSharing(true);
    try {
      const { url } = await shareSet({ unitName: unit.name, questions, subjectType: unit.subjectType });
      setShareUrl(url);
      navigator.clipboard?.writeText(url).catch(() => {});
    } catch (e) {
      setError("Couldn't create share link — " + e.message);
    }
    setSharing(false);
  };

  const handleExportPDF = async () => {
    setExporting(true);
    setExportMsg("");
    try {
      const blob = await exportPDF({
        questions,
        unitName:    unit.name,
        subjectType: unit.subjectType || "stem",
      });
      const safeName = unit.name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
      downloadBlob(blob, `cramforge-${safeName}.pdf`);
      setExportMsg(isPro ? "" : "Demo PDF downloaded — upgrade to Pro for unlimited exports.");
    } catch (e) {
      setExportMsg(e.message);
    }
    setExporting(false);
  };

  const generate = async () => {
    setBusy(true);
    setError("");
    setQuestions([]);
    setShareUrl("");
    setExportMsg("");
    try {
      const out = await generateQuestions({
        unitName:    unit.name,
        notes,
        topics:      selected.length ? selected : topics,
        difficulty,
        count,
        weakTopics:  weak,
        subjectType: unit.subjectType || "stem",
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
        topic:     q.topic,
        score:     r.score,
        max:       r.maxMarks,
        errorType: r.errorType,
        mode:      "practice",
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
            <label className="eyebrow" htmlFor="diff">Difficulty</label>
            <select id="diff" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="easy">Easy — single concept</option>
              <option value="medium">Medium — multi-step</option>
              <option value="hard">Hard — exam finisher</option>
            </select>
          </div>
          <div>
            <label className="eyebrow" htmlFor="count">Questions</label>
            <select id="count" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}</option>
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

      {questions.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          {/* Share link */}
          {shareUrl ? (
            <>
              <input
                type="text"
                readOnly
                value={shareUrl}
                onClick={(e) => e.target.select()}
                style={{ fontSize: 12, fontFamily: "var(--mono)", flex: 1, minWidth: 200, color: "var(--ink-soft)" }}
              />
              <span className="mono small" style={{ color: "var(--green)" }}>✓ Link copied</span>
            </>
          ) : (
            <button className="btn ghost sm" onClick={share} disabled={sharing}>
              {sharing ? "Creating link…" : "Share this set"}
            </button>
          )}

          {/* PDF export */}
          <button
            className="btn ghost sm"
            style={{ borderColor: "var(--ink)", display: "flex", alignItems: "center", gap: 6 }}
            onClick={handleExportPDF}
            disabled={exporting}
            title={isPro ? "Export as a clean exam paper PDF" : "1 free demo export — Pro for unlimited"}
          >
            {exporting
              ? <><span className="spin">◌</span> Generating PDF…</>
              : <>📄 Export PDF{isPro ? "" : " (1 free)"}</>}
          </button>
        </div>
      )}

      {exportMsg && (
        <p className="small" style={{ color: exportMsg.includes("Demo") ? "var(--amber)" : "var(--red)", marginBottom: 12 }}>
          {exportMsg}
        </p>
      )}

      {questions.map((q, i) => (
        <QuestionCard key={i} q={q} index={i} onGraded={onGraded} mode="practice" isPro={isPro} />
      ))}
    </>
  );
}
