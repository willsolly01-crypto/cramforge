import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

const BUCKET = "past-papers";

// A paper counts as a CramForge original if the `source` column says so,
// OR if it lives in a /practice/ folder in the bucket. The second check means
// this works even before add-source-column.sql has been run.
const isCramForge = (r) =>
  String(r.source || "") === "CramForge" ||
  String(r.file_path || "").includes("/practice/");

// ── WHAT'S BEHIND THE PAYWALL ────────────────────────────────
// Free users get every VCAA paper, plus the whole of CramForge Practice
// Paper A — Exam 1, Exam 2 and its worked solutions. Papers B and C, the
// formula sheet and the guide are Pro-only. That's 3 free of 11.
//
// To also free the formula sheet and guide, change the test to:
//   !(FREE_CRAMFORGE.test(title) || r.paper_type === "Reference")
const FREE_CRAMFORGE = /Paper A\b/;

const isLocked = (r, isPro) =>
  !isPro && isCramForge(r) && !FREE_CRAMFORGE.test(String(r.title || ""));

export default function Papers({ isPro = false }) {
  const [rows, setRows] = useState([]);
  const [subject, setSubject] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // select("*") on purpose — naming columns explicitly breaks the whole
      // query if one of them doesn't exist yet.
      // Single .order() on purpose — chaining two .order() calls in supabase-js
      // encodes the separator as %2C and silently returns zero rows with a 200.
      const { data, error } = await supabase
        .from("past_papers")
        .select("*")
        .order("subject");

      if (cancelled) return;

      if (error) {
        console.error("[Papers] load failed:", error);
        setError(error.message || "Unknown error");
        setLoading(false);
        return;
      }

      const list = data || [];
      setRows(list);

      const subjects = [...new Set(list.map((r) => r.subject))].sort();
      setSubject(
        subjects.find((s) => s.toLowerCase().includes("methods")) ||
          subjects[0] ||
          ""
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const subjects = useMemo(
    () => [...new Set(rows.map((r) => r.subject))].sort(),
    [rows]
  );

  const visible = useMemo(
    () => rows.filter((r) => r.subject === subject),
    [rows, subject]
  );

  const vcaa = useMemo(
    () =>
      visible
        .filter((r) => !isCramForge(r))
        .sort(
          (a, b) =>
            (b.year || 0) - (a.year || 0) ||
            String(a.paper_type || "").localeCompare(String(b.paper_type || ""))
        ),
    [visible]
  );

  const cram = useMemo(
    () =>
      visible
        .filter(isCramForge)
        .sort((a, b) =>
          String(a.title || "").localeCompare(String(b.title || ""))
        ),
    [visible]
  );

  const urlFor = (path) =>
    supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  return (
    <div className="cfp">
      <style>{CSS}</style>

      {subjects.length > 0 && (
        <div className="cfp-toolbar">
          <select
            className="cfp-select"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          >
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading && <p className="cfp-msg">Loading papers…</p>}

      {error && (
        <div className="cfp-errbox">
          <strong>Couldn’t load papers.</strong>
          <div className="cfp-errdetail">{error}</div>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="cfp-msg">No papers have been added yet.</p>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="cfp-cols">
          <Column
            heading="VCE"
            sub="Official VCAA past examinations"
            tone="navy"
            papers={vcaa}
            urlFor={urlFor}
            isPro={isPro}
            empty="No VCAA papers for this subject yet."
          />
          <Column
            heading="CramForge"
            sub="Original practice exams written by CramForge"
            tone="coral"
            note="Not VCAA papers and not endorsed by the VCAA."
            papers={cram}
            urlFor={urlFor}
            isPro={isPro}
            empty="No CramForge practice papers for this subject yet."
          />
        </div>
      )}
    </div>
  );
}

function Column({ heading, sub, tone, note, papers, urlFor, isPro, empty }) {
  return (
    <section className={`cfp-col cfp-col--${tone}`}>
      <header className="cfp-colhead">
        <h2 className="cfp-h2">{heading}</h2>
        <p className="cfp-sub">{sub}</p>
        <p className="cfp-note">{note || "\u00A0"}</p>
      </header>

      {papers.length === 0 ? (
        <p className="cfp-msg">{empty}</p>
      ) : (
        <div className="cfp-grid">
          {papers.map((p) => {
            const locked = isLocked(p, isPro);
            return (
              <article
                key={p.id}
                className={"cfp-card" + (locked ? " cfp-card--locked" : "")}
              >
                <div className={locked ? "cfp-blur" : undefined}>
                  <div className="cfp-cardtop">
                    <span className="cfp-badge">{p.paper_type}</span>
                    <span className="cfp-year">{p.year}</span>
                  </div>
                  <h3 className="cfp-title">{p.title}</h3>
                </div>

                {locked ? (
                  <>
                    <div className="cfp-lockwrap">
                      <span className="cfp-lock">Pro only</span>
                    </div>
                    <button
                      type="button"
                      className="cfp-dl cfp-dl--locked"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent("cf:upgrade"));
                        alert(
                          "This paper is part of CramForge Pro.\n\nUpgrade in the Account tab to unlock every practice exam."
                        );
                      }}
                    >
                      Unlock with Pro
                    </button>
                  </>
                ) : (
                  <a
                    className="cfp-dl"
                    href={urlFor(p.file_path)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Download PDF
                  </a>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

const CSS = `
.cfp { --navy:#152540; --coral:#C8353C; --line:#D8DDE5; --ink:#1B2433; }

.cfp-toolbar { margin-bottom: 22px; }
.cfp-select {
  font: 500 15px/1.2 Inter, system-ui, sans-serif;
  color: var(--ink); padding: 12px 16px; min-width: 280px;
  background:#fff; border: 1.5px solid var(--navy); border-radius: 3px;
}

.cfp-msg { font: 400 14px/1.5 Inter, system-ui, sans-serif; color:#5A6472; }

.cfp-errbox {
  font: 400 14px/1.5 Inter, system-ui, sans-serif;
  border: 1.5px solid var(--coral); border-radius: 3px;
  padding: 14px 16px; color: var(--coral); background: rgba(200,53,60,.06);
}
.cfp-errdetail {
  font: 400 12px/1.5 "IBM Plex Mono", ui-monospace, monospace;
  margin-top: 6px; color:#5A6472; word-break: break-word;
}

.cfp-cols { display: grid; grid-template-columns: 1fr; gap: 34px; }
@media (min-width: 1100px) {
  .cfp-cols { grid-template-columns: 1fr 1fr; gap: 30px; }
  .cfp-col--coral { border-left: 1.5px solid var(--line); padding-left: 30px; }
}

.cfp-colhead { margin-bottom: 18px; min-height: 104px; }
.cfp-h2 {
  font: 700 26px/1.2 Spectral, Georgia, serif;
  margin: 0; padding-bottom: 8px; border-bottom: 2px solid currentColor;
}
.cfp-col--navy  .cfp-h2 { color: var(--navy); }
.cfp-col--coral .cfp-h2 { color: var(--coral); }

.cfp-sub {
  font: 500 11px/1.4 "IBM Plex Mono", ui-monospace, monospace;
  letter-spacing: .08em; text-transform: uppercase;
  color:#5A6472; margin: 8px 0 0;
}
.cfp-note {
  font: 400 12px/1.45 Inter, system-ui, sans-serif;
  color: var(--coral); margin: 6px 0 0; min-height: 17px;
}

/* grid-auto-rows keeps every card the same height, so rows in the two
   columns line up horizontally instead of drifting apart. */
.cfp-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 16px; grid-auto-rows: 232px;
}
@media (max-width: 760px) { .cfp-grid { grid-template-columns: 1fr; } }

.cfp-card {
  position: relative; overflow: hidden;
  border: 1.5px solid var(--navy); border-radius: 3px; background:#fff;
  padding: 16px; display: flex; flex-direction: column; gap: 12px;
}
.cfp-col--coral .cfp-card { border-color: var(--coral); }
.cfp-card--locked { background:#FBFAF7; }

.cfp-blur { filter: blur(3.5px); opacity: .55; user-select: none; pointer-events: none; }

.cfp-lockwrap { flex: 1; display: flex; align-items: center; justify-content: center; }
.cfp-lock {
  font: 700 11px/1 "IBM Plex Mono", ui-monospace, monospace;
  letter-spacing: .1em; text-transform: uppercase;
  color:#fff; background: var(--coral);
  padding: 7px 12px; border-radius: 2px;
}

.cfp-cardtop { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.cfp-badge {
  font: 700 11px/1.2 "IBM Plex Mono", ui-monospace, monospace;
  letter-spacing: .05em; color: var(--coral); background: rgba(200,53,60,.10);
  padding: 6px 9px; border-radius: 2px;
}
.cfp-year {
  font: 700 14px/1 "IBM Plex Mono", ui-monospace, monospace;
  color: var(--navy); flex-shrink: 0;
}

.cfp-title {
  font: 400 15px/1.4 Inter, system-ui, sans-serif;
  color: var(--ink); margin: 10px 0 0;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
  overflow: hidden;
}

.cfp-dl {
  display: block; text-align: center; margin-top: auto;
  font: 700 12px/1 "IBM Plex Mono", ui-monospace, monospace;
  letter-spacing: .08em; text-transform: uppercase;
  color: var(--navy); text-decoration: underline;
  padding: 12px; border: 1.5px solid var(--navy); border-radius: 2px;
  background: none; width: 100%; cursor: pointer;
}
.cfp-dl:hover { background: var(--navy); color:#fff; }
.cfp-col--coral .cfp-dl { color: var(--coral); border-color: var(--coral); }
.cfp-col--coral .cfp-dl:hover { background: var(--coral); color:#fff; }
.cfp-dl--locked { text-decoration: none; }
`;
