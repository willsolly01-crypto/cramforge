// api/class.js — Class management for tutors and students.
//
// POST /api/class        { action: "create", name }         → create a class (tutor)
// POST /api/class        { action: "join",   code }         → join a class (student)
// POST /api/class        { action: "leave",  classId }      → leave a class (student)
// POST /api/class        { action: "delete", classId }      → delete a class (tutor)
// GET  /api/class                                            → list classes the user is in/owns

import { requireUser, sendErr, httpErr } from "./_auth.js";
import { readBody } from "./_claude.js";

export default async function handler(req, res) {
  try {
    const { sb, user } = await requireUser(req);

    // ── GET: list classes ──────────────────────────────────────────────────
    if (req.method === "GET") {
      // Classes the user created (as tutor)
      const { data: ownedClasses } = await sb
        .from("classes")
        .select("id, name, code, created_at")
        .eq("tutor_id", user.id)
        .order("created_at", { ascending: false });

      // Member counts for owned classes
      const ownedWithCounts = await Promise.all(
        (ownedClasses || []).map(async (cls) => {
          const { count } = await sb
            .from("class_members")
            .select("*", { count: "exact", head: true })
            .eq("class_id", cls.id);
          return { ...cls, memberCount: count || 0, role: "tutor" };
        })
      );

      // Classes the user joined (as student)
      const { data: memberships } = await sb
        .from("class_members")
        .select("class_id, joined_at, classes(id, name, code, tutor_id)")
        .eq("student_id", user.id);

      const joinedClasses = (memberships || []).map((m) => ({
        ...m.classes,
        joinedAt: m.joined_at,
        role: "student",
      }));

      return res.status(200).json({
        owned:  ownedWithCounts,
        joined: joinedClasses,
      });
    }

    // ── POST: actions ──────────────────────────────────────────────────────
    if (req.method === "POST") {
      const { action, name, code, classId } = await readBody(req);

      // Create a new class
      if (action === "create") {
        if (!name?.trim()) return res.status(400).json({ error: "Class name is required." });

        const { data, error } = await sb
          .from("classes")
          .insert({ tutor_id: user.id, name: name.trim() })
          .select()
          .single();

        if (error) throw error;
        return res.status(201).json({ class: data });
      }

      // Join a class by code
      if (action === "join") {
        if (!code?.trim()) return res.status(400).json({ error: "Class code is required." });

        const { data: cls } = await sb
          .from("classes")
          .select("id, name, code, tutor_id")
          .eq("code", code.trim().toUpperCase())
          .maybeSingle();

        if (!cls) {
          return res.status(404).json({ error: `No class found with code "${code.trim().toUpperCase()}". Check the code with your tutor.` });
        }
        if (cls.tutor_id === user.id) {
          return res.status(400).json({ error: "You can't join your own class as a student." });
        }

        const { error } = await sb
          .from("class_members")
          .insert({ class_id: cls.id, student_id: user.id });

        if (error?.code === "23505") {
          return res.status(200).json({ class: cls, alreadyMember: true });
        }
        if (error) throw error;
        return res.status(201).json({ class: cls });
      }

      // Leave a class
      if (action === "leave") {
        if (!classId) return res.status(400).json({ error: "classId is required." });
        await sb.from("class_members")
          .delete()
          .eq("class_id", classId)
          .eq("student_id", user.id);
        return res.status(200).json({ ok: true });
      }

      // Delete a class (tutor only)
      if (action === "delete") {
        if (!classId) return res.status(400).json({ error: "classId is required." });
        const { data: cls } = await sb
          .from("classes").select("tutor_id").eq("id", classId).maybeSingle();
        if (!cls || cls.tutor_id !== user.id) {
          throw httpErr(403, "Only the class creator can delete it.");
        }
        await sb.from("classes").delete().eq("id", classId);
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    return res.status(405).json({ error: "GET or POST only" });
  } catch (e) {
    return sendErr(res, e);
  }
}
