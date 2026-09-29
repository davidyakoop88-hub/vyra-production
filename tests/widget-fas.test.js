'use strict';
// Fasmotorns fabrik — skrivet RÖTT FÖRST (widget-fas.js finns inte än).
//
// VARFÖR EN FABRIK. fan-fas.js bär motorn (register, bytbar klocka, sekventiella exklusiva
// fasklasser, spela/avbryt, trigger-koppling via timerfältets identitetsdiff) men är Fan-hårdkodad
// på fem punkter: PREFIX, layoutprefixet, selektorn, aktivklassen och triggernamnet+timerfältet.
// Gifter Level Up ska få samma motorform (Davids beslut 2026-08-19: full port av fyrfasspråket),
// och att kopiera filen vore att låta två motorer glida isär — samma felklass som lät 'card' och
// 'hero' divergera. Fabriken äger mekaniken, arterna äger sina register.
//
// KONTRAKTET SOM PROVAS HÄR är fabrikens egna: instansiering, isolation mellan instanser,
// sekvensen driven av instansens EGEN klocka, och att kopplingen läser konfigurerad trigger +
// timerfält. Fan-artens beteende ägs oförändrat av tests/fan-fas.test.js — refaktorns bevis är
// att den sviten står grön orörd (enda riggändringen: widget-fas.js laddas före fan-fas.js).
const test = require('node:test'), assert = require('node:assert/strict');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

test.after(closeAll);

function rigg() {
  const h = createDom({ state: { widgets: [] } });
  h.paint([]);
  h.load('widget-fas.js');
  return h;
}

// En manuell klocka: proven stegar tiden själva i stället för att sova.
function manuellKlocka() {
  const jobb = [];
  return {
    satt: (fn, ms) => { jobb.push({ fn, ms }); return jobb.length; },
    rensa: id => { if (jobb[id - 1]) jobb[id - 1].fn = null; },
    kor: () => { const j = jobb.splice(0); j.forEach(x => x.fn && x.fn()); },
    jobb,
  };
}

test('fabriken skapar en instans med artens eget register och prefix', () => {
  const h = rigg();
  const motor = h.window.VyraWidgetFas.skapa({
    prefix: 'prov-fas-', kortasteVisning: 2000,
    faser: { solo: [{ namn: 'ett', ms: 100 }, { namn: 'tva', ms: 200 }] },
    layoutPrefix: 'prov-layout-', selector: '.prov-widget', aktivKlass: 'prov-active',
    timerFalt: '_provTimer', triggerNamn: 'triggerProv',
  });
  assert.equal(motor.PREFIX, 'prov-fas-');
  assert.equal(motor.KORTASTE_VISNING, 2000);
  assert.equal(motor.total('solo'), 300);
  assert.equal(motor.faser('okand'), null, 'en oregistrerad modell ska sakna faser');
});

test('sekvensen drivs av instansens egen klocka: en exklusiv fasklass i taget', () => {
  const h = rigg();
  const motor = h.window.VyraWidgetFas.skapa({
    prefix: 'prov-fas-', kortasteVisning: 2000,
    faser: { solo: [{ namn: 'ett', ms: 100 }, { namn: 'tva', ms: 200 }] },
    layoutPrefix: 'prov-layout-', selector: '.prov-widget', aktivKlass: 'prov-active',
    timerFalt: '_provTimer', triggerNamn: 'triggerProv',
  });
  const klocka = manuellKlocka();
  Object.assign(motor.klocka, { satt: klocka.satt, rensa: klocka.rensa });
  const box = h.document.createElement('div');
  box.className = 'prov-widget prov-layout-solo';
  assert.equal(motor.spela(box), true);
  assert.ok(box.classList.contains('prov-fas-ett'), 'första fasen tänds direkt');
  assert.ok(!box.classList.contains('prov-fas-tva'), 'fas två får inte vara tänd samtidigt');
  klocka.kor();
  assert.ok(!box.classList.contains('prov-fas-ett'), 'fas ett ska släckas av klockan');
  motor.avbryt(box);
  assert.equal([...box.classList].filter(k => k.startsWith('prov-fas-')).length, 0,
    'avbryt ska lämna lådan utan fasklasser');
});

test('två instanser är isolerade: olika prefix, olika register, olika klockor', () => {
  const h = rigg();
  const a = h.window.VyraWidgetFas.skapa({
    prefix: 'a-fas-', kortasteVisning: 2000, faser: { x: [{ namn: 'en', ms: 50 }] },
    layoutPrefix: 'a-layout-', selector: '.a', aktivKlass: 'a-active',
    timerFalt: '_aTimer', triggerNamn: 'triggerA',
  });
  const b = h.window.VyraWidgetFas.skapa({
    prefix: 'b-fas-', kortasteVisning: 3000, faser: { x: [{ namn: 'en', ms: 70 }, { namn: 'tva', ms: 80 }] },
    layoutPrefix: 'b-layout-', selector: '.b', aktivKlass: 'b-active',
    timerFalt: '_bTimer', triggerNamn: 'triggerB',
  });
  assert.notEqual(a.klocka, b.klocka, 'instanserna får inte dela klockobjekt');
  assert.equal(a.total('x'), 50);
  assert.equal(b.total('x'), 150);
  assert.equal(a.KORTASTE_VISNING, 2000);
  assert.equal(b.KORTASTE_VISNING, 3000);
  const box = h.document.createElement('div');
  box.className = 'a b a-layout-x b-layout-x';
  a.spela(box);
  assert.ok(box.classList.contains('a-fas-en'));
  assert.ok(!box.classList.contains('b-fas-en'), 'a-instansen får inte tända b-prefixade klasser');
});

test('kopplingen läser konfigurerad trigger och timerfält — och spelar bara nytriggade lådor', () => {
  const h = rigg();
  const motor = h.window.VyraWidgetFas.skapa({
    prefix: 'prov-fas-', kortasteVisning: 2000,
    faser: { solo: [{ namn: 'ett', ms: 100 }] },
    layoutPrefix: 'prov-layout-', selector: '.prov-widget', aktivKlass: 'prov-active',
    timerFalt: '_provTimer', triggerNamn: 'triggerProv',
  });
  const gammal = h.document.createElement('div');
  gammal.className = 'prov-widget prov-layout-solo prov-active';
  gammal._provTimer = 7;                       // spelar redan — identiteten ska INTE ändras
  const ny = h.document.createElement('div');
  ny.className = 'prov-widget prov-layout-solo';
  h.document.body.append(gammal, ny);

  h.window.triggerProv = function () {
    // originalet tänder den nya lådan och byter dess timeridentitet — precis som media.js gör
    ny.classList.add('prov-active');
    ny._provTimer = 42;
    return 'svar';
  };
  assert.equal(motor.koppla(), true, 'kopplingen ska lyckas när triggern finns');
  assert.equal(motor.arKopplad(), true);
  const svar = h.window.triggerProv({});
  assert.equal(svar, 'svar', 'originalets returvärde ska bevaras');
  assert.ok(ny.classList.contains('prov-fas-ett'), 'den nytriggade lådan ska få fas ett');
  assert.ok(!gammal.classList.contains('prov-fas-ett'),
    'lådan vars timeridentitet inte bytts spelade redan och ska inte ryckas om');
});

// ——— FABRIKEN FOR PERMANENTA WIDGETAR (gavororelsen, docs/gavororelsen.md §1 och §7) ———
//
// De tre foljande proven skrevs RODA. Fabriken byggdes for ALERTS — nagot som tands, spelar och
// slacks — och Top Gift och Top Streak ar ingetdera. De ligger kvar hela sandningen och uppdateras
// pa plats. Tva antaganden i motorn holl darfor inte, och bada ar matbara:
//
//   1. KOPPLINGEN. `koppla()` lindar sig runt en global triggerfunktion och laser ett timerspar per
//      tand lada. Uppmatt 2026-09-22: det finns varken `triggerTopGift`, `triggerTopStreak` eller
//      nagot timerfalt pa de tva familjernas lador. En art utan trigger ska darfor kunna saga det
//      RAKT UT och fa nej tillbaka — i dag returnerar `koppla()` false for att `root[undefined]`
//      rakar vara undefined, vilket ar ratt svar av fel skal.
//
//   2. SLUTET PA EN SEKVENS. `box._fasTimers` fylls i `spela()` men toms bara i `avbryt()` — aldrig
//      nar sista fasen tagit slut. For en alert spelar det ingen roll: ladan slacks. For en
//      permanent widget betyder det att listan star kvar full for alltid, och da gar det inte att
//      fraga om koreografin pagar. Det ar precis den fragan §7:s beslut vilar pa: ett nytt rekord
//      avbryter INTE en pagaende sekvens.

function permanentMotor(h, extra = {}) {
  return h.window.VyraWidgetFas.skapa(Object.assign({
    prefix: 'perm-fas-', kortasteVisning: 2000,
    faser: { solo: [{ namn: 'ett', ms: 100 }, { namn: 'tva', ms: 200 }] },
    layoutPrefix: 'perm-layout-', selector: '.perm-widget', aktivKlass: 'perm-active',
    timerFalt: null, triggerNamn: null,
  }, extra));
}

test('en art utan trigger kopplar sig inte — och sager nej av ratt skal', () => {
  const h = rigg();
  const motor = permanentMotor(h);
  assert.equal(motor.koppla(), false, 'en art utan triggerNamn far aldrig linda nagon global');
  assert.equal(motor.arKopplad(), false);

  // OCH DEN SKA INTE HA RATT AV EN SLUMP. Den gamla formen slog upp `root[triggerNamn]` direkt:
  // med `triggerNamn: null` blev uppslaget `root['null']`, vilket ar undefined sa lange ingen
  // global heter sa. Finns en, lindar den gamla formen den. Uppslagsnyckeln ar strangen, sa det
  // racker att lagga dit en funktion vid namn "null" for att skilja de tva formerna at.
  h.window.null = function () { return 'fel' };
  assert.equal(motor.koppla(), false, 'kopplingen letade upp en global pa ett falskt namn');
  assert.equal(motor.arKopplad(), false);

  // Tomma strangen ar samma fall och ska behandlas likadant — en art som glomt fylla i faltet ska
  // inte tyst koppla sig till nagonting alls.
  const tom = permanentMotor(h, { triggerNamn: '' });
  assert.equal(tom.koppla(), false);
});

test('sista fasen tommer timerlistan — annars gar det inte att fraga om sekvensen pagar', () => {
  const h = rigg();
  const motor = permanentMotor(h);
  const klocka = manuellKlocka();
  Object.assign(motor.klocka, { satt: klocka.satt, rensa: klocka.rensa });
  const box = h.document.createElement('div');
  box.className = 'perm-widget perm-layout-solo';

  assert.equal(motor.spelar(box), false, 'en orord lada spelar ingenting');
  motor.spela(box);
  assert.equal(motor.spelar(box), true, 'sekvensen ar i luften sa fort forsta fasen tants');
  klocka.kor();
  assert.equal(motor.spelar(box), false,
    'timerlistan star kvar full efter sista fasen — da ser varje ny gava widgeten som upptagen');
  assert.equal([...box.classList].filter(k => k.startsWith('perm-fas-')).length, 0,
    'sista fasen ska ocksa slacka sin egen klass');
});

test('avbryt() tommer listan ocksa — bada vagarna ut ur en sekvens ska se likadana ut', () => {
  const h = rigg();
  const motor = permanentMotor(h);
  Object.assign(motor.klocka, manuellKlocka());
  const box = h.document.createElement('div');
  box.className = 'perm-widget perm-layout-solo';
  motor.spela(box);
  assert.equal(motor.spelar(box), true);
  motor.avbryt(box);
  assert.equal(motor.spelar(box), false, 'efter avbryt ska widgeten vara ledig igen');
});

test('spelar() ar fabrikens enda bidrag till §7 — policyn agas av anroparen', () => {
  // Fabriken far INTE sjalv vagra spela om en pagaende sekvens. Fan och Gifter bygger pa att
  // spela() alltid spelar; deras skydd ar timerdiffen i koppla(), inte motorn. Att flytta upp
  // regeln hit hade andrat tva fungerande familjer for en tredjes skull.
  const h = rigg();
  const motor = permanentMotor(h);
  Object.assign(motor.klocka, manuellKlocka());
  const box = h.document.createElement('div');
  box.className = 'perm-widget perm-layout-solo';
  motor.spela(box);
  assert.equal(motor.spela(box), true, 'spela() ska fortfarande spela om pa begaran');
  assert.ok(box.classList.contains('perm-fas-ett'), 'och da borja om fran fas ett');
});
