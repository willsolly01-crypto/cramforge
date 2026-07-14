import { supabase } from "./supabase.js";

async function post(path, body, { anon = false } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(!anon && session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 402 || res.status === 429) {
      window.dispatchEvent(new CustomEvent("cramforge:limit", { detail: { message: data.error } }));
    }
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

async function authedGet(path) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

async function get(path) {
  const res = await fetch(path);
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

// ── Core AI endpoints ──────────────────────────────────────────────────────
export const generateAnon      = (payload) => post("/api/ai?op=generate", payload, { anon: true });
export const ingestMaterial    = (payload) => post("/api/ai?op=ingest", payload);
export const generateQuestions = (payload) => post("/api/ai?op=generate", payload);
export const gradeAttempt      = (payload) => post("/api/ai?op=grade", payload);
export const explainConcept    = (payload) => post("/api/ai?op=explain", payload);

// ── PDF export ─────────────────────────────────────────────────────────────
// Returns a Blob — download it client-side as a file.
export async function exportPDF(payload) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch("/api/export-pdf", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 402 || res.status === 429) {
      window.dispatchEvent(new CustomEvent("cramforge:limit", { detail: { message: err.error } }));
    }
    throw new Error(err.error || `PDF export failed (${res.status})`);
  }
  return res.blob();
}

// ── Billing ────────────────────────────────────────────────────────────────
export const startCheckout    = ()           => post("/api/billing?op=checkout");
export const activateSession  = (sessionId) => post("/api/billing?op=activate", { sessionId });
export const openPortal       = ()           => post("/api/billing?op=portal");
export const fetchMe          = ()           => post("/api/account?op=me");

// ── Shared question sets ───────────────────────────────────────────────────
export const shareSet    = (payload) => post("/api/share", payload);
export const getSharedSet = (id) =>
  fetch(`/api/share?id=${encodeURIComponent(id)}`).then((r) => r.json());

// ── Cross-device sync ──────────────────────────────────────────────────────
export const syncState       = (state) => post("/api/account?op=sync", { state });
export const loadServerState = () => authedGet("/api/account?op=sync").then((d) => d?.state || null);

// ── Quick Study (MCQ rapid-fire) ───────────────────────────────────────────
export const quickGenerate = (payload) => post("/api/ai?op=quick", payload);

// ── Study sessions ─────────────────────────────────────────────────────────
export const saveStudySession = (payload)  => post("/api/study-session", payload);
export const loadStudySessions = (limit = 20) =>
  authedGet(`/api/study-session?limit=${limit}`).then((d) => d || { sessions: [], streak: 0, weekSeconds: 0 });

// ── Social profile ─────────────────────────────────────────────────────────
export const getPublicProfile = (username) =>
  get(`/api/account?op=profile&username=${encodeURIComponent(username)}`);
export const getLeaderboard   = () =>
  get("/api/account?op=profile&leaderboard=1").then((d) => d?.leaderboard || []);
export const updateProfile    = (payload)  => post("/api/account?op=profile", payload);

// ── Classes (tutors + students) ────────────────────────────────────────────
export const createClass = (name)    => post("/api/social", { scope: "class", action: "create", name });
export const joinClass   = (code)    => post("/api/social", { scope: "class", action: "join",   code });
export const leaveClass  = (classId) => post("/api/social", { scope: "class", action: "leave",  classId });
export const deleteClass = (classId) => post("/api/social", { scope: "class", action: "delete", classId });
export const loadClasses = ()        => authedGet("/api/social?scope=class").then((d) => d || { owned: [], joined: [] });

// ── Public question bank ───────────────────────────────────────────────────
export const loadBank = ({ subject, featured, page = 0 } = {}) => {
  const q = new URLSearchParams({ page });
  if (subject)  q.set("subject",  subject);
  if (featured) q.set("featured", "1");
  return get(`/api/bank?${q.toString()}`).then((d) => d || { sets: [], total: 0 });
};

// ── File helpers ───────────────────────────────────────────────────────────
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

export function fileToText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsText(file);
  });
}

