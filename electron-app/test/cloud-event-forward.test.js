'use strict';
// Desktop spelade aldrig in nagot i molnet — och det var inte en konfigurationsmiss.
//
// Uppmatt pa vyralive.app: /api/health rapporterar tiktokBridge.lastEventSecondsAgo = null. Inget
// TikTok-event har NAGONSIN natt servern. Orsaken ar arkitektonisk: desktopappen anvander inte
// tiktok-bridge/bridge.js (som har molnvidarebefordran) utan sin egen tiktok-service.js, och den
// skriver till en array i minnet:
//
//   tiktok-service.js -> local-server.js ingestEvent() -> events[] -> GET /api/events pa 127.0.0.1
//
// local-server.js:168 fangar /api/events lokalt FORE molnproxyn, sa eventet lamnar aldrig maskinen.
// Foljden: server/stream-stats.js spelar in noll rader medan David sander, och framsidans "All
// time" skulle lasa tomma tabeller.
//
// VARFOR INTE BRYGGANS EGEN VAG. tiktok-bridge postar till /api/events/tiktok/:workspace med
// TIKTOK_INGEST_TOKEN. Den token ar EN global serverhemlighet (server/production-config.js:53
// grupperar den med APP_ENCRYPTION_KEY), och rutten laser workspace ur URL:en utan att binda den
// till token. Den som har token kan posta till VILKET workspace som helst. I en installerad .exe
// racker det att en anvandare packar upp filen for att vem som helst ska kunna injicera falska
// gavor i vilken streamers overlay som helst. Darfor postar Desktop i stallet som den INLOGGADE
// ANVANDAREN, med sessionskakan som redan bryggas hit, till en rutt som harleder behorigheten ur
// medlemskapet.
//
// ROTT NU: allihop. Ingen vidarebefordran finns.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { startLocalServer } = require('../local-server');

const ROOT = path.join(__dirname, '..', '..');
const CLOUD = 'https://vyra-cloud.invalid';
const SESSION = 'vyra_session=hemligt-token';
const WORKSPACE = '11111111-2222-3333-4444-555555555555';

// Samma stubb som cloud-api-proxy.test.js: fangar vad servern skickade uppat.
function stubCloud(t, handler) {
  const realFetch = global.fetch;
  const seen = [];
  t.after(() => { global.fetch = realFetch; });
  global.fetch = async (url, init = {}) => {
    const target = new URL(String(url));
    if (target.origin !== CLOUD) return realFetch(url, init);
    seen.push({ url: target, method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    return handler(target, init);
  };
  return seen;
}

const svarOk = () => new Response(JSON.stringify({ ok: true }), { status: 202, headers: { 'content-type': 'application/json' } });

// Fangar callbacken tiktok-service.js normalt far, sa ett event kan matas in exakt dar den riktiga
// TikTok-anslutningen matar in det.
function riggen(extra = {}) {
  const kanal = {};
  return {
    kanal,
    options: {
      cloudOrigin: CLOUD,
      cloudSession: () => SESSION,
      cloudIdentity: () => ({ workspaceId: WORKSPACE }),
      createLiveConnector: cb => { kanal.skicka = cb.onEvent; kanal.status = cb.onStatus; return {} },
      ...extra
    }
  };
}

async function medServer(t, port, options, kor) {
  const server = await startLocalServer(ROOT, port, options);
  try { await kor(`http://127.0.0.1:${port}`) }
  finally { await new Promise(r => server.close(r)) }
}

// Vidarebefordran ar avsiktligt inte await:ad — den lokala vagen far aldrig vanta pa natet. Testen
// maste darfor ge mikrotaskerna en chans att kora innan de pastar nagot om vad som skickades.
const slappFram = () => new Promise(r => setTimeout(r, 20));

const GAVA = { type: 'gift', username: 'anna', count: 2, coins: 300, giftName: 'Rose' };

// FORVAKT MOT TOMMA GRONA PROV.
//
// Varje prov nedan som pastar att nagot INTE skickades ar gront sa lange ingen vidarebefordran
// finns alls — det ar samma falla som gjort fyra prov i den har sessionen grona utan att mata
// nagot. Darfor bevisar de negativa proven forst att kanalen LEVER, genom att skicka en gava pa
// samma server och krava att den kom fram. Utan den raden mater de ingenting.
async function kravLevandeKanal(kanal, seen) {
  kanal.skicka({ ...GAVA, username: 'forvakt', eventKey: 'forvakt-' + seen.length });
  await slappFram();
  assert.ok(seen.length > 0,
    'ingen vidarebefordran alls — provet nedan hade blivit grönt utan att mäta något');
  seen.length = 0;
}

test('ett TikTok-event speglas till molnet', async (t) => {
  const seen = stubCloud(t, svarOk);
  const { kanal, options } = riggen();
  await medServer(t, 4260, options, async () => {
    kanal.skicka(GAVA);
    await slappFram();
  });
  assert.equal(seen.length, 1, 'eventet nadde aldrig molnet — statistiken hade spelat in noll rader');
  assert.equal(seen[0].method, 'POST');
});

test('eventet postas på workspace-rutten med den bryggade sessionen', async (t) => {
  const seen = stubCloud(t, svarOk);
  const { kanal, options } = riggen();
  await medServer(t, 4261, options, async () => {
    kanal.skicka(GAVA);
    await slappFram();
  });
  assert.equal(seen[0].url.pathname, `/api/workspaces/${WORKSPACE}/events`,
    `postade till ${seen[0].url.pathname}`);
  assert.equal(seen[0].headers.cookie, SESSION, 'sessionen bryggades inte — molnet hade svarat 401');
});

// Molnets validator (server/index.js:82) kraver en kand typ, och username for allt som inte ar en
// rumstyp. Bryts kontraktet blir varje event en tyst 400 och ingen mark er det.
test('nyttolasten uppfyller molnets validator', async (t) => {
  const TILLATNA = new Set(['gift', 'like', 'likes', 'chat', 'follow', 'share', 'member', 'subscribe', 'viewer', 'battle']);
  const RUMSTYPER = new Set(['viewer', 'battle']);
  const seen = stubCloud(t, svarOk);
  const { kanal, options } = riggen();
  await medServer(t, 4262, options, async () => {
    kanal.skicka(GAVA);
    kanal.skicka({ type: 'follow', username: 'ny' });
    kanal.skicka({ type: 'viewer', count: 1284 });
    await slappFram();
  });
  assert.ok(seen.length >= 3, `bara ${seen.length} event nådde molnet`);
  for (const anrop of seen) {
    const nytta = JSON.parse(anrop.body);
    assert.ok(TILLATNA.has(nytta.type), `typen "${nytta.type}" avvisas av molnet med 400`);
    if (!RUMSTYPER.has(nytta.type)) {
      assert.equal(typeof nytta.username, 'string', `${nytta.type} saknar username — molnet svarar 400`);
      assert.ok(nytta.username.trim().length > 0, `${nytta.type} har tomt username`);
    }
  }
});

// Chatt ar den overlagset frekventaste typen och anvands inte av statistiken alls
// (server/stream-stats.js utesluter den med flit). Takten pa ingest-rutten ar 100 event/s per
// workspace — chatten ensam kan ata den under en aktiv sandning.
test('chatt vidarebefordras inte', async (t) => {
  const seen = stubCloud(t, svarOk);
  const { kanal, options } = riggen();
  await medServer(t, 4263, options, async () => {
    await kravLevandeKanal(kanal, seen);
    kanal.skicka({ type: 'chat', username: 'pratkvarn', comment: 'hej' });
    await slappFram();
  });
  assert.equal(seen.length, 0, 'chatten skickades och ater upp ingest-takten');
});

// Dubbletter stoppas redan lokalt (seenEvents). Skickas de anda vidare rakar servern dem tva ganger
// i en summa — och dubbelrakning gar inte att upptacka i efterhand.
test('en dubblett speglas bara en gång', async (t) => {
  const seen = stubCloud(t, svarOk);
  const { kanal, options } = riggen();
  await medServer(t, 4264, options, async () => {
    const medNyckel = { ...GAVA, eventKey: 'samma-nyckel' };
    kanal.skicka(medNyckel);
    kanal.skicka(medNyckel);
    await slappFram();
  });
  assert.equal(seen.length, 1, `dubbletten skickades ${seen.length} gånger`);
});

// DET VIKTIGASTE PROVET I FILEN. Overlayen i OBS laser den lokala kon. Ett natverksfel mot molnet
// far darfor aldrig marka den lokala vagen — annars slutar sandningen fungera for att en
// analysskrivning strulade. Samma regel som server/stream-stats.js foljer.
test('en trasig molnlänk rör inte den lokala kön', async (t) => {
  const seen = stubCloud(t, () => { throw new Error('getaddrinfo ENOTFOUND') });
  const { kanal, options } = riggen();
  await medServer(t, 4265, options, async (origin) => {
    kanal.skicka(GAVA);
    await slappFram();
    assert.equal(seen.length, 1,
      'inget forsok gjordes — provet bevisar da bara att den lokala kon fungerar utan moln');
    const res = await fetch(origin + '/api/events?after=0');
    assert.equal(res.status, 200, 'den lokala kon svarade inte');
    const kropp = await res.json();
    const lista = kropp.events || kropp;
    assert.equal(Array.isArray(lista) && lista.length, 1,
      'eventet forsvann ur den lokala kon nar molnet fallerade — OBS hade slutat visa gavor');
  });
});

test('ett 401 från molnet fäller inte heller den lokala kön', async (t) => {
  const seen = stubCloud(t, () => new Response(JSON.stringify({ ok: false, error: 'Inte inloggad' }), { status: 401 }));
  const { kanal, options } = riggen();
  await medServer(t, 4266, options, async (origin) => {
    kanal.skicka(GAVA);
    await slappFram();
    assert.equal(seen.length, 1, 'inget forsok gjordes — 401:an provades aldrig');
    const kropp = await (await fetch(origin + '/api/events?after=0')).json();
    const lista = kropp.events || kropp;
    assert.equal(Array.isArray(lista) && lista.length, 1, 'eventet forsvann vid 401');
  });
});

// Servern startar FORE inloggningen (samma skal som cloudSession ar en funktion och inte en strang).
// Utan workspace finns ingen rutt att posta till, och en gissning hade blivit 403 i basta fall.
test('utan workspace skickas ingenting', async (t) => {
  const seen = stubCloud(t, svarOk);
  const { kanal, options } = riggen({ cloudIdentity: () => ({ workspaceId: '' }) });
  await medServer(t, 4267, options, async () => {
    kanal.skicka(GAVA);
    await slappFram();
  });
  assert.equal(seen.length, 0, 'postade utan att veta vilket workspace det gällde');
});

test('utan molnorigin skickas ingenting', async (t) => {
  const seen = stubCloud(t, svarOk);
  const { kanal, options } = riggen({ cloudOrigin: '' });
  await medServer(t, 4268, options, async () => {
    kanal.skicka(GAVA);
    await slappFram();
  });
  assert.equal(seen.length, 0);
});

// Vidarebefordran far inte fordroja den lokala vagen. Mats genom att lata molnet hanga: den lokala
// kon ska svara med eventet anda, medan molnanropet fortfarande ar ute.
test('den lokala kön väntar inte på molnet', async (t) => {
  let slappLos;
  const seen = stubCloud(t, () => new Promise(r => { slappLos = () => r(svarOk()) }));
  const { kanal, options } = riggen();
  await medServer(t, 4269, options, async (origin) => {
    kanal.skicka(GAVA);
    // Anropet ar UTE men aldrig besvarat (handlern loser aldrig sitt lofte). Just det ar poangen:
    // den lokala kon maste svara medan molnet fortfarande hanger.
    await slappFram();
    assert.equal(seen.length, 1, 'inget hangande molnanrop — provet mater inte blockering');
    const kropp = await (await fetch(origin + '/api/events?after=0')).json();
    const lista = kropp.events || kropp;
    assert.equal(Array.isArray(lista) && lista.length, 1,
      'den lokala kon var tom — vidarebefordran blockerade ingesten');
    if (slappLos) slappLos();
  });
});

// ---- kopplingen i main.js -----------------------------------------------------------------------
//
// KALLKODSKONTROLL, av samma skal som desktop-auth.test.js gor det: main.js kraver en korande
// Electron-runtime och gar inte att starta i en testprocess. Den vaktar den enda trad som saknades
// nar allt annat redan fanns — behorighetsgrinden hamtade workspace-objektet men skickade det
// aldrig vidare till den lokala servern.
const fs = require('node:fs');
const mainKod = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

test('main.js skickar workspace-id till den lokala servern', () => {
  assert.match(mainKod, /cloudIdentity:\s*\(\)\s*=>/,
    'startLocalServer får inget cloudIdentity — local-server.js speglar då ingenting');
  assert.match(mainKod, /cloudWorkspaceId\s*=\s*String\(/,
    'workspace-id fångas aldrig ur behörighetsgrindens svar');
});

// En funktion, inte en strang. Servern startar FORE inloggningen, sa ett vardefast id hade varit
// tomt for alltid — precis den bugg som cloudSession redan loser pa samma satt.
test('workspace-id läses vid varje event, inte en gång vid start', () => {
  const rad = mainKod.split(/\r?\n/).find(l => /cloudIdentity:/.test(l));
  assert.ok(rad, 'hittade ingen cloudIdentity-rad');
  assert.match(rad, /\(\)\s*=>/, `cloudIdentity är inte en funktion: ${rad.trim()}`);
});

// Desktop far ALDRIG ha den globala ingest-token. Den ar en huvudnyckel till alla workspaces och en
// .exe gar att packa upp. Provet ar billigt och skyddar mot att nagon "forenklar" hit den senare.
// Matcha KODEN, inte kommentarerna: filerna forklarar med flit varfor de INTE anvander token, och
// en vakt som laser forklaringen som ett brott ar oanvandbar.
//
// `[^\r\n]*` och inte `.*$`: JS-punkten matchar inte \r, sa pa en CRLF-checkout hade `$` aldrig
// matchat och strippningen blivit en no-op. Exakt den buggen gor server/test/goal-sse.test.js:268
// falskrott pa Windows och gront i CI.
const utanKommentarer = kod => kod.split(/\r?\n/).map(rad => rad.replace(/\/\/[^\r\n]*/, '')).join('\n');

test('ingen global ingest-token finns i desktopkoden', () => {
  for (const fil of ['main.js', 'local-server.js', 'tiktok-service.js']) {
    const kod = utanKommentarer(fs.readFileSync(path.join(__dirname, '..', fil), 'utf8'));
    assert.equal(/TIKTOK_INGEST_TOKEN|VYRA_INGEST_TOKEN/.test(kod), false,
      `${fil} nämner ingest-token — den får aldrig följa med en installerad .exe`);
    assert.equal(/\/api\/events\/tiktok\//.test(kod), false,
      `${fil} postar till token-rutten i stället för den sessionsautentiserade`);
  }
});

// ---- kontraktet mot molnets validator ------------------------------------------------------------
//
// Hittat 2026-08-08, efter att speglingen redan var mergad: tiktok-service.js skickar typer som
// molnet INTE kanner igen.
//
//   molnet (server/index.js:72):  gift like likes chat follow share member subscribe viewer battle
//   desktop (tiktok-service.js):  ... + chatcommand + subscriberemote
//
// `chatcommand` fods pa rad 91 nar en chattrad borjar med "!", `subscriberemote` pa rad 120. Bada
// avvisas av molnet med 400 — och eftersom speglingen sval jer sina egna fel skulle ingen marka
// det. De ater ingest-takten och lamnar ingenting efter sig.
//
// Chattfiltret var dessutom en SVARTLISTA (`new Set(['chat'])`), vilket inte ens fangar
// `chatcommand`. En svartlista slapper igenom varje ny typ som nagon lagger till i framtiden.
// Ratt form ar en VITLISTA: en okand typ ska stanna hemma, inte skickas och avvisas.
//
// ROTT NU: bada.
const TIKTOK_INGEST_TYPES = ['gift', 'like', 'likes', 'chat', 'follow', 'share', 'member',
  'subscribe', 'viewer', 'battle'];

// Typerna lases ur kallan, inte ur en handskriven lista: laggs en ny till i tiktok-service.js ska
// det har provet upptacka den, inte en manniska som rakar minnas att uppdatera bada stallena.
function desktopTyper() {
  const kod = fs.readFileSync(path.join(__dirname, '..', 'tiktok-service.js'), 'utf8');
  const typer = new Set();
  for (const m of kod.matchAll(/emit\(\s*'([a-z]+)'/g)) typer.add(m[1]);
  // Raden `emit(comment.startsWith('!') ? 'chatcommand' : 'chat', ...)` matchar inte monstret ovan.
  for (const m of kod.matchAll(/\?\s*'([a-z]+)'\s*:\s*'([a-z]+)'/g)) { typer.add(m[1]); typer.add(m[2]) }
  return [...typer].sort();
}

test('alla typer desktop kan skicka är kända — annars måste de stanna hemma', async (t) => {
  const okanda = desktopTyper().filter(typ => !TIKTOK_INGEST_TYPES.includes(typ));
  const seen = stubCloud(t, svarOk);
  const { kanal, options } = riggen();
  await medServer(t, 4270, options, async () => {
    await kravLevandeKanal(kanal, seen);
    for (const typ of okanda) kanal.skicka({ type: typ, username: 'nagon', eventKey: 'k-' + typ });
    await slappFram();
  });
  assert.deepEqual(seen.map(a => JSON.parse(a.body).type), [],
    `dessa typer skickades men avvisas av molnet med 400: ${okanda.join(', ')}`);
});

// Vitlista, inte svartlista. Mats genom att skicka en typ som inte finns alls: en svartlista
// slapper igenom den, en vitlista stoppar den.
test('en okänd typ skickas inte vidare', async (t) => {
  const seen = stubCloud(t, svarOk);
  const { kanal, options } = riggen();
  await medServer(t, 4271, options, async () => {
    await kravLevandeKanal(kanal, seen);
    kanal.skicka({ type: 'nagotheltnytt', username: 'anna', eventKey: 'nytt-1' });
    await slappFram();
  });
  assert.equal(seen.length, 0, 'filtret är en svartlista — varje ny typ läcker igenom och 400:ar');
});
