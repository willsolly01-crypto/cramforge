import { useState, useEffect, useRef } from "react";
import {
  loadState, saveState, newUnit, unitTopics, unitNotes,
  weakTopics, exportBackup, SUBJECT_TYPES,
} from "./storage.js";
import Materials  from "./Materials.jsx";
import Practice   from "./Practice.jsx";
import Exam       from "./Exam.jsx";
import Progress   from "./Progress.jsx";
import Auth       from "./Auth.jsx";
import Account    from "./Account.jsx";
import SharedView from "./SharedView.jsx";
import SocialProfile from "./SocialProfile.jsx";
import StudyTimer  from "./StudyTimer.jsx";
import QuestionBank from "./QuestionBank.jsx";
import QuickStudy  from "./QuickStudy.jsx";
import StudyFeed   from "./StudyFeed.jsx";
import Papers      from "./Papers.jsx";
import OnboardingTour, { shouldShowOnboarding } from "./OnboardingTour.jsx";
import { supabase } from "./supabase.js";
import { activateSession, startCheckout, syncState, loadServerState } from "./api.js";

// ── URL param routing (checked once at startup) ────────────────────────────
const SP          = new URLSearchParams(window.location.search);
const SHARE_ID    = SP.get("share");
const PROFILE     = SP.get("profile");
const QUICK_MODE  = SP.has("quick");          // ?quick=1 — PWA shortcut
const INITIAL_TAB = SP.get("tab") || "materials"; // ?tab=study etc.

// ── Register service worker ─────────────────────────────────────────────────
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

export default function App() {
  const [state,        setState]        = useState(loadState);
  const [session,      setSession]      = useState(undefined);
  const [justVerified, setJustVerified] = useState(false);
  const [upgradeMsg,   setUpgradeMsg]   = useState(null);
  const [tab,          setTab]          = useState(INITIAL_TAB);
  const [adding,       setAdding]       = useState(false);
  const [unitName,     setUnitName]     = useState("");
  const [unitSubject,  setUnitSubject]  = useState("stem");
  const [profile,      setProfile]      = useState(null);
  const [quickMode,    setQuickMode]    = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstall,   setShowInstall]   = useState(false);
  const [showTour,      setShowTour]      = useState(shouldShowOnboarding());
  const [sidebarOpen,   setSidebarOpen]   = useState(() => {
    try { return localStorage.getItem("cf_sidebar") !== "closed"; } catch { return true; }
  });
  const syncTimer = useRef(null);

  const toggleSidebar = () => {
    setSidebarOpen((open) => {
      const next = !open;
      try { localStorage.setItem("cf_sidebar", next ? "open" : "closed"); } catch { /* ignore */ }
      return next;
    });
  };

  // ── PWA install banner ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); setShowInstall(true); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // ── Static-content routes (no auth required) ────────────────────────────
  if (SHARE_ID)  return <SharedView shareId={SHARE_ID} onSignup={() => window.history.replaceState({}, "", window.location.pathname)} />;
  if (PROFILE)   return <SocialProfile username={PROFILE} onSignup={() => window.history.replaceState({}, "", window.location.pathname)} />;

  // ── Auth + state bootstrap ───────────────────────────────────────────────
  useEffect(() => {
    if (window.location.hash.includes("type=signup") || window.location.hash.includes("type=email_change")) {
      setJustVerified(true);
    }

    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) {
        loadServerState().then((serverState) => {
          if (!serverState) {
            const local = loadState();
            if (Object.keys(local.units || {}).length > 0) syncState(local).catch(() => {});
          } else {
            setState((local) => {
              const merged = {
                ...serverState,
                units: { ...local.units, ...serverState.units },
                activeUnitId: serverState.activeUnitId || local.activeUnitId,
              };
              saveState(merged);
              return merged;
            });
          }
        }).catch(() => {});

        // Load profile info for social features
        fetchProfileInfo();

        // Activate Quick Study if launched via PWA shortcut
        if (QUICK_MODE) setQuickMode(true);
      }
    });

    const onLimit = (e) => setUpgradeMsg(e.detail?.message || "You've hit your daily limit.");
    window.addEventListener("cramforge:limit", onLimit);
    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("cramforge:limit", onLimit);
    };
  }, []);

  // Fetch profile info after login (username, plan for UI)
  const fetchProfileInfo = async () => {
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!s) return;
      const res = await fetch("/api/account?op=me", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.access_token}` },
        body: JSON.stringify({}),
      });
      if (!res.ok) return;
      const me = await res.json();
      setProfile({
        username:    me.profile?.username  || null,
        displayName: me.profile?.display_name || null,
        isPublic:    me.profile?.is_public !== false,
        plan:        me.plan || "free",
        pdfDemoUsed: me.profile?.pdf_demo_used || false,
      });
    } catch { /* non-fatal */ }
  };

  // After Stripe checkout: activate Pro
  useEffect(() => {
    const sid = new URLSearchParams(window.location.search).get("session_id");
    if (sid && session) {
      activateSession(sid).catch(() => {}).finally(() => window.history.replaceState({}, "", window.location.pathname));
    }
  }, [session]);

  const persist = (next) => {
    setState(next);
    saveState(next);
    if (session) {
      clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => syncState(next).catch(() => {}), 2000);
    }
  };

  const unit = state.activeUnitId ? state.units[state.activeUnitId] : null;

  const updateUnit = (updated) =>
    persist({ ...state, units: { ...state.units, [updated.id]: updated } });

  const addUnit = () => {
    const name = unitName.trim();
    if (!name) return;
    const u = newUnit(name, unitSubject);
    persist({ ...state, activeUnitId: u.id, units: { ...state.units, [u.id]: u } });
    setUnitName(""); setUnitSubject("stem"); setAdding(false); setTab("materials");
  };

  const deleteUnit = (id, opts = {}) => {
    if (opts.confirm !== false && !window.confirm("Delete this unit? This can't be undone.")) return;
    const units = { ...state.units };
    delete units[id];
    const remaining = Object.keys(units);
    persist({ ...state, units, activeUnitId: remaining[0] || null });
  };

  const importBackup = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (!data.units) throw new Error("bad shape");
        persist(data);
      } catch { alert("That file isn't a CramForge backup."); }
    };
    r.readAsText(file);
    e.target.value = "";
  };

  const isPro = profile?.plan === "pro";

  const tabs = [
    ["materials", "Materials"],
    ["practice",  "Practice"],
    ["exam",      "Exam"],
    ["progress",  "Progress"],
    ["bank",      "Question bank"],
    ["study",     "Study timer"],
    ["account",   "Account"],
  ];

  const unitNav = unit ? (
    <nav className="tabs" role="tablist">
      {[
        ["materials", "Materials"],
        ["practice",  "Practice"],
        ["exam",      "Exam"],
        ["progress",  "Progress"],
        ["account",   "Account"],
      ].map(([id, label]) => (
        <button
          key={id} role="tab" aria-selected={tab === id}
          className={"tab" + (tab === id ? " active" : "")}
          onClick={() => setTab(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  ) : null;

  // Loading state
  if (session === undefined) {
    const isVerifying = window.location.hash.includes("type=signup") || window.location.hash.includes("type=email_change");
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 16, background: "var(--paper)" }}>
        <h1 className="wordmark" style={{ fontSize: 30 }}>Cram<span className="red">Forge</span></h1>
        <p style={{ color: "var(--ink-soft)", fontSize: 15 }}>{isVerifying ? "Confirming your email…" : "Loading…"}</p>
      </div>
    );
  }
  if (!session) return <Auth />;

  // ── Quick Study overlay (full-screen, hides everything else) ─────────────
  if (quickMode) {
    return (
      <QuickStudy
        units={state.units}
        onBack={() => {
          setQuickMode(false);
          // Clean ?quick=1 from URL without a reload
          const url = new URL(window.location.href);
          url.searchParams.delete("quick");
          window.history.replaceState({}, "", url.toString());
        }}
      />
    );
  }

  return (
    <>
      {/* First-visit onboarding tour */}
      {showTour && (
        <OnboardingTour onNavigate={setTab} onDone={() => setShowTour(false)} />
      )}

      {/* Upgrade modal */}
      {upgradeMsg && (
        <div className="upgrade-overlay" onClick={() => setUpgradeMsg(null)}>
          <div className="upgrade-modal" onClick={(e) => e.stopPropagation()}>
            <p style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--pencil)", marginTop: 0, marginBottom: 12 }}>
              Limit reached
            </p>
            <h2 style={{ fontFamily: "var(--display)", fontSize: 24, fontWeight: 700, margin: "0 0 10px" }}>
              Unlock unlimited practice
            </h2>
            <p style={{ color: "var(--ink-soft)", fontSize: 14, lineHeight: 1.6, margin: "0 0 22px" }}>
              {upgradeMsg}
            </p>
            <button
              className="btn"
              style={{ width: "100%", marginBottom: 10, background: "var(--red)", borderColor: "var(--red)" }}
              onClick={() => { setUpgradeMsg(null); startCheckout().catch(() => {}); }}
            >
              Upgrade to Pro →
            </button>
            <button className="btn ghost sm" style={{ width: "100%" }} onClick={() => setUpgradeMsg(null)}>
              Maybe later
            </button>
          </div>
        </div>
      )}

      <div className={"shell" + (sidebarOpen ? "" : " sidebar-collapsed")}>
        <button
          className="sidebar-toggle"
          onClick={toggleSidebar}
          title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          aria-expanded={sidebarOpen}
        >
          {sidebarOpen ? "‹" : "›"}
        </button>

        {/* Email-verified toast */}
        {justVerified && (
          <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 999, background: "#1a7a4a", color: "#fff", padding: "12px 20px", borderRadius: 8, fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 12, boxShadow: "0 4px 16px rgba(0,0,0,.18)" }}>
            ✓ Email confirmed — welcome to CramForge!
            <button onClick={() => setJustVerified(false)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 18 }}>×</button>
          </div>
        )}

        <aside className="sidebar">
          <div className="sidebar-inner">
          <h1 className="wordmark">Cram<span className="red">Forge</span></h1>
          <p className="tagline">Unlimited exam practice</p>

          {/* Units list */}
          <div className="eyebrow" style={{ marginBottom: 10 }}>Your units</div>
          {Object.values(state.units).map((u) => (
            <button
              key={u.id}
              className={"unit-btn" + (state.activeUnitId === u.id ? " active" : "")}
              onClick={() => { persist({ ...state, activeUnitId: u.id }); if (tab === "study" || tab === "bank" || tab === "account") setTab("materials"); }}
            >
              {u.name}
              <span className="count">{(u.materials || []).length} mat.</span>
            </button>
          ))}

          {adding ? (
            <div style={{ marginTop: 10 }}>
              <input
                type="text" value={unitName}
                onChange={(e) => setUnitName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addUnit()}
                placeholder="e.g. MATH1051, BIOL2030"
                autoFocus style={{ marginBottom: 8 }}
              />
              <select value={unitSubject} onChange={(e) => setUnitSubject(e.target.value)} style={{ marginBottom: 8 }}>
                {SUBJECT_TYPES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn sm" onClick={addUnit}>Add</button>
                <button className="btn sm ghost" onClick={() => setAdding(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="btn sm ghost" style={{ marginTop: 10, width: "100%" }} onClick={() => setAdding(true)}>
              + New unit
            </button>
          )}

          {/* Quick Study — primary CTA */}
          <button
            className="btn"
            style={{
              marginTop: 18, width: "100%",
              background: "var(--red)", borderColor: "var(--red)",
              fontSize: 12, letterSpacing: "0.06em",
            }}
            onClick={() => setQuickMode(true)}
          >
            ⚡ Quick Study
          </button>

          {/* Study together — social features front and centre */}
          <div className="eyebrow" style={{ margin: "18px 0 8px" }}>Study together</div>
          <button
            className={"btn sm" + (tab === "feed" ? "" : " ghost")}
            style={{ width: "100%", marginBottom: 6, fontSize: 12 }}
            onClick={() => setTab("feed")}
          >
            📸 Study Feed — post & see friends
          </button>
          <div className="side-trio">
            <button
              className={"btn sm ghost" + (tab === "bank" ? " active" : "")}
              onClick={() => setTab("bank")}
            >
              Question<br />bank
            </button>
            <button
              className={"btn sm ghost" + (tab === "study" ? " active" : "")}
              onClick={() => setTab("study")}
            >
              Study<br />timer
            </button>
            <button
              className={"btn sm ghost" + (tab === "papers" ? " active" : "")}
              onClick={() => setTab("papers")}
            >
              Past<br />papers
            </button>
          </div>

          {/* Data + unit management */}
          <div style={{ marginTop: 28 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Data</div>
            <button className="btn sm ghost" style={{ width: "100%", marginBottom: 6 }} onClick={() => exportBackup(state)}>
              Export backup
            </button>
            <label className="btn sm ghost" style={{ width: "100%", display: "block", textAlign: "center" }}>
              Restore backup
              <input type="file" accept=".json" onChange={importBackup} style={{ display: "none" }} />
            </label>
            {unit && (
              <button
                className="btn sm ghost"
                style={{ width: "100%", marginTop: 14, color: "var(--red)", borderColor: "var(--red)" }}
                onClick={() => deleteUnit(unit.id)}
              >
                Delete current unit
              </button>
            )}
          </div>
          </div>
        </aside>

        <main className="main">
          {/* Study timer and question bank are top-level tabs (don't need a unit) */}
          {tab === "study" && (
            <>
              <h2 className="h-display">Study timer</h2>
              <p className="small muted" style={{ marginBottom: 24 }}>
                Track your study sessions, compete on the weekly leaderboard, and share your stats with friends.
              </p>
              <StudyTimer
                units={state.units}
                username={profile?.username}
                onSessionSaved={() => {}}
              />
            </>
          )}

          {tab === "bank" && (
            <QuestionBank isPro={isPro} />
          )}

          {tab === "feed" && (
            <StudyFeed unitNames={Object.values(state.units || {}).map((u) => u.name)} />
          )}

          {tab === "papers" && <Papers />}

          {tab === "account" && (
            <>
              {unitNav}
              <Account
                profile={profile}
                onProfileUpdate={(updated) => setProfile((p) => ({ ...p, ...updated }))}
                units={state.units}
                activeUnitId={state.activeUnitId}
                onDeleteUnit={(id) => deleteUnit(id, { confirm: false })}
                onSelectUnit={(id) => persist({ ...state, activeUnitId: id })}
              />
            </>
          )}

          {tab !== "study" && tab !== "bank" && tab !== "feed" && tab !== "papers" && tab !== "account" && (
            !unit ? (
              <>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                  <button className="btn ghost sm" onClick={() => supabase.auth.signOut()}>Sign out</button>
                </div>
                <h2 className="h-display">Set up your first unit</h2>
                <div className="notice">
                  Add a unit in the sidebar (e.g. MATH1051, BIOL2030), then upload your lecture notes.
                  CramForge reads them and generates unlimited exam-style questions with worked solutions
                  — and learns which topics keep tripping you up.
                </div>
              </>
            ) : (
              <>
                {unitNav}

                {tab === "materials" && <Materials unit={unit} updateUnit={updateUnit} />}
                {tab === "practice" && (
                  <Practice
                    unit={unit} updateUnit={updateUnit}
                    topics={unitTopics(unit)} notes={unitNotes(unit)} weak={weakTopics(unit)}
                    isPro={isPro}
                  />
                )}
                {tab === "exam" && (
                  <Exam
                    unit={unit} updateUnit={updateUnit}
                    topics={unitTopics(unit)} notes={unitNotes(unit)} weak={weakTopics(unit)}
                    isPro={isPro}
                  />
                )}
                {tab === "progress" && <Progress unit={unit} weak={weakTopics(unit)} />}
              </>
            )
          )}
        </main>
      </div>

      {/* PWA install banner — shown on first visit on Android Chrome */}
      {showInstall && !window.matchMedia("(display-mode: standalone)").matches && (
        <div className="pwa-install-banner">
          <p><strong>Add CramForge to your home screen</strong> for quick study access anywhere.</p>
          <button
            className="install-btn"
            onClick={() => {
              installPrompt?.prompt();
              setShowInstall(false);
            }}
          >
            Install
          </button>
          <button className="dismiss-btn" onClick={() => setShowInstall(false)}>
            Later
          </button>
        </div>
      )}
    </>
  );
}
