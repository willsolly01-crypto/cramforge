// src/OnboardingTour.jsx — first-visit walkthrough.
// Shows once (localStorage flag), walks new users through the social side first,
// then points them at Materials to upload their notes.

import { useState } from "react";

const FLAG = "cramforge-onboarded-v1";

export function shouldShowOnboarding() {
  try {
    return !localStorage.getItem(FLAG);
  } catch {
    return false;
  }
}

const STEPS = [
  {
    icon: "👋",
    title: "Welcome to CramForge",
    body: "Upload your lecture notes and get unlimited exam-style questions, marked like a real exam. But first — the part nobody else has:",
    cta: null,
  },
  {
    icon: "📸",
    title: "Study with your mates",
    body: "The Feed is BeReal for studying. Snap a photo mid-session, tag the unit and your minutes, and it shows up for your friends. Add friends by username — guilt-tripping each other into revision is the whole point.",
    cta: { label: "I'll check the Feed later", tab: "feed", go: "Take me to the Feed" },
  },
  {
    icon: "🏆",
    title: "Compete on the leaderboard",
    body: "The Study Timer tracks your sessions and ranks you against everyone on study hours this week. Quick Study gives you XP with combo multipliers. Set your username in Account so you appear on the board.",
    cta: { label: "Next", tab: "study", go: "Show me the leaderboard" },
  },
  {
    icon: "📝",
    title: "Now feed it your notes",
    body: "Upload lecture slides, summaries, or past papers in Materials. Everything — questions, Quick Study, your weak-topic tracking — runs off your own content. The more you upload, the sharper it gets.",
    cta: { label: "Done", tab: "materials", go: "Upload my notes" },
  },
];

export default function OnboardingTour({ onNavigate, onDone }) {
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  const finish = (tab) => {
    try {
      localStorage.setItem(FLAG, "1");
    } catch {}
    if (tab && onNavigate) onNavigate(tab);
    onDone && onDone();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome tour"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26,34,56,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div className="booklet" style={{ maxWidth: 460, width: "100%", marginBottom: 0 }}>
        <div style={{ fontSize: 44, lineHeight: 1 }}>{s.icon}</div>
        <h3 style={{ fontFamily: "var(--display)", fontSize: 26, margin: "10px 0 8px" }}>
          {s.title}
        </h3>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--ink-soft)", margin: 0 }}>
          {s.body}
        </p>

        {/* progress dots */}
        <div style={{ display: "flex", gap: 6, margin: "18px 0" }}>
          {STEPS.map((_, i) => (
            <span
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: 99,
                background: i === step ? "var(--red)" : "var(--line)",
              }}
            />
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {s.cta && s.cta.go && (
            <button className="btn red" onClick={() => finish(s.cta.tab)}>
              {s.cta.go}
            </button>
          )}
          {!last ? (
            <button className="btn ghost" onClick={() => setStep(step + 1)}>
              {step === 0 ? "Show me" : "Next"}
            </button>
          ) : (
            <button className="btn" onClick={() => finish("materials")}>
              Upload my notes
            </button>
          )}
          <button
            className="btn sm ghost"
            style={{ marginLeft: "auto", border: "none", color: "var(--pencil)" }}
            onClick={() => finish(null)}
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
