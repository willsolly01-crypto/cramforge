import { useState, useEffect } from "react";
import { fetchMe, startCheckout, openPortal, updateProfile } from "./api.js";
import { supabase } from "./supabase.js";
import ClassManager from "./ClassManager.jsx";

function ReferralSection({ referral }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}?ref=${referral.code}`;
  const copy = () => {
    navigator.clipboard?.writeText(link).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="booklet" style={{ marginTop: 20 }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>Refer a friend</div>
      <p className="small" style={{ color: "var(--ink-soft)", marginBottom: 14, lineHeight: 1.6 }}>
        Share your link. Every sign-up earns you <strong>+5 free question sets</strong> — stacks up to 50.
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        <input
          type="text" readOnly value={link}
          onClick={(e) => e.target.select()}
          style={{ flexGrow: 1, fontSize: 12, fontFamily: "var(--mono)", color: "var(--ink-soft)" }}
        />
        <button className="btn sm" style={{ whiteSpace: "nowrap", flexShrink: 0 }} onClick={copy}>
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>
      <div style={{ display: "flex", gap: 24, marginTop: 16 }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ margin: 0, fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700 }}>
            {referral.count}
          </p>
          <p className="eyebrow" style={{ marginTop: 2 }}>referrals</p>
        </div>
        <div style={{ textAlign: "center" }}>
          <p style={{ margin: 0, fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700, color: "var(--green)" }}>
            +{referral.bonus_gen}
          </p>
          <p className="eyebrow" style={{ marginTop: 2 }}>bonus sets</p>
        </div>
      </div>
      {referral.bonus_gen > 0 && (
        <p className="small" style={{ color: "var(--green)", marginTop: 12 }}>
          ✓ {referral.bonus_gen} bonus sets added to your daily limit.
        </p>
      )}
    </div>
  );
}

function ProfileSection({ profile, onSaved }) {
  const [username,    setUsername]    = useState(profile.username    || "");
  const [displayName, setDisplayName] = useState(profile.displayName || "");
  const [isPublic,    setIsPublic]    = useState(profile.isPublic    !== false);
  const [saving,      setSaving]      = useState(false);
  const [msg,         setMsg]         = useState("");
  const [error,       setError]       = useState("");
  const [copied,      setCopied]      = useState(false);

  const profileUrl = username
    ? `${window.location.origin}?profile=${encodeURIComponent(username)}`
    : null;

  const save = async () => {
    setSaving(true);
    setMsg(""); setError("");
    try {
      await updateProfile({ username: username.trim(), displayName: displayName.trim(), isPublic });
      setMsg("Profile updated.");
      onSaved && onSaved({ username: username.trim(), displayName: displayName.trim(), isPublic });
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  const copyProfileLink = () => {
    if (!profileUrl) return;
    navigator.clipboard?.writeText(profileUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="booklet" style={{ marginTop: 20 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>Public profile</div>
      <p className="small muted" style={{ marginTop: 0, marginBottom: 16 }}>
        Your profile shows your study stats and streak to friends and classmates.
      </p>

      <label className="eyebrow" htmlFor="display-name">Display name</label>
      <input
        id="display-name"
        type="text"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder="e.g. Will"
        style={{ marginBottom: 12 }}
        maxLength={60}
      />

      <label className="eyebrow" htmlFor="username">Username</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <span className="small muted" style={{ flexShrink: 0 }}>@</span>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
          placeholder="yourusername"
          maxLength={30}
          style={{ flex: 1 }}
        />
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, cursor: "pointer" }}>
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
        <span className="small">Show on leaderboard and allow profile sharing</span>
      </label>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </button>
        {profileUrl && (
          <button className="btn ghost sm" onClick={copyProfileLink}>
            {copied ? "✓ Copied!" : "Copy profile link"}
          </button>
        )}
      </div>
      {msg && <p className="small" style={{ color: "var(--green)", marginTop: 8 }}>{msg}</p>}
      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}

export default function Account({ profile, onProfileUpdate }) {
  const [me,    setMe]    = useState(null);
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchMe().then(setMe).catch((e) => setError(e.message));
  }, []);

  const upgrade = async () => {
    setBusy(true); setError("");
    try { const { url } = await startCheckout(); window.location.href = url; }
    catch (e) { setError(e.message); setBusy(false); }
  };

  const manage = async () => {
    setBusy(true); setError("");
    try { const { url } = await openPortal(); window.location.href = url; }
    catch (e) { setError(e.message); setBusy(false); }
  };

  if (!me && !error) return <p className="mono small"><span className="spin">◌</span> Loading account…</p>;

  return (
    <>
      <h2 className="h-display">Account</h2>
      {me && (
        <>
          {/* Plan card */}
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
                  Today: {me.usage.gen}/{me.limits.gen} sets · {me.usage.grade}/{me.limits.grade} marked · {me.usage.ingest}/{me.limits.ingest} ingested
                  {me.referral?.bonus_gen > 0 && (
                    <span style={{ color: "var(--green)" }}> (+{me.referral.bonus_gen} referral bonus)</span>
                  )}
                </p>
                <button className="btn red" onClick={upgrade} disabled={busy}>
                  {busy ? "Opening checkout…" : "Upgrade to Pro — $8.99/mo · unlimited"}
                </button>
              </>
            ) : (
              <>
                <p className="small muted">Unlimited generation, grading, and exports. PDF export active.</p>
                <button className="btn ghost" onClick={manage} disabled={busy}>
                  {busy ? "Opening…" : "Manage billing / cancel"}
                </button>
              </>
            )}
            {error && <p className="error-text">{error}</p>}
          </div>

          {/* Public profile settings */}
          <ProfileSection
            profile={{ username: profile?.username || "", displayName: profile?.displayName || "", isPublic: profile?.isPublic !== false }}
            onSaved={onProfileUpdate}
          />

          {/* Referral — free only */}
          {me.plan === "free" && me.referral?.code && (
            <ReferralSection referral={me.referral} />
          )}

          {/* Class manager */}
          <ClassManager />

          <div style={{ marginTop: 24 }}>
            <button className="btn ghost sm" onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
        </>
      )}
      {error && !me && <p className="error-text">{error}</p>}
    </>
  );
}
