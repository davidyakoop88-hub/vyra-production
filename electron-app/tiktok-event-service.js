'use strict';

const crypto = require('crypto');

const OFFICIAL_TIKTOK = /(^|\.)tiktok\.com$/i;
const LOGIN_HOSTS = /(^|\.)(tiktok\.com|google\.com|googleusercontent\.com|facebook\.com|apple\.com)$/i;
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

function officialUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && !url.username && !url.password && OFFICIAL_TIKTOK.test(url.hostname)
      ? url.href : null;
  } catch { return null; }
}

function loginUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && !url.username && !url.password && LOGIN_HOSTS.test(url.hostname)
      ? url.href : null;
  } catch { return null; }
}

function cleanLine(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

function unique(values, limit = 20) {
  return [...new Set(values.map(cleanLine).filter(Boolean))].slice(0, limit);
}

function parseTikTokEventPage(input = {}) {
  const sourceUrl = officialUrl(input.url);
  const title = cleanLine(input.title).slice(0, 180);
  const lines = unique(String(input.text || '').split(/\r?\n/), 500);
  const joined = lines.join('\n');
  const nameCandidates = lines.filter(line =>
    line.length >= 4 && line.length <= 90 &&
    !/^(tiktok|live center|home|analytics|rewards?|tasks?|missions?|rules?|details?|join now|learn more|bonus|events?)$/i.test(line) &&
    /(pact|heart|cup|fest|festival|campaign|event|challenge|league|party|battle|showdown)/i.test(line));
  let name = cleanLine(input.name || nameCandidates[0] || title.replace(/\s*[|–-]\s*TikTok.*$/i, ''));
  if (/^(tiktok|live center|tiktok live studio)$/i.test(name)) name = '';

  const dates = [];
  const datePattern = /\b(?:20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]20\d{2}|\d{1,2}\s+(?:jan(?:uari)?|feb(?:ruari)?|mar(?:s)?|apr(?:il)?|maj|jun(?:i)?|jul(?:i)?|aug(?:usti)?|sep(?:tember)?|okt(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+20\d{2})?)\b/gi;
  for (const match of joined.matchAll(datePattern)) dates.push(cleanLine(match[0]));

  const tasks = unique(lines.filter(line =>
    line.length <= 220 && /(?:task|mission|uppgift|gå live|go live|stream|samla|collect|rank|poäng|points|diamonds|diamanter)/i.test(line) &&
    !/^(tasks?|missions?|uppgifter?)$/i.test(line)), 12);

  const boostedGifts = unique(lines.filter(line =>
    line.length <= 180 && /(?:\b[2-9]\s*[x×]|double\s+points?|dubbla?\s+poäng|boosted?\s+gift|bonus\s+gift)/i.test(line)), 12);

  const bonusWindows = unique(lines.filter(line =>
    line.length <= 180 && /(?:bonus|boost|happy hour|power hour|dubbla?\s+poäng)/i.test(line) &&
    /(?:\b[0-2]?\d[:.]\d{2}\b|\b(?:am|pm|utc|cet|cest)\b)/i.test(line)), 12);

  const missing = [];
  if (!sourceUrl) missing.push('officiell TikTok-källa');
  if (!name) missing.push('eventnamn');
  if (dates.length < 2) missing.push('start- och slutdatum');
  if (!tasks.length) missing.push('uppgifter');
  if (!boostedGifts.length && !bonusWindows.length) missing.push('bonusregler eller bonusperiod');
  const publishable = missing.length === 0;
  const normalized = { name, dates: unique(dates, 4), tasks, boostedGifts, bonusWindows };
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex').slice(0, 16);
  return { sourceUrl, title, ...normalized, publishable, missing, fingerprint };
}

function createTikTokEventService({ BrowserWindow, partition = 'persist:vyra-tiktok-events', log = () => {} } = {}) {
  let reader = null;
  let snapshot = null;
  let lastError = '';
  let updatedAt = null;
  let autoTimer = null;

  const status = () => ({
    available: !!BrowserWindow,
    open: !!reader && !reader.isDestroyed(),
    state: lastError ? 'error' : snapshot ? (snapshot.publishable ? 'verified' : 'incomplete') : 'idle',
    updatedAt, lastError, snapshot
  });

  async function open(value) {
    if (!BrowserWindow) throw new Error('TikTok-event finns endast i VYRA Desktop');
    const url = officialUrl(value);
    if (!url) throw new Error('Ange en officiell https-adress på tiktok.com');
    if (reader && !reader.isDestroyed()) { reader.show(); await reader.loadURL(url); return status(); }
    reader = new BrowserWindow({
      width: 1160, height: 820, minWidth: 860, minHeight: 640, show: true,
      title: 'VYRA · TikTok Event Reader', autoHideMenuBar: true,
      webPreferences: { partition, contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true }
    });
    reader.setMenu(null);
    reader.webContents.setUserAgent(CHROME_UA);
    reader.webContents.setWindowOpenHandler(({ url: next }) => loginUrl(next)
      ? { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true,
          webPreferences: { partition, contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } } }
      : { action: 'deny' });
    reader.webContents.on('did-create-window', child => child.webContents.setUserAgent(CHROME_UA));
    reader.webContents.on('will-navigate', (event, next) => { if (!loginUrl(next)) event.preventDefault(); });
    reader.webContents.on('did-fail-load', (_event, code, description, target) => {
      lastError = `TikTok kunde inte laddas (${code}: ${description})`;
      log('TikTok event load failed', code, description, target || '');
    });
    reader.webContents.on('did-finish-load', () => {
      setTimeout(() => scan().catch(error => { lastError = error.message; }), 1500).unref?.();
    });
    reader.on('closed', () => { clearInterval(autoTimer); autoTimer = null; reader = null; });
    await reader.loadURL(url);
    clearInterval(autoTimer);
    autoTimer = setInterval(() => scan().catch(error => { lastError = error.message; }), 15 * 60 * 1000);
    autoTimer.unref?.();
    lastError = '';
    return status();
  }

  async function scan() {
    if (!reader || reader.isDestroyed()) throw new Error('Öppna TikTok-sidan först');
    const page = await reader.webContents.executeJavaScript(`(() => ({
      url: location.href,
      title: document.title,
      text: (document.body && document.body.innerText || '').slice(0, 120000)
    }))()`, true);
    snapshot = parseTikTokEventPage(page);
    updatedAt = new Date().toISOString();
    lastError = snapshot.publishable ? '' : `Saknas: ${snapshot.missing.join(', ')}`;
    log('TikTok event scan', snapshot.fingerprint, snapshot.publishable ? 'verified' : lastError);
    return status();
  }

  function close() {
    if (reader && !reader.isDestroyed()) reader.close();
    return status();
  }

  return { open, scan, close, status };
}

module.exports = { createTikTokEventService, parseTikTokEventPage, officialUrl, loginUrl };
