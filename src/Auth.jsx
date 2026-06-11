import { useState } from "react";
import { supabase } from "./supabase.js";

export default function Auth() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    if (!email.trim() || !password || busy) return;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        setMsg("Account created. If your project requires email confirmation, check your inbox — then sign in.");
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
    <div style={{ maxWidth: 880, margin: "60px auto", padding: "0 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, alignItems: "center" }}>
      <div>
        <h1 className="wordmark" style={{ fontSize: 38 }}>
          Cram<span className="red">Forge</span>
        </h1>
        <p className="tagline" style={{ marginBottom: 18 }}>Unlimited exam practice</p>
        <p style={{ fontSize: 16, lineHeight: 1.7, color: "var(--ink-soft)" }}>
          Upload your lecture notes and past papers. Get unlimited exam-style questions with full
          worked solutions, marked with partial credit like a real examiner — and a tracker that
          finds the topics that keep tripping you up.
        </p>
        <p className="mono small" style={{ color: "var(--pencil)" }}>
          Free: 5 question sets a day · Pro: unlimited
        </p>
      </div>

      <div className="booklet" style={{ marginBottom: 0 }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>
          {mode === "signin" ? "Sign in" : "Create your account"}
        </div>
        <label className="eyebrow" htmlFor="email">Email</label>
        <input
          id="email"
          type="text"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@student.monash.edu"
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
      </div>

      <style>{`@media (max-width: 760px) { .shell-auth { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
