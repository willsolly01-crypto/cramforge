export default function Progress({ unit, weak }) {
  const stats = unit.stats || {};
  const rows = Object.entries(stats).sort(
    (a, b) => a[1].scored / Math.max(a[1].max, 1) - b[1].scored / Math.max(b[1].max, 1)
  );
  const history = unit.history || [];
  const totalAttempts = history.length;
  const totalScored = history.reduce((a, h) => a + h.score, 0);
  const totalMax = history.reduce((a, h) => a + h.max, 0);

  const errorTotals = { concept: 0, algebra: 0, arithmetic: 0, incomplete: 0 };
  Object.values(stats).forEach((s) =>
    Object.entries(s.errors || {}).forEach(([k, v]) => (errorTotals[k] += v))
  );
  const dominantError = Object.entries(errorTotals).sort((a, b) => b[1] - a[1])[0];

  if (!rows.length) {
    return (
      <>
        <h2 className="h-display">Progress — {unit.name}</h2>
        <div className="notice">
          Nothing marked yet. Attempt some questions in <strong>Practice</strong> or sit a paper in{" "}
          <strong>Exam mode</strong> — every marked attempt lands here, broken down by topic and
          error type, so the weak spots can't hide.
        </div>
      </>
    );
  }

  return (
    <>
      <h2 className="h-display">Progress — {unit.name}</h2>

      <div className="row" style={{ marginBottom: 22 }}>
        <div className="booklet" style={{ marginBottom: 0 }}>
          <div className="eyebrow">Marked attempts</div>
          <div className="mono" style={{ fontSize: 26, fontWeight: 700 }}>{totalAttempts}</div>
        </div>
        <div className="booklet" style={{ marginBottom: 0 }}>
          <div className="eyebrow">Overall accuracy</div>
          <div className="mono" style={{ fontSize: 26, fontWeight: 700 }}>
            {totalMax ? Math.round((totalScored / totalMax) * 100) : 0}%
          </div>
        </div>
        <div className="booklet" style={{ marginBottom: 0 }}>
          <div className="eyebrow">Most common error</div>
          <div className="mono" style={{ fontSize: 26, fontWeight: 700, color: dominantError[1] ? "var(--red)" : "var(--ink)" }}>
            {dominantError[1] ? dominantError[0] : "none"}
          </div>
        </div>
      </div>

      {weak.length > 0 && (
        <div className="marking" style={{ marginBottom: 22 }}>
          <span className="who">Flagged for revision</span>
          {weak.join(" · ")} — under 60% accuracy. Practice mode will automatically bias new
          questions toward these.
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>Topic</th>
            <th>Attempts</th>
            <th>Marks</th>
            <th>Accuracy</th>
            <th>Errors (con/alg/ari/inc)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([topic, s]) => {
            const acc = s.max ? s.scored / s.max : 0;
            const color = acc >= 0.7 ? "var(--green)" : acc >= 0.5 ? "var(--amber)" : "var(--red)";
            return (
              <tr key={topic}>
                <td style={{ fontWeight: 500 }}>
                  {topic}
                  {weak.includes(topic) && (
                    <span className="mono" style={{ color: "var(--red)", fontSize: 11 }}> ⚑</span>
                  )}
                </td>
                <td className="mono">{s.attempts}</td>
                <td className="mono">
                  {s.scored}/{s.max}
                </td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div className="acc-bar" style={{ flex: 1 }}>
                      <div className="acc-fill" style={{ width: `${acc * 100}%`, background: color }} />
                    </div>
                    <span className="mono small">{Math.round(acc * 100)}%</span>
                  </div>
                </td>
                <td className="mono small muted">
                  {s.errors.concept}/{s.errors.algebra}/{s.errors.arithmetic}/{s.errors.incomplete}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="small muted" style={{ marginTop: 14 }}>
        Error key: <strong>con</strong>cept = wrong method · <strong>alg</strong>ebra = manipulation
        slip · <strong>ari</strong>thmetic = calculation slip · <strong>inc</strong>omplete = right
        path, didn't finish.
      </p>
    </>
  );
}
