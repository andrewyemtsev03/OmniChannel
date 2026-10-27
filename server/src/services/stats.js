import { query } from '../db.js';

// repId: when set, only that rep's doctors are counted (reps see their own territory).
export async function presentationStats(presentationId, repId = null) {
  const scope = 'AND ($2::int IS NULL OR d.rep_id = $2)';
  const [summary, slides, doctors] = await Promise.all([
    query(
      `SELECT
         count(DISTINCT l.id)::int AS links,
         count(DISTINCT l.id) FILTER (WHERE l.first_opened_at IS NOT NULL)::int AS opened_links,
         count(vs.id)::int AS sessions,
         COALESCE(round(avg(vs.total_seconds)), 0)::int AS avg_seconds,
         COALESCE(sum(vs.total_seconds), 0)::int AS total_seconds,
         count(DISTINCT l.doctor_id) FILTER (WHERE vs.id IS NOT NULL)::int AS doctors_reached
       FROM links l JOIN doctors d ON d.id = l.doctor_id
       LEFT JOIN view_sessions vs ON vs.link_id = l.id
       WHERE l.presentation_id = $1 ${scope}`,
      [presentationId, repId]
    ),
    query(
      `SELECT sv.slide_index, count(DISTINCT sv.session_id)::int AS sessions, sum(sv.seconds)::int AS seconds
       FROM slide_views sv
       JOIN view_sessions vs ON vs.id = sv.session_id
       JOIN links l ON l.id = vs.link_id JOIN doctors d ON d.id = l.doctor_id
       WHERE l.presentation_id = $1 ${scope}
       GROUP BY sv.slide_index ORDER BY sv.slide_index`,
      [presentationId, repId]
    ),
    query(
      `SELECT d.id, d.full_name, d.specialty, d.city,
         count(DISTINCT l.id)::int AS links,
         count(vs.id)::int AS sessions,
         COALESCE(sum(vs.total_seconds), 0)::int AS total_seconds,
         max(vs.last_seen_at) AS last_viewed_at,
         max(l.created_at) AS last_sent_at
       FROM links l JOIN doctors d ON d.id = l.doctor_id
       LEFT JOIN view_sessions vs ON vs.link_id = l.id
       WHERE l.presentation_id = $1 ${scope}
       GROUP BY d.id ORDER BY max(vs.last_seen_at) DESC NULLS LAST, d.full_name
       LIMIT 500`,
      [presentationId, repId]
    ),
  ]);
  const s = summary.rows[0];
  const sessions = s.sessions || 0;
  return {
    ...s,
    open_rate: s.links ? s.opened_links / s.links : 0,
    slides: slides.rows.map((r) => ({
      slide: r.slide_index + 1,
      sessions: r.sessions,
      reach: sessions ? r.sessions / sessions : 0,
      avg_seconds: r.sessions ? Math.round(r.seconds / r.sessions) : 0,
    })),
    doctors: doctors.rows,
  };
}

export async function overviewStats(repId = null) {
  const scope = '($1::int IS NULL OR d.rep_id = $1)';
  const [counts, activity, recent] = await Promise.all([
    query(
      `SELECT
         (SELECT count(*) FROM doctors d WHERE ${scope})::int AS doctors,
         (SELECT count(*) FROM doctors d WHERE ${scope} AND EXISTS (
            SELECT 1 FROM consents c WHERE c.doctor_id = d.id AND c.withdrawn_at IS NULL
              AND c.given_at <= now() AND (c.expires_at IS NULL OR c.expires_at > now())))::int AS doctors_with_consent,
         (SELECT count(*) FROM presentations WHERE status = 'approved')::int AS approved_presentations,
         (SELECT count(*) FROM presentations WHERE status = 'in_review')::int AS in_review`,
      [repId]
    ),
    query(
      `SELECT
         count(DISTINCT l.id)::int AS links_30d,
         count(DISTINCT l.id) FILTER (WHERE l.first_opened_at IS NOT NULL)::int AS opened_30d,
         count(vs.id)::int AS sessions_30d,
         COALESCE(round(avg(vs.total_seconds)), 0)::int AS avg_seconds_30d
       FROM links l JOIN doctors d ON d.id = l.doctor_id
       LEFT JOIN view_sessions vs ON vs.link_id = l.id
       WHERE l.created_at > now() - interval '30 days' AND ${scope}`,
      [repId]
    ),
    query(
      `SELECT vs.id, vs.last_seen_at, vs.total_seconds, d.id AS doctor_id, d.full_name, p.id AS presentation_id, p.title,
         (SELECT count(*) FROM slide_views sv WHERE sv.session_id = vs.id)::int AS slides_seen
       FROM view_sessions vs JOIN links l ON l.id = vs.link_id
       JOIN doctors d ON d.id = l.doctor_id JOIN presentations p ON p.id = l.presentation_id
       WHERE ${scope}
       ORDER BY vs.last_seen_at DESC LIMIT 15`,
      [repId]
    ),
  ]);
  const [followups, daily, reviewQueue] = await Promise.all([
    // Links sent 3+ days ago that the doctor still hasn't opened: candidates for a rep follow-up.
    query(
      `SELECT l.id, l.created_at, l.channel, d.id AS doctor_id, d.full_name, d.specialty, p.id AS presentation_id, p.title
       FROM links l JOIN doctors d ON d.id = l.doctor_id JOIN presentations p ON p.id = l.presentation_id
       WHERE l.first_opened_at IS NULL AND p.status = 'approved'
         AND l.created_at < now() - interval '3 days' AND l.created_at > now() - interval '60 days'
         AND ${scope}
       ORDER BY l.created_at DESC LIMIT 6`,
      [repId]
    ),
    // Viewing sessions per day for the last 30 days (zero-filled).
    query(
      `SELECT to_char(day, 'YYYY-MM-DD') AS day, COALESCE(n, 0)::int AS views
       FROM generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') AS day
       LEFT JOIN (
         SELECT date_trunc('day', vs.started_at) AS d, count(*) AS n
         FROM view_sessions vs JOIN links l ON l.id = vs.link_id JOIN doctors d ON d.id = l.doctor_id
         WHERE vs.started_at > now() - interval '30 days' AND ${scope}
         GROUP BY 1
       ) v ON v.d = day
       ORDER BY day`,
      [repId]
    ),
    query(
      `SELECT p.id, p.title, p.product, p.updated_at, u.name AS uploaded_by_name
       FROM presentations p LEFT JOIN users u ON u.id = p.uploaded_by
       WHERE p.status = 'in_review' ORDER BY p.updated_at ASC LIMIT 5`
    ),
  ]);
  const a = activity.rows[0];
  return {
    ...counts.rows[0],
    ...a,
    open_rate_30d: a.links_30d ? a.opened_30d / a.links_30d : 0,
    recent_views: recent.rows,
    followups: followups.rows,
    daily_views: daily.rows,
    review_queue: reviewQueue.rows,
  };
}
