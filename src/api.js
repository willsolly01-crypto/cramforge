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
export const generateAnon      = (payload) => post("/api/generate", payload, { anon: true });
export const ingestMaterial    = (payload) => post("/api/ingest", payload);
export const generateQuestions = (payload) => post("/api/generate", payload);
export const gradeAttempt      = (payload) => post("/api/grade", payload);
export const explainConcept    = (payload) => post("/api/explain", payload);

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
export const startCheckout    = ()           => post("/api/checkout");
export const activateSession  = (sessionId) => post("/api/activate", { sessionId });
export const openPortal       = ()           => post("/api/portal");
export const fetchMe          = ()           => post("/api/me");

// ── Shared question sets ───────────────────────────────────────────────────
export const shareSet    = (payload) => post("/api/share", payload);
export const getSharedSet = (id) =>
  fetch(`/api/share?id=${encodeURIComponent(id)}`).then((r) => r.json());

// ── Cross-device sync ──────────────────────────────────────────────────────
export const syncState       = (state) => post("/api/sync", { state });
export const loadServerState = () => authedGet("/api/sync").then((d) => d?.state || null);

// ── Quick Study (MCQ rapid-fire) ───────────────────────────────────────────
export const quickGenerate = (payload) => post("/api/quick", payload);

// ── Study sessions ─────────────────────────────────────────────────────────
export const saveStudySession = (payload)  => post("/api/study-session", payload);
export const loadStudySessions = (limit = 20) =>
  authedGet(`/api/study-session?limit=${limit}`).then((d) => d || { sessions: [], streak: 0, weekSeconds: 0 });

// ── Social profile ─────────────────────────────────────────────────────────
export const getPublicProfile = (username) =>
  get(`/api/profile?username=${encodeURIComponent(username)}`);
export const getLeaderboard   = () =>
  get("/api/profile?leaderboard=1").then((d) => d?.leaderboard || []);
export const updateProfile    = (payload)  => post("/api/profile", payload);

// ── Classes (tutors + students) ────────────────────────────────────────────
export const createClass = (name)    => post("/api/class", { action: "create", name });
export const joinClass   = (code)    => post("/api/class", { action: "join",   code });
export const leaveClass  = (classId) => post("/api/class", { action: "leave",  classId });
export const deleteClass = (classId) => post("/api/class", { action: "delete", classId });
export const loadClasses = ()        => authedGet("/api/class").then((d) => d || { owned: [], joined: [] });

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
