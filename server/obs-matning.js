'use strict';
// OBS-KALLANS MATNING (2026-11-19).
//
// OBS-overlayn ar en egen webblasare utan delad lagring med Studion, och det fanns ingen vag fran
// den till "Problem i sandningen". Efter sandningen 2026-11-18 gick det darfor inte att se VARFOR
// pratbubblan lag kvar i minuter, Fan Level Up fastnade och fyrverkeriet bara gav ljud — allt det
// hande i OBS, och Studion kunde bara rakna ut samma BESLUT, inte se hur sidan i OBS madde.
//
// Den har modulen ar mellanlagret: OBS-kallan skickar en kort rad (POST med sin egen lanknyckel),
// raderna ligger i Redis i hogst tolv timmar, och Studion hamtar dem med sin inloggning.
//
// INTE EN LIVEHANDELSE. Raderna gar aldrig genom handelsebussen, cleanEvent eller SSE-strommen —
// handelsekontraktet ar orort. En matrad ar text for streamern, ingenting en widget laser.
//
// INGA PERSONUPPGIFTER. Vitlistan nedan slapper bara igenom en niva, en kort text och enkla tal.
// Texten skrivs av var egen klient (overlay-matning.js) och bar aldrig tittarnamn.
const NIVAER = new Set(['info', 'varning', 'fel']);
const MAX_RADER = 80;
const TTL_SEKUNDER = 12 * 3600;
const MAX_TEXT = 300;
const MAX_FALT = 12;
const FALTNAMN = /^[a-zA-Z][a-zA-Z0-9_]{0,23}$/;

const nyckel = workspaceId => 'vyra:obs-matning:' + workspaceId;

// Gor om det klienten skickade till en rad som ar saker att lagra och visa. null = kasta.
function ren(input, nu = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const text = String(input.text == null ? '' : input.text).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
  if (!text) return null;
  const niva = NIVAER.has(input.niva) ? input.niva : 'info';
  const data = {};
  if (input.data && typeof input.data === 'object' && !Array.isArray(input.data)) {
    for (const [k, v] of Object.entries(input.data)) {
      if (Object.keys(data).length >= MAX_FALT) break;
      if (!FALTNAMN.test(k)) continue;
      if (typeof v === 'number' && Number.isFinite(v)) data[k] = Math.round(v * 100) / 100;
      else if (typeof v === 'boolean') data[k] = v;
      else if (typeof v === 'string') data[k] = v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 80);
    }
  }
  return { at: nu, niva, text, data };
}

// `klient` ar en ansluten Redis-klient (node-redis v4: lPush, lTrim, expire, lRange).
async function spara(klient, workspaceId, rad) {
  const k = nyckel(workspaceId);
  await klient.lPush(k, JSON.stringify(rad));
  await klient.lTrim(k, 0, MAX_RADER - 1);
  await klient.expire(k, TTL_SEKUNDER);
}

// Raderna nyare an `efter`, aldst forst.
async function las(klient, workspaceId, efter = 0) {
  const gräns = Number(efter) || 0;
  const lista = await klient.lRange(nyckel(workspaceId), 0, MAX_RADER - 1);
  const ut = [];
  for (const rå of lista || []) {
    try {
      const r = JSON.parse(rå);
      if (r && typeof r === 'object' && Number(r.at) > gräns && typeof r.text === 'string') ut.push(r);
    } catch (_) {}
  }
  return ut.sort((a, b) => a.at - b.at);
}

module.exports = { ren, spara, las, nyckel, MAX_RADER, TTL_SEKUNDER };
