import { supabase } from "./supabase.js";

async function post(path, body) {
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

export const ingestMaterial = (payload) => post("/api/ingest", payload);
export const generateQuestions = (payload) => post("/api/generate", payload);
export const gradeAttempt = (payload) => post("/api/grade", payload);
export const startCheckout = () => post("/api/checkout");
export const activateSession = (sessionId) => post("/api/activate", { sessionId });
export const openPortal = () => post("/api/portal");
export const fetchMe = () => post("/api/me");

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

export function fileToText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsText(file);
  });
}
