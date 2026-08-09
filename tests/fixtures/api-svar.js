'use strict';
// Svarsformer for mock-backenden (Etapp 6B). EN kalla, samma monster som sprak-ordlista.js och
// inline-transform-vakt.js: nar backend-API:t utvecklas andras formen har, inte pa spridda stallen
// i serverkoden.
//
// Formerna ar UPPMATTA ur klienten 2026-08-09, inte pahittade. Varje falt nedan lases nagonstans:
//
//   authRequired   auth-client.js init(): `required = !!config.authRequired`
//   user           finish(): `d.user.display_name || d.user.displayName || d.user.email`
//   workspaces     finish(): saknas de gors ett EXTRA /api/auth/me-anrop for att berika
//   csrfToken      init(): sparas i sessionStorage och skickas som X-VYRA-CSRF i varje anrop
//   events         live-leaderboard.js: `(d.events || []).forEach(...)`
//   widgets        cloud-sync.js apply(): kastar pa `!Array.isArray(remote.widgets)`

const ARBETSYTA = { id: 'ws-mock', name: 'Mock-arbetsyta', slug: 'mock' };
const OVERLAY = { id: 'ov-mock', name: 'Mock-overlay', workspace_id: ARBETSYTA.id };
const ANVANDARE = {
  id: 'u-mock',
  email: 'mock@vyra.test',
  display_name: 'Mock Streamer',
  email_verified: true,
};
const CSRF = 'mock-csrf-token';

// En giltig layout. apply() i cloud-sync.js kastar om widgets inte ar en array — {} duger inte.
const LAYOUT = {
  widgets: [{ id: 'mock1', type: 'templateTopLike', x: 40, y: 40, width: 300 }],
  flows: [],
  user: 'Mock Streamer',
  tiktok: '',
};

const SVAR = {
  // Grinden. authRequired:false ar det ENDA som oppnar en skrivbar lokal session — uppmatt.
  'GET /api/auth/config': () => ({ authRequired: true }),
  'GET /api/auth/me': () => ({
    ok: true, user: ANVANDARE, workspaces: [ARBETSYTA], csrfToken: CSRF,
  }),
  'POST /api/auth/logout': () => ({ ok: true }),
  'GET /api/status': () => ({ ok: true, connected: false, uptime: 0 }),
  'GET /api/state': () => ({ ok: true, state: LAYOUT, version: 1 }),
  'GET /api/events': () => ({ ok: true, events: [] }),
  'GET /api/auth/sessions': () => ({ ok: true, sessions: [] }),
  'GET /api/auth/security-events': () => ({ ok: true, events: [] }),
  'GET /api/auth/account/deletion': () => ({ ok: true, scheduled: null }),
  // Molnvagen: overlays-listan ger id:t som nasta anrop skriver till.
  'GET /api/workspaces/:ws/overlays': () => ({ ok: true, overlays: [OVERLAY] }),
  'POST /api/workspaces/:ws/overlays': () => ({ ok: true, overlay: OVERLAY }),
  'GET /api/workspaces/:ws/overlays/:ov': () => ({ ok: true, overlay: { ...OVERLAY, state: LAYOUT } }),
  'PUT /api/workspaces/:ws/overlays/:ov': () => ({ ok: true, overlay: { ...OVERLAY, state: LAYOUT } }),
  'GET /api/workspaces/:ws/billing': () => ({ ok: true, plan: 'free', status: 'active' }),
  'GET /api/workspaces/:ws/stats': () => ({
    ok: true, period: 'all', totalt: { gifts: 0, diamonds: 0, likes: 0 }, dagar: [], toppGivare: [],
  }),
};

// Strommar. Tre moduler oppnar SSE (overlay-access.js, live-client.js, goal-client.js) och en
// mock som bara svarar pa GET/POST lamnar dem hangande. Grundutforandet ar en tom keep-alive:
// stromen oppnas, sager ingenting, och stangs nar sidan stangs.
const STROMMAR = [
  '/api/workspaces/:ws/events/stream',
  '/api/workspaces/:ws/overlays/:ov/events/stream',
  '/api/overlay-access/:token/events/stream',
];

module.exports = { SVAR, STROMMAR, ARBETSYTA, OVERLAY, ANVANDARE, CSRF, LAYOUT };
