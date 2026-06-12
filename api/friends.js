// api/friends.js — friend system
// POST with { action, ... }:
//   { action: "search", query }            → find users by username/display name
//   { action: "request", userId }          → send friend request
//   { action: "accept", friendshipId }     → accept incoming request
//   { action: "remove", friendshipId }     → remove friend / decline / cancel
//   { action: "list" }                     → { friends, incoming, outgoing }

import { requireUser, sendErr, httpErr } from "./_auth.js";
import { readBody } from "./_claude.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { sb, user } = await requireUser(req);
    const body = await readBody(req);
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
      // Already friends or pending in either direction?
      const { data: existing } = await sb
        .from("friendships")
        .select("id, status")
        .or(
          `and(requester.eq.${user.id},addressee.eq.${target}),and(requester.eq.${target},addressee.eq.${user.id})`
        )
        .maybeSingle();
      if (existing) {
        throw httpErr(
          409,
          existing.status === "accepted" ? "Already friends." : "Request already pending."
        );
      }
      await sb.from("friendships").insert({ requester: user.id, addressee: target });
      return res.status(200).json({ ok: true });
    }

    if (action === "accept") {
      const { data: row } = await sb
        .from("friendships")
        .select("*")
        .eq("id", body.friendshipId)
        .maybeSingle();
      if (!row || row.addressee !== user.id) throw httpErr(403, "Not your request to accept.");
      await sb.from("friendships").update({ status: "accepted" }).eq("id", row.id);
      return res.status(200).json({ ok: true });
    }

    if (action === "remove") {
      const { data: row } = await sb
        .from("friendships")
        .select("*")
        .eq("id", body.friendshipId)
        .maybeSingle();
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
        const { data: profs } = await sb
          .from("profiles")
          .select("id, username, display_name")
          .in("id", otherIds);
        (profs || []).forEach((p) => (profiles[p.id] = p));
      }
      const decorate = (r) => {
        const otherId = r.requester === user.id ? r.addressee : r.requester;
        const p = profiles[otherId] || {};
        return {
          friendshipId: r.id,
          userId: otherId,
          username: p.username,
          displayName: p.display_name,
        };
      };
      return res.status(200).json({
        friends: all.filter((r) => r.status === "accepted").map(decorate),
        incoming: all
          .filter((r) => r.status === "pending" && r.addressee === user.id)
          .map(decorate),
        outgoing: all
          .filter((r) => r.status === "pending" && r.requester === user.id)
          .map(decorate),
      });
    }

    throw httpErr(400, "Unknown action.");
  } catch (e) {
    return sendErr(res, e);
  }
}
