import { useState, useEffect } from "react";
import { fetchMe, startCheckout, openPortal } from "./api.js";
import { supabase } from "./supabase.js";

export default function Account() {
  const [me, setMe] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchMe().then(setMe).catch((e) => setError(e.message));
  }, []);

  const upgrade = async () => {
    setBusy(true);
    setError("");
    try {
      const { url } = await startCheckout();
      window.location.href = url;
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const manage = async () => {
    setBusy(true);
    setError("");
    try {
      const { url } = await openPortal();
      window.location.href = url;
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  if (!me && !error) return <p className="mono small"><span className="spin">◌</span> Loading account…</p>;

  return (
    <>
      <h2 className="h-display">Account</h2>
      {me && (
        <>
          <div className="booklet">
            <div className="qhead">
              <span className="qnum">{me.email}</span>
              <span className={`stamp ${me.plan === "pro" ? "green" : "amber"}`} style={{ fontSize: 14 }}>
                {me.plan.toUpperCase()}
              </span>
            </div>
            {me.plan === "free" ? (
              <>
                <p className="small muted">
                  Today's usage: {me.usage.gen}/{me.limits.gen} question sets ·{" "}
                  {me.usage.grade}/{me.limits.grade} attempts marked · {me.usage.ingest}/
                  {me.limits.ingest} materials ingested. Resets daily.
                </p>
                <button className="btn red" onClick={upgrade} disabled={busy}>
                  {busy ? "Opening checkout…" : "Upgrade to Pro — unlimited"}
                </button>
              </>
            ) : (
              <>
                <p className="small muted">Unlimited everything. Good luck in there.</p>
                <button className="btn ghost" onClick={manage} disabled={busy}>
                  {busy ? "Opening…" : "Manage billing / cancel"}
                </button>
              </>
            )}
            {error && <p className="error-text">{error}</p>}
          </div>
          <button className="btn ghost sm" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </>
      )}
      {error && !me && <p className="error-text">{error}</p>}
    </>
  );
}
