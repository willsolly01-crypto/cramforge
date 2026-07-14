import { useState, useEffect, useRef } from "react";
import { saveStudySession, loadStudySessions, getLeaderboard } from "./api.js";

function fmtTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function fmtDuration(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0)          return `${h}h`;
  if (m > 0)          return `${m}m`;
  return `${secs}s`;
}

function fmtDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

// Circular timer display
function TimerRing({ elapsed, running }) {
  const size = 160;
  const r    = 66;
  const circ = 2 * Math.PI * r;
  // Pulse every 60s if running
  const pulse = running && elapsed % 60 === 0 && elapsed > 0;

  return (
    <div style={{
      position: "relative", width: size, height: size, margin: "0 auto",
      filter: running ? "drop-shadow(0 0 12px rgba(215,38,61,0.25))" : "none",
      transition: "filter 0.4s"
    }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
        <circle
          cx={size/2} cy={size/2} r={r}
          fill="none"
          stroke={running ? "var(--red)" : "var(--pencil)"}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ - (circ * ((elapsed % 3600) / 3600))}
          style={{ transition: "stroke-dashoffset 0.8s linear, stroke 0.3s" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center"
      }}>
        <span style={{
          fontFamily: "var(--mono)", fontSize: 30, fontWeight: 700,
          color: running ? "var(--red)" : "var(--ink)",
          letterSpacing: "0.04em",
          transition: "color 0.3s"
        }}>
          {fmtTime(elapsed)}
        </span>
        {running && (
          <span className="eyebrow" style={{ color: "var(--red)", marginTop: 2 }}>STUDYING</span>
        )}
      </div>
    </div>
  );
}

export default function StudyTimer({ units, username, onSessionSaved }) {
  const [running,       setRunning]       = useState(false);
  const [elapsed,       setElapsed]       = useState(0);
  const [selectedUnit,  setSelectedUnit]  = useState(Object.values(units || {})[0]?.name || "");
  const [startTime,     setStartTime]     = useState(null);
  const [history,       setHistory]       = useState([]);
  const [stats,         setStats]         = useState({ streak: 0, weekSeconds: 0 });
  const [leaderboard,   setLeaderboard]   = useState([]);
  const [lastSession,   setLastSession]   = useState(null);
  const [saving,        setSaving]        = useState(false);
  const [view,          setView]          = useState("timer"); // timer | leaderboard
  const intervalRef = useRef(null);

  useEffect(() => {
    loadStudySessions(10).then((d) => {
      setHistory(d.sessions || []);
      setStats({ streak: d.streak || 0, weekSeconds: d.weekSeconds || 0 });
    }).catch(() => {});
    getLeaderboard().then(setLeaderboard).catch(() => {});
  }, []);

  const start = () => {
    if (running) return;
    setRunning(true);
    setElapsed(0);
    setStartTime(new Date());
    setLastSession(null);
    intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  };

  const stop = async () => {
    clearInterval(intervalRef.current);
    setRunning(false);
    const endTime = new Date();
    const dur     = elapsed;
    setElapsed(0);

    if (dur >= 30) {
      setSaving(true);
      try {
        await saveStudySession({
          unitName:        selectedUnit || null,
          durationSeconds: dur,
          startedAt:       startTime?.toISOString(),
          endedAt:         endTime.toISOString(),
        });
        const session = {
          unit_name:       selectedUnit || null,
          duration_seconds: dur,
          started_at:      startTime?.toISOString(),
          ended_at:        endTime.toISOString(),
        };
        setLastSession(session);
        setHistory((h) => [session, ...h.slice(0, 9)]);
        onSessionSaved && onSessionSaved(session);

        // Refresh stats
        loadStudySessions(10).then((d) => {
          setStats({ streak: d.streak || 0, weekSeconds: d.weekSeconds || 0 });
        }).catch(() => {});
      } catch (e) {
        // silent — session just won't be saved
      }
      setSaving(false);
    }
  };

  const unitList = Object.values(units || {}).map((u) => u.name);

  const copyProfileLink = () => {
    if (!username) return;
    const url = `${window.location.origin}?profile=${encodeURIComponent(username)}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    alert(`Copied: ${url}\n\nShare this with friends to compare your stats.`);
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      {/* Stats bar */}
      <div className="booklet" style={{
        display: "flex", gap: 20, justifyContent: "space-around",
        flexWrap: "wrap", padding: "14px 20px", marginBottom: 20
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 24, fontWeight: 700, color: stats.streak > 0 ? "var(--red)" : "var(--ink)" }}>
            {stats.streak > 0 ? "🔥" : ""}{stats.streak}
          </div>
          <div className="eyebrow" style={{ marginTop: 2 }}>Day streak</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 24, fontWeight: 700 }}>
            {fmtDuration(stats.weekSeconds)}
          </div>
          <div className="eyebrow" style={{ marginTop: 2 }}>This week</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 24, fontWeight: 700 }}>
            {history.length}
          </div>
          <div className="eyebrow" style={{ marginTop: 2 }}>Sessions saved</div>
        </div>
      </div>

      {/* View toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {["timer", "leaderboard"].map((v) => (
          <button
            key={v}
            className={"btn ghost sm" + (view === v ? " active-tab" : "")}
            style={view === v ? { background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" } : {}}
            onClick={() => setView(v)}
          >
            {v === "timer" ? "Timer" : "Leaderboard"}
          </button>
        ))}
        {username && (
          <button className="btn ghost sm" onClick={copyProfileLink} style={{ marginLeft: "auto" }}>
            Share my profile
          </button>
        )}
      </div>

      {/* Timer view */}
      {view === "timer" && (
        <>
          <div className="booklet" style={{ textAlign: "center", padding: "28px 24px" }}>
            <TimerRing elapsed={elapsed} running={running} />

            {/* Unit selector */}
            {unitList.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <label className="eyebrow" htmlFor="timer-unit">Studying</label>
                <select
                  id="timer-unit"
                  value={selectedUnit}
                  onChange={(e) => setSelectedUnit(e.target.value)}
                  disabled={running}
                  style={{ marginTop: 6, textAlign: "center" }}
                >
                  <option value="">— Select subject —</option>
                  {unitList.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            )}

            {/* Controls */}
            <div style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "center" }}>
              {!running ? (
                <button className="btn" style={{ background: "var(--red)", borderColor: "var(--red)", minWidth: 140, fontSize: 16 }} onClick={start}>
                  Start studying
                </button>
              ) : (
                <button className="btn ghost" style={{ minWidth: 140, fontSize: 16, borderColor: "var(--red)", color: "var(--red)" }} onClick={stop}>
                  {saving ? <><span className="spin">◌</span> Saving…</> : "Stop & save"}
                </button>
              )}
            </div>

            {!running && elapsed === 0 && (
              <p className="small muted" style={{ marginTop: 12 }}>
                Timer saves automatically when you stop.{username ? " Sessions appear on your public profile." : ""}
              </p>
            )}
          </div>

          {/* Last session share card */}
          {lastSession && (
            <div className="booklet" style={{ background: "var(--green-soft)", border: "1.5px solid var(--green)", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 28, fontWeight: 700, color: "var(--green)" }}>
                  {fmtDuration(lastSession.duration_seconds)}
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--green)" }}>Session saved</div>
                  <div className="small muted">
                    {lastSession.unit_name ? `${lastSession.unit_name} · ` : ""}
                    {new Date(lastSession.ended_at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                {username && (
                  <button className="btn ghost sm" style={{ marginLeft: "auto", borderColor: "var(--green)", color: "var(--green)" }} onClick={copyProfileLink}>
                    Share →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Session history */}
          {history.length > 0 && (
            <div className="booklet">
              <div className="eyebrow" style={{ marginBottom: 10 }}>Recent sessions</div>
              {history.map((s, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 0",
                  borderBottom: i < history.length - 1 ? "1px solid var(--line)" : "none"
                }}>
                  <div style={{ fontFamily: "var(--mono)", fontWeight: 700, minWidth: 50 }}>
                    {fmtDuration(s.duration_seconds)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="small" style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.unit_name || "General"}
                    </div>
                    <div className="small muted">{fmtDate(s.ended_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Leaderboard view */}
      {view === "leaderboard" && (
        <div className="booklet">
          <div className="eyebrow" style={{ marginBottom: 14 }}>Weekly study leaderboard</div>
          {leaderboard.length === 0 ? (
            <p className="small muted">
              No sessions yet this week — start the timer and study to appear here.
            </p>
          ) : (
            leaderboard.map((entry, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "11px 0",
                borderBottom: i < leaderboard.length - 1 ? "1px solid var(--line)" : "none"
              }}>
                {/* Rank */}
                <div style={{
                  width: 30, textAlign: "center", fontFamily: "var(--mono)", fontWeight: 700, fontSize: 15,
                  color: i === 0 ? "var(--red)" : i === 1 ? "var(--amber)" : "var(--pencil)"
                }}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                </div>

                {/* Avatar initial */}
                <div style={{
                  width: 34, height: 34, borderRadius: "50%",
                  background: i === 0 ? "var(--red)" : "var(--ink)",
                  color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "var(--mono)", fontWeight: 700, fontSize: 14, flexShrink: 0
                }}>
                  {(entry.display_name || entry.username || "?")[0].toUpperCase()}
                </div>

                {/* Name + stats */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {entry.display_name || entry.username}
                  </div>
                  <div className="small muted">
                    {entry.active_days} active day{entry.active_days !== 1 ? "s" : ""} · {entry.session_count} session{entry.session_count !== 1 ? "s" : ""}
                  </div>
                </div>

                {/* Time */}
                <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 16, color: i === 0 ? "var(--red)" : "var(--ink)" }}>
                  {fmtDuration(entry.total_seconds || 0)}
                </div>
              </div>
            ))
          )}
          <p className="small muted" style={{ marginTop: 14 }}>
            Rankings are based on total study time in the last 7 days. Public profiles only.
          </p>
        </div>
      )}
    </div>
  );
}
