'use strict';
// EN SEEDNING SOM ÖVERLEVER EN PROJEKTION.
//
// `state` i studio.js är en PERMANENT referens som töms och fylls på vid varje projektion:
//
//   Object.keys(activeStateObject).forEach(k => { delete activeStateObject[k] });
//   Object.assign(activeStateObject, clone(next));
//
// Cloud-syncs tickare sparar VARJE SEKUND, så fönstret är alltid öppet — det står i studio.js:30,
// och `liveWidget()`-proxyn därunder finns just för att appkoden ska slippa fällan. Proven hade
// inget motsvarande skydd: en seedning som bara muterar `state` kan få det FÖRRA sparade läget
// tillbakaskrivet över sig, och då pekar `state` på den gamla widgeten medan duken visar den nya.
//
// UPPMÄTT 2026-09-10: provet `dra-textdelar` föll så två körningar i rad på main, med olika
// katalognycklar, medan samma commit var grön i sin egen PR — på en snabb maskin landar
// projektionen utanför fönstret. Se docs/tech-debt.md §16.
//
// DEN VIKTIGA DETALJEN: en sparning i ett prov som inte först kallat
// `window.VyraSessionState.projectLocalSession()` returnerar `{ok:false, reason:'not-writable'}`
// och gör INGENTING. `save()` är `settled()` och kastar aldrig. Därför kastar den här hjälparen i
// stället — en tyst misslyckad seedning är exakt den fälla §16 beskriver, och den ska höras.
//
// NÄR DU INTE BEHÖVER DEN: seedar provet och läser av i SAMMA synkrona `page.evaluate`, utan något
// `await` emellan, finns inget fönster alls. Då är en fast seedning både korrekt och billigare.

const STANDARD_VANTAN = 30000;

/**
 * Seedar studions layout och väntar tills den syns både i `state` och i duken.
 *
 * @param {import('playwright-core').Page} page
 * @param {string|string[]} nycklar  katalognyckel/-nycklar, i den ordning de ska ligga
 * @param {object} [opts]
 * @param {{x:number,y:number}|Array} [opts.placering]  placering för alla, eller en per widget
 * @param {number|null} [opts.valj=0]  index som blir `selected`; null lämnar inget valt
 * @param {boolean} [opts.spara=true]  false bara när sessionen medvetet inte är skrivbar
 * @param {boolean} [opts.vantaPaDuken=true]  false när widgeten med flit inte ska renderas
 * @param {string} [opts.vantaPa]  extra selektor INNE i widgeten som måste finnas
 * @param {object} [opts.falt]  fält att sätta på varje widget (t.ex. livedata)
 * @param {string[]} [opts.tabort]  fält att ta bort från varje widget
 * @returns {Promise<string[]>} widgetarnas id, i ordning
 */
async function seedaStudioState(page, nycklar, opts = {}) {
  const lista = Array.isArray(nycklar) ? nycklar : [nycklar];
  const {
    placering = null, valj = 0, spara = true, vantaPaDuken = true,
    vantaPa = null, falt = null, tabort = null, timeout = STANDARD_VANTAN,
  } = opts;

  const idn = await page.evaluate(async ([keys, plac, val, skaSpara, satt, ta]) => {
    if (typeof state === 'undefined' || !window.VyraWidgets)
      throw new Error('seedaStudioState: studion är inte laddad — vänta in .editor-shell/#view först');
    state.widgets.length = 0;
    const skapade = keys.map((nyckel, i) => {
      // create() kastar på en okänd nyckel, och det ska den få göra: ett tyst sväljt kast
      // gav en gång ett prov som mätte nästan ingenting.
      const w = window.VyraWidgets.create(nyckel);
      const p = Array.isArray(plac) ? plac[i] : plac;
      if (p) { w.x = p.x; w.y = p.y; }
      if (satt) Object.assign(w, satt);
      if (ta) for (const k of ta) delete w[k];
      state.widgets.push(w);
      return w;
    });
    selected = val === null ? null : (skapade[val] || skapade[0]).id;
    render();
    if (skaSpara) {
      const ut = await save();
      if (!ut || !ut.ok) {
        throw new Error(`seedaStudioState: save() nekades (${(ut && ut.reason) || 'okänt'}). `
          + 'Kallade provet window.VyraSessionState.projectLocalSession() innan seedningen? '
          + 'Utan skrivbar session sparas ingenting, och nästa projektion skriver tillbaka '
          + 'det gamla läget (docs/tech-debt.md §16).');
      }
    }
    return skapade.map(w => w.id);
  }, [lista, placering, valj, spara, falt, tabort]);

  await page.waitForFunction(([ids, kravDuk, inreSelektor]) => {
    const iState = state.widgets.length === ids.length
      && ids.every((id, i) => state.widgets[i] && state.widgets[i].id === id);
    if (!iState || !kravDuk) return iState;
    return ids.every(id => {
      const rot = document.querySelector(`[data-id="${id}"]`);
      return !!rot && (!inreSelektor || !!rot.querySelector(inreSelektor));
    });
  }, [idn, vantaPaDuken, vantaPa], { timeout, polling: 100 });

  return idn;
}

/**
 * Widgeten som ligger i layouten JUST NU, uppslagen på id.
 *
 * Håll aldrig en fångad widgetreferens över ett `await`: projektionen byter ut varje widgetobjekt
 * mot en klon, och en fångad referens pekar sedan på något som inte längre ligger i layouten —
 * skrivningen ser ut att lyckas och är borta utan felmeddelande. Samma regel som `liveWidget()`
 * i studio.js följer.
 */
const widgetPaId = (page, id, falt) => page.evaluate(([wid, f]) => {
  const w = state.widgets.find(x => x && x.id === wid);
  if (!w) return null;
  if (!f) return { ...w };
  const ut = {};
  for (const k of f) ut[k] = w[k] === undefined ? null : w[k];
  return ut;
}, [id, falt || null]);

module.exports = { seedaStudioState, widgetPaId };
