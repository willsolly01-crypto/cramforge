import { useEffect, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

// Reuses the same public env vars your app already has in Vercel.
// If you already export a shared client elsewhere (e.g. src/supabase.js),
// swap this out for that import instead — this is just self-contained by default.
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const BUCKET = "past-papers";

export default function Papers() {
  const [papers, setPapers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [subjectFilter, setSubjectFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("past_papers")
        .select("*")
        .order("subject", { ascending: true })
        .order("year", { ascending: false });
      if (cancelled) return;
      if (error) setError(error.message);
      else setPapers(data || []);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const subjects = useMemo(() => {
    const s = new Set(papers.map((p) => p.subject));
    return ["all", ...Array.from(s).sort()];
  }, [papers]);

  const filtered = useMemo(() => {
    if (subjectFilter === "all") return papers;
    return papers.filter((p) => p.subject === subjectFilter);
  }, [papers, subjectFilter]);

  const grouped = useMemo(() => {
    const g = {};
    for (const p of filtered) {
      if (!g[p.subject]) g[p.subject] = [];
      g[p.subject].push(p);
    }
    return g;
  }, [filtered]);

  function downloadUrl(path) {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  if (loading) {
    return <p className="small muted">Loading papers…</p>;
  }

  if (error) {
    return <p className="small" style={{ color: "var(--red, #D85A30)" }}>Couldn't load papers: {error}</p>;
  }

  return (
    <div style={{ maxWidth: 880 }}>
      <h2 className="h-display">Past exam papers</h2>
      <p className="small muted" style={{ marginBottom: 20 }}>
        Real VCE exam papers, organised by subject — free to download.
      </p>

      {/* Constrain the select's own width instead of letting the global
          full-width form-control style stretch it across the whole page */}
      <div style={{ maxWidth: 220, marginBottom: 28 }}>
        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
        >
          {subjects.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All subjects" : s}
            </option>
          ))}
        </select>
      </div>

      {papers.length === 0 && (
        <div className="notice">
          No papers uploaded yet — check back soon. New papers are added regularly.
        </div>
      )}

      {Object.keys(grouped)
        .sort()
        .map((subject) => (
          <div key={subject} style={{ marginBottom: 32 }}>
            <h3
              style={{
                fontFamily: "var(--display, 'Spectral', serif)",
                fontSize: 18,
                fontWeight: 700,
                color: "var(--red, #D85A30)",
                borderBottom: "2px solid var(--ink-soft, #26215C)",
                paddingBottom: 6,
                marginBottom: 14,
              }}
            >
              {subject}
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              {grouped[subject].map((p) => (
                <div
                  key={p.id}
                  style={{
                    background: "#fff",
                    border: "2px solid var(--ink, #26215C)",
                    borderRadius: 6,
                    padding: 14,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span
                      style={{
                        fontFamily: "var(--mono, 'IBM Plex Mono', monospace)",
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        color: "var(--red, #D85A30)",
                        background: "rgba(216, 90, 48, 0.1)",
                        padding: "3px 8px",
                        borderRadius: 4,
                      }}
                    >
                      {p.paper_type}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--mono, 'IBM Plex Mono', monospace)",
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--ink-soft, #5F5E5A)",
                      }}
                    >
                      {p.year}
                    </span>
                  </div>
                  <p style={{ fontSize: 14, color: "var(--ink, #26215C)", margin: "2px 0 4px", flexGrow: 1 }}>
                    {p.title}
                  </p>
                  <a
                    className="btn sm ghost"
                    href={downloadUrl(p.file_path)}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ textAlign: "center" }}
                  >
                    Download PDF
                  </a>
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
