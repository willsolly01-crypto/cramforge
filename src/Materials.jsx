import { useState } from "react";
import { ingestMaterial, fileToBase64, fileToText } from "./api.js";

const MAX_PDF_MB = 3;

export default function Materials({ unit, updateUnit }) {
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const addMaterial = (m) => {
    updateUnit({ ...unit, materials: [...(unit.materials || []), m] });
  };

  const removeMaterial = (idx) => {
    const materials = (unit.materials || []).filter((_, i) => i !== idx);
    updateUnit({ ...unit, materials });
  };

  const ingest = async (payload, label) => {
    setBusy(true);
    setError("");
    setStatus(`Reading ${label}… this takes ~20 seconds`);
    try {
      const out = await ingestMaterial({ ...payload, unitName: unit.name });
      addMaterial({
        title: out.materialTitle || label,
        topics: out.topics || [],
        notes: out.notes || "",
      });
      setStatus("");
      setPasted("");
    } catch (e) {
      setError(e.message);
      setStatus("");
    }
    setBusy(false);
  };

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    for (const file of files) {
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        if (file.size > MAX_PDF_MB * 1024 * 1024) {
          setError(`${file.name} is over ${MAX_PDF_MB}MB. Split it (e.g. per topic) and upload the parts.`);
          continue;
        }
        const pdfBase64 = await fileToBase64(file);
        await ingest({ pdfBase64 }, file.name);
      } else {
        const text = await fileToText(file);
        await ingest({ text }, file.name);
      }
    }
  };

  return (
    <>
      <h2 className="h-display">Course materials — {unit.name}</h2>

      <div className="booklet">
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Upload notes, past papers, or summaries
        </div>
        <p className="small muted" style={{ marginTop: 0 }}>
          PDF (max {MAX_PDF_MB}MB each), .txt or .md files. CramForge extracts the topics and
          everything needed to write exam questions — formulas, methods, definitions.
        </p>
        <label className="btn" style={{ display: "inline-block" }}>
          {busy ? "Working…" : "Choose files"}
          <input
            type="file"
            accept=".pdf,.txt,.md,text/plain,application/pdf"
            multiple
            onChange={handleFiles}
            disabled={busy}
            style={{ display: "none" }}
          />
        </label>

        <div style={{ margin: "20px 0 8px" }} className="eyebrow">
          Or paste content directly
        </div>
        <textarea
          rows={5}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder="Paste lecture notes, a topic list, or typed-up past paper questions…"
          disabled={busy}
        />
        <button
          className="btn"
          style={{ marginTop: 10 }}
          disabled={busy || !pasted.trim()}
          onClick={() => ingest({ text: pasted.trim() }, "Pasted notes")}
        >
          {busy ? "Working…" : "Add pasted notes"}
        </button>

        {status && (
          <p className="small mono" style={{ marginTop: 12 }}>
            <span className="spin">◌</span> {status}
          </p>
        )}
        {error && <p className="error-text">{error}</p>}
      </div>

      <div className="eyebrow" style={{ marginBottom: 12 }}>
        {(unit.materials || []).length
          ? `Loaded materials (${unit.materials.length})`
          : "No materials yet"}
      </div>

      {(unit.materials || []).map((m, i) => (
        <div className="booklet" key={i}>
          <div className="qhead">
            <span className="qnum">{m.title}</span>
            <button className="btn sm ghost" onClick={() => removeMaterial(i)}>
              Remove
            </button>
          </div>
          <div className="chips">
            {(m.topics || []).map((t) => (
              <span className="chip" key={t} style={{ cursor: "default" }}>
                {t}
              </span>
            ))}
          </div>
        </div>
      ))}

      {!(unit.materials || []).length && (
        <div className="notice">
          The more you give it, the better the questions. Lecture slides exported as PDF, your own
          summary notes, and one past paper is the ideal starter pack.
        </div>
      )}
    </>
  );
}
