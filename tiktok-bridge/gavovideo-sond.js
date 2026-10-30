'use strict';
// GÅVOVIDEO-SOND — ett lokalt mätverktyg, aldrig en del av bryggan i drift.
//
// Ansluter som tittare till VILKEN offentlig TikTok LIVE som helst (ingen inloggning) och mäter
// vilka gåvor som bär TikToks egen animation (`asset.videoResourceList`), hämtar zip-filen UTAN
// headers — som en OBS-overlay gör — och läser codec, storlek och var färg och alfa ligger.
// Underlaget för gavovideo.js och gavovideo-prov.html.
//
// Första mätningen 2026-10-30, @jas_alexis, 5 min: 28 gåvomeddelanden, 1 med asset (gåva 5660),
// zip med output.mp4 (H.264 1440×1280, färg vänster, alfa höger) och config.json. Öppen fråga:
// VARFÖR bara 1 av 28. Kör mot en sändning med större gåvor och battles för att svara på den.
//
// Kör:  node tiktok-bridge/gavovideo-sond.js <användarnamn som är live> [sekunder=300]
// Bakom en HTTPS-proxy (HTTPS_PROXY satt) går både anslutningen och nedladdningen genom den.
// Utdata: tiktok-bridge/inspelningar/gavovideo-<användare>-<tid>/rapport.json, zip-filerna och
// en stillbild per video om ffmpeg finns. Rådata innehåller tittarnamn — checka aldrig in den.
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');
const { TikTokLiveConnection, WebcastEvent } = require('tiktok-live-connector');

const anv = String(process.argv[2] || '').replace(/^@/, '');
const sek = Number(process.argv[3]) || 300;
if (!anv) { console.error('Användning: node tiktok-bridge/gavovideo-sond.js <användarnamn> [sekunder]'); process.exit(1); }
const UT = path.join(__dirname, 'inspelningar', `gavovideo-${anv}-${Date.now()}`);
fs.mkdirSync(UT, { recursive: true });

const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || '';
const agent = PROXY ? new (require('https-proxy-agent').HttpsProxyAgent)(PROXY) : undefined;
const anslutningsval = agent ? { webClientOptions: { agent: { http: agent, https: agent } }, wsClientOptions: { agent } } : {};

const urlsAv = r => (r && (r.urlList || r.url_list)) || [];

function sammanfatta(data) {
  const a = data.asset || null;
  return {
    giftId: String(data.giftId ?? data.gift?.id ?? ''),
    namn: data.gift?.name || data.giftDetails?.giftName || '?',
    diamanter: data.gift?.diamondCount ?? data.giftDetails?.diamondCount ?? null,
    primaryEffectId: data.gift?.primaryEffectId || data.giftDetails?.primaryEffectId || null,
    isAssetBundleGift: data.isAssetBundleGift ?? null,
    isFirstSent: data.isFirstSent ?? null,
    harAsset: !!a,
    videor: (a?.videoResourceList || []).map(v => ({ typ: v.videoTypeName, urls: urlsAv(v.videoUrl) })),
    resurs: urlsAv(a?.resourceModel),
  };
}

// Inga headers alls, som en <video>/fetch i OBS. Följer en omdirigering.
function hamta(url, varv = 0) {
  return new Promise((klar, fel) => {
    https.get(url, { agent }, svar => {
      if (svar.statusCode >= 300 && svar.statusCode < 400 && svar.headers.location && varv < 3) {
        svar.resume(); return hamta(new URL(svar.headers.location, url).href, varv + 1).then(klar, fel);
      }
      const delar = [];
      svar.on('data', d => delar.push(d));
      svar.on('end', () => klar({ status: svar.statusCode, typ: svar.headers['content-type'], cors: svar.headers['access-control-allow-origin'] || null, data: Buffer.concat(delar) }));
    }).on('error', fel);
  });
}

function undersok(zipFil, mapp) {
  const r = {};
  try {
    fs.mkdirSync(mapp, { recursive: true });
    execFileSync('unzip', ['-o', '-q', zipFil, '-d', mapp]);
    const konfig = path.join(mapp, 'config.json');
    if (fs.existsSync(konfig)) r.konfig = JSON.parse(fs.readFileSync(konfig, 'utf8'));
    const mp4 = fs.readdirSync(mapp).find(f => f.endsWith('.mp4'));
    if (mp4) {
      const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path.join(mapp, mp4)]).toString());
      const v = (j.streams || []).find(s => s.codec_type === 'video') || {};
      Object.assign(r, { codec: v.codec_name, bredd: v.width, hojd: v.height, pix_fmt: v.pix_fmt, sekunder: Number(j.format?.duration) || null });
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '1', '-i', path.join(mapp, mp4), '-frames:v', '1', path.join(mapp, 'ruta.png')]);
    }
  } catch (e) { r.undersokning = 'ofullständig (saknas unzip/ffprobe?): ' + String(e.message).slice(0, 120); }
  return r;
}

(async () => {
  const gavor = new Map();
  let meddelanden = 0, medAsset = 0;
  const conn = new TikTokLiveConnection(anv, anslutningsval);
  conn.on(WebcastEvent.GIFT, data => {
    meddelanden++;
    const s = sammanfatta(data);
    if (s.harAsset) medAsset++;
    const forra = gavor.get(s.giftId);
    if (!forra || (!forra.harAsset && s.harAsset)) {
      gavor.set(s.giftId, { ...s, antal: (forra?.antal || 0) + 1 });
      console.log(`[gåva] ${s.namn} (${s.diamanter} dm) asset=${s.harAsset} videor=${s.videor.length} förstaGången=${s.isFirstSent}`);
    } else forra.antal++;
  });
  console.log(`Ansluter till @${anv} …`);
  const st = await conn.connect();
  console.log(`Ansluten, rum ${st.roomId}. Lyssnar ${sek} s.`);
  await new Promise(r => setTimeout(r, sek * 1000));
  conn.disconnect();

  const prov = [];
  for (const s of gavor.values()) {
    const v = s.videor.find(x => /^h264$/.test(x.typ) && x.urls.length) || s.videor.find(x => x.urls.length);
    if (!v) continue;
    const p = { gava: s.namn, giftId: s.giftId, typ: v.typ, url: v.urls[0] };
    try {
      const svar = await hamta(v.urls[0]);
      Object.assign(p, { status: svar.status, contentType: svar.typ, cors: svar.cors, byte: svar.data.length });
      if (svar.status === 200) {
        const zip = path.join(UT, `${s.giftId}.zip`);
        fs.writeFileSync(zip, svar.data);
        Object.assign(p, undersok(zip, path.join(UT, s.giftId)));
      }
    } catch (e) { p.fel = String(e.message).slice(0, 160); }
    prov.push(p);
  }
  const rapport = { anv, rum: st.roomId, sekunder: sek, meddelanden, medAsset, gavor: [...gavor.values()], prov };
  fs.writeFileSync(path.join(UT, 'rapport.json'), JSON.stringify(rapport, null, 1));
  console.log(`\n${meddelanden} gåvomeddelanden, ${medAsset} med video, ${gavor.size} olika gåvor.`);
  for (const p of prov) console.log(`  ${p.gava}: ${p.status ?? p.fel} cors=${p.cors} ${p.codec || ''} ${p.bredd || ''}×${p.hojd || ''} ${p.sekunder || ''}s`);
  console.log(`Rapport: ${path.join(UT, 'rapport.json')}`);
  process.exit(0);
})().catch(e => { console.error('Fel:', e.message); process.exit(2); });
