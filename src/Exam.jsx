import { useState, useEffect, useRef } from "react";
import { generateQuestions, gradeAttempt, exportPDF } from "./api.js";
import { recordResult } from "./storage.js";
import MathText from "./MathText.jsx";

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href    = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Exam({ unit, updateUnit, topics, notes, weak, isPro }) {
  const [phase, setPhase] = useState("setup"); // setup | running | grading | results
  const [count, setCount] = useState(4);
  const [minutes, setMinutes] = useState(30);
  const [questions, setQuestions] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [results, setResults] = useState([]);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [gradeProgress, setGradeProgress] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    if (phase !== "running") return;
    timerRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(timerRef.current);
          submitPaper();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const startExam = async () => {
    setBusy(true);
    setError("");
    try {
      const out = await generateQuestions({
        unitName: unit.name,
        notes,
        topics,
        difficulty: "medium",
        count,
        weakTopics: weak,
        examMode: true,
        subjectType: unit.subjectType || "stem",
      });
      const qs = out.questions || [];
      setQuestions(qs);
      setAttempts(qs.map(() => ""));
      setRemaining(minutes * 60);
      setPhase("running");
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const submitPaper = async () => {
    clearInterval(timerRef.current);
    setPhase("grading");
    setGradeProgress(0);
    const out = [];
    let u = unit;
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const attempt = attemptsRef.current[i];
      if (!attempt || !attempt.trim()) {
        out.push({ score: 0, maxMarks: q.marks, errorType: "incomplete", feedback: "No attempt submitted.", verdict: "incorrect" });
      } else {
        try {
          const r = await gradeAttempt({
            question: q.text,
            solution: q.solution,
            marks: q.marks,
            attempt: attempt.trim(),
          });
          out.push(r);
          u = recordResult(u, {
            topic: q.topic,
            score: r.score,
            max: r.maxMarks,
            errorType: r.errorType,
            mode: "exam",
          });
        } catch (e) {
          out.push({ score: 0, maxMarks: q.marks, errorType: "none", feedback: "Grading failed for this question: " + e.message, verdict: "incorrect" });
        }
      }
      setGradeProgress(i + 1);
    }
    updateUnit(u);
    setResults(out);
    setPhase("results");
  };

  // keep latest attempts visible to the timer-triggered submit
  const attemptsRef = useRef(attempts);
  attemptsRef.current = attempts;

  const fmt = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  if (!notes) {
    return (
      <div className="notice">
        Upload course materials first (Materials tab) — exam mode builds a timed paper from your
        actual unit content.
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <>
        <h2 className="h-display">Exam mode — {unit.name}</h2>
        <div className="booklet">
          <p className="small muted" style={{ marginTop: 0 }}>
            A timed paper across all your topics{weak.length ? ", biased toward your weak spots" : ""}.
            No solutions until you submit. The clock submits for you at zero.
          </p>
          <div className="row">
            <div>
              <label className="eyebrow" htmlFor="eq">Questions</label>
              <select id="eq" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {[3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="eyebrow" htmlFor="em">Time limit</label>
              <select id="em" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                {[15, 30, 45, 60, 90, 120].map((n) => <option key={n} value={n}>{n} min</option>)}
              </select>
            </div>
            <div style={{ flex: "0 0 auto" }}>
              <button className="btn red" onClick={startExam} disabled={busy}>
                {busy ? "Setting the paper…" : "Start exam"}
              </button>
            </div>
          </div>
          {error && <p className="error-text">{error}</p>}
        </div>
      </>
    );
  }

  if (phase === "running") {
    const total = questions.reduce((a, q) => a + q.marks, 0);
    return (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <h2 className="h-display" style={{ margin: 0 }}>
            {unit.name} — practice paper <span className="mono small muted">({total} marks)</span>
          </h2>
          <span className={"timer" + (remaining < 300 ? " low" : "")}>{fmt(remaining)}</span>
        </div>

        {questions.map((q, i) => (
          <div className="booklet" key={i}>
            <span className="qtopic">{q.topic}</span>
            <div className="qhead">
              <span className="qnum">Question {i + 1}</span>
              <span className="qmarks">({q.marks} marks)</span>
            </div>
            <MathText block className="qtext">{q.text}</MathText>
            <label className="eyebrow" htmlFor={`ex-${i}`}>Your working</label>
            <textarea
              id={`ex-${i}`}
              rows={6}
              value={attempts[i]}
              onChange={(e) => {
                const next = [...attempts];
                next[i] = e.target.value;
                setAttempts(next);
              }}
            />
          </div>
        ))}

        <button className="btn red" onClick={submitPaper}>
          Submit paper
        </button>
      </>
    );
  }

  if (phase === "grading") {
    return (
      <div className="notice">
        <span className="spin">◌</span> Marking your paper… {gradeProgress}/{questions.length}{" "}
        questions graded. Don't close the tab.
      </div>
    );
  }

  // results
  const totalScore = results.reduce((a, r) => a + r.score, 0);
  const totalMax   = results.reduce((a, r) => a + r.maxMarks, 0);
  const pct        = totalMax ? Math.round((totalScore / totalMax) * 100) : 0;
  const tone       = pct >= 70 ? "green" : pct >= 50 ? "amber" : "";

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
      setExportMsg(isPro ? "" : "Demo exported — upgrade to Pro for unlimited PDF exports.");
    } catch (e) {
      setExportMsg(e.message);
    }
    setExporting(false);
  };

  return (
    <>
      <h2 className="h-display">Results — {unit.name}</h2>
      <div className="booklet" style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <span className={`stamp ${tone}`} style={{ fontSize: 28 }}>
          {totalScore}/{totalMax}
        </span>
        <div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700 }}>{pct}%</div>
          <div className="small muted">
            {pct >= 80 ? "HD territory. Keep this up." : pct >= 70 ? "Solid distinction-level work." : pct >= 50 ? "Passing — check the examiner's notes below." : "Rough paper — the feedback below shows exactly where it went."}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="btn ghost sm"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
            onClick={handleExportPDF}
            disabled={exporting}
            title={isPro ? "Export exam paper as PDF" : "1 free demo export"}
          >
            {exporting ? <><span className="spin">◌</span> PDF…</> : <>📄 PDF{isPro ? "" : " (1 free)"}</>}
          </button>
          <button className="btn ghost" onClick={() => setPhase("setup")}>New paper</button>
        </div>
      </div>
      {exportMsg && (
        <p className="small" style={{ color: exportMsg.includes("Demo") ? "var(--amber)" : "var(--red)", marginBottom: 12 }}>
          {exportMsg}
        </p>
      )}

      {questions.map((q, i) => {
        const r = results[i];
        const t = r.verdict === "correct" ? "green" : r.verdict === "partial" ? "amber" : "";
        return (
          <div className="booklet" key={i}>
            <span className="qtopic">{q.topic}</span>
            <div className="qhead">
              <span className="qnum">Question {i + 1}</span>
              <span className={`stamp ${t}`} style={{ fontSize: 15 }}>
                {r.score}/{r.maxMarks}
              </span>
            </div>
            <MathText block className="qtext">{q.text}</MathText>
            {attempts[i] && attempts[i].trim() && (
              <div className="solution" style={{ borderTop: "none", paddingTop: 0 }}>
                <span className="label">Your working</span>
                {attempts[i]}
              </div>
            )}
            <div className={`marking ${t}`}>
              <span className="who">
                Examiner's note{r.errorType !== "none" ? ` · ${r.errorType} error` : ""}
              </span>
              {r.feedback}
            </div>
            <div className="solution">
              <span className="label">Model solution</span>
              <MathText block>{q.solution}</MathText>
            </div>
          </div>
        );
      })}
    </>
  );
}
