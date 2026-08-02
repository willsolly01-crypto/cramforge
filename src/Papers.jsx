import { useEffect, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

// Reuses the same public env vars your app already has in Vercel.
// If you already export a shared client elsewhere (e.g. src/supabaseClient.js),
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
    return (
      <div style={styles.wrap}>
        <p style={styles.muted}>Loading papers…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.wrap}>
        <p style={styles.error}>Couldn't load papers: {error}</p>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <h2 style={styles.h2}>Past exam papers</h2>
        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          style={styles.select}
        >
          {subjects.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All subjects" : s}
            </option>
          ))}
        </select>
      </div>

      {papers.length === 0 && (
        <p style={styles.muted}>No papers uploaded yet — check back soon.</p>
      )}

      {Object.keys(grouped)
        .sort()
        .map((subject) => (
          <div key={subject} style={styles.group}>
            <h3 style={styles.subjectTitle}>{subject}</h3>
            <div style={styles.grid}>
              {grouped[subject].map((p) => (
                <div key={p.id} style={styles.card}>
                  <div style={styles.cardTop}>
                    <span style={styles.badge}>{p.paper_type}</span>
                    <span style={styles.year}>{p.year}</span>
                  </div>
                  <p style={styles.title}>{p.title}</p>
                  <a
                    href={downloadUrl(p.file_path)}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.downloadBtn}
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

const styles = {
  wrap: {
    fontFamily: "'IBM Plex Mono', monospace",
    padding: "24px",
    backgroundImage:
      "linear-gradient(#e6e2d6 1px, transparent 1px), linear-gradient(90deg, #e6e2d6 1px, transparent 1px)",
    backgroundSize: "26px 26px",
    backgroundColor: "#FAF8F2",
    minHeight: "100%",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "24px",
    flexWrap: "wrap",
    gap: "12px",
  },
  h2: {
    fontFamily: "'Spectral', serif",
    fontWeight: 700,
    fontSize: "28px",
    color: "#26215C",
    margin: 0,
  },
  select: {
    padding: "8px 12px",
    border: "2px solid #26215C",
    borderRadius: "4px",
    background: "white",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "14px",
    color: "#26215C",
  },
  group: { marginBottom: "32px" },
  subjectTitle: {
    fontFamily: "'Spectral', serif",
    fontSize: "20px",
    color: "#712B13",
    borderBottom: "2px solid #26215C",
    paddingBottom: "6px",
    marginBottom: "14px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: "14px",
  },
  card: {
    background: "white",
    border: "2px solid #26215C",
    borderRadius: "6px",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badge: {
    fontSize: "11px",
    fontWeight: 700,
    color: "#712B13",
    background: "#FAECE7",
    padding: "3px 8px",
    borderRadius: "4px",
    letterSpacing: "1px",
  },
  year: { fontSize: "13px", color: "#5F5E5A", fontWeight: 700 },
  title: { fontSize: "14px", color: "#444441", margin: "4px 0", flexGrow: 1 },
  downloadBtn: {
    display: "inline-block",
    textAlign: "center",
    background: "#26215C",
    color: "white",
    padding: "8px 12px",
    borderRadius: "4px",
    textDecoration: "none",
    fontSize: "13px",
    fontWeight: 700,
  },
  muted: { color: "#5F5E5A" },
  error: { color: "#993C1D" },
};
