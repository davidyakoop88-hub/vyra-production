'use strict';
// ACTION- OCH EVENTDIALOGERNA AR RIKTIGA DIALOGER.
//
// Granskning 2026-10-17 F10: nar Ny Action och Nytt Event oppnades lag fokus kvar pa knappen bakom
// dialogen, och tillganglighetstradet visade en vanlig container i stallet for en namngiven dialog.
// F11: Escape stangde inte actiondialogen — den fick stangas med knappen.
//
// Kraven: role=dialog + aria-modal + aria-labelledby mot rubriken, fokus flyttas in, Tab stannar
// i dialogen, Escape stanger nar inget andrats och fragar forst nar nagot andrats, och fokus
// gar tillbaka till knappen som oppnade dialogen.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..'), { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp' };
function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''), fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) { res.writeHead(404); res.end('nej'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' }); fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}
let server, browser, bas, skip = hoppaOver();
test.before(async () => { if (skip) return; browser = await startaWebblasare(); if (!browser) throw new Error('webblasaren kunde inte starta'); server = await servera(); bas = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { if (browser) await browser.close(); if (server) await new Promise(r => server.close(r)); });

async function actionEvent({ medAction = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function' && !!window.VyraSessionState && !!document.querySelector('aside [data-extra="actions"]'), null, { timeout: 30000, polling: 100 });
  await page.evaluate(async medAction => {
    await window.VyraSessionState.projectLocalSession();
    if (medAction) await window.VyraSessionState.writeActive('vyra-action-event-v2', JSON.stringify({
      enabled: true, events: [],
      actions: [{ id: 'prov-a1', name: 'Provaction', types: ['alert'], config: { alertText: 'Hej' }, scene: { number: 1 }, duration: 5 }],
    }));
  }, medAction);
  await page.waitForTimeout(1200);
  await page.click('aside [data-extra="actions"]');
  await page.waitForSelector('#newAeAction', { timeout: 15000 });
  return page;
}
const las = () => {
  const m = document.querySelector('.ae-modal');
  if (!m) return { oppen: false, fokus: document.activeElement && (document.activeElement.id || document.activeElement.textContent.trim().slice(0, 30)) };
  const id = m.getAttribute('aria-labelledby'), rubrik = id && document.getElementById(id);
  return {
    oppen: true, role: m.getAttribute('role'), modal: m.getAttribute('aria-modal'),
    namn: rubrik ? rubrik.textContent.trim() : null,
    fokusInne: m.contains(document.activeElement),
  };
};

for (const [vad, knapp, rubrik, medAction] of [
  ['Ny Action', '#newAeAction', 'Ny Action', false],
  ['Nytt Event', '#newAeEventCard', 'Nytt Event', true],
]) {
  test(`${vad}: namngiven modal dialog som tar fokus och lamnar tillbaka det`, { skip, timeout: 120000 }, async () => {
    const page = await actionEvent({ medAction });
    try {
      await page.click(knapp);
      await page.waitForSelector('.ae-modal', { timeout: 5000 });
      await page.waitForTimeout(200);
      const m = await page.evaluate(las);
      assert.equal(m.role, 'dialog');
      assert.equal(m.modal, 'true');
      assert.equal(m.namn, rubrik, 'dialogen ar inte namngiven efter sin rubrik');
      assert.ok(m.fokusInne, 'fokus ligger kvar bakom dialogen');

      // Tab stannar i dialogen: 60 tryck fram och 5 bak ska aldrig lamna den.
      let utanfor = 0;
      for (let i = 0; i < 60; i++) { await page.keyboard.press('Tab'); if (!(await page.evaluate(las)).fokusInne) utanfor++; }
      for (let i = 0; i < 5; i++) { await page.keyboard.press('Shift+Tab'); if (!(await page.evaluate(las)).fokusInne) utanfor++; }
      assert.equal(utanfor, 0, 'Tab lamnade dialogen');

      await page.click('.ae-modal footer [data-close-ae]');
      await page.waitForTimeout(150);
      const efter = await page.evaluate(() => ({ oppen: !!document.querySelector('.ae-modal'), fokus: document.activeElement && document.activeElement.id }));
      assert.equal(efter.oppen, false);
      assert.equal('#' + efter.fokus, knapp, 'fokus gick inte tillbaka till knappen som oppnade dialogen');
    } finally { await page.close(); }
  });
}

test('Escape stanger en orord actiondialog', { skip, timeout: 120000 }, async () => {
  const page = await actionEvent();
  try {
    await page.click('#newAeAction');
    await page.waitForSelector('.ae-modal', { timeout: 5000 });
    await page.focus('.ae-modal [data-close-ae][aria-label="Stäng"]');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const m = await page.evaluate(() => ({ oppen: !!document.querySelector('.ae-modal'), fokus: document.activeElement && document.activeElement.id }));
    assert.equal(m.oppen, false, 'Escape stangde inte dialogen');
    assert.equal(m.fokus, 'newAeAction');
  } finally { await page.close(); }
});

test('Escape med osparade andringar fragar forst och respekterar svaret', { skip, timeout: 120000 }, async () => {
  const page = await actionEvent();
  try {
    await page.click('#newAeAction');
    await page.waitForSelector('.ae-modal', { timeout: 5000 });
    await page.fill('#aeActionName', 'Halvfardig action');
    const fragor = [];
    let svar = false;
    page.on('dialog', d => { fragor.push(d.message()); svar ? d.accept() : d.dismiss(); });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const kvar = await page.evaluate(() => ({ oppen: !!document.querySelector('.ae-modal'), namn: document.querySelector('#aeActionName')?.value }));
    assert.equal(fragor.length, 1, 'ingen fraga om osparade andringar');
    assert.ok(/osparade|spara/i.test(fragor[0]), 'fragan sager inte vad som star pa spel: ' + fragor[0]);
    assert.equal(kvar.oppen, true, 'dialogen stangdes trots Nej');
    assert.equal(kvar.namn, 'Halvfardig action', 'texten forsvann trots Nej');

    svar = true;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => !!document.querySelector('.ae-modal')), false, 'dialogen stangdes inte trots Ja');
  } finally { await page.close(); }
});
