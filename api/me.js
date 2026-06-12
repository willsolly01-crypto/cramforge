import { requireUser, sendErr, FREE_LIMITS } from "./_auth.js";

export default async function handler(req, res) {
  try {
    const { sb, user, profile } = await requireUser(req);
    const day = new Date().toISOString().slice(0, 10);
    const { data: row } = await sb
      .from("usage").select("*").eq("user_id", user.id).eq("day", day).maybeSingle();

    return res.status(200).json({
      email: user.email,
      plan:  profile.plan,
      usage: {
        gen:    row?.gen    || 0,
        grade:  row?.grade  || 0,
        ingest: row?.ingest || 0,
      },
      limits: {
        gen:    FREE_LIMITS.gen + (profile.bonus_gen || 0),
        grade:  FREE_LIMITS.grade,
        ingest: FREE_LIMITS.ingest,
      },
      referral: {
        code:      profile.referral_code  || null,
        count:     profile.referral_count || 0,
        bonus_gen: profile.bonus_gen      || 0,
      },
      // Social profile info + XP stats
      profile: {
        username:           profile.username           || null,
        display_name:       profile.display_name       || null,
        is_public:          profile.is_public          !== false,
        pdf_demo_used:      profile.pdf_demo_used      || false,
        total_xp:           profile.total_xp           || 0,
        questions_answered: profile.questions_answered || 0,
        questions_correct:  profile.questions_correct  || 0,
      },
    });
  } catch (e) {
    return sendErr(res, e);
  }
}
