'use strict';
// Proveniensen i sanningens karta — kolumnerna "Senast andrad" och "PR".
//
// Kartan lases som facit. Nar de kolumnerna ar fel ar de fel PA ETT SATT SOM SER RATT UT: varje
// rad har ett datum och ett PR-nummer, allt ar ifyllt, ingenting flaggas. Uppmatt pa main
// 2026-08-25 pekade 293 av 293 PR-hanvisningar pa #270 — den senaste PR:en — och ingen kolumn
// sa ifran. Provet nedan bevakar de tre orsakerna var for sig.
const { describe, it } = require('node:test'), assert = require('node:assert/strict');
const { familj, prefixkandidater, prUrAmne, HISTORIK_OMRADE } = require('../scripts/generate-catalog-map.js');

describe('katalogkarta · proveniens', () => {
  // Att bara krava require() ar inte trivialt: generatorn startade forr en webblasare direkt vid
  // inladdning, sa harledningen gick inte att prova utan Chromium.
  it('gar att ladda utan att starta en webblasare', () => {
    assert.strictEqual(typeof familj, 'function');
    assert.strictEqual(typeof prefixkandidater, 'function');
  });

  describe('sokomradet utesluter prosa', () => {
    // ORSAK 2. `-S catalog:giftjar -- .` sokte hela repot. Nyckeln namns i DAVID.md, i
    // docs/tech-debt.md och i kartan sjalv, sa den nyaste dokumentationscommiten vann over koden
    // som definierar nyckeln. Att kartan namner sina egna nycklar gjorde det sjalvrefererande.
    it('utesluter docs, tests och all markdown', () => {
      assert.deepStrictEqual(HISTORIK_OMRADE, [':(exclude)docs', ':(exclude)tests', ':(exclude)*.md']);
    });

    it('utesluter kartan sjalv, annars blir varje karta-commit nasta kartas svar', () => {
      assert.ok(HISTORIK_OMRADE.includes(':(exclude)docs'),
        'docs/katalogkarta.md maste ligga utanfor sokomradet');
    });
  });

  describe('prefixkandidater', () => {
    // ORSAK 3. Gift Campaign bygger sin nyckel av delar i media.js:
    // `'catalog:giftcampaign:' + tema + ':' + orientering`. Den fulla nyckeln finns aldrig som en
    // literal, sa `-S` traffade ingenting och bade datum och PR blev tomma.
    it('kortar av ett led i taget nar hela prefixet inte finns som literal', () => {
      assert.deepStrictEqual(prefixkandidater('catalog:giftcampaign:neon'),
        ['catalog:giftcampaign:neon', 'catalog:giftcampaign:']);
    });

    it('behaller kolonet, sa en avkortning inte kan trilla over till en grannyckel', () => {
      // Utan slutkolon hade 'catalog:top' traffat bade catalog:topgifter och catalog:topstreak.
      for (const k of prefixkandidater('catalog:a:b:c').slice(1)) {
        assert.ok(k.endsWith(':'), `avkortningen ${k} saknar slutkolon`);
      }
    });

    it('provar alltid det fulla prefixet forst', () => {
      assert.strictEqual(prefixkandidater('catalog:giftcampaign:neon')[0], 'catalog:giftcampaign:neon');
    });

    it('kortar inte ner till bara catalog:, som hade traffat vad som helst', () => {
      assert.ok(!prefixkandidater('catalog:a:b:c').includes('catalog:'));
    });

    it('lamnar en tvaledad nyckel orord', () => {
      assert.deepStrictEqual(prefixkandidater('catalog:lastx'), ['catalog:lastx']);
    });
  });

  describe('prUrAmne', () => {
    it('plockar numret ur en squash-merge', () => {
      assert.strictEqual(prUrAmne('De sista elva nycklarna (#83)'), '83');
    });

    // En direktpush till main HAR ingen PR. Kolumnen ska sta tom hellre an gissa — det var just
    // gissandet som gjorde att allt pekade pa den senaste PR:en.
    it('ger null for en direktpush utan PR-nummer', () => {
      assert.strictEqual(prUrAmne('Guardian Emblem byggd — 56 prov grona'), null);
    });

    it('tar bara numret pa slutet, inte ett (#12) mitt i amnet', () => {
      assert.strictEqual(prUrAmne('Foljer upp (#12) i texten'), null);
    });

    it('tal skrap i stallet for ett amne', () => {
      assert.strictEqual(prUrAmne(null), null);
      assert.strictEqual(prUrAmne(''), null);
    });
  });

  describe('familj', () => {
    it('tar bort sista ledet', () => {
      assert.strictEqual(familj('catalog:topstreak:frame:rose-heart'), 'catalog:topstreak:frame');
    });

    it('lamnar en tvaledad nyckel orord', () => {
      assert.strictEqual(familj('catalog:lastx'), 'catalog:lastx');
    });
  });
});
