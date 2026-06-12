// QuickStudy.jsx — Short-form "5 quick questions" mode
// Full-screen dark UI inspired by TikTok/Reels: tap to answer, instant feedback,
// combo multiplier, XP floats, share your score.

import { useState, useEffect, useRef } from "react";
import { quickGenerate, saveStudySession } from "./api.js";

// ── XP maths ──────────────────────────────────────────────────────────────
const BASE_XP = 10;
function calcXP(comboBeforeThisAnswer) {
  if (comboBeforeThisAnswer >= 4) return Math.round(BASE_XP * 2.5);
  if (comboBeforeThisAnswer >= 3) return Math.round(BASE_XP * 2.0);
  if (comboBeforeThisAnswer >= 2) return Math.round(BASE_XP * 1.5);
  return BASE_XP;
}

// ── Share score ────────────────────────────────────────────────────────────
function doShare({ score, total, xp, bestCombo, unitName }) {
  const emoji = score === total ? "🔥" : score >= total * 0.6 ? "⚡" : "📚";
  const text =
    `${emoji} ${score}/${total} on CramForge Quick Study` +
    (unitName && unitName !== "Mixed units" ? ` — ${unitName}` : "") +
    `\n⚡ ${xp} XP` +
    (bestCombo >= 2 ? ` · 🔥 ${bestCombo} combo` : "") +
    `\ncramforge.app`;

  if (navigator.share) {
    navigator.share({ text, url: "https://cramforge.app" }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(text).catch(() => {});
  }
}

// ── Floating XP animation ──────────────────────────────────────────────────
function XPFloat({ amount, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 850);
    return () => clearTimeout(t);
  }, [onDone]);
  return <div className="qs-xp-float">+{amount}⚡</div>;
}

// ── Progress pips ──────────────────────────────────────────────────────────
function ProgressPips({ current, total }) {
  return (
    <div className="qs-pips">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`qs-pip ${i < current ? "done" : i === current ? "active" : ""}`}
        />
      ))}
    </div>
  );
}

// ── Single answer option ──────────────────────────────────────────────────
function Option({ letter, text, state, onClick }) {
  return (
    <button
      className={`qs-option qs-option--${state}`}
      onClick={state === "idle" ? onClick : undefined}
      disabled={state !== "idle"}
      aria-pressed={state === "correct" || state === "wrong"}
    >
      <span className="qs-option-letter">{letter}</span>
      <span className="qs-option-text">{text}</span>
      {state === "correct" && <span className="qs-option-tick">✓</span>}
      {state === "wrong"   && <span className="qs-option-tick">✗</span>}
    </button>
  );
}

// ── Question card ─────────────────────────────────────────────────────────
function QuestionCard({ q, qIndex, total, combo, onAnswer }) {
  const [chosen,   setChosen]   = useState(null);
  const [revealed, setRevealed] = useState(false);
  const letters = ["A", "B", "C", "D"];

  const pick = (idx) => {
    if (chosen !== null) return;
    setChosen(idx);
    const correct = idx === q.correctIndex;
    // Brief pause then show explanation + correct answer
    setTimeout(() => setRevealed(true), 80);
    onAnswer(idx, correct);
  };

  const optState = (idx) => {
    if (chosen === null) return "idle";
    if (idx === q.correctIndex) return "correct";
    if (idx === chosen)         return "wrong";
    return "dimmed";
  };

  return (
    <div className="qs-card" key={qIndex}>
      {/* HUD row */}
      <div className="qs-hud">
        <ProgressPips current={qIndex} total={total} />
        {combo >= 2 && (
          <div className="qs-combo">🔥{combo}</div>
        )}
      </div>

      {/* Topic tag */}
      <div className="qs-topic">{q.topic}</div>

      {/* Question text */}
      <div className="qs-question-wrap">
        <p className="qs-question-text">{q.text}</p>
      </div>

      {/* Explanation (revealed after answering) */}
      {revealed && (
        <div className={`qs-explanation ${chosen === q.correctIndex ? "qs-explanation--correct" : "qs-explanation--wrong"}`}>
          {chosen === q.correctIndex
            ? `✓ ${q.explanation}`
            : `✗ The answer was ${letters[q.correctIndex]}. ${q.explanation}`}
        </div>
      )}

      {/* Options grid */}
      <div className="qs-options">
        {q.options.map((opt, i) => (
          <Option
            key={i}
            letter={letters[i]}
            text={opt}
            state={optState(i)}
            onClick={() => pick(i)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Unit selector screen ──────────────────────────────────────────────────
function SelectScreen({ units, onSelect, loading, error }) {
  const list = Object.values(units);
  return (
    <div className="qs-select">
      <div className="qs-select-hero">
        <p className="qs-select-eyebrow">Quick Study</p>
        <h1 className="qs-select-headline">
          5 questions.<br />Right now.
        </h1>
        <p className="qs-select-sub">
          Pick a unit and go. Results in under 2 minutes.
        </p>
      </div>

      <div className="qs-unit-list">
        {list.map((u) => (
          <button
            key={u.id}
            className="qs-unit-btn"
            onClick={() => !loading && onSelect(u.id)}
            disabled={loading}
          >
            <span className="qs-unit-name">{u.name}</span>
            <span className="qs-unit-arrow">→</span>
          </button>
        ))}
        {list.length > 1 && (
          <button
            className="qs-unit-btn qs-unit-btn--all"
            onClick={() => !loading && onSelect("all")}
            disabled={loading}
          >
            <span className="qs-unit-name">✦ Mix all units</span>
            <span className="qs-unit-arrow">→</span>
          </button>
        )}
      </div>

      {loading && (
        <p className="qs-loading-msg"><span className="spin">◌</span> Generating questions…</p>
      )}
      {error && (
        <p className="qs-error">{error}</p>
      )}

      {/* Social proof nudge */}
      <div className="qs-nudge">
        <span>⚡</span>
        <span>Answer 5 correct in a row for a 2.5× XP bonus</span>
      </div>
    </div>
  );
}

// ── Results screen ────────────────────────────────────────────────────────
function ResultsScreen({ score, total, xp, bestCombo, unitName, onAgain, onBack }) {
  const [shared, setShared] = useState(false);
  const pct = total ? Math.round((score / total) * 100) : 0;

  const grade =
    pct === 100 ? { msg: "Perfect! 🔥", color: "#2dd4a0" }
    : pct >= 80  ? { msg: "Excellent",    color: "#2dd4a0" }
    : pct >= 60  ? { msg: "Good work",    color: "#ffe45c" }
    : pct >= 40  ? { msg: "Keep going",   color: "#ff9f43" }
    :               { msg: "Try again",   color: "#ff4d6a" };

  const handleShare = () => {
    doShare({ score, total, xp, bestCombo, unitName });
    setShared(true);
    setTimeout(() => setShared(false), 2200);
  };

  return (
    <div className="qs-results">
      {/* Score hero */}
      <div className="qs-results-hero">
        <p className="qs-results-unit">{unitName}</p>
        <div className="qs-results-score" style={{ color: grade.color }}>
          {score}<span className="qs-results-denom">/{total}</span>
        </div>
        <p className="qs-results-grade" style={{ color: grade.color }}>{grade.msg}</p>

        {/* Stats */}
        <div className="qs-results-stats">
          <div className="qs-results-stat">
            <span className="qs-results-stat-val" style={{ color: "#ffe45c" }}>⚡{xp}</span>
            <span className="qs-results-stat-label">XP earned</span>
          </div>
          {bestCombo >= 2 && (
            <div className="qs-results-stat">
              <span className="qs-results-stat-val" style={{ color: "#ff9f43" }}>🔥{bestCombo}</span>
              <span className="qs-results-stat-label">best combo</span>
            </div>
          )}
          <div className="qs-results-stat">
            <span className="qs-results-stat-val">{pct}%</span>
            <span className="qs-results-stat-label">accuracy</span>
          </div>
        </div>
      </div>

      {/* CTAs */}
      <div className="qs-cta-stack">
        <button className="qs-cta qs-cta--primary" onClick={onAgain}>
          5 more →
        </button>
        <button
          className="qs-cta qs-cta--share"
          onClick={handleShare}
        >
          {shared
            ? (navigator.share ? "✓ Shared!" : "✓ Copied!")
            : "Share score"}
        </button>
        <button className="qs-cta qs-cta--ghost" onClick={onBack}>
          Back to CramForge
        </button>
      </div>

      {/* Deepen nudge */}
      <p className="qs-deepen-nudge">
        Want harder questions?<br />
        Try <strong>Exam mode</strong> for a full timed paper.
      </p>
    </div>
  );
}

// ── Main QuickStudy component ─────────────────────────────────────────────
export default function QuickStudy({ units, onBack }) {
  const [phase,     setPhase]     = useState("select");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [questions, setQuestions] = useState([]);
  const [current,   setCurrent]   = useState(0);
  const [answers,   setAnswers]   = useState([]);   // [{chosen, correct}]
  const [xp,        setXp]        = useState(0);
  const [combo,     setCombo]     = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [xpPop,     setXpPop]     = useState(null); // amount to show, or null
  const [unitName,  setUnitName]  = useState("");
  const [startedAt, setStartedAt] = useState(null);

  // Stable refs so async callbacks always see latest values
  const comboRef    = useRef(0);
  const currentRef  = useRef(0);
  const unitIdRef   = useRef(null);

  const unitList = Object.values(units || {});

  // ── Gather notes for a unit selection ──────────────────────────────────
  const buildPayload = (unitId) => {
    if (unitId === "all") {
      const notes  = unitList.map((u) =>
        (u.materials || []).map((m) => m.content || "").join("\n")
      ).join("\n\n").slice(0, 5000);
      const topics = [...new Set(unitList.flatMap((u) => u.topics || []))].slice(0, 10);
      return { notes, unitName: "Mixed units", topics };
    }
    const u      = units[unitId];
    const notes  = (u.materials || []).map((m) => m.content || "").join("\n").slice(0, 5000);
    const topics = (u.topics || []).slice(0, 10);
    return { notes, unitName: u.name, topics };
  };

  // ── Start a session ──────────────────────────────────────────────────────
  const startSession = async (unitId) => {
    setLoading(true);
    setError("");
    unitIdRef.current = unitId;

    const { notes, unitName: name, topics } = buildPayload(unitId);
    setUnitName(name);

    try {
      const data = await quickGenerate({ notes, unitName: name, topics });
      setQuestions(data.questions);
      setAnswers([]);
      setCurrent(0);
      currentRef.current = 0;
      setXp(0);
      setCombo(0);
      comboRef.current = 0;
      setBestCombo(0);
      setStartedAt(new Date().toISOString());
      setPhase("playing");
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  // ── Handle an answer ──────────────────────────────────────────────────────
  const handleAnswer = (chosenIdx, correct) => {
    const prevCombo  = comboRef.current;
    const newCombo   = correct ? prevCombo + 1 : 0;
    comboRef.current = newCombo;

    const xpEarned = correct ? calcXP(prevCombo) : 0;

    setAnswers((prev) => [...prev, { chosen: chosenIdx, correct }]);
    setCombo(newCombo);
    setBestCombo((bc) => Math.max(bc, newCombo));
    if (correct) {
      setXp((x) => x + xpEarned);
      setXpPop(xpEarned);
    }

    // Auto-advance after 1.7 s
    setTimeout(() => {
      const next = currentRef.current + 1;
      if (next >= questions.length) {
        setPhase("results");
        // Save session stats
        const durationMs = startedAt ? Date.now() - new Date(startedAt).getTime() : 0;
        const durationSec = Math.max(30, Math.round(durationMs / 1000));
        saveStudySession({
          unitName:    unitName,
          durationSeconds: durationSec,
          startedAt:   startedAt || new Date().toISOString(),
          endedAt:     new Date().toISOString(),
          mode:        "quick",
          xpEarned:    xp + xpEarned,
          correct:     answers.filter((a) => a.correct).length + (correct ? 1 : 0),
          total:       questions.length,
        }).catch(() => {});
      } else {
        currentRef.current = next;
        setCurrent(next);
      }
    }, 1700);
  };

  // ── No units → prompt to add one ──────────────────────────────────────
  if (!unitList.length) {
    return (
      <div className="qs-shell">
        <div className="qs-header">
          <button className="qs-back" onClick={onBack}>←</button>
          <span className="qs-brand">Cram<span>Forge</span></span>
          <span />
        </div>
        <div className="qs-select" style={{ textAlign: "center" }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>📚</p>
          <p style={{ color: "rgba(255,255,255,0.55)", marginBottom: 20 }}>
            Add a unit and upload some notes first — Quick Study reads from your materials.
          </p>
          <button className="qs-cta qs-cta--ghost" onClick={onBack}>
            ← Go back and add a unit
          </button>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="qs-shell">
      {/* Persistent header */}
      <div className="qs-header">
        <button className="qs-back" onClick={onBack} title="Back">←</button>
        <span className="qs-brand">Cram<span>Forge</span></span>
        {xp > 0
          ? <span className="qs-xp-badge">⚡{xp}</span>
          : <span />
        }
      </div>

      {/* Phase: select unit */}
      {phase === "select" && (
        <SelectScreen
          units={units}
          onSelect={startSession}
          loading={loading}
          error={error}
        />
      )}

      {/* Phase: playing */}
      {phase === "playing" && questions.length > 0 && (
        <div className="qs-play">
          <QuestionCard
            key={current}
            q={questions[current]}
            qIndex={current}
            total={questions.length}
            combo={combo}
            onAnswer={handleAnswer}
          />

          {/* Floating XP */}
          {xpPop !== null && (
            <XPFloat amount={xpPop} onDone={() => setXpPop(null)} />
          )}
        </div>
      )}

      {/* Phase: results */}
      {phase === "results" && (
        <ResultsScreen
          score={answers.filter((a) => a.correct).length}
          total={questions.length}
          xp={xp}
          bestCombo={bestCombo}
          unitName={unitName}
          onAgain={() => startSession(unitIdRef.current)}
          onBack={onBack}
        />
      )}
    </div>
  );
}
