// api/social.js — friends, study feed, and classes behind one function.
// Dispatched by body.scope: "friends" | "feed" | "class".
// Each scope keeps its original { action, ... } contract.
//
//   POST /api/social { scope: "friends", action: "search"|"request"|"accept"|"remove"|"list", ... }
//   POST /api/social { scope: "feed",    action: "post"|"feed"|"delete", ... }
//   POST /api/social { scope: "class",   action: "create"|"join"|"leave"|"delete", ... }
//   GET  /api/social?scope=class   → list classes the user is in/owns

import { requireUser, sendErr, httpErr } from "../lib/_auth.js";
import { readBody } from "../lib/_claude.js";

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const FEED_LIMIT = 50;

// ── FRIENDS ──────────────────────────────────────────────────────────────────
async function friends(req, res, sb, user, body) {
  const action = body.action;

  if (action === "search") {
    const q = String(body.query || "").trim();
    if (q.length < 2) throw httpErr(400, "Type at least 2 characters.");
    const { data } = await sb
      .from("profiles")
      .select("id, username, display_name")
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .neq("id", user.id)
      .not("username", "is", null)
      .limit(10);
    return res.status(200).json({ results: data || [] });
  }

  if (action === "request") {
    const target = body.userId;
    if (!target || target === user.id) throw httpErr(400, "Invalid user.");
    const { data: existing } = await sb
      .from("friendships")
      .select("id, status")
      .or(`and(requester.eq.${user.id},addressee.eq.${target}),and(requester.eq.${target},addressee.eq.${user.id})`)
      .maybeSingle();
    if (existing) {
      throw httpErr(409, existing.status === "accepted" ? "Already friends." : "Request already pending.");
    }
    await sb.from("friendships").insert({ requester: user.id, addressee: target });
    return res.status(200).json({ ok: true });
  }

  if (action === "accept") {
    const { data: row } = await sb.from("friendships").select("*").eq("id", body.friendshipId).maybeSingle();
    if (!row || row.addressee !== user.id) throw httpErr(403, "Not your request to accept.");
    await sb.from("friendships").update({ status: "accepted" }).eq("id", row.id);
    return res.status(200).json({ ok: true });
  }

  if (action === "remove") {
    const { data: row } = await sb.from("friendships").select("*").eq("id", body.friendshipId).maybeSingle();
    if (!row || (row.requester !== user.id && row.addressee !== user.id)) {
      throw httpErr(403, "Not your friendship to remove.");
    }
    await sb.from("friendships").delete().eq("id", row.id);
    return res.status(200).json({ ok: true });
  }

  if (action === "list") {
    const { data: rows } = await sb
      .from("friendships")
      .select("*")
      .or(`requester.eq.${user.id},addressee.eq.${user.id}`);
    const all = rows || [];
    const otherIds = Array.from(
      new Set(all.map((r) => (r.requester === user.id ? r.addressee : r.requester)))
    );
    let profiles = {};
    if (otherIds.length) {
      const { data: profs } = await sb.from("profiles").select("id, username, display_name").in("id", otherIds);
      (profs || []).forEach((p) => (profiles[p.id] = p));
    }
    const decorate = (r) => {
      const otherId = r.requester === user.id ? r.addressee : r.requester;
      const p = profiles[otherId] || {};
      return { friendshipId: r.id, userId: otherId, username: p.username, displayName: p.display_name };
    };
    return res.status(200).json({
      friends: all.filter((r) => r.status === "accepted").map(decorate),
      incoming: all.filter((r) => r.status === "pending" && r.addressee === user.id).map(decorate),
      outgoing: all.filter((r) => r.status === "pending" && r.requester === user.id).map(decorate),
    });
  }

  throw httpErr(400, "Unknown action.");
}

// ── FEED ─────────────────────────────────────────────────────────────────────
async function feed(req, res, sb, user, body) {
  const action = body.action;

  if (action === "post") {
    const { imageBase64, mediaType, caption, unitName, durationMinutes } = body;
    if (!imageBase64) throw httpErr(400, "A photo is required.");
    if (!/^image\/(jpeg|png|webp)$/.test(mediaType || "")) {
      throw httpErr(400, "Photo must be JPEG, PNG, or WebP.");
    }
    const buffer = Buffer.from(imageBase64, "base64");
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw httpErr(400, "Photo too large — try again, it should compress automatically.");
    }
    const ext = mediaType === "image/png" ? "png" : mediaType === "image/webp" ? "webp" : "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await sb.storage
      .from("study-photos")
      .upload(path, buffer, { contentType: mediaType, upsert: false });
    if (upErr) throw httpErr(500, "Photo upload failed: " + upErr.message);

    const { data: post, error: insErr } = await sb
      .from("study_posts")
      .insert({
        user_id: user.id,
        photo_path: path,
        caption: (caption || "").slice(0, 300) || null,
        unit_name: (unitName || "").slice(0, 60) || null,
        duration_minutes: durationMinutes ? Math.round(Number(durationMinutes)) : null,
      })
      .select()
      .single();
    if (insErr) throw httpErr(500, "Could not save post.");
    return res.status(200).json({ ok: true, post });
  }

  if (action === "feed") {
    const { data: fr } = await sb
      .from("friendships")
      .select("requester, addressee")
      .eq("status", "accepted")
      .or(`requester.eq.${user.id},addressee.eq.${user.id}`);
    const friendIds = (fr || []).map((r) => (r.requester === user.id ? r.addressee : r.requester));
    const visibleIds = [user.id, ...friendIds];

    const { data: posts } = await sb
      .from("study_posts")
      .select("*")
      .in("user_id", visibleIds)
      .order("created_at", { ascending: false })
      .limit(FEED_LIMIT);

    const authorIds = Array.from(new Set((posts || []).map((p) => p.user_id)));
    let profiles = {};
    if (authorIds.length) {
      const { data: profs } = await sb.from("profiles").select("id, username, display_name").in("id", authorIds);
      (profs || []).forEach((p) => (profiles[p.id] = p));
    }

    const out = (posts || []).map((p) => {
      const { data: pub } = sb.storage.from("study-photos").getPublicUrl(p.photo_path);
      const prof = profiles[p.user_id] || {};
      return {
        id: p.id,
        mine: p.user_id === user.id,
        username: prof.username,
        displayName: prof.display_name,
        photoUrl: pub.publicUrl,
        caption: p.caption,
        unitName: p.unit_name,
        durationMinutes: p.duration_minutes,
        createdAt: p.created_at,
      };
    });
    return res.status(200).json({ posts: out, friendCount: friendIds.length });
  }

  if (action === "delete") {
    const { data: post } = await sb.from("study_posts").select("*").eq("id", body.postId).maybeSingle();
    if (!post || post.user_id !== user.id) throw httpErr(403, "Not your post.");
    await sb.from("study_posts").delete().eq("id", post.id);
    await sb.storage.from("study-photos").remove([post.photo_path]);
    return res.status(200).json({ ok: true });
  }

  throw httpErr(400, "Unknown action.");
}

// ── CLASS ────────────────────────────────────────────────────────────────────
async function classHandler(req, res, sb, user, body, isGet) {
  if (isGet) {
    const { data: ownedClasses } = await sb
      .from("classes")
      .select("id, name, code, created_at")
      .eq("tutor_id", user.id)
      .order("created_at", { ascending: false });

    const ownedWithCounts = await Promise.all(
      (ownedClasses || []).map(async (cls) => {
        const { count } = await sb
          .from("class_members")
          .select("*", { count: "exact", head: true })
          .eq("class_id", cls.id);
        return { ...cls, memberCount: count || 0, role: "tutor" };
      })
    );

    const { data: memberships } = await sb
      .from("class_members")
      .select("class_id, joined_at, classes(id, name, code, tutor_id)")
      .eq("student_id", user.id);

    const joinedClasses = (memberships || []).map((m) => ({
      ...m.classes,
      joinedAt: m.joined_at,
      role: "student",
    }));

    return res.status(200).json({ owned: ownedWithCounts, joined: joinedClasses });
  }

  const { action, name, code, classId } = body;

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
    const { error } = await sb.from("class_members").insert({ class_id: cls.id, student_id: user.id });
    if (error?.code === "23505") return res.status(200).json({ class: cls, alreadyMember: true });
    if (error) throw error;
    return res.status(201).json({ class: cls });
  }

  if (action === "leave") {
    if (!classId) return res.status(400).json({ error: "classId is required." });
    await sb.from("class_members").delete().eq("class_id", classId).eq("student_id", user.id);
    return res.status(200).json({ ok: true });
  }

  if (action === "delete") {
    if (!classId) return res.status(400).json({ error: "classId is required." });
    const { data: cls } = await sb.from("classes").select("tutor_id").eq("id", classId).maybeSingle();
    if (!cls || cls.tutor_id !== user.id) throw httpErr(403, "Only the class creator can delete it.");
    await sb.from("classes").delete().eq("id", classId);
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
}

// ── Router ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const isGet = req.method === "GET";
  if (!isGet && req.method !== "POST") return res.status(405).json({ error: "GET or POST only" });

  try {
    const { sb, user } = await requireUser(req);

    // scope comes from query (GET) or body (POST)
    let scope, body = {};
    if (isGet) {
      scope = new URL(req.url, "http://x").searchParams.get("scope");
    } else {
      body = await readBody(req);
      scope = body.scope;
    }

    if (scope === "friends") return await friends(req, res, sb, user, body);
    if (scope === "feed") return await feed(req, res, sb, user, body);
    if (scope === "class") return await classHandler(req, res, sb, user, body, isGet);

    return res.status(400).json({ error: `Unknown scope "${scope}". Use "friends", "feed", or "class".` });
  } catch (e) {
    return sendErr(res, e);
  }
}
