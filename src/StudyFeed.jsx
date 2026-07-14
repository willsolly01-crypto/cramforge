// src/StudyFeed.jsx — BeReal-style study feed.
// Post a photo of your study session with duration + unit; see friends' posts; manage friends.
// Self-contained: talks to /api/social (feed + friends scopes) directly.

import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase.js";

async function call(path, body) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Downscale + compress a photo client-side so uploads stay small and fast.
function compressImage(file, maxDim = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      resolve({
        base64: dataUrl.split(",")[1],
        mediaType: "image/jpeg",
        preview: dataUrl,
      });
    };
    img.onerror = () => reject(new Error("Could not read that photo."));
    img.src = url;
  });
}

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function StudyFeed({ unitNames = [] }) {
  const [view, setView] = useState("feed"); // feed | friends
  const [posts, setPosts] = useState(null);
  const [friendCount, setFriendCount] = useState(0);
  const [error, setError] = useState("");

  // composer state
  const [photo, setPhoto] = useState(null);
  const [caption, setCaption] = useState("");
  const [unitName, setUnitName] = useState(unitNames[0] || "");
  const [duration, setDuration] = useState("");
  const [posting, setPosting] = useState(false);
  const fileRef = useRef(null);

  const loadFeed = () => {
    call("/api/social", { scope: "feed", action: "feed" })
      .then((d) => {
        setPosts(d.posts);
        setFriendCount(d.friendCount);
      })
      .catch((e) => setError(e.message));
  };
  useEffect(loadFeed, []);

  const pickPhoto = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    try {
      setPhoto(await compressImage(file));
    } catch (err) {
      setError(err.message);
    }
  };

  const submitPost = async () => {
    if (!photo || posting) return;
    setPosting(true);
    setError("");
    try {
      await call("/api/social", {
        scope: "feed",
        action: "post",
        imageBase64: photo.base64,
        mediaType: photo.mediaType,
        caption: caption.trim(),
        unitName: unitName.trim(),
        durationMinutes: duration ? Number(duration) : null,
      });
      setPhoto(null);
      setCaption("");
      setDuration("");
      loadFeed();
    } catch (e) {
      setError(e.message);
    }
    setPosting(false);
  };

  const deletePost = async (id) => {
    if (!window.confirm("Delete this post?")) return;
    try {
      await call("/api/social", { scope: "feed", action: "delete", postId: id });
      setPosts((p) => p.filter((x) => x.id !== id));
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h2 className="h-display" style={{ margin: 0 }}>Study feed</h2>
        <div style={{ display: "flex", gap: 6 }}>
          <button className={"btn sm" + (view === "feed" ? "" : " ghost")} onClick={() => setView("feed")}>
            Feed
          </button>
          <button className={"btn sm" + (view === "friends" ? "" : " ghost")} onClick={() => setView("friends")}>
            Friends ({friendCount})
          </button>
        </div>
      </div>
      <p className="small muted" style={{ margin: "6px 0 18px" }}>
        Snap a photo mid-session, tag the unit and how long you studied. Only you and your friends
        see your posts.
      </p>
      {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}

      {view === "friends" ? (
        <FriendsPanel onChanged={loadFeed} />
      ) : (
        <>
          {/* composer */}
          <div className="booklet">
            <div className="eyebrow" style={{ marginBottom: 10 }}>Post your session</div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={pickPhoto}
              style={{ display: "none" }}
              aria-hidden="true"
            />
            {!photo ? (
              <button className="btn red" onClick={() => fileRef.current && fileRef.current.click()}>
                📷 Snap your study setup
              </button>
            ) : (
              <>
                <img
                  src={photo.preview}
                  alt="Your study session"
                  style={{ width: "100%", maxHeight: 340, objectFit: "cover", borderRadius: 8, border: "1.5px solid var(--ink)" }}
                />
                <div className="row" style={{ marginTop: 12 }}>
                  <div>
                    <label className="eyebrow" htmlFor="sf-unit">Unit</label>
                    {unitNames.length ? (
                      <select id="sf-unit" value={unitName} onChange={(e) => setUnitName(e.target.value)}>
                        {unitNames.map((u) => <option key={u} value={u}>{u}</option>)}
                        <option value="">Other</option>
                      </select>
                    ) : (
                      <input id="sf-unit" type="text" value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder="e.g. ENG1090" />
                    )}
                  </div>
                  <div>
                    <label className="eyebrow" htmlFor="sf-dur">Minutes studied</label>
                    <input id="sf-dur" type="number" min="1" max="1440" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g. 90" />
                  </div>
                </div>
                <label className="eyebrow" htmlFor="sf-cap" style={{ marginTop: 12 }}>Caption (optional)</label>
                <input id="sf-cap" type="text" maxLength={300} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Trig sub grind continues…" />
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button className="btn red" onClick={submitPost} disabled={posting}>
                    {posting ? "Posting…" : "Post it"}
                  </button>
                  <button className="btn ghost" onClick={() => fileRef.current && fileRef.current.click()}>Retake</button>
                  <button className="btn ghost" onClick={() => setPhoto(null)}>Discard</button>
                </div>
              </>
            )}
          </div>

          {/* feed */}
          {posts === null && <p className="mono small"><span className="spin">◌</span> Loading feed…</p>}
          {posts && posts.length === 0 && (
            <div className="notice">
              Nothing here yet. Post your first study photo above — and add some friends in the
              Friends tab so their sessions show up here too.
            </div>
          )}
          {posts && posts.map((p) => (
            <div className="booklet" key={p.id} style={{ padding: 0, overflow: "hidden" }}>
              <img
                src={p.photoUrl}
                alt={`${p.displayName || p.username || "Someone"} studying`}
                style={{ width: "100%", maxHeight: 420, objectFit: "cover", display: "block" }}
                loading="lazy"
              />
              <div style={{ padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontWeight: 600 }}>
                    {p.displayName || p.username || "Anonymous"}
                    {p.username && <span className="mono small muted"> @{p.username}</span>}
                  </span>
                  <span className="mono small muted">{timeAgo(p.createdAt)}</span>
                </div>
                <div className="chips" style={{ margin: "8px 0" }}>
                  {p.unitName && <span className="chip" style={{ cursor: "default" }}>{p.unitName}</span>}
                  {p.durationMinutes && (
                    <span className="chip on" style={{ cursor: "default" }}>⏱ {p.durationMinutes} min</span>
                  )}
                </div>
                {p.caption && <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.5 }}>{p.caption}</p>}
                {p.mine && (
                  <button className="btn sm ghost" style={{ marginTop: 10, color: "var(--red)", borderColor: "var(--red)" }} onClick={() => deletePost(p.id)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}

function FriendsPanel({ onChanged }) {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [msg, setMsg] = useState("");

  const refresh = () => {
    call("/api/social", { scope: "friends", action: "list" }).then(setData).catch((e) => setMsg(e.message));
  };
  useEffect(refresh, []);

  const search = async () => {
    setMsg("");
    try {
      const d = await call("/api/social", { scope: "friends", action: "search", query });
      setResults(d.results);
      if (!d.results.length) setMsg("No one found with that name. They need a username set in Account first.");
    } catch (e) {
      setMsg(e.message);
    }
  };

  const act = async (action, payload) => {
    setMsg("");
    try {
      await call("/api/social", { scope: "friends", action, ...payload });
      refresh();
      onChanged && onChanged();
      if (action === "request") setMsg("Request sent ✓");
    } catch (e) {
      setMsg(e.message);
    }
  };

  return (
    <>
      <div className="booklet">
        <div className="eyebrow" style={{ marginBottom: 10 }}>Find friends</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Search by username…"
          />
          <button className="btn" style={{ flexShrink: 0 }} onClick={search}>Search</button>
        </div>
        {results.map((r) => (
          <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <span>{r.display_name || r.username} <span className="mono small muted">@{r.username}</span></span>
            <button className="btn sm" onClick={() => act("request", { userId: r.id })}>Add friend</button>
          </div>
        ))}
        {msg && <p className="small" style={{ marginTop: 10, color: msg.includes("✓") ? "var(--green)" : "var(--red)" }}>{msg}</p>}
      </div>

      {data && data.incoming.length > 0 && (
        <div className="booklet">
          <div className="eyebrow" style={{ marginBottom: 10 }}>Requests for you</div>
          {data.incoming.map((f) => (
            <div key={f.friendshipId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span>{f.displayName || f.username} <span className="mono small muted">@{f.username}</span></span>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn sm" onClick={() => act("accept", { friendshipId: f.friendshipId })}>Accept</button>
                <button className="btn sm ghost" onClick={() => act("remove", { friendshipId: f.friendshipId })}>Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="booklet">
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Your friends {data ? `(${data.friends.length})` : ""}
        </div>
        {data && data.friends.length === 0 && (
          <p className="small muted">No friends yet — search above. Friends see each other's study posts.</p>
        )}
        {data && data.friends.map((f) => (
          <div key={f.friendshipId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span>{f.displayName || f.username} <span className="mono small muted">@{f.username}</span></span>
            <button className="btn sm ghost" onClick={() => act("remove", { friendshipId: f.friendshipId })}>Remove</button>
          </div>
        ))}
        {data && data.outgoing.length > 0 && (
          <>
            <div className="eyebrow" style={{ margin: "14px 0 8px" }}>Sent — waiting</div>
            {data.outgoing.map((f) => (
              <div key={f.friendshipId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span className="muted">{f.displayName || f.username}</span>
                <button className="btn sm ghost" onClick={() => act("remove", { friendshipId: f.friendshipId })}>Cancel</button>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}

