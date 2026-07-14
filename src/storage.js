// All user data lives in localStorage under one key.
// Shape:
// {
//   activeUnitId: string|null,
//   units: {
//     [id]: {
//       id, name,
//       materials: [{ title, topics: [...], notes: "..." }],
//       stats: { [topic]: { attempts, scored, max, errors: { concept, algebra, arithmetic, incomplete } } },
//       history: [{ ts, topic, score, max, errorType, mode }]
//     }
//   }
// }

const KEY = "cramforge-v1";

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { activeUnitId: null, units: {} };
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Could not save — storage may be full.", e);
  }
}

// Subject types determine the question format and marking rubric
export const SUBJECT_TYPES = [
  { value: "stem",       label: "STEM (maths, science, engineering)" },
  { value: "essay",      label: "Essay (humanities, social science)" },
  { value: "law",        label: "Law (IRAC analysis)" },
  { value: "accounting", label: "Accounting (journal entries, ratios)" },
  { value: "medicine",   label: "Medicine / Health Sciences" },
];

export function newUnit(name, subjectType = "stem") {
  return {
    id: "u" + Date.now().toString(36),
    name,
    subjectType,
    materials: [],
    stats: {},
    history: [],
  };
}

export function unitTopics(unit) {
  const set = new Set();
  (unit.materials || []).forEach((m) => (m.topics || []).forEach((t) => set.add(t)));
  return Array.from(set);
}

export function unitNotes(unit) {
  return (unit.materials || [])
    .map((m) => `--- ${m.title} ---\n${m.notes}`)
    .join("\n\n");
}

export function recordResult(unit, { topic, score, max, errorType, mode }) {
  const stats = { ...(unit.stats || {}) };
  const s = stats[topic] || {
    attempts: 0,
    scored: 0,
    max: 0,
    errors: { concept: 0, algebra: 0, arithmetic: 0, incomplete: 0 },
  };
  const errors = { ...s.errors };
  if (errorType && errorType !== "none") {
    errors[errorType] = (errors[errorType] || 0) + 1;
  }
  stats[topic] = {
    attempts: s.attempts + 1,
    scored: s.scored + score,
    max: s.max + max,
    errors,
  };
  const history = [
    ...(unit.history || []),
    { ts: Date.now(), topic, score, max, errorType, mode },
  ].slice(-500);
  return { ...unit, stats, history };
}

export function weakTopics(unit) {
  const out = [];
  Object.entries(unit.stats || {}).forEach(([topic, s]) => {
    if (s.attempts >= 2 && s.max > 0 && s.scored / s.max < 0.6) out.push(topic);
  });
  return out;
}

export function exportBackup(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cramforge-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
