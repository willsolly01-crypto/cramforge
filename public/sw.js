// CramForge Service Worker
// Strategy: network-first for navigation + API; cache-first for static assets.
// This enables offline fallback and makes the app installable as a PWA.

const CACHE = "cramforge-v2";
const OFFLINE_PAGE = "/";

// ── Install: pre-cache shell ────────────────────────────────────────────────
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll([OFFLINE_PAGE]).catch(() => {})  // best-effort
    )
  );
});

// ── Activate: clean old caches ──────────────────────────────────────────────
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

// ── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Pass API calls straight through — never cache auth'd requests
  if (url.pathname.startsWith("/api/")) return;

  // Navigation (HTML pages): network-first, fall back to cached shell
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(OFFLINE_PAGE))
    );
    return;
  }

  // Static assets (JS, CSS, fonts, images): cache-first
  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res.ok && request.method === "GET") {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
        }
        return res;
      });
    })
  );
});
