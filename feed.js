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
          .select("id, username, display_name, streak_count")
          .in("id", authorIds);
        (profs || []).forEach((p) => (profiles[p.id] = p));
      }

      // Reactions for these posts: counts per emoji + which ones I gave
      const postIds = (posts || []).map((p) => p.id);
      const reactionsByPost = {};
      if (postIds.length) {
        const { data: rx } = await sb
          .from("post_reactions")
          .select("post_id, user_id, emoji")
          .in("post_id", postIds);
        (rx || []).forEach((r) => {
          const slot = (reactionsByPost[r.post_id] ||= { counts: {}, mine: [] });
          slot.counts[r.emoji] = (slot.counts[r.emoji] || 0) + 1;
          if (r.user_id === user.id) slot.mine.push(r.emoji);
        });
      }

      const out = (posts || []).map((p) => {
        const { data: pub } = sb.storage.from("study-photos").getPublicUrl(p.photo_path);
        const prof = profiles[p.user_id] || {};
        const rx = reactionsByPost[p.id] || { counts: {}, mine: [] };
        return {
          id: p.id,
          mine: p.user_id === user.id,
          username: prof.username,
          displayName: prof.display_name,
          streak: prof.streak_count || 0,
          reactions: rx.counts,
          myReactions: rx.mine,
          photoUrl: pub.publicUrl,
          caption: p.caption,
          unitName: p.unit_name,
          durationMinutes: p.duration_minutes,
          createdAt: p.created_at,
        };
      });

      return res.status(200).json({ posts: out, friendCount: friendIds.length });
    }

    if (action === "react") {
      const emoji = body.emoji;
      if (!["🔥", "📚", "💀", "👏"].includes(emoji)) throw httpErr(400, "Unknown reaction.");
      const { data: post } = await sb
        .from("study_posts")
        .select("id, user_id")
        .eq("id", body.postId)
        .maybeSingle();
      if (!post) throw httpErr(404, "Post not found.");
      // Visibility: own post or a friend's post
      if (post.user_id !== user.id) {
        const { data: fr } = await sb
          .from("friendships")
          .select("id")
          .eq("status", "accepted")
          .or(
            `and(requester.eq.${user.id},addressee.eq.${post.user_id}),and(requester.eq.${post.user_id},addressee.eq.${user.id})`
          )
          .maybeSingle();
        if (!fr) throw httpErr(403, "You can only react to friends' posts.");
      }
      // Toggle
      const { data: existing } = await sb
        .from("post_reactions")
        .select("*")
        .eq("post_id", post.id)
        .eq("user_id", user.id)
        .eq("emoji", emoji)
        .maybeSingle();
      if (existing) {
        await sb
          .from("post_reactions")
          .delete()
          .eq("post_id", post.id)
          .eq("user_id", user.id)
          .eq("emoji", emoji);
        return res.status(200).json({ ok: true, reacted: false });
      }
      await sb.from("post_reactions").insert({ post_id: post.id, user_id: user.id, emoji });
      return res.status(200).json({ ok: true, reacted: true });
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
