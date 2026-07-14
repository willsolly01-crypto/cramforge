import { useState, useEffect } from "react";
import { createClass, joinClass, leaveClass, deleteClass, loadClasses } from "./api.js";

function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

function ClassCard({ cls, role, onAction }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    copyToClipboard(cls.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="booklet" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 17, fontWeight: 600, marginBottom: 4 }}>
            {cls.name}
          </div>
          <div className="small muted">
            {role === "tutor" ? "You created this class" : "Joined"} ·{" "}
            {new Date(cls.created_at || cls.joinedAt).toLocaleDateString("en-AU", { month: "short", year: "numeric" })}
          </div>
          {role === "tutor" && (
            <div className="small muted">
              {cls.memberCount || 0} student{cls.memberCount !== 1 ? "s" : ""}
            </div>
          )}
        </div>

        {/* Join code */}
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700,
            letterSpacing: "0.14em", color: "var(--ink)",
            background: "var(--highlight)", padding: "6px 12px", borderRadius: 6,
            userSelect: "all"
          }}>
            {cls.code}
          </div>
          {role === "tutor" && (
            <button className="btn ghost sm" style={{ marginTop: 6, width: "100%" }} onClick={copy}>
              {copied ? "✓ Copied" : "Copy code"}
            </button>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        {role === "tutor" && (
          <button
            className="btn ghost sm"
            style={{ color: "var(--red)", borderColor: "var(--red)" }}
            onClick={() => onAction("delete", cls.id)}
          >
            Delete class
          </button>
        )}
        {role === "student" && (
          <button
            className="btn ghost sm"
            style={{ color: "var(--red)", borderColor: "var(--red)" }}
            onClick={() => onAction("leave", cls.id)}
          >
            Leave class
          </button>
        )}
      </div>
    </div>
  );
}

export default function ClassManager() {
  const [classes, setClasses] = useState({ owned: [], joined: [] });
  const [loading, setLoading] = useState(true);
  const [view,    setView]    = useState("list"); // list | create | join
  // Create form
  const [newName, setNewName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createMsg,  setCreateMsg]  = useState("");
  // Join form
  const [joinCode, setJoinCode]  = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinMsg,  setJoinMsg]  = useState("");

  const reload = () => {
    setLoading(true);
    loadClasses().then(setClasses).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(reload, []);

  const handleCreate = async () => {
    if (!newName.trim() || createBusy) return;
    setCreateBusy(true);
    setCreateMsg("");
    try {
      await createClass(newName.trim());
      setNewName("");
      setView("list");
      reload();
    } catch (e) {
      setCreateMsg(e.message);
    }
    setCreateBusy(false);
  };

  const handleJoin = async () => {
    if (!joinCode.trim() || joinBusy) return;
    setJoinBusy(true);
    setJoinMsg("");
    try {
      const { class: cls, alreadyMember } = await joinClass(joinCode.trim().toUpperCase());
      if (alreadyMember) {
        setJoinMsg(`You're already in "${cls.name}".`);
      } else {
        setJoinMsg(`Joined "${cls.name}" successfully!`);
        setJoinCode("");
        reload();
      }
    } catch (e) {
      setJoinMsg(e.message);
    }
    setJoinBusy(false);
  };

  const handleAction = async (action, id) => {
    if (action === "delete" && !window.confirm("Delete this class and remove all students? This can't be undone.")) return;
    if (action === "leave"  && !window.confirm("Leave this class?")) return;
    try {
      if (action === "delete") await deleteClass(id);
      if (action === "leave")  await leaveClass(id);
      reload();
    } catch (e) {
      alert(e.message);
    }
  };

  const totalClasses = classes.owned.length + classes.joined.length;

  return (
    <>
      <div className="eyebrow" style={{ marginBottom: 16, marginTop: 32 }}>Class codes</div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {["list", "create", "join"].map((v) => (
          <button
            key={v}
            className="btn ghost sm"
            style={view === v ? { background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" } : {}}
            onClick={() => setView(v)}
          >
            {v === "list" ? `My classes${totalClasses > 0 ? ` (${totalClasses})` : ""}` : v === "create" ? "+ Create class" : "Join a class"}
          </button>
        ))}
      </div>

      {/* List */}
      {view === "list" && (
        <>
          {loading ? (
            <div className="notice"><span className="spin">◌</span> Loading classes…</div>
          ) : totalClasses === 0 ? (
            <div className="notice">
              You haven't created or joined any classes yet.
              <br />
              <strong>Tutors:</strong> create a class and share the 6-character code with your students.
              <br />
              <strong>Students:</strong> enter the code your tutor gave you.
            </div>
          ) : (
            <>
              {classes.owned.length > 0 && (
                <>
                  <div className="eyebrow" style={{ marginBottom: 10 }}>Classes you teach</div>
                  {classes.owned.map((cls) => (
                    <ClassCard key={cls.id} cls={cls} role="tutor" onAction={handleAction} />
                  ))}
                </>
              )}
              {classes.joined.length > 0 && (
                <>
                  <div className="eyebrow" style={{ marginBottom: 10, marginTop: 16 }}>Classes you're in</div>
                  {classes.joined.map((cls) => (
                    <ClassCard key={cls.id} cls={cls} role="student" onAction={handleAction} />
                  ))}
                </>
              )}
            </>
          )}
        </>
      )}

      {/* Create */}
      {view === "create" && (
        <div className="booklet">
          <div className="eyebrow" style={{ marginBottom: 12 }}>Create a class</div>
          <p className="small muted" style={{ marginTop: 0, marginBottom: 16 }}>
            Students join using the 6-character code. Share question sets with them via the bank.
          </p>
          <label className="eyebrow" htmlFor="class-name">Class name</label>
          <input
            id="class-name"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="e.g. MATH1051 Tutorials, Year 12 Chemistry"
            style={{ marginBottom: 12 }}
          />
          <button className="btn" onClick={handleCreate} disabled={createBusy || !newName.trim()}>
            {createBusy ? "Creating…" : "Create class →"}
          </button>
          {createMsg && <p className="error-text">{createMsg}</p>}
        </div>
      )}

      {/* Join */}
      {view === "join" && (
        <div className="booklet">
          <div className="eyebrow" style={{ marginBottom: 12 }}>Join a class</div>
          <p className="small muted" style={{ marginTop: 0, marginBottom: 16 }}>
            Enter the 6-character code your tutor shared with you.
          </p>
          <label className="eyebrow" htmlFor="join-code">Class code</label>
          <input
            id="join-code"
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            placeholder="e.g. MATH01"
            style={{ fontFamily: "var(--mono)", letterSpacing: "0.2em", fontSize: 18, textTransform: "uppercase", marginBottom: 12 }}
            maxLength={6}
          />
          <button className="btn" onClick={handleJoin} disabled={joinBusy || joinCode.length < 6}>
            {joinBusy ? "Joining…" : "Join class →"}
          </button>
          {joinMsg && (
            <p className={joinMsg.includes("success") || joinMsg.includes("already") ? "small" : "error-text"}
               style={joinMsg.includes("success") ? { color: "var(--green)" } : {}}>
              {joinMsg}
            </p>
          )}
        </div>
      )}
    </>
  );
}
