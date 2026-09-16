'use strict';
// KONTROLLEN SOM JÄMFÖR TIKTOKS EGET GIVARANTAL MED VÅRT (#361).
//
// TikTok skickar `goal.contributors[]` med score per person och `goal.contributorsLength`. Det är
// samma sorts tal som Heart Me Goal räknar fram själv — och det talet kostade sex granskningsrundor
// i #289/#290. TikTok sänder det gratis, och bryggan kastar det.
//
// Kontrollen ligger i analysatorn och INTE i produktionskedjan: att föra talet till servern hade
// krävt en ny typ i fyra listor, permanent, för en engångskontroll. Inspelningen bär redan båda
// talen.
//
// PROVET MÄTER ATT RÄKNINGEN ÄR RÄTT, inte att den körs. En kontroll som räknar fel är värre än
// ingen: den ser ut som ett facit.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

const { analysera } = require('../analysera-inspelning.js');

const tempar = [];
test.after(() => { for (const f of tempar) try { fs.rmSync(f, { force: true }) } catch (_) {} });

// Inspelningen är JSON Lines. Identiteterna är MASKADE men hashen är stabil genom filen — det är
// hela förutsättningen för att kunna räkna unika personer ur en maskad fil.
function skrivInspelning(rader) {
  const fil = path.join(os.tmpdir(), `hmk-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
  tempar.push(fil);
  fs.writeFileSync(fil, rader.map(r => JSON.stringify(r)).join('\n') + '\n');
  return fil;
}

const gava = (vem, namn) => ({
  typ: 'gift', vid: '2026-09-06T20:00:00Z', kalla: 'vidarebefordrad',
  nyttolast: {
    user: { userId: 'id#' + vem, nickname: 'namn#' + vem },
    giftDetails: { giftName: namn, diamondCount: 1 },
    repeatEnd: true, repeatCount: 1
  }
});

const malrad = (langd, idn, delmal) => ({
  typ: 'GOAL_UPDATE', vid: '2026-09-06T20:00:00Z', kalla: 'inspelad',
  nyttolast: {
    goal: {
      contributorsLength: langd,
      contributors: idn.map(i => ({ userIdStr: 'id#' + i, score: '10' })),
      subGoals: delmal || []
    }
  }
});

test('utan GOAL_UPDATE svarar kontrollen "inget underlag" — och gissar inte', () => {
  // Regeln genom hela analysatorn: hellre inget svar än ett påhittat. En tom rad i en rapport läses
  // som ett godkännande.
  const r = analysera(skrivInspelning([gava('anna', 'Heart Me'), gava('bo', 'Rose')]));
  const k = r.heartMeKontroll;

  assert.equal(k.svar, 'inget underlag');
  assert.match(k.skal, /VYRA_INSPELNING_TYPER=alla/, 'skälet ska säga hur man får fram typen');
  // Vårt eget tal ska redovisas ÄVEN utan TikToks — det är mätbart ur filen oavsett.
  assert.deepEqual(k['vart tal (unika avsandare per gava)'].sort(), [['Heart Me', 1], ['Rose', 1]]);
});

test('unika avsändare räknas per gåva — samma person tre gånger är fortfarande en', () => {
  // Produktbeslutet bakom Heart Me Goal, ordagrant: Anna skickar tre → +1. Anna och Bo en var → +2.
  // Räknar kontrollen gåvor i stället för personer blir den värdelös som facit.
  const r = analysera(skrivInspelning([
    gava('anna', 'Heart Me'), gava('anna', 'Heart Me'), gava('anna', 'Heart Me'),
    gava('bo', 'Heart Me'),
    gava('cecilia', 'Rose')
  ]));
  const tal = new Map(r.heartMeKontroll['vart tal (unika avsandare per gava)']);

  assert.equal(tal.get('Heart Me'), 2, 'Anna räknades mer än en gång, eller Bo inte alls');
  assert.equal(tal.get('Rose'), 1);
});

test('TikToks tal läses av: förlopp, sista värdet, unika id och delmål', () => {
  const r = analysera(skrivInspelning([
    malrad(1, ['anna'], [{ progress: 5, target: 100 }]),
    malrad(1, ['anna']),                       // oförändrad — ska INTE dyka upp två gånger i förloppet
    malrad(3, ['anna', 'bo', 'cecilia'], [{ progress: 30, target: 100 }, { progress: 0, target: 500 }]),
    gava('anna', 'Heart Me')
  ]));
  const k = r.heartMeKontroll;

  assert.equal(k.svar, 'TikTok sager 3 unika givare pa sitt mal');
  assert.deepEqual(k['contributorsLength, forlopp'], [1, 3],
    'förloppet ska visa förändringar, inte en rad per händelse');
  assert.equal(k['unika id i contributors[]'], 3);
  assert.deepEqual(k['delmal (progress/target)'], ['30/100', '0/500'], 'senaste delmålen ska redovisas');
  assert.equal(k['GOAL_UPDATE-rader'], 3);
});

test('kontrollen påstår ALDRIG att talen ska vara lika', () => {
  // Det viktigaste påståendet i hela filen. TikToks mål är det mål streamern satt upp i TikTok;
  // Heart Me Goal räknar VÅR gåva. Ett verktyg som jämför dem åt läsaren skulle förvandla en
  // förväntad skillnad till ett larm — och ett larm som ropar utan orsak slutar man lyssna på.
  const r = analysera(skrivInspelning([malrad(7, ['a', 'b']), gava('anna', 'Heart Me')]));
  const k = r.heartMeKontroll;

  assert.match(k.jamforelse, /inte nodvandigtvis samma mal/);
  assert.match(k.jamforelse, /MANNISKA/, 'jämförelsen ska uttryckligen lämnas till en människa');
  // Och den räknar inte ihop dem åt någon: båda talen står var för sig.
  assert.equal(k['unika id i contributors[]'], 2);
  assert.deepEqual(k['vart tal (unika avsandare per gava)'], [['Heart Me', 1]]);
});

test('en GOAL_UPDATE utan contributorsLength tigs inte ihjäl', () => {
  const r = analysera(skrivInspelning([{ typ: 'GOAL_UPDATE', vid: 'x', kalla: 'inspelad', nyttolast: { goal: {} } }]));
  assert.equal(r.heartMeKontroll.svar, 'GOAL_UPDATE finns men bar ingen contributorsLength');
});
