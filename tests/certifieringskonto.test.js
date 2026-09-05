'use strict';
// SPÄRRARNA I scripts/certifieringskonto.js.
//
// Skriptet skriver i `subscriptions` mot PRODUKTIONENS databas. Två av dess beslut kan göra tyst
// skada, och båda provas här:
//
//   1. Ett RIKTIGT Stripe-abonnemang får aldrig röras. Skrivs det över säger databasen en sak
//      medan Stripe fortsätter fakturera — och nästa webhook skriver ändå tillbaka Stripes bild,
//      så ändringen vore både farlig och verkningslös. Spärren måste gälla ÅT BÅDA HÅLLEN: `--av`
//      på ett betalt abonnemang skulle stänga av en kund som betalar.
//
//   2. Utan arbetsyta finns ingen rad att skriva på. Skriptet måste stanna, inte hitta på en.
//
// Beslutet ligger i en ren funktion just för att det ska gå att bevisa utan Postgres. Låg det
// inbakat i databasanropen skulle det bara kunna provas mot en riktig server, alltså sällan.
//
// MUTATIONSPRÖVAT: tas raden `if (sub && sub.stripe_subscription_id)` bort ur beslut() faller
// "betalt abonnemang rors aldrig" åt båda hållen. Tas `if (!forsta)` bort faller
// "utan arbetsyta stannar skriptet".
const test = require('node:test'), assert = require('node:assert/strict');
const { beslut, hinderForTestare, parseArgs } = require('../scripts/certifieringskonto.js');

const ARBETSYTA = { id: 'w-1', name: 'Testytan', created_at: new Date('2026-01-01') };
const ANVANDARE = {
  id: 'u-1', email: 'cert@exempel.test', display_name: 'Cert',
  disabled_at: null, email_verified_at: new Date(), mfa_enabled_at: null, is_platform_admin: false,
};
const konto = (over = {}) => ({
  user: { ...ANVANDARE, ...(over.user || {}) },
  workspaces: over.workspaces || [ARBETSYTA],
  forsta: 'forsta' in over ? over.forsta : ARBETSYTA,
  sub: 'sub' in over ? over.sub : null,
});

test('ett betalt Stripe-abonnemang ror skriptet aldrig — at bada hallen', () => {
  const betalt = { plan: 'premium', status: 'active', stripe_subscription_id: 'sub_1ABC' };

  for (const flaggor of [{ pa: true }, { av: true }]) {
    const vad = beslut(konto({ sub: betalt }), flaggor);
    assert.equal(vad.atgard, 'stopp',
      `${JSON.stringify(flaggor)} pa ett Stripe-abonnemang maste stanna, blev "${vad.atgard}"`);
    assert.equal(vad.kod, 3);
    assert.match(vad.text, /Stripe-abonnemang/);
  }

  // Samma rad UTAN stripe-id ska daremot ga igenom — annars ar spärren bara "gor aldrig nagot".
  const kompat = { plan: 'premium', status: 'active', stripe_subscription_id: null };
  assert.equal(beslut(konto({ sub: kompat }), { av: true }).atgard, 'ta',
    'ett KOMPAT premium maste ga att ta tillbaka, annars ar spärren for bred');
});

test('utan arbetsyta stannar skriptet i stallet for att hitta pa en rad', () => {
  for (const flaggor of [{ pa: true }, { av: true }]) {
    const vad = beslut(konto({ forsta: null, workspaces: [] }), flaggor);
    assert.equal(vad.atgard, 'stopp');
    assert.equal(vad.kod, 1);
  }
});

test('utan flagga skrivs ingenting — visning ar standardlaget', () => {
  const vad = beslut(konto(), {});
  assert.equal(vad.atgard, 'visa');
  assert.equal(vad.kod, 0);
});

test('--pa och --av samtidigt avvisas i stallet for att ena vinner tyst', () => {
  const vad = beslut(konto(), { pa: true, av: true });
  assert.equal(vad.atgard, 'stopp');
  assert.equal(vad.kod, 2);
});

test('ett konto utan abonnemangsrad far Premium', () => {
  assert.equal(beslut(konto({ sub: null }), { pa: true }).atgard, 'ge');
});

test('--pa ar idempotent mot ett konto som redan har aktivt Premium', () => {
  for (const status of ['active', 'trialing', 'past_due']) {
    const vad = beslut(konto({ sub: { plan: 'premium', status, stripe_subscription_id: null } }), { pa: true });
    assert.equal(vad.atgard, 'visa', `status "${status}" raknas som aktivt i main.js och ska inte skrivas om`);
  }
});

test('ett UTGANGET premium skrivs om — statuslistan ar samma som appens', () => {
  // main.js:128 slapper bara in ['active','trialing','past_due']. Allt annat ar for appen samma sak
  // som inget premium, sa skriptet maste kunna laga det.
  for (const status of ['canceled', 'unpaid', 'incomplete_expired', 'inactive']) {
    const vad = beslut(konto({ sub: { plan: 'premium', status, stripe_subscription_id: null } }), { pa: true });
    assert.equal(vad.atgard, 'ge', `status "${status}" slapps INTE in av appen och maste kunna skrivas om`);
  }
});

test('--av pa ett konto utan kompat premium skriver ingenting', () => {
  assert.equal(beslut(konto({ sub: null }), { av: true }).atgard, 'visa');
  assert.equal(beslut(konto({ sub: { plan: 'free', status: 'inactive', stripe_subscription_id: null } }), { av: true }).atgard, 'visa');
});

test('tvafaktor rapporteras som hinder — det ar den som far appen att hanga tyst', () => {
  const hinder = hinderForTestare(konto({ user: { mfa_enabled_at: new Date() } }));
  assert.equal(hinder.length, 1, 'exakt ett hinder vantades');
  assert.match(hinder[0], /TVÅFAKTOR/);
  // Utan MFA ska listan vara tom, annars sager provet ingenting om just MFA.
  assert.deepEqual(hinderForTestare(konto()), []);
});

test('avstangt konto och saknad arbetsyta rapporteras ocksa', () => {
  assert.match(hinderForTestare(konto({ user: { disabled_at: new Date() } }))[0], /avstängt/);
  assert.match(hinderForTestare(konto({ forsta: null, workspaces: [] }))[0], /ingen arbetsyta/);
});

test('overifierad e-post rapporteras — grinden slapper igenom men allt skrivande faller', () => {
  // server/index.js:374 svarar 403 pa VARJE icke-GET utan verifierad e-post. Grinden i main.js gor
  // bara GET, sa den markér ingenting: testaren kommer in i en Studio dar inget gar att spara.
  const hinder = hinderForTestare(konto({ user: { email_verified_at: null } }));
  assert.equal(hinder.length, 1);
  assert.match(hinder[0], /E-POSTEN ÄR INTE VERIFIERAD/);
  assert.deepEqual(hinderForTestare(konto()), [], 'ett verifierat konto ska inte ge nagot hinder');
});

test('--operator slukar aldrig en flagga — det skulle stanga av torrkorningen tyst', () => {
  // `--operator --dry-run` med en naiv argv[++i] gor "--dry-run" till operatorsnamn OCH ater upp
  // flaggan. Skriptet hade da skrivit SKARPT mot produktion fast anvandaren bad om torrkorning.
  const a = parseArgs(['post@exempel.test', '--pa', '--operator', '--dry-run']);
  assert.equal(a.flags.dryRun, true, 'torrkorningen maste overleva');
  assert.equal(a.flags.operator, undefined);
  assert.equal(a.flags.operatorSaknasVarde, true, 'och felet ska rapporteras, inte tigas ihjal');

  // --operator sist utan varde ska ocksa fangas, inte bli undefined i tysthet.
  assert.equal(parseArgs(['x@y.z', '--operator']).flags.operatorSaknasVarde, true);
});

test('flaggorna lases som de skrivs', () => {
  const a = parseArgs(['post@exempel.test', '--pa', '--dry-run', '--operator', 'David']);
  assert.deepEqual(a.positional, ['post@exempel.test']);
  assert.equal(a.flags.pa, true);
  assert.equal(a.flags.dryRun, true);
  assert.equal(a.flags.operator, 'David');
  assert.equal(a.flags.av, undefined);
  // "--på" med svenskt a ska funka lika bra — det ar den stavning en svensk hand skriver.
  assert.equal(parseArgs(['x@y.z', '--på']).flags.pa, true);
});
