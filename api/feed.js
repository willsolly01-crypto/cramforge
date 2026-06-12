// api/feed.js — study photo feed
// POST with { action, ... }:
//   { action: "post", imageBase64, mediaType, caption?, unitName?, durationMinutes? }
//   { action: "feed" }                → own + friends' posts, newest first
//   { action: "delete", postId }      → delete own post (and its photo)

import { requireUser, sendErr, httpErr } from "./_auth.js";
import { readBody } from "./_claude.js";

const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // ~3MB after client compression
const FEED_LIMIT = 50;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { sb, user } = await requireUser(req);
    const body = await readBody(req);
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
      // Who am I friends with?
      const { data: fr } = await sb
        .from("friendships")
        .select("requester, addressee")
        .eq("status", "accepted")
        .or(`requester.eq.${user.id},addressee.eq.${user.id}`);
      const friendIds = (fr || []).map((r) =>
        r.requester === user.id ? r.addressee : r.requester
      );
      const visibleIds = [user.id, ...friendIds];

      const { data: posts } = await sb
        .from("study_posts")
        .select("*")
        .in("user_id", visibleIds)
        .order("created_at", { ascending: false })
        .limit(FEED_LIMIT);

      // Attach author profiles + public photo URLs
      const authorIds = Array.from(new Set((posts || []).map((p) => p.user_id)));
      let profiles = {};
      if (authorIds.length) {
        const { data: profs } = await sb
          .from("profiles")
          .select("id, username, display_name")
          .in("id", authorIds);
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
      const { data: post } = await sb
        .from("study_posts")
        .select("*")
        .eq("id", body.postId)
        .maybeSingle();
      if (!post || post.user_id !== user.id) throw httpErr(403, "Not your post.");
      await sb.from("study_posts").delete().eq("id", post.id);
      await sb.storage.from("study-photos").remove([post.photo_path]);
      return res.status(200).json({ ok: true });
    }

    throw httpErr(400, "Unknown action.");
  } catch (e) {
    return sendErr(res, e);
  }
}
