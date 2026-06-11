import { useState } from "react";
import {
  loadState,
  saveState,
  newUnit,
  unitTopics,
  unitNotes,
  weakTopics,
  exportBackup,
} from "./storage.js";
import Materials from "./Materials.jsx";
import Practice from "./Practice.jsx";
import Exam from "./Exam.jsx";
import Progress from "./Progress.jsx";
import Auth from "./Auth.jsx";
import Account from "./Account.jsx";
import { supabase } from "./supabase.js";
import { activateSession } from "./api.js";
import { useEffect } from "react";
import { Analytics } from "@vercel/analytics/react";

export default function App() {
  const [state, setState] = useState(loadState);
  const [session, setSession] = useState(undefined); // undefined = loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // After Stripe checkout redirect: activate Pro, then clean the URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("session_id");
    if (sid && session) {
      activateSession(sid)
        .catch(() => {})
        .finally(() => window.history.replaceState({}, "", window.location.pathname));
    }
  }, [session]);
  const [tab, setTab] = useState("materials");
  const [adding, setAdding] = useState(false);
  const [unitName, setUnitName] = useState("");

  const persist = (next) => {
    setState(next);
    saveState(next);
  };

  const unit = state.activeUnitId ? state.units[state.activeUnitId] : null;

  const updateUnit = (updated) => {
    persist({
      ...state,
      units: { ...state.units, [updated.id]: updated },
    });
  };

  const addUnit = () => {
    const name = unitName.trim();
    if (!name) return;
    const u = newUnit(name);
    persist({
      ...state,
      activeUnitId: u.id,
      units: { ...state.units, [u.id]: u },
    });
    setUnitName("");
    setAdding(false);
    setTab("materials");
  };

  const deleteUnit = (id) => {
    if (!window.confirm("Delete this unit and all its progress? This can't be undone.")) return;
    const units = { ...state.units };
    delete units[id];
    const remaining = Object.keys(units);
    persist({ ...state, units, activeUnitId: remaining[0] || null });
  };

  const importBackup = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (!data.units) throw new Error("bad shape");
        persist(data);
      } catch {
        alert("That file isn't a CramForge backup.");
      }
    };
    r.readAsText(file);
    e.target.value = "";
  };

  const tabs = [
    ["materials", "Materials"],
    ["practice", "Practice"],
    ["exam", "Exam mode"],
    ["progress", "Progress"],
    ["account", "Account"],
  ];

  if (session === undefined) return null;
  if (!session) return (
    <>
      <Auth />
      <Analytics />
    </>
  );

  return (
    <>
      <Analytics />
      <div className="shell">
      <aside className="sidebar">
        <h1 className="wordmark">
          Cram<span className="red">Forge</span>
        </h1>
        <p className="tagline">Unlimited exam practice</p>

        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Your units
        </div>
        {Object.values(state.units).map((u) => (
          <button
            key={u.id}
            className={"unit-btn" + (state.activeUnitId === u.id ? " active" : "")}
            onClick={() => persist({ ...state, activeUnitId: u.id })}
          >
            {u.name}
            <span className="count">{(u.materials || []).length} mat.</span>
          </button>
        ))}

        {adding ? (
          <div style={{ marginTop: 10 }}>
            <input
              type="text"
              value={unitName}
              onChange={(e) => setUnitName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addUnit()}
              placeholder="e.g. ENG1091"
              autoFocus
            />
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button className="btn sm" onClick={addUnit}>
                Add
              </button>
              <button className="btn sm ghost" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="btn sm ghost" style={{ marginTop: 10, width: "100%" }} onClick={() => setAdding(true)}>
            + New unit
          </button>
        )}

        <div style={{ marginTop: 36 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Data
          </div>
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
              style={{ width: "100%", marginTop: 18, color: "var(--red)", borderColor: "var(--red)" }}
              onClick={() => deleteUnit(unit.id)}
            >
              Delete current unit
            </button>
          )}
        </div>
      </aside>

      <main className="main">
        {!unit ? (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              <button className="btn ghost sm" onClick={() => supabase.auth.signOut()}>Sign out</button>
            </div>
            <h2 className="h-display">Set up your first unit</h2>
            <div className="notice">
              Add a unit in the sidebar (e.g. ENG1091, ACC1100), then upload your lecture notes,
              past papers, or summaries. CramForge reads them and generates unlimited exam-style
              questions with full worked solutions — and learns which topics keep tripping you up.
            </div>
          </>
        ) : (
          <>
            <nav className="tabs" role="tablist">
              {tabs.map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  className={"tab" + (tab === id ? " active" : "")}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </nav>

            {tab === "materials" && <Materials unit={unit} updateUnit={updateUnit} />}
            {tab === "practice" && (
              <Practice
                unit={unit}
                updateUnit={updateUnit}
                topics={unitTopics(unit)}
                notes={unitNotes(unit)}
                weak={weakTopics(unit)}
              />
            )}
            {tab === "exam" && (
              <Exam
                unit={unit}
                updateUnit={updateUnit}
                topics={unitTopics(unit)}
                notes={unitNotes(unit)}
                weak={weakTopics(unit)}
              />
            )}
            {tab === "progress" && <Progress unit={unit} weak={weakTopics(unit)} />}
            {tab === "account" && <Account />}
          </>
        )}
      </main>
    </div>
    </>
  );
}
