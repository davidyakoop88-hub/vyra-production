// Pure Node.js re-implementation of server.ps1, used only by the Electron app. Runs in-process (no
// child process spawn at all) instead of shelling out to `powershell.exe -ExecutionPolicy Bypass
// -File server.ps1` — that spawn pattern (unsigned .exe launching PowerShell with an explicit
// security-bypass flag) is a classic antivirus/SmartScreen heuristic trigger, and a real user report
// showed the packaged app's window opening then closing itself ~8s later, consistent with something
// terminating it shortly after launch. Removing the PowerShell dependency removes that signature
// entirely, and having Electron own the server directly is also simpler than managing a child process.
//
// Mirrors server.ps1's API exactly (same endpoints, same event/connection shape) so studio.html,
// tiktok-bridge, and ANSLUT-TIKTOK-LIVE.cmd all work unchanged — only server.ps1's shell process is
// replaced, not the contract other code depends on. The standalone (non-Electron) path via
// STARTA-HEMSIDAN.cmd still uses server.ps1; this file is Electron-only.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp4': 'video/mp4', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg'
};

function readBody(req, maxBytes = 65536) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, failed = false;
    req.on('data', c => { if (failed) return; size += c.length; if (size > maxBytes) { failed = true; reject(Object.assign(new Error('Payload too large'), { statusCode: 413 })); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', e => { if (!failed) reject(e); });
  });
}

// Studio's HTML/CSS/JS is fetched live from cloudOrigin on every request when set, so a website
// deploy shows up in the desktop app on the next page load — no new installer needed. Only the
// TikTok-connector API routes above (matched before this is ever reached) stay local-only, since
// only this process holds a real TikTok LIVE connection; the proxy exists purely for static
// content. Falls back to the bundled local snapshot on any network failure so the app still opens
// without internet, using whatever was baked into the installer.
function validateCloudOrigin(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && !url.username && !url.password ? url.origin : null;
  } catch { return null; }
}

// Forarplatserna lever i minnet med flit: de ar en OGONBLICKSBILD av vilka flikar som ar oppna
// just nu, inte data. Startar appen om ar varje plats ledig, vilket ar exakt ratt — ingen flik
// haller den langre. TTL:n ar densamma som i vyra-masterval.js och sceneOnline().
const forarplatser = new Map();
const FORAR_TTL = 6000;

function startLocalServer(root, port = 4173, options = {}) {
  const cloudOrigin = validateCloudOrigin(options.cloudOrigin);
  // Sessionskakan for molnet, bryggad av huvudprocessen. Den ar satt for vyralive.app och skickas
  // aldrig till 127.0.0.1, sa utan den har bryggan svarar molnet 401 pa allt den lokala Studion
  // fragar om. En funktion, inte en strang: inloggningen sker efter att servern startat.
  const cloudSession = typeof options.cloudSession === 'function'
    ? options.cloudSession
    : () => options.cloudSession || '';
  // Vilket workspace eventen hor till. Samma skal som cloudSession ar en funktion: servern startar
  // fore inloggningen, och workspace-id:t blir kant forst nar behorighetsgrinden i main.js har
  // svarat. Utan det finns ingen rutt att posta till, och da skickas ingenting alls.
  const cloudIdentity = typeof options.cloudIdentity === 'function'
    ? options.cloudIdentity
    : () => options.cloudIdentity || {};
  const events = [];
  const connection = { connected: false, username: '', mode: 'live', state: 'idle', roomId: '', heartbeat: 0, reconnectAttempt: 0, updated: Date.now() };
  const seenEvents = new Map();
  const requestBuckets = new Map();
  // `root` ar installationskatalogen och agar ENBART statiska filer. Allt som skrivs gar till
  // dataDir, som huvudprocessen satter till app.getPath('userData').
  //
  // Varfor: i en paketerad app ar root = C:\Program Files\VYRA\resources\app, dar en vanlig
  // anvandare bara har ReadAndExecute. Att spara layouten dar kastar EACCES for alla — utom for
  // den som kor med avstangd UAC, dar den tyst lyckas. Buggen var darfor osynlig pa precis den
  // maskin dar den upptacktes, och versionerade backuper hade aldrig sparats en enda gang.
  //
  // Fallback till root nar dataDir utelamnas: befintliga anropare (och testerna) fortsatter
  // fungera oforandrat. Det ar ett bakatkompatibelt tillagg, inte ett nytt kontrakt.
  const dataDir = options.dataDir || root;
  const backupDir = path.join(dataDir, '.vyra-backups');
  const stateFile = path.join(dataDir, 'vyra-state-backup.json');
  // En ren installation har ingen dataDir an, och writeAtomic skriver sin .tmp i samma katalog —
  // utan den har raden faller forsta sparningen pa ENOENT i stallet for att skapa katalogen.
  try { fs.mkdirSync(dataDir, { recursive: true }) } catch (_) { /* fangas nar skrivningen sker */ }
  function writeAtomic(file, raw) { const tmp = file + '.tmp'; fs.writeFileSync(tmp, raw, 'utf8'); fs.renameSync(tmp, file); }

  // Engangsflytt av en backup som skrevs pa den gamla platsen. Kors vid start, tyst och idempotent.
  //
  // Tre forsiktighetsatgarder: en befintlig fil i dataDir ar alltid nyare och rors aldrig;
  // originalet raderas BAST-EFFORT eftersom kallan ligger i en skrivskyddad katalog pa varje
  // maskin med UAC pa — en misslyckad radering far inte hindra att layouten raddades; och hela
  // migreringen ar innesluten sa en trasig gammal fil aldrig kan stoppa serverstarten.
  function migrateLegacyState() {
    if (path.resolve(dataDir) === path.resolve(root)) return;
    const legacy = path.join(root, 'vyra-state-backup.json');
    try {
      if (!fs.existsSync(legacy) || fs.existsSync(stateFile)) return;
      writeAtomic(stateFile, fs.readFileSync(legacy, 'utf8'));
      try { fs.unlinkSync(legacy) } catch (_) { /* skrivskyddad installationskatalog */ }
    } catch (_) { /* ingen migrering ar battre an ingen serverstart */ }
  }
  migrateLegacyState();
  function versionFiles() { if (!fs.existsSync(backupDir)) return []; return fs.readdirSync(backupDir).filter(n => /^state-\d+\.json$/.test(n)).sort().reverse(); }

  function sendJson(res, obj, status = 200) {
    const body = Buffer.from(JSON.stringify(obj), 'utf8');
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': body.length });
    res.end(body);
  }
  function allowedOrigin(req) { const origin = req.headers.origin; return !origin || origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`; }
  function rateAllowed(req) { const ip = req.socket.remoteAddress || 'local', now = Date.now(), bucket = requestBuckets.get(ip) || { at: now, count: 0 }; if (now - bucket.at >= 1000) { bucket.at = now; bucket.count = 0; } bucket.count++; requestBuckets.set(ip, bucket); return bucket.count <= 2500; }
  function text(v, max) { return String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F<>]/g, '').slice(0, max); }
  function imageUrl(v) { const value = text(v, 2048); return /^(https?:\/\/|data:image\/(?:png|jpeg|webp|gif);base64,)/i.test(value) ? value : ''; }
  function number(v, min = 0, max = Number.MAX_SAFE_INTEGER) { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0; }
  function cleanEvent(d) { return { type: text(d.type, 64).replace(/[^a-z0-9_:-]/gi, ''), username: text(d.username, 100), name: text(d.name, 500), profileImage: imageUrl(d.profileImage), giftName: text(d.giftName, 160), giftImage: imageUrl(d.giftImage), emote: text(d.emote, 160), isAnonymous: !!d.isAnonymous, diamonds: number(d.diamonds ?? d.coins, 0, 1e9), coins: number(d.coins, 0, 1e9), count: number(d.count, 0, 1e7), multiplier: number(d.multiplier, 0, 100), points: number(d.points, 0, 1e12), level: number(d.level, 0, 10000), score: number(d.score, 0, 1e12), scoreUs: number(d.scoreUs, 0, 1e12), scoreThem: number(d.scoreThem, 0, 1e12), ourScore: number(d.ourScore, 0, 1e12), opponentScore: number(d.opponentScore, 0, 1e12), eventKey: text(d.eventKey, 200), source: text(d.source, 64) }; }
  function setConnection(next) {
    Object.assign(connection, next, { updated: Date.now() });
    if (connection.connected) connection.heartbeat = Date.now();
  }
  function ingestEvent(raw) {
    const d = cleanEvent(raw || {});
    if (!d.type) return { ok: false, error: 'Eventtyp saknas' };
    const now = Date.now(), key = d.eventKey;
    for (const [oldKey, at] of seenEvents) if (now - at > 120000) seenEvents.delete(oldKey);
    if (key && seenEvents.has(key)) return { ok: true, duplicate: true, eventKey: key };
    if (key) seenEvents.set(key, now);
    let id = Date.now();
    while (events.length && events[events.length - 1].id >= id) id++;
    const event = { id, ...d, timestamp: id };
    events.push(event);
    while (events.length > 5000) events.shift();
    // `event`, inte `d`: molnet kraver ett id (server/event-bus.js:49) och `event` bar bade
    // eventKey och det lokala lopnumret. Se speglaTillMolnet.
    speglaTillMolnet(event);
    return { ok: true, event };
  }

  // ---- Spegling till molnet ---------------------------------------------------------------------
  //
  // Fram till nu stannade varje TikTok-event i arrayen ovan. Overlayen i OBS laser den lokalt, sa
  // sandningen sag korrekt ut — men servern fick ALDRIG ett enda event (uppmatt: /api/health
  // rapporterade tiktokBridge.lastEventSecondsAgo = null), och darmed kunde ingen statistik sparas.
  // Speglingen ar det som gor "All time" mojligt.
  //
  // TRE REGLER, alla av samma skal: den lokala kon ar sandningen, molnet ar bokforingen.
  //
  //   1. ALDRIG await:ad. Ett langsamt nat far inte fordroja ett event pa vag till OBS.
  //   2. Svaljer sina egna fel. Ett natverksfel eller en 401 blir en lucka i historiken; ett kastat
  //      fel hade stoppat gavan fran att synas pa skarmen.
  //   3. Postas som den inloggade anvandaren, med sessionskakan som redan bryggas hit. Desktop far
  //      aldrig TIKTOK_INGEST_TOKEN — den ar en global huvudnyckel och en .exe gar att packa upp.
  //
  // VITLISTA, inte svartlista — och det ar hela poangen med den har raden.
  //
  // Forsta versionen var `new Set(['chat'])`: allt utom chatt skickades. Men tiktok-service.js
  // skickar tva typer molnet inte kanner igen — `chatcommand` (en chattrad som borjar med "!",
  // rad 91) och `subscriberemote` (rad 120). Ingen av dem finns i server/index.js:72, sa bada
  // avvisas med 400. Och eftersom speglingen svaljer sina egna fel hade ingen markt det: de ater
  // ingest-takten och lamnar ingenting efter sig.
  //
  // En svartlista slapper dessutom igenom VARJE ny typ nagon lagger till i framtiden. En vitlista
  // gor tvartom: en okand typ stannar hemma tills nagon medvetet slapper fram den.
  //
  // Listan ar molnets egna tillatna typer minus `chat`, som utesluts pa volym: den ar den
  // frekventaste typen under en aktiv sandning, ingest-takten ar 100 event/s per workspace, och
  // server/stream-stats.js raknar inte chatt overhuvudtaget.
  // Vidgad 2026-09-02: listan hade drivit isar fran regeln i kommentaren ovan. `glove` lades till
  // i molnet 2026-08-14 och nadde aldrig hit; `guardian` (#304) och `subscriberemote` (#307) kom i
  // natt. tests/desktop-paritet.test.js provar numera REGELN — molnets typer minus chat — i
  // stallet for att jamfora mot en hardkodad kopia som kan glida igen.
  const TILL_MOLNET = new Set(['gift', 'like', 'likes', 'follow', 'share', 'member', 'subscribe',
    'viewer', 'battle', 'glove', 'guardian', 'subscriberemote', 'fanlevelup']);
  function speglaTillMolnet(d) {
    if (!cloudOrigin || !TILL_MOLNET.has(d.type)) return;
    const workspaceId = String((cloudIdentity() || {}).workspaceId || '');
    if (!workspaceId) return;
    const kaka = cloudSession();
    if (!kaka) return;
    // ID:T ÄR INTE VALFRITT. server/event-bus.js:49 avvisar allt utan id med 400 "Ogiltigt
    // live-event". Första versionen postade det lokala eventet rakt av — och det bär `eventKey`,
    // inte `id`. Följden: VARJE speglat event avvisades. Speglingen var helt verkningslös, och
    // eftersom den sväljer sina egna fel syntes det ingenstans. Upptäckt först när kedjan provades
    // mot riktig produktion, inte i något test.
    //
    // eventKey föredras: den är innehållshärledd och ger samma dedupe-semantik som molnbryggan
    // (N.cloudEvent tar samma nyckel). Det lokala löpnumret är reserven — det är monotont och
    // unikt, och kön har redan deduplicerat vid det här laget.
    const nytta = { ...d, id: String(d.eventKey || d.id || '') };
    if (!nytta.id) return;
    // Anropet ar avsiktligt obevakat. .catch() ar anda obligatoriskt: en avvisad promise utan
    // hanterare faller hela Electron-processen.
    Promise.resolve()
      .then(() => fetch(`${cloudOrigin}/api/workspaces/${encodeURIComponent(workspaceId)}/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', cookie: kaka },
        body: JSON.stringify(nytta),
        signal: AbortSignal.timeout(10000)
      }))
      .catch(() => {});
  }
  const liveConnector = options.createLiveConnector?.({ onStatus: setConnection, onEvent: ingestEvent });
  const obsService = options.obsService || null;

  const server = http.createServer(async (req, res) => {
    try {
      const parsed = new URL(req.url, `http://127.0.0.1:${port}`);
      const p = parsed.pathname;
      res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Cross-Origin-Resource-Policy', 'same-origin'); res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      if (p.startsWith('/api/') && req.method !== 'GET' && !allowedOrigin(req)) return sendJson(res, { ok: false, error: 'Origin nekad' }, 403);
      if (p.startsWith('/api/') && !rateAllowed(req)) return sendJson(res, { ok: false, error: 'För många anrop' }, 429);

      if (p === '/api/status') {
        if (connection.connected && connection.heartbeat && Date.now() - connection.heartbeat > 15000) {
          connection.connected = false; connection.state = 'stale'; connection.updated = Date.now();
        }
        return sendJson(res, { ok: true, server: 'VYRA Live Server', connection, lastEventId: events.length ? events[events.length - 1].id : 0 });
      }
      if (p === '/api/connect' && req.method === 'POST') {
        const d = JSON.parse((await readBody(req)) || '{}');
        if (!liveConnector) return sendJson(res, { ok: false, error: 'TikTok LIVE-anslutningen finns endast i VYRA Desktop' }, 503);
        try {
          await liveConnector.connect(d.username);
          return sendJson(res, { ok: true, connection, message: 'TikTok LIVE är anslutet' });
        } catch (error) {
          return sendJson(res, { ok: false, error: error.message }, 409);
        }
      }
      if (p === '/api/disconnect' && req.method === 'POST') {
        const d = JSON.parse((await readBody(req)) || '{}');
        if (liveConnector) await liveConnector.disconnect(d.reason || 'Frånkopplad av användaren');
        connection.connected = false;
        connection.state = d.retryInMs ? 'reconnecting' : 'disconnected';
        connection.reconnectAttempt = Number(d.reconnectAttempt || 0); connection.retryInMs = Number(d.retryInMs || 0); connection.reason = String(d.reason || '');
        connection.updated = Date.now();
        return sendJson(res, { ok: true, connection });
      }
      if (p === '/api/heartbeat' && req.method === 'POST') {
        const d = JSON.parse((await readBody(req)) || '{}');
        connection.connected = true; connection.state = 'live'; connection.heartbeat = Date.now(); connection.updated = connection.heartbeat;
        connection.username = String(d.username || connection.username); connection.roomId = String(d.roomId || connection.roomId); connection.reconnectAttempt = Number(d.reconnectAttempt || 0);
        return sendJson(res, { ok: true, connection });
      }
      if (p === '/api/events' && req.method === 'GET') {
        const after = Number(parsed.searchParams.get('after') || 0) || 0;
        return sendJson(res, { ok: true, events: events.filter(e => e.id > after) });
      }
      if (p === '/api/events' && req.method === 'POST') {
        const result = ingestEvent(JSON.parse((await readBody(req, 65536)) || '{}'));
        return sendJson(res, result, result.ok ? 200 : 400);
      }
      // ---- FORARVALET, DELAT MELLAN STUDIO OCH OVERLAY (SS15, forts. 2026-08-20) --------------
      //
      // UPPMATT mot OBS 32.2.1: en browser source har sin EGEN localStorage-rymd (samma origin,
      // varde satt i Chrome, OBS hittade det inte — docs/live-verifiering.md punkt 5). SS15:s
      // forarval ar en localStorage-nyckel som delas mellan FLIKAR via storage-event, och OBS ar
      // ingen flik. Studion och overlayn ser darfor aldrig varandras nyckel och bada kan tro att
      // de ar forare: tittaren betalar tva ganger och ser effekten tva ganger.
      //
      // Den har servern ser BADA — de talar redan med 127.0.0.1 — och blir domare nar appen kor.
      // localStorage ar kvar som reserv for den som kor webben utan appen; klienten valjer.
      //
      // REGLERNA AR IDENTISKA MED vyra-masterval.js, annars vore det tva sanningar i systemet.
      if (p === '/api/automation/master' && (req.method === 'POST' || req.method === 'DELETE')) {
        const d = JSON.parse((await readBody(req, 8192)) || '{}');
        const nyckel = text(d.nyckel, 80), tabId = text(d.tabId, 120);
        if (!nyckel || !tabId) return sendJson(res, { ok: false, error: 'nyckel och tabId kravs' }, 400);
        if (req.method === 'DELETE') {
          // Bara innehavaren far lamna platsen. Annars kan vem som helst peta foraren genom att
          // gissa nyckeln — och ett avsked ar ett anspraks motsats, inte en oppen dorr.
          const m = forarplatser.get(nyckel);
          if (m && m.tabId === tabId) forarplatser.delete(nyckel);
          return sendJson(res, { ok: true, master: (forarplatser.get(nyckel) || {}).tabId || null });
        }
        const niva = Number(d.niva) === 1 ? 1 : 2;
        // __nuForProv finns bara for att kunna aldra en plats i prov utan att sova 6 sekunder.
        const nu = Number(d.__nuForProv) || Date.now();
        const m = forarplatser.get(nyckel);
        const farsk = !!m && Date.now() - Number(m.at || 0) < FORAR_TTL;
        const farTaOver = !farsk || m.tabId === tabId || (niva === 1 && Number(m.niva || 2) > 1);
        if (farTaOver) forarplatser.set(nyckel, { tabId, niva, at: nu });
        const nuvarande = forarplatser.get(nyckel) || {};
        return sendJson(res, { ok: true, master: nuvarande.tabId || null,
          niva: nuvarande.niva || null, jagArMaster: nuvarande.tabId === tabId });
      }

      if (p === '/api/obs/status' && req.method === 'GET') {
        if (!obsService) return sendJson(res, { ok: false, error: 'OBS-anslutningen finns endast i VYRA Desktop' }, 503);
        return sendJson(res, { ok: true, ...obsService.getStatus() });
      }
      if (p === '/api/obs/connect' && req.method === 'POST') {
        if (!obsService) return sendJson(res, { ok: false, error: 'OBS-anslutningen finns endast i VYRA Desktop' }, 503);
        const d = JSON.parse((await readBody(req)) || '{}');
        const ip = text(d.ip, 100) || '127.0.0.1', port = number(d.port, 1, 65535) || 4455, password = text(d.password, 200);
        try { await obsService.connect(ip, port, password); return sendJson(res, { ok: true, ...obsService.getStatus() }); }
        catch (error) { return sendJson(res, { ok: false, error: error.message }, 409); }
      }
      if (p === '/api/obs/disconnect' && req.method === 'POST') {
        if (obsService) obsService.disconnect();
        return sendJson(res, { ok: true });
      }
      if (p === '/api/obs/scene' && req.method === 'POST') {
        if (!obsService) return sendJson(res, { ok: false, error: 'OBS-anslutningen finns endast i VYRA Desktop' }, 503);
        const d = JSON.parse((await readBody(req)) || '{}');
        try { await obsService.setScene(text(d.sceneName, 200)); return sendJson(res, { ok: true }); }
        catch (error) { return sendJson(res, { ok: false, error: error.message }, 409); }
      }
      if (p === '/api/obs/source' && req.method === 'POST') {
        if (!obsService) return sendJson(res, { ok: false, error: 'OBS-anslutningen finns endast i VYRA Desktop' }, 503);
        const d = JSON.parse((await readBody(req)) || '{}');
        try { await obsService.setSourceEnabled(text(d.sceneName, 200) || null, text(d.sourceName, 200), !!d.enabled); return sendJson(res, { ok: true }); }
        catch (error) { return sendJson(res, { ok: false, error: error.message }, 409); }
      }
      // TTS Chat's cloud-voice synthesis lives on the real cloud server (server/tts.js), not here —
      // unlike /api/obs/* above, there's nothing Electron-specific about it. But it's a POST, and
      // every unmatched POST/PUT/DELETE gets rejected at the `req.method !== 'GET'` guard below
      // before it would ever reach the generic GET-only static-content proxy further down, so it
      // needs its own explicit forward (cookie + CSRF header included) to actually reach the cloud.
      if (/^\/api\/workspaces\/[^/]+\/tts\/synthesize$/.test(p) && req.method === 'POST') {
        if (!cloudOrigin) return sendJson(res, { ok: false, error: 'TTS Chat kräver en internetanslutning' }, 503);
        const raw = await readBody(req, 4096);
        try {
          const upstream = await fetch(cloudOrigin + p, {
            method: 'POST',
            headers: { 'content-type': 'application/json', cookie: req.headers.cookie || '', 'x-vyra-csrf': req.headers['x-vyra-csrf'] || '' },
            body: raw, redirect: 'follow', signal: AbortSignal.timeout(15000)
          });
          const body = Buffer.from(await upstream.arrayBuffer());
          res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store', 'Content-Length': body.length });
          return res.end(body);
        } catch {
          return sendJson(res, { ok: false, error: 'Kunde inte nå TTS-tjänsten' }, 502);
        }
      }
      if (p === '/api/state' && req.method === 'GET') {
        const backupFile = stateFile;
        if (fs.existsSync(backupFile)) {
          const body = fs.readFileSync(backupFile);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': body.length });
          return res.end(body);
        }
        return sendJson(res, { ok: false, error: 'Ingen backup sparad an' }, 404);
      }
      if (p === '/api/state' && req.method === 'POST') {
        const raw = await readBody(req, 5 * 1024 * 1024);
        // Tom kropp skrev tidigare ingenting men svarade anda ok:true — den enda vagen dar servern
        // pastod att layouten var sparad utan att den var det.
        if (!raw) return sendJson(res, { ok: false, error: 'Tom kropp — ingenting sparades' }, 400);
        JSON.parse(raw); writeAtomic(stateFile, raw);
        return sendJson(res, { ok: true });
      }
      if (p === '/api/state/versions' && req.method === 'GET') {
        const versions = versionFiles().map(file => { const stat = fs.statSync(path.join(backupDir, file)); return { id: file.slice(6, -5), createdAt: stat.mtimeMs, size: stat.size }; });
        return sendJson(res, { ok: true, versions });
      }
      if (p === '/api/state/version' && req.method === 'GET') {
        const id = String(parsed.searchParams.get('id') || ''); if (!/^\d+$/.test(id)) return sendJson(res, { ok: false, error: 'Ogiltig version' }, 400);
        const file = path.join(backupDir, `state-${id}.json`); if (!fs.existsSync(file)) return sendJson(res, { ok: false, error: 'Version saknas' }, 404);
        const body = fs.readFileSync(file); res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': body.length }); return res.end(body);
      }
      if (p === '/api/state/version' && req.method === 'POST') {
        const raw = await readBody(req, 5 * 1024 * 1024); const parsedState = JSON.parse(raw || '{}'); if (!Array.isArray(parsedState.widgets)) return sendJson(res, { ok: false, error: 'Ogiltig VYRA-state' }, 400);
        fs.mkdirSync(backupDir, { recursive: true }); const id = String(Date.now()); writeAtomic(path.join(backupDir, `state-${id}.json`), raw);
        versionFiles().slice(20).forEach(file => fs.unlinkSync(path.join(backupDir, file))); return sendJson(res, { ok: true, id });
      }

      // Allt under /api/ som INTE ar en av enhetsrutterna ovan hor till molnet. Den lokala Studion
      // kor samma auth-, moln- och betalningskod som webben, sa utan den har vidarebefordran fick
      // varje POST 405 fran catch-allen nedan — inklusive inloggningen, vilket ar exakt vad
      // anvandaren sag. GET-anrop foll i stallet till den statiska proxyn, som hamtade dem utan
      // kaka och darfor alltid fick 401.
      //
      // Enhetsrutterna ar redan besvarade ovan och kan inte na hit: /api/status ar TikTok-
      // anslutningen i DEN HAR processen och far aldrig ga till molnet.
      if (p.startsWith('/api/') && cloudOrigin) {
        const raw = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req, 5 * 1024 * 1024);
        try {
          // URL:en byggs av cloudOrigin + path, sa kakan kan inte folja med nagon annanstans.
          const upstream = await fetch(cloudOrigin + p + (parsed.search || ''), {
            method: req.method,
            headers: {
              'content-type': req.headers['content-type'] || 'application/json',
              accept: req.headers.accept || 'application/json',
              cookie: cloudSession() || '',
              'x-vyra-csrf': req.headers['x-vyra-csrf'] || ''
            },
            body: raw, redirect: 'follow', signal: AbortSignal.timeout(15000)
          });
          const body = Buffer.from(await upstream.arrayBuffer());
          res.writeHead(upstream.status, {
            'Content-Type': upstream.headers.get('content-type') || 'application/json',
            'Cache-Control': 'no-store', 'Content-Length': body.length
          });
          return res.end(body);
        } catch {
          return sendJson(res, { ok: false, error: 'Kunde inte nå VYRA-molnet' }, 502);
        }
      }

      if (req.method !== 'GET') {
        return sendJson(res, { ok: false, error: 'Method not allowed' }, 405);
      }

      function serveLocalFile() {
        let rel = decodeURIComponent(p).replace(/^\/+/, '');
        if (!rel) rel = 'index.html';
        const rootResolved = path.resolve(root);
        const filePath = path.resolve(path.join(rootResolved, rel));
        if (!filePath.toLowerCase().startsWith(rootResolved.toLowerCase()) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          return sendJson(res, { ok: false, error: 'Hittades inte' }, 404);
        }
        const body = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const type = TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Length': body.length });
        res.end(body);
      }

      if (!cloudOrigin) return serveLocalFile();
      try {
        const upstream = await fetch(cloudOrigin + p + (parsed.search || ''), {
          redirect: 'follow', signal: AbortSignal.timeout(5000)
        });
        if (!upstream.ok || !upstream.body) throw new Error('upstream ' + upstream.status);
        const body = Buffer.from(await upstream.arrayBuffer());
        res.writeHead(200, {
          'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
          'Cache-Control': 'no-store', 'Content-Length': body.length
        });
        res.end(body);
      } catch {
        serveLocalFile();
      }
    } catch (err) {
      try { sendJson(res, { ok: false, error: err.message }, err.statusCode || (err instanceof SyntaxError ? 400 : 500)); } catch { /* response already sent */ }
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { startLocalServer };
