import { useState, useEffect } from "react";
import { loadBank, getSharedSet } from "./api.js";

const SUBJECT_FILTERS = [
  { value: "",            label: "All subjects" },
  { value: "stem",        label: "STEM / Maths" },
  { value: "essay",       label: "Humanities" },
  { value: "law",         label: "Law" },
  { value: "accounting",  label: "Accounting" },
  { value: "medicine",    label: "Medicine" },
];

const SUBJECT_EMOJI = {
  stem:       "🔢",
  essay:      "📝",
  law:        "⚖️",
  accounting: "💼",
  medicine:   "🩺",
};

function SetCard({ set, onOpen, isPro, setIndex }) {
  const freeQuota = 3; // free users can browse 3 sets per session (tracked in localStorage)
  const tried  = JSON.parse(localStorage.getItem("cf_bank_tried") || "[]");
  const locked = !isPro && set.featured && !tried.includes(set.id) && tried.length >= freeQuota;

  const handleClick = () => {
    if (locked) {
      window.dispatchEvent(new CustomEvent("cramforge:limit", {
        detail: { message: "Upgrade to Pro to access all featured question sets in the bank — free users can open 3 per session." }
      }));
      return;
    }
    // Track opened sets for free users
    if (!isPro && !tried.includes(set.id)) {
      const next = [...tried, set.id].slice(-20);
      localStorage.setItem("cf_bank_tried", JSON.stringify(next));
    }
    onOpen(set.id);
  };

  return (
    <div
      className="booklet"
      style={{
        cursor: "pointer", opacity: locked ? 0.6 : 1,
        transition: "box-shadow 0.15s",
        position: "relative",
      }}
      onClick={handleClick}
      onMouseEnter={(e) => e.currentTarget.style.boxShadow = "0 4px 16px rgba(26,34,56,0.12)"}
      onMouseLeave={(e) => e.currentTarget.style.boxShadow = ""}
    >
      {set.featured && (
        <span style={{
          position: "absolute", top: 12, right: 12,
          background: "var(--highlight)", color: "var(--ink)",
          fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700,
          letterSpacing: "0.1em", padding: "3px 8px", borderRadius: 4
        }}>
          FEATURED
        </span>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 22 }}>{SUBJECT_EMOJI[set.subject_type] || "📚"}</span>
        <span className="eyebrow">{set.subject_type || "general"}</span>
        {locked && <span className="eyebrow" style={{ color: "var(--red)", marginLeft: "auto", paddingRight: 32 }}>PRO</span>}
      </div>

      <div style={{ fontFamily: "var(--display)", fontSize: 17, fontWeight: 600, marginBottom: 6 }}>
        {set.unit_name}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <span className="small muted">{set.question_count || "?"} questions</span>
        <span className="small muted">·</span>
        <span className="small muted">{set.view_count || 0} views</span>
        <span className="small muted">·</span>
        <span className="small muted">
          {new Date(set.created_at).toLocaleDateString("en-AU", { month: "short", day: "numeric" })}
        </span>
      </div>
    </div>
  );
}

// Inline viewer for a set opened from the bank
function SetViewer({ setId, onBack }) {
  const [questions, setQuestions] = useState(null);
  const [meta,      setMeta]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");

  useEffect(() => {
    getSharedSet(setId).then((d) => {
      if (d?.questions) {
        setQuestions(d.questions);
        setMeta({ unitName: d.unitName, subjectType: d.subjectType });
      } else {
        setError("Could not load this question set.");
      }
    }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [setId]);

  if (loading) return <div className="notice"><span className="spin">◌</span> Loading…</div>;
  if (error)   return <div className="notice">{error} <button className="btn ghost sm" onClick={onBack}>Back</button></div>;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button className="btn ghost sm" onClick={onBack}>← Back to bank</button>
        <h2 className="h-display" style={{ margin: 0 }}>{meta?.unitName}</h2>
      </div>
      {(questions || []).map((q, i) => (
        <div className="booklet" key={i}>
          <span className="qtopic">{q.topic}</span>
          <div className="qhead">
            <span className="qnum">Question {i + 1}</span>
            <span className="qmarks">({q.marks} marks)</span>
          </div>
          <p className="qtext">{q.text}</p>
          <details>
            <summary className="btn ghost sm" style={{ display: "inline-flex", cursor: "pointer" }}>
              Show worked solution
            </summary>
            <div className="solution">
              <span className="label">Model solution</span>
              {q.solution}
            </div>
          </details>
        </div>
      ))}
    </>
  );
}

export default function QuestionBank({ isPro }) {
  const [subject,  setSubject]  = useState("");
  const [featured, setFeatured] = useState(false);
  const [sets,     setSets]     = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [openId,   setOpenId]   = useState(null);

  const perPage = 12;

  useEffect(() => {
    setLoading(true);
    loadBank({ subject: subject || undefined, featured: featured || undefined, page })
      .then((d) => {
        setSets(d.sets || []);
        setTotal(d.total || 0);
      })
      .finally(() => setLoading(false));
  }, [subject, featured, page]);

  if (openId) {
    return <SetViewer setId={openId} onBack={() => setOpenId(null)} />;
  }

  return (
    <>
      <h2 className="h-display">Question Bank</h2>
      <p className="small muted" style={{ marginBottom: 20 }}>
        Browse question sets shared by the CramForge community. Use them to practise without uploading notes, or share your own generated sets.
        {!isPro && " Free users can open 3 sets per session — Pro unlocks all."}
      </p>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div className="chips">
          {SUBJECT_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              className={"chip" + (subject === value ? " on" : "")}
              onClick={() => { setSubject(value); setPage(0); }}
            >
              {label}
            </button>
          ))}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={featured}
            onChange={(e) => { setFeatured(e.target.checked); setPage(0); }}
          />
          <span className="small">Featured only</span>
        </label>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="notice"><span className="spin">◌</span> Loading sets…</div>
      ) : sets.length === 0 ? (
        <div className="notice">
          No question sets found{subject ? ` for ${subject}` : ""}{featured ? " (featured)" : ""}.
          <br />Generate some questions in Practice mode and share them to grow the bank!
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 16, marginBottom: 24
        }}>
          {sets.map((set, i) => (
            <SetCard key={set.id} set={set} onOpen={setOpenId} isPro={isPro} setIndex={i} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > perPage && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button className="btn ghost sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            ← Prev
          </button>
          <span className="small muted" style={{ lineHeight: "32px" }}>
            Page {page + 1} of {Math.ceil(total / perPage)}
          </span>
          <button className="btn ghost sm" disabled={(page + 1) * perPage >= total} onClick={() => setPage(page + 1)}>
            Next →
          </button>
        </div>
      )}
    </>
  );
}
