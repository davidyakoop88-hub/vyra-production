'use strict';
// Täcker server/tiktok-handtagslas.js — regeln som gör verifieringen värd något ÖVER TID.
//
// Utan låset betyder en verifiering bara "någon bevisade det här handtaget en gång". Nästa person
// som verifierar sig kan koppla samma handtag till sitt workspace, och den första förlorar sitt
// konto utan att något gick fel. overlaylive.app skriver ut regeln under knappen: "Each username
// locks to the account that linked it". Det här är den regeln.
const test = require('node:test'), assert = require('node:assert/strict');
const { knytVerifieratHandtag } = require('../tiktok-handtagslas');

// Fejkad transaktionsklient med en delad tabell i minnet, på husets form (se capacity-gate.test.js).
function fejkbas({ las = [], kopplingar = [] } = {}) {
  const laasTabell = las.slice(), kopplingsTabell = kopplingar.slice();
  const sedd = [];
  const nyckel = v => String(v || '').trim().toLowerCase().replace(/^@+/, '');

  return {
    las: laasTabell, kopplingar: kopplingsTabell, sedd,
    async query(sql, params = []) {
      sedd.push(sql.replace(/\s+/g, ' ').trim().slice(0, 44));

      if (sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 0 };

      // Låset: skriv bara om handtaget är ledigt ELLER redan tillhör samma open_id.
      if (sql.includes('INSERT INTO tiktok_handtagslas')) {
        const [handtag, openId] = params;
        const rad = laasTabell.find(r => r.handtag === handtag);
        if (!rad) { laasTabell.push({ handtag, open_id: openId }); return { rows: [{ open_id: openId }], rowCount: 1 } }
        if (rad.open_id === openId) return { rows: [{ open_id: openId }], rowCount: 1 };
        return { rows: [], rowCount: 0 };           // annat konto håller handtaget
      }
      if (sql.includes('FROM tiktok_handtagslas')) {
        const hit = laasTabell.filter(r => r.handtag === params[0]);
        return { rows: hit, rowCount: hit.length };
      }
      // capacity-gate.js:s frågor
      if (sql.includes('WHERE workspace_id=$1 AND active=true')) {
        const hit = kopplingsTabell.filter(r => r.workspace_id === params[0] && r.active);
        return { rows: hit, rowCount: hit.length };
      }
      if (sql.includes('workspace_id<>$2')) {
        const hit = kopplingsTabell.filter(r => r.active && r.workspace_id !== params[1]
          && nyckel(r.tiktok_username) === params[0]);
        return { rows: hit, rowCount: hit.length };
      }
      if (sql.includes('count(DISTINCT')) {
        const n = new Set(kopplingsTabell.filter(r => r.active).map(r => nyckel(r.tiktok_username))).size;
        return { rows: [{ n }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO tiktok_connections')) {
        const [workspaceId, handtag] = params;
        const fanns = kopplingsTabell.find(r => r.workspace_id === workspaceId);
        const rad = fanns || { workspace_id: workspaceId };
        Object.assign(rad, { tiktok_username: handtag, active: true, updated_at: new Date() });
        if (!fanns) kopplingsTabell.push(rad);
        return { rows: [rad], rowCount: 1 };
      }
      if (sql.includes('UPDATE tiktok_connections')) {
        const rad = kopplingsTabell.find(r => r.workspace_id === params[0]);
        Object.assign(rad, { verifierad_at: new Date(), tiktok_open_id: params[1],
          tiktok_union_id: params[2], visningsnamn: params[3], avatar_url: params[4] });
        return { rows: [rad], rowCount: 1 };
      }
      throw new Error('oväntad fråga i provet: ' + sql.slice(0, 60));
    },
  };
}

const PROFIL = { handtag: 'streamqueen', openId: 'open-1', unionId: 'union-1',
  visningsnamn: 'Stream Queen', avatarUrl: 'https://p16.tiktok.com/a.jpg' };

test('ett ledigt handtag knyts till kontot och kopplingen märks verifierad', async () => {
  const bas = fejkbas();
  const ut = await knytVerifieratHandtag(bas, { workspaceId: 'ws-1', profil: PROFIL, limit: 5 });

  assert.equal(ut.refused, undefined);
  assert.equal(ut.connection.tiktok_username, 'streamqueen');
  assert.equal(ut.connection.tiktok_open_id, 'open-1');
  assert.ok(ut.connection.verifierad_at instanceof Date, 'verifierad_at måste sättas');
  assert.deepEqual(bas.las, [{ handtag: 'streamqueen', open_id: 'open-1' }]);
});

test('SAMMA konto får koppla om sitt eget handtag — byte av dator eller workspace ska inte låsa ute', async () => {
  const bas = fejkbas({ las: [{ handtag: 'streamqueen', open_id: 'open-1' }] });
  const ut = await knytVerifieratHandtag(bas, { workspaceId: 'ws-2', profil: PROFIL, limit: 5 });
  assert.equal(ut.refused, undefined);
  assert.equal(ut.connection.tiktok_username, 'streamqueen');
});

test('ETT ANNAT konto avvisas — det är hela poängen med verifieringen', async () => {
  const bas = fejkbas({ las: [{ handtag: 'streamqueen', open_id: 'nagon-annan' }] });
  const ut = await knytVerifieratHandtag(bas, { workspaceId: 'ws-2', profil: PROFIL, limit: 5 });

  assert.equal(ut.refused, 'last');
  assert.match(ut.error, /kopplat/i);
  // Ingen rad får ha skrivits: ett avvisat försök ska inte lämna spår i tiktok_connections.
  assert.equal(bas.kopplingar.length, 0);
  assert.ok(!bas.sedd.some(s => s.includes('INSERT INTO tiktok_connections')),
    'kopplingen får inte skrivas när låset avvisar');
});

test('låset tas FÖRE kapacitetsbeslutet — annars kan ett avvisat försök ta en live-plats', async () => {
  const bas = fejkbas({ las: [{ handtag: 'streamqueen', open_id: 'nagon-annan' }] });
  await knytVerifieratHandtag(bas, { workspaceId: 'ws-2', profil: PROFIL, limit: 5 });
  const lasIndex = bas.sedd.findIndex(s => s.includes('tiktok_handtagslas'));
  const kapacitetIndex = bas.sedd.findIndex(s => s.includes('count(DISTINCT'));
  assert.ok(lasIndex >= 0, 'låset måste frågas');
  assert.ok(kapacitetIndex === -1 || lasIndex < kapacitetIndex, 'låset ska komma först');
});

test('kapacitetsspärren gäller fortfarande för ett verifierat konto', async () => {
  const kopplingar = ['a', 'b', 'c', 'd', 'e'].map((n, i) => ({ workspace_id: 'ws-' + i, tiktok_username: n, active: true }));
  const bas = fejkbas({ kopplingar });
  const ut = await knytVerifieratHandtag(bas, { workspaceId: 'ws-ny', profil: PROFIL, limit: 5 });
  assert.equal(ut.refused, 'capacity');
});

test('tar advisory-låset först av allt, så beslutet inte kan tävla med ett annat', async () => {
  const bas = fejkbas();
  await knytVerifieratHandtag(bas, { workspaceId: 'ws-1', profil: PROFIL, limit: 5 });
  assert.match(bas.sedd[0], /pg_advisory_xact_lock/);
});

test('avvisar en profil utan handtag i stället för att skriva en tom rad', async () => {
  const bas = fejkbas();
  await assert.rejects(
    () => knytVerifieratHandtag(bas, { workspaceId: 'ws-1', profil: { ...PROFIL, handtag: '' }, limit: 5 }),
    /handtag|användarnamn/i);
});

test('avvisar en profil utan open_id — utan konto-id finns inget att låsa handtaget vid', async () => {
  const bas = fejkbas();
  await assert.rejects(
    () => knytVerifieratHandtag(bas, { workspaceId: 'ws-1', profil: { ...PROFIL, openId: null }, limit: 5 }),
    /konto/i);
});
