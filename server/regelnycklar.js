'use strict';
// REGELNYCKLAR — vilken "låda" en inlärd gåvoidentitet hamnar i.
//
// gift_rule_identity har PRIMARY KEY (workspace_id, rule_key). Nyckeln är den enda kopplingen
// mellan "det Studio lärde in" och "det en regel senare slår upp". Väljs den fritt av webbläsaren
// kan Studio lära in Heart Me under en nyckel medan Goal frågar efter en annan — och lärläget ser
// tomt ut trots att gåvan är inlärd. Ingen felkod, inget larm, bara en widget som står på noll.
//
// Därför: nycklarna har FASTA FORMER, de valideras här på servern, och rutten släpper aldrig
// igenom en sträng som inte matchar en känd form.
//
// Formerna:
//   heart_me                              — Heart Me Goal. En enda, global, oföränderlig.
//   gift_campaign:<widgetId>:<slot>       — en Gift Campaign-SLOT.
//
// Att kampanjnyckeln bär både widget och slot är inte överdrivet: en kampanjwidget har flera
// slots, och VARJE slot väljer sin egen gåva och har sin egen räknare
// (gift-event-images.js:238-252, widget['giftCurrent' + index]). En nyckel per widget hade tvingat
// alla slots att dela en gåva.

const HEART_ME = 'heart_me';

// Widget-id:n i huset ser ut som 'templateHeartGoal-mt971cfu-8492a349ed8e': bokstäver, siffror,
// bindestreck. Kolon är uteslutet med flit — det är nyckelns egen separator.
const WIDGET_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,119}$/;
const MAX_SLOT = 999;

function arHeltal(v) {
  return Number.isInteger(v) || (typeof v === 'string' && /^\d{1,3}$/.test(v));
}

// Bygger en kampanjnyckel. Kastar hellre än att returnera något halvgiltigt — en nyckel som
// byggts fel ska upptäckas på anropsplatsen, inte tyst bli en tom låda.
function giftCampaign(widgetId, slot) {
  const w = String(widgetId || '');
  if (!WIDGET_ID.test(w)) throw new Error('Ogiltigt widget-id för kampanjnyckel');
  if (!arHeltal(slot)) throw new Error('Ogiltig slot för kampanjnyckel');
  const s = Number(slot);
  if (s < 0 || s > MAX_SLOT) throw new Error('Slot utanför intervallet');
  return `gift_campaign:${w}:${s}`;
}

// Enda porten in. Returnerar den KANONISKA nyckeln, eller null om formen är okänd.
//
// Kanonisering betyder här att '007' och '7' blir samma slot: annars vore de två lådor för samma
// kampanjplats, och en av dem alltid tom.
function validera(rule_key) {
  if (typeof rule_key !== 'string') return null;
  const k = rule_key.trim();
  if (!k || k.length > 160) return null;

  if (k === HEART_ME) return HEART_ME;

  const m = k.match(/^gift_campaign:([A-Za-z0-9][A-Za-z0-9-]{0,119}):(\d{1,3})$/);
  if (m) {
    const slot = Number(m[2]);
    if (slot < 0 || slot > MAX_SLOT) return null;
    return `gift_campaign:${m[1]}:${slot}`;      // kanoniserad slot, utan inledande nollor
  }

  return null;                                    // okänd form = ingen låda
}

// Alla former som finns, för dokumentation och för prov som ska falla när en ny form läggs till
// utan att bli validerad.
const FORMER = ['heart_me', 'gift_campaign:<widgetId>:<slot>'];

module.exports = { HEART_ME, giftCampaign, validera, FORMER, MAX_SLOT };
