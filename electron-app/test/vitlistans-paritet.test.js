'use strict';
// INGET SKRIVBORDSAPPEN RAKNAR FRAM FAR STRYKAS AV DESS EGEN VITLISTA. #350
//
// `cleanEvent()` i local-server.js ar en andra, oberoende vitlista efter falten redan raknats fram
// i tiktok-fields.js och tiktok-service.js. Sju falt foll mellan de tva leden, och foljden var att
// FYRA widgetar aldrig kunde tandas via appens EGEN TikTok-anslutning:
//
//   giftId        Heart Me Goal (server/heart-me-goal.js:113 returnerar direkt utan det)
//   fanClubLevel  Fan Level Up (fan-level-session.js kraver heltal 1-50)
//   gifterLevel   Gifter Level Up (samma krav)
//   isModerator   publikvalet "Moderator" i Actions
//   isFollower / isSubscriber / fanLevelUp  samma familj, samma tystnad
//
// giftId ar tydligast: det lades till med kommentaren "PARITET MED MOLNVAGEN" i #280 och stroks
// ett led senare.
//
// ⚠️ VARFOR PROVET JAMFOR MOT PRODUKTIONEN OCH INTE MOT MOLNETS VITLISTA. Molnets cleanEvent bar
// 38 falt, varav de flesta skrivbordsappen aldrig producerar (battleId, winsUs, liga*, tillVarden
// ...). Ett prov som kravde paritet DAR hade krävt falt som inte finns att bara, och hade darfor
// antingen brusat eller tystats ned. Den regel som verkligen galler ar smalare och underhaller sig
// sjalv: allt appen RAKNAR FRAM maste overleva dess egen vitlista.
//
// ⚠️ OCH VARFOR DET MATS GENOM HELA VAGEN. Det gamla provet larlage-paritet.test.js:165 heter
// "electron skickar giftId hela vagen fran en gava" och asserterar pa tjanstens onEvent — ett steg
// FORE strykningen. Ratt namn, fel led, och darfor gront i sju veckor. Det har provet postar till
// /api/events och laser tillbaka via GET, alltsa exakt den vag OBS-overlayen anvander.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');
const { startLocalServer } = require('../local-server');
const F = require('../tiktok-fields');

const ROOT = path.join(__dirname, '..', '..');
let nastaPort = 45231;

async function medServer(kor) {
  const port = nastaPort++;
  const server = await startLocalServer(ROOT, port, {});
  try { await kor(`http://127.0.0.1:${port}`) }
  finally { await new Promise(r => server.close(r)) }
}

// En payload i den form TikTok levererar den, rik nog att fylla varje falt baseUser raknar fram.
const raPayload = () => ({
  user: {
    userId: '6812345678901234567', uniqueId: 'lisa_live', nickname: 'Lisa',
    avatarLarger: { urlList: ['https://p16.tiktokcdn.com/a.jpeg'] },
    badgeList: [
      { sceneType: 10, privilegeLogExtra: { level: 7 } },   // fanklubbsniva
      { sceneType: 8, privilegeLogExtra: { level: 12 } },   // gifterniva
    ],
  },
  userIdentity: { isModeratorOfAnchor: true, isFollowerOfAnchor: true, isSubscriberOfAnchor: true },
});

test('allt baseUser raknar fram overlever vitlistan', async () => {
  const producerat = F.baseUser(raPayload());
  // Sanity: provet ar meningslost om extraktorn slutar producera falten.
  for (const falt of ['isModerator', 'isFollower', 'isSubscriber', 'fanClubLevel', 'gifterLevel']) {
    assert.ok(falt in producerat, `baseUser producerar inte langre ${falt} — provet mater fel sak`);
  }

  await medServer(async origin => {
    await fetch(origin + '/api/events', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'gift', eventKey: 'p1', ...producerat }),
    });
    const svar = await (await fetch(origin + '/api/events?after=0')).json();
    const e = (svar.events || svar || []).slice(-1)[0];
    assert.ok(e, 'inget event kom tillbaka ur /api/events');

    for (const [falt, varde] of Object.entries(producerat)) {
      assert.ok(falt in e,
        `${falt} raknas fram av baseUser men stryks av cleanEvent — konsumenten far det aldrig`);
      // Booleaner och tal maste behalla sitt VARDE, inte bara sin nyckel: en niva som klipps till
      // 0 ar lika tyst som ett struket falt.
      if (typeof varde === 'boolean' || typeof varde === 'number') {
        assert.equal(e[falt], varde, `${falt} bar fel varde efter vitlistan`);
      }
    }
  });
});

test('giftId overlever hela vagen — det led det gamla provet aldrig matte', async () => {
  await medServer(async origin => {
    await fetch(origin + '/api/events', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'gift', eventKey: 'p2', giftId: '9001', giftName: 'Rose' }),
    });
    const svar = await (await fetch(origin + '/api/events?after=0')).json();
    const e = (svar.events || svar || []).slice(-1)[0];
    assert.equal(e.giftId, '9001',
      'giftId stryks fortfarande — Heart Me Goal star pa 0 hela sandningen och gavoidentitetens '
      + 'larlage kan aldrig slutfora en fangst');
  });
});

test('nivahojningen bars som objekt, och en TOM hojning bars inte alls', async () => {
  await medServer(async origin => {
    const post = (nyckel, kropp) => fetch(origin + '/api/events', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'fanlevelup', eventKey: nyckel, ...kropp }),
    });
    await post('p3', { fanLevelUp: { from: 6, to: 7 } });
    await post('p4', { fanLevelUp: { from: 0, to: 0 } });
    const svar = await (await fetch(origin + '/api/events?after=0')).json();
    const rader = svar.events || svar || [];
    const riktig = rader.find(x => x.eventKey === 'p3'), tom = rader.find(x => x.eventKey === 'p4');
    assert.deepEqual(riktig.fanLevelUp, { from: 6, to: 7 }, 'nivahojningen tappades');
    // En nolla hade sett ut som en riktig hojning till niva 0 och tant widgeten i onodan.
    assert.ok(!('fanLevelUp' in tom), 'en tom hojning bars som om den vore riktig');
  });
});

test('battleStatus star medvetet INTE i vitlistan — det raknas aldrig fram', () => {
  // #350 pastod att battleStatus stryks. Det gor det inte: skrivbordsappen producerar det aldrig.
  // Battle MVP pa desktopvagen kraver att faltet BERAKNAS forst, vilket ar en annan andring — och
  // att lagga det i vitlistan hade sett ut som en fix utan att vara en.
  const fs = require('fs');
  const kalla = fs.readFileSync(path.join(__dirname, '..', 'tiktok-service.js'), 'utf8')
    + fs.readFileSync(path.join(__dirname, '..', 'tiktok-fields.js'), 'utf8');
  assert.doesNotMatch(kalla, /battleStatus/,
    'skrivbordsappen har borjat rakna fram battleStatus — da SKA det ocksa in i vitlistan, och '
    + 'den har vakten ska bytas mot ett prov som kraver det');
});
