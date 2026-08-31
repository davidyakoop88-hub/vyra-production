'use strict';
// LIVE Control Center: filen fanns, men ingen laddade den — och ingen kunde oppna den.
//
// live-control.js (12,7 KB) och live-control.css har legat i repot sedan `8bb0cdf` och serverats i
// produktion med 200. Anda definierades `window.VyraLiveControl` ALDRIG, for varken studio.html
// eller media.js namnde filen. Det ar samma tysta mekanism som en gang dolde supportsystemet.
//
// Det kostade redan en gang: Command Centers LIVE PULSE tvingades halla en EGEN handelsebuffert
// (overview-premium.js) eftersom getSnapshot() inte fanns att fraga i korningen.
//
// TVA VILLKOR, INTE ETT. Proven nedan ar medvetet uppdelade, for de kan falla var for sig:
//   1. skriptet laddas          -> annars finns objektet inte
//   2. knappen finns i menyn    -> annars finns ingen ingang; vyn ritas av en klicklyssnare pa
//                                  [data-extra="liveControl"], och den knappen fanns inte.
// En laddad fil utan ingang ar lika onabar som en oladdad fil. Att bara vakta det ena hade latit
// den andra halvan tyst falla bort igen.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('live-control: filerna finns kvar dar laddaren pekar', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'live-control.js')), 'live-control.js saknas');
  assert.ok(fs.existsSync(path.join(ROOT, 'live-control.css')), 'live-control.css saknas');
});

test('live-control: media.js laddar bade skriptet och dess CSS', () => {
  const media = las('media.js');
  assert.match(media, /live-control\.js\?v=/, 'ingenting laddar live-control.js — buggen ar tillbaka');
  assert.match(media, /live-control\.css\?v=/, 'CSS:en laddas inte; vyn ritas oformaterad');
});

test('live-control: bada filerna cachebustas', () => {
  // Utan cachebust far den som redan besokt Studion en gammal fil ur webblasarcachen, och
  // "det funkar inte hos mig" blir omojligt att skilja fran en riktig bugg.
  for (const fil of ['live-control.js', 'live-control.css']) {
    // Utan regex med flykttecken: hitta strangen, las fram till narmaste citattecken.
    const media = las('media.js'), start = media.indexOf(fil + '?v=');
    assert.ok(start > -1, fil + ' laddas utan ?v=');
    const efter = media.slice(start + fil.length + 3);
    const stopp = Math.min(...[String.fromCharCode(39), String.fromCharCode(34)]
      .map(c => efter.indexOf(c)).filter(k => k > -1));
    const bust = efter.slice(0, stopp);
    assert.ok(bust.length > 3, fil + ' har en tom eller meningslos cachebust: ' + bust);
  }
});

test('live-control: sidomenyn har en ingang till vyn', () => {
  // Vyns enda ingang. live-control.js:51 lyssnar pa klick mot precis den har valjaren.
  assert.match(las('studio.html'), /data-extra="liveControl"/,
    'skriptet laddas men ingen knapp oppnar vyn — den ar fortfarande onabar');
});

test('live-control: knappens valjare stammer med lyssnarens', () => {
  // Mutationsvakt: byter nagon namn pa den ena men inte den andra faller det har provet i
  // stallet for att vyn tyst slutar oppna sig.
  const nyckel = las('live-control.js').match(/\[data-extra="([^"]+)"\]/);
  assert.ok(nyckel, 'live-control.js lyssnar inte langre pa nagon [data-extra]-valjare');
  assert.match(las('studio.html'), new RegExp('data-extra="' + nyckel[1] + '"'),
    'lyssnaren vantar pa [data-extra="' + nyckel[1] + '"] men menyn har ingen sadan knapp');
});

test('extras.js skriver inte "undefined" i rubriken for en extra som ritar sig sjalv', () => {
  // showExtra() slog upp rubriken i en tabell med tre poster och skrev resultatet rakt in i
  // #title. For liveControl — och for guide, soundAlerts, support — blev det strangen
  // "undefined", synlig tills agarfilens egen render hann ikapp via setTimeout.
  const extras = las('extras.js');
  assert.match(extras, /if\(!rubrik\)return;/,
    'grinden mot okand extratyp ar borta — rubriken kan bli "undefined" igen');
  const i = extras.indexOf('if(!rubrik)return;');
  const j = extras.indexOf("querySelector('#title').textContent=rubrik");
  assert.ok(i > -1 && j > i, 'grinden maste ligga FORE skrivningen till #title');
});
