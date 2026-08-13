'use strict';
// Domänkartan måste stämma med verkligheten, annars är den värre än ingen karta alls.
//
// `.claude/domaner.json` säger vem som äger vad, och `.claude/agents/*.md` säger hur varje
// domän ska behandlas. Båda pekar på riktiga filer i repot. Det som gör en sådan karta
// värdelös är inte att den är fel från början — det är att någon flyttar en fil ett halvår
// senare och kartan tyst fortsätter beskriva ett läge som inte finns. Då skickas arbetet till
// fel agent, tester körs inte, och kartan blir något man slutar lita på.
//
// De fyra kraven här är precis de som går sönder av sig själva över tid:
//   1. Varje domän har en agentfil, och agentfilens `name` matchar `agent`-fältet.
//   2. Varje mönster i `filer` och `tester` träffar minst en spårad fil.
//   3. Varje fil i repotroten ägs av exakt en domän (eller står i `ovagda`).
//   4. Varje testväg som listas är ett riktigt testkommando som går att köra.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');

const ROT = path.resolve(__dirname, '..');
const KARTA = path.join(ROT, '.claude', 'domaner.json');
const AGENTKATALOG = path.join(ROT, '.claude', 'agents');

const karta = JSON.parse(fs.readFileSync(KARTA, 'utf8'));
const spårade = execFileSync('git', ['ls-files'], { cwd: ROT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\n').filter(Boolean);

// Samma mönsterregel som scripts/domaner.js: '*' inom ett segment, men 'katalog/*' rekursivt.
function tillRegex(mönster) {
  const rekursiv = mönster.endsWith('/*');
  const kropp = rekursiv ? mönster.slice(0, -2) : mönster;
  const escaped = kropp.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp(rekursiv ? `^${escaped}/` : `^${escaped}$`);
}

const träffar = (mönster) => spårade.filter((f) => tillRegex(mönster).test(f));

test('varje domän har unikt id och en agentfil som heter samma sak', () => {
  const sedda = new Set();
  for (const d of karta.domaner) {
    assert.ok(d.id && d.namn && d.agent && d.syfte, `Domänen ${d.id || '(utan id)'} saknar ett obligatoriskt fält`);
    assert.ok(!sedda.has(d.id), `Dubblerat domän-id: ${d.id}`);
    sedda.add(d.id);

    const fil = path.join(AGENTKATALOG, `${d.agent}.md`);
    assert.ok(fs.existsSync(fil), `Domänen ${d.id} pekar på agenten ${d.agent}, men .claude/agents/${d.agent}.md finns inte`);

    const innehåll = fs.readFileSync(fil, 'utf8');
    const namn = /^---\r?\n(?:.*\r?\n)*?name:\s*(\S+)/m.exec(innehåll);
    assert.ok(namn, `${d.agent}.md saknar ett name-fält i frontmatter`);
    assert.equal(namn[1], d.agent, `${d.agent}.md heter "${namn[1]}" i frontmatter men "${d.agent}" i domänkartan`);
    assert.match(innehåll, /^description:\s*\S/m, `${d.agent}.md saknar description — utan den vet ingen när agenten ska användas`);
  }
});

test('varje agentfil i katalogen ägs av en domän', () => {
  const agenter = fs.readdirSync(AGENTKATALOG).filter((f) => f.endsWith('.md') && f !== 'README.md');
  const kända = new Set(karta.domaner.map((d) => `${d.agent}.md`));
  for (const a of agenter) {
    assert.ok(kända.has(a), `.claude/agents/${a} hör inte till någon domän i domaner.json — lägg till domänen eller ta bort filen`);
  }
});

test('varje filmönster träffar minst en spårad fil', () => {
  for (const d of karta.domaner) {
    for (const mönster of d.filer) {
      assert.ok(träffar(mönster).length > 0, `Domänen ${d.id}: mönstret "${mönster}" träffar ingen fil i repot`);
    }
  }
});

test('varje testmönster träffar minst ett riktigt testfil', () => {
  for (const d of karta.domaner) {
    for (const mönster of d.tester || []) {
      const funna = träffar(mönster);
      assert.ok(funna.length > 0, `Domänen ${d.id}: testmönstret "${mönster}" träffar ingen fil`);
      for (const f of funna) {
        assert.match(f, /\.(test|browser\.test)\.js$/, `Domänen ${d.id}: "${f}" listas som test men ser inte ut som ett testfil`);
      }
    }
  }
});

// En Playwright-spec är inte en node:test-fil. Kör man den med `node --test` faller den inte —
// den hänger, tills något utifrån dödar den. Det kostade 900 s per domän första gången tavlan
// kördes, och ett hängande test är dyrare än ett rött: det ser ut som att sviten är långsam.
test('e2e-specar står i e2e-fältet och aldrig bland node:test-filerna', () => {
  for (const d of karta.domaner) {
    for (const mönster of d.tester || []) {
      assert.ok(!mönster.includes('/e2e/'), `Domänen ${d.id}: "${mönster}" är en Playwright-spec och hör hemma i "e2e", inte i "tester"`);
    }
    for (const mönster of d.e2e || []) {
      const funna = träffar(mönster);
      assert.ok(funna.length > 0, `Domänen ${d.id}: e2e-mönstret "${mönster}" träffar ingen fil`);
      for (const f of funna) {
        assert.match(f, /\.spec\.js$/, `Domänen ${d.id}: "${f}" står under e2e men är inte en .spec.js`);
      }
    }
  }
});

test('varje fil i repotroten ägs av exakt en domän', () => {
  const rotfiler = spårade.filter((f) => !f.includes('/'));
  const utan = [], dubbla = [];
  for (const f of rotfiler) {
    if ((karta.ovagda || []).some((m) => tillRegex(m).test(f))) continue;
    const ägare = karta.domaner.filter((d) => d.filer.some((m) => tillRegex(m).test(f))).map((d) => d.id);
    if (ägare.length === 0) utan.push(f);
    else if (ägare.length > 1) dubbla.push(`${f} -> ${ägare.join(', ')}`);
  }
  assert.deepEqual(utan, [], `Filer i roten utan ägare (lägg dem i .claude/domaner.json): ${utan.join(', ')}`);
  assert.deepEqual(dubbla, [], `Dubbelägda filer (skärp mönstren): ${dubbla.join(' | ')}`);
});

test('mätkommandon pekar på skript som finns', () => {
  for (const d of karta.domaner) {
    for (const m of d.matning || []) {
      assert.ok(m.namn && m.kommando, `Domänen ${d.id} har en mätning utan namn eller kommando`);
      // Plocka ut den första sökvägen i kommandot och kontrollera att filen finns.
      const väg = /(?:^|\s)((?:scripts|tests|server)\/[\w./-]+)/.exec(m.kommando);
      if (väg) {
        assert.ok(fs.existsSync(path.join(ROT, väg[1])), `Domänen ${d.id}: mätningen "${m.namn}" kör ${väg[1]} som inte finns`);
      }
    }
  }
});
