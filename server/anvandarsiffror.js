'use strict';
// ANVÄNDARSIFFROR FÖR DRIFTCENTRALEN (GET /api/admin/anvandare). Bara antal — inga e-postadresser,
// namn eller id lämnar servern. Rutten sitter bakom /api/admin/-spärren i index.js (is_platform_admin,
// annars 403), som alla adminvägar.
//
// PREMIUM räknas som billing.js entitlement() gör: plan premium, status active/trialing/past_due, och
// inte en uppsägning vars period redan löpt ut (den flippas till free vid nästa läsning). provider
// skiljer betan (comp, 30 dagars gratis Premium) från de som betalar (paypal, stripe).
const AKTIV_PREMIUM = `plan='premium' AND status IN ('active','trialing','past_due')
  AND NOT (cancel_at_period_end AND current_period_end IS NOT NULL AND current_period_end < now())`;

const FRAGOR = {
  konton: `SELECT count(*)::int totalt,
      count(*) FILTER (WHERE disabled_at IS NULL)::int aktiva,
      count(*) FILTER (WHERE email_verified_at IS NOT NULL)::int verifierad_epost,
      count(*) FILTER (WHERE created_at > now() - interval '7 days')::int nya_7d,
      count(*) FILTER (WHERE created_at > now() - interval '30 days')::int nya_30d
    FROM users`,
  inloggade: `SELECT count(DISTINCT user_id) FILTER (WHERE last_seen_at > now() - interval '1 day')::int dygn,
      count(DISTINCT user_id) FILTER (WHERE last_seen_at > now() - interval '7 days')::int d7,
      count(DISTINCT user_id) FILTER (WHERE last_seen_at > now() - interval '30 days')::int d30
    FROM sessions`,
  premium: `SELECT provider, count(*)::int antal FROM subscriptions WHERE ${AKTIV_PREMIUM} GROUP BY provider`,
  tiktok: `SELECT count(*)::int kopplade, count(*) FILTER (WHERE active)::int aktiva,
      count(*) FILTER (WHERE verifierad_at IS NOT NULL)::int verifierade
    FROM tiktok_connections`
};

const tal = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

async function anvandarsiffror(pool, nu = () => new Date()) {
  const [k, i, p, t] = await Promise.all([
    pool.query(FRAGOR.konton), pool.query(FRAGOR.inloggade), pool.query(FRAGOR.premium), pool.query(FRAGOR.tiktok)
  ]);
  const kr = k.rows[0] || {}, ir = i.rows[0] || {}, tr = t.rows[0] || {};
  const perLeverantor = {};
  for (const r of p.rows) perLeverantor[String(r.provider || 'okand')] = tal(r.antal);
  const beta = perLeverantor.comp || 0;
  const premiumTotalt = Object.values(perLeverantor).reduce((a, b) => a + b, 0);
  return {
    konton: { totalt: tal(kr.totalt), aktiva: tal(kr.aktiva), verifieradEpost: tal(kr.verifierad_epost), nya7d: tal(kr.nya_7d), nya30d: tal(kr.nya_30d) },
    inloggade: { dygn: tal(ir.dygn), d7: tal(ir.d7), d30: tal(ir.d30) },
    premium: { totalt: premiumTotalt, beta, betalande: premiumTotalt - beta, perLeverantor },
    tiktok: { kopplade: tal(tr.kopplade), aktiva: tal(tr.aktiva), verifierade: tal(tr.verifierade) },
    uppdaterad: nu().toISOString()
  };
}

module.exports = { anvandarsiffror, FRAGOR };
