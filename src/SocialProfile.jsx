import { useState, useEffect } from "react";
import { getPublicProfile } from "./api.js";

function fmtDuration(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0)          return `${h}h`;
  if (m > 0)          return `${m}m`;
  return `${secs}s`;
}

// Simple bar chart (CSS only)
function UnitBar({ name, seconds, max }) {
  const pct = max > 0 ? Math.round((seconds / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span className="small" style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{name}</span>
        <span className="mono small" style={{ color: "var(--pencil)" }}>{fmtDuration(seconds)}</span>
      </div>
      <div style={{ height: 6, background: "var(--line)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "var(--red)", borderRadius: 3, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

export default function SocialProfile({ username, onSignup }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [copied,  setCopied]  = useState(false);

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    getPublicProfile(username)
      .then((d) => {
        if (!d || d.error) {
          setError(d?.error || "Profile not found.");
        } else {
          setData(d);
        }
      })
      .catch((e) => setError(e.message || "Failed to load profile."))
      .finally(() => setLoading(false));
  }, [username]);

  const shareUrl = `${window.location.origin}?profile=${encodeURIComponent(username)}`;

  const copyLink = () => {
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 640, margin: "60px auto", textAlign: "center" }}>
        <h1 className="wordmark" style={{ fontSize: 30 }}>Cram<span className="red">Forge</span></h1>
        <p style={{ color: "var(--ink-soft)", marginTop: 12 }}>
          <span className="spin">◌</span> Loading profile…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px", textAlign: "center" }}>
        <h1 className="wordmark" style={{ fontSize: 30 }}>Cram<span className="red">Forge</span></h1>
        <p className="error-text" style={{ marginTop: 20 }}>{error}</p>
        <button className="btn" style={{ marginTop: 20 }} onClick={() => window.history.replaceState({}, "", window.location.pathname)}>
          Back to CramForge
        </button>
      </div>
    );
  }

  const { profile, stats, recentSessions } = data;
  const maxUnitSeconds = Math.max(...(stats.units || []).map((u) => u.seconds), 1);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 20px 80px" }}>
      {/* Brand header */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <h1 className="wordmark" style={{ fontSize: 28, display: "inline-block", marginBottom: 0 }}>
          Cram<span className="red">Forge</span>
        </h1>
      </div>

      {/* Profile card */}
      <div className="booklet" style={{ marginBottom: 20, textAlign: "center", padding: "28px 24px" }}>
        {/* Avatar */}
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: "var(--ink)", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--mono)", fontWeight: 700, fontSize: 26,
          margin: "0 auto 12px"
        }}>
          {(profile.displayName || profile.username || "?")[0].toUpperCase()}
        </div>

        <h2 style={{ margin: "0 0 4px", fontFamily: "var(--display)", fontSize: 22 }}>
          {profile.displayName || profile.username}
        </h2>
        <p className="mono small" style={{ color: "var(--pencil)", margin: "0 0 16px" }}>
          @{profile.username} · member since {new Date(profile.memberSince).toLocaleDateString("en-AU", { month: "long", year: "numeric" })}
        </p>

        {/* Stat row */}
        <div style={{ display: "flex", justifyContent: "center", gap: 32, flexWrap: "wrap", marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 28, fontWeight: 700, color: stats.streak > 0 ? "var(--red)" : "var(--ink)" }}>
              {stats.streak > 0 ? "🔥" : ""}{stats.streak}
            </div>
            <div className="eyebrow">Day streak</div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 28, fontWeight: 700 }}>
              {fmtDuration(stats.weekSeconds)}
            </div>
            <div className="eyebrow">This week</div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 28, fontWeight: 700 }}>
              {fmtDuration(stats.totalSeconds)}
            </div>
            <div className="eyebrow">Last 30 days</div>
          </div>
        </div>

        {/* Challenge + share */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="btn" style={{ background: "var(--red)", borderColor: "var(--red)" }} onClick={copyLink}>
            {copied ? "✓ Link copied!" : "Challenge them →"}
          </button>
          <button className="btn ghost" onClick={onSignup}>
            Track my own stats
          </button>
        </div>
      </div>

      {/* Unit breakdown */}
      {stats.units?.length > 0 && (
        <div className="booklet" style={{ marginBottom: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>Study time by subject</div>
          {stats.units.map((u) => (
            <UnitBar key={u.name} name={u.name} seconds={u.seconds} max={maxUnitSeconds} />
          ))}
        </div>
      )}

      {/* Recent sessions */}
      {recentSessions?.length > 0 && (
        <div className="booklet" style={{ marginBottom: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Recent sessions</div>
          {recentSessions.map((s, i) => (
            <div key={i} style={{
              display: "flex", gap: 12, padding: "10px 0",
              borderBottom: i < recentSessions.length - 1 ? "1px solid var(--line)" : "none",
              alignItems: "center"
            }}>
              <div style={{ fontFamily: "var(--mono)", fontWeight: 700, minWidth: 48 }}>
                {fmtDuration(s.duration_seconds)}
              </div>
              <div>
                <div className="small" style={{ fontWeight: 500 }}>{s.unit_name || "General"}</div>
                <div className="small muted">
                  {new Date(s.ended_at).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CTA */}
      <div className="booklet" style={{ background: "var(--red-soft)", border: "1.5px solid var(--red)", textAlign: "center" }}>
        <p style={{ margin: "0 0 12px", fontWeight: 600, color: "var(--red)" }}>
          Study smarter with CramForge
        </p>
        <p className="small muted" style={{ margin: "0 0 16px" }}>
          Upload your lecture notes and get unlimited exam-style questions with AI marking and tracked weak topics.
        </p>
        <button className="btn" style={{ background: "var(--red)", borderColor: "var(--red)" }} onClick={onSignup}>
          Start for free →
        </button>
      </div>
    </div>
  );
}
