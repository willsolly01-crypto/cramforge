import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import { generateAnon } from "./api.js";

// Static demo shown before the user does anything — real product feel, zero API call
function DemoCard() {
  const [showSolution, setShowSolution] = useState(false);
  const [showMarking, setShowMarking] = useState(false);
  return (
    <div style={{ marginBottom: 28 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>
        Example — generated from lecture notes
      </div>
      <div className="booklet" style={{ marginBottom: 10 }}>
        <span className="qtopic">Differential Calculus</span>
        <div className="qhead">
          <span className="qnum">Question 1</span>
          <span className="qmarks">(6 marks)</span>
        </div>
        <p className="qtext">
          Find the stationary points of f(x) = x³ − 3x² + 4 and classify each as a local maximum, local minimum, or point of inflection.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <button className="btn ghost sm" onClick={() => setShowMarking(!showMarking)}>
            {showMarking ? "Hide marking" : "See AI marking"}
          </button>
          <button className="btn ghost sm" onClick={() => setShowSolution(!showSolution)}>
            {showSolution ? "Hide solution" : "See worked solution"}
          </button>
        </div>
        {showMarking && (
          <div style={{ marginTop: 14, display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
            <span className="stamp amber">4/6</span>
            <div className="marking amber" style={{ flex: 1, minWidth: 220, marginTop: 0 }}>
              <span className="who">Examiner's note · concept error</span>
              Correct differentiation and roots (x = 0, x = 2). Classification error — you need f″(x) to classify: f″(0) = −6 &lt; 0 → local max; f″(2) = 6 &gt; 0 → local min. Stating both are minima costs 2 marks.
            </div>
          </div>
        )}
        {showSolution && (
          <div className="solution">
            <span className="label">Model solution</span>
            {`f'(x) = 3x² − 6x = 3x(x − 2) = 0  →  x = 0, x = 2\n\nf''(x) = 6x − 6\nf''(0) = −6 < 0  →  local maximum at (0, 4)\nf''(2) = 6 > 0   →  local minimum at (2, 0)`}
          </div>
        )}
      </div>
      <p className="mono small" style={{ color: "var(--pencil)", marginTop: 4 }}>
        Generated in ~8 seconds from 3 pages of lecture notes.
      </p>
    </div>
  );
}

// Anonymous single-question trial — user pastes their own notes
function AnonTrial({ onSignupPrompt }) {
  const [notes, setNotes] = useState("");
  const [question, setQuestion] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const alreadyTried = localStorage.getItem("cf_tried");

  const run = async () => {
    if (!notes.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const out = await generateAnon({ notes: notes.trim(), difficulty: "medium" });
      setQuestion(out.questions?.[0] || null);
      localStorage.setItem("cf_tried", "1");
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  if (alreadyTried && !question) {
    return (
      <div className="notice" style={{ marginBottom: 24, textAlign: "center" }}>
        <p style={{ margin: "0 0 10px", fontWeight: 500 }}>You've used your free preview.</p>
        <p className="small muted" style={{ margin: "0 0 14px" }}>Sign up free to save progress, track weak topics, and get 5 question sets a day.</p>
        <button className="btn" onClick={onSignupPrompt}>Create free account →</button>
      </div>
    );
  }

  if (question) {
    return (
      <div style={{ marginBottom: 28 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Your question — from your notes</div>
        <div className="booklet">
          <span className="qtopic">{question.topic}</span>
          <div className="qhead">
            <span className="qnum">Question 1</span>
            <span className="qmarks">({question.marks} marks)</span>
          </div>
          <p className="qtext">{question.text}</p>
          <div className="solution" style={{ marginTop: 14 }}>
            <span className="label">Worked solution</span>
            {question.solution}
          </div>
        </div>
        <div style={{ background: "var(--green-soft)", border: "1.5px solid var(--green)", borderRadius: 8, padding: "16px 18px", marginTop: 12 }}>
          <p style={{ margin: "0 0 10px", fontWeight: 600, color: "var(--green)" }}>
            Sign up free to keep going
          </p>
          <p className="small muted" style={{ margin: "0 0 14px" }}>
            Save this unit, get 5 question sets a day, track which topics you keep getting wrong, and unlock timed exam mode.
          </p>
          <button className="btn" style={{ background: "var(--green)", borderColor: "var(--green)" }} onClick={onSignupPrompt}>
            Create free account →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>Try it — paste your notes</div>
      <p className="small muted" style={{ marginBottom: 10 }}>
        Paste a few paragraphs from your lecture notes or a past paper. No account needed.
      </p>
      <textarea
        rows={5}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Paste your lecture notes, a topic summary, or a past exam question…"
      />
      {error && <p className="error-text">{error}</p>}
      <button
        className="btn"
        style={{ marginTop: 10, width: "100%" }}
        onClick={run}
        disabled={busy || !notes.trim()}
      >
        {busy ? <><span className="spin">◌</span> Writing question…</> : "Generate a question from my notes →"}
      </button>
      <p className="mono small" style={{ color: "var(--pencil)", marginTop: 6, textAlign: "center" }}>
        One free preview · No signup
      </p>
    </div>
  );
}

export default function Auth() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  // Capture referral code from URL and persist it
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) localStorage.setItem("cf_ref", ref);
  }, []);

  // OAuth sign-in — passes referral code through state so it survives the redirect
  const signInWith = async (provider) => {
    const ref = localStorage.getItem("cf_ref");
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
        queryParams: ref ? { referred_by: ref } : {},
      },
    });
  };

  const submit = async () => {
    if (!email.trim() || !password || busy) return;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      if (mode === "signup") {
        const ref = localStorage.getItem("cf_ref");
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: ref ? { referred_by: ref } : {},
          },
        });
        if (error) throw error;
        setMsg("Account created — check your inbox to confirm your email, then sign in.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
    } catch (e) {
      setError(e.message || "Something went wrong.");
    }
    setBusy(false);
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "48px 20px 80px" }}>
      {/* Hero */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <h1 className="wordmark" style={{ fontSize: 44, display: "inline-block", marginBottom: 8 }}>
          Cram<span className="red">Forge</span>
        </h1>
        <p style={{ fontSize: 18, color: "var(--ink-soft)", margin: "0 0 8px" }}>
          Upload your lecture notes. Get unlimited exam-style questions with worked solutions and AI marking.
        </p>
        <p className="mono small" style={{ color: "var(--pencil)" }}>
          Free · No credit card · Works for any uni subject
        </p>
      </div>

      {/* Two-column: demo/trial left, auth right */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, alignItems: "start" }} className="auth-grid">
        {/* Left col */}
        <div>
          <DemoCard />
          <AnonTrial onSignupPrompt={() => setMode("signup")} />
        </div>

        {/* Right col — sign-in / sign-up form */}
        <div>
          <div className="booklet" style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 14 }}>
              {mode === "signin" ? "Sign in" : "Create your free account"}
            </div>
            <label className="eyebrow" htmlFor="email">Email</label>
            <input
              id="email"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@uni.edu.au"
              autoComplete="email"
            />
            <label className="eyebrow" htmlFor="pw" style={{ marginTop: 12 }}>Password</label>
            <input
              id="pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
            <button className="btn" style={{ width: "100%", marginTop: 16 }} onClick={submit} disabled={busy}>
              {busy ? "Working…" : mode === "signin" ? "Sign in" : "Sign up free"}
            </button>
            <button
              className="btn ghost sm"
              style={{ width: "100%", marginTop: 8 }}
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setMsg(""); }}
            >
              {mode === "signin" ? "New here? Create an account" : "Have an account? Sign in"}
            </button>
            {msg && <p className="small" style={{ color: "var(--green)", marginTop: 10 }}>{msg}</p>}
            {error && <p className="error-text">{error}</p>}

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0" }}>
              <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
              <span className="eyebrow">or</span>
              <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
            </div>

            {/* OAuth buttons */}
            <button
              className="btn ghost"
              style={{ width: "100%", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
              onClick={() => signInWith("google")}
            >
              <svg width="18" height="18" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z" fill="#4285F4"/>
                <path d="M6.3 14.7l7 5.1C15 16.1 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 16.3 2 9.7 7.4 6.3 14.7z" fill="#EA4335"/>
                <path d="M24 46c5.5 0 10.4-1.9 14.3-5l-6.6-5.4C29.8 37.5 27 38.5 24 38.5c-6.1 0-10.7-3.2-11.8-7.5l-7 5.4C8.1 42.2 15.5 46 24 46z" fill="#34A853"/>
                <path d="M44.5 20H24v8.5h11.8c-.9 2.6-2.5 4.8-4.7 6.3l6.6 5.4c3.9-3.6 6.3-8.9 6.3-15.2 0-1.3-.2-2.7-.5-4z" fill="#FBBC05"/>
              </svg>
              Continue with Google
            </button>
          </div>

          {/* Feature list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              ["Unlimited practice questions", "from your own notes — not generic textbook problems"],
              ["AI marking with partial credit", "tells you if it's a concept error, algebra slip, or arithmetic mistake"],
              ["Weak topic tracker", "biases new questions toward the topics you keep getting wrong"],
              ["Timed exam mode", "full paper simulation with the clock running"],
              ["Free: 5 question sets/day", "Pro: unlimited · $8.99/month · cancel any time"],
            ].map(([title, desc]) => (
              <div key={title} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ color: "var(--green)", fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>
                <span className="small" style={{ color: "var(--ink-soft)" }}>
                  <strong style={{ color: "var(--ink)" }}>{title}</strong> — {desc}
                </span>
              </div>
            ))}
          </div>

          {/* Legal footer */}
          <p className="mono small" style={{ color: "var(--pencil)", textAlign: "center", marginTop: 24 }}>
            <a href="/terms.html" target="_blank" rel="noopener" style={{ color: "var(--pencil)", textDecoration: "underline" }}>
              Terms &amp; Refunds
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
