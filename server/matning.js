'use strict';
// Tratthandelser till Plausible fran SERVERN.
//
// VARFOR SERVERN OCH INTE WEBBLASAREN for just de har tva:
//   betald          — kunden star pa PayPals doman nar betalningen gar igenom och kommer kanske
//                     aldrig tillbaka. Sanningen ar webhooken BILLING.SUBSCRIPTION.ACTIVATED.
//   forsta_sandning — sandningen startas av BRYGGAN, inte av en flik. Ingen webblasare ser den.
//
// ⚠️ DEN VIKTIGA BEGRANSNINGEN: Plausible harleder besokaridentitet ur IP + User-Agent. ALLA
// handelser harifran kommer fran samma server-IP och samma UA, sa de rullas ihop till EN
// "besokare". Kolumnen "unique visitors" ar darfor MENINGSLOS for de har tva malen — bara
// "total events" sager nagot.
//
// Foljden, och den ar ett designkrav och inte en detalj: en handelse harifran maste skickas
// EXAKT en gang per verklig forekomst, for ingenting nedstroms kan deduplicera den at oss.
//   betald          — webhooken ar redan idempotent via billing_events(stripe_event_id).
//   forsta_sandning — anroparen maste sjalv ha avgjort att det ar workspacets FORSTA session.
//                     Se stream-sessions.js: det avgors i samma transaktion som skapar raden.
//
// UTAN PLAUSIBLE_DOMAN ar modulen INERT och skickar ingenting. Det ar med flit: en omatt miljo
// ska vara tyst, inte skicka till fel doman eller logga fel varje minut.
const DOMAN = String(process.env.PLAUSIBLE_DOMAN || '').trim();
const VARD = String(process.env.PLAUSIBLE_VARD || 'https://plausible.io').trim().replace(/\/+$/, '');
const TIMEOUT_MS = 4000;

// Basen maste vara en URL pa den matta domanen — Plausible kraver den, och den far ALDRIG bara
// en riktig sokvag med query. Servern har ingen sidkontext, och en pahittad sokvag med
// parametrar hade bara smutsat ner sidrapporten. En fast, tydligt syntetisk sokvag i stallet.
function url(handelse) { return `https://${DOMAN}/_server/${handelse}`; }

function aktiv() { return DOMAN !== ''; }

// Kastar ALDRIG och vantar ALDRIG pa nagot som betyder nagot. En matning far inte kunna falla en
// betalning eller en sandningsstart — darfor ar returvardet ett lofte som alltid loses, och
// anroparen behover inte ens await:a det.
async function handelse(namn, egenskaper) {
  if (!aktiv()) return { skickad: false, skal: 'omatt-miljo' };
  const kropp = { name: String(namn), url: url(namn), domain: DOMAN };
  if (egenskaper && Object.keys(egenskaper).length) kropp.props = egenskaper;
  const avbryt = new AbortController();
  const klocka = setTimeout(() => avbryt.abort(), TIMEOUT_MS);
  try {
    const svar = await fetch(VARD + '/api/event', {
      method: 'POST',
      signal: avbryt.signal,
      headers: {
        'content-type': 'application/json',
        // Plausible KRAVER bada. Utan dem avvisas anropet med 400. Att den ar uppenbart en
        // server och inte en webblasare ar med flit — se begransningen overst.
        'user-agent': 'VYRA-server/1.0 (+https://vyralive.app)',
        'x-forwarded-for': '127.0.0.1',
      },
      body: JSON.stringify(kropp),
    });
    return { skickad: svar.ok, status: svar.status };
  } catch (error) {
    return { skickad: false, skal: error && error.name === 'AbortError' ? 'timeout' : 'natverksfel' };
  } finally {
    clearTimeout(klocka);
  }
}

module.exports = { handelse, aktiv, url, DOMAN };
