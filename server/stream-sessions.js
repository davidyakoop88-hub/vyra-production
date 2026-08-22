'use strict';
// SÄNDNINGSIDENTITET — modulstomme.
//
// Ingen funktion är implementerad än. Stommen finns för ETT syfte: flytta de 39 provens fel från
// en enda gemensam existenskontroll ("modulen finns inte") till var sitt eget beteendefel, så att
// fördelningen går att läsa innan funktionerna byggs.
//
// Varje metod returnerar det MINST hjälpsamma korrekta värdet — tomma listor, false — aldrig ett
// gissat resultat. En stomme som råkar få ett prov grönt är värre än ingen stomme: den döljer
// exakt det provet var byggt för att fånga.
//
// AKTIVERINGSFLAGGA (fail-closed): skrivvägen är avstängd om inte VYRA_SANDNINGSIDENTITET är
// exakt strängen '1'. Allt annat — 'true', 'ja', 'on', tomt, osatt — är AV. Rutterna svarar 503
// utan att röra databasen. Flaggan gäller HTTP-vägen; proven anropar modulen direkt.
const AKTIVERAD = () => process.env.VYRA_SANDNINGSIDENTITET === '1';

// Husregeln finns redan i capacity-gate.js:24 och återanvänds ordagrant. En andra
// normaliseringsregel hade delat kontot i två och halverat fan-outen.
function kontonyckel(namn) {
  return String(namn == null ? '' : namn).trim().toLowerCase().replace(/^@+/, '');
}

function fel(status, meddelande) {
  // Meddelandet går till klienten OCH loggen. Ingen token, ingen header, ingen hemlighet får
  // någonsin hamna här — inte heller dess längd, som är en ledtråd i sig.
  return Object.assign(new Error(meddelande), { status });
}

function skapaStreamSessions({ pool }) {
  if (!pool) throw new Error('stream-sessions kräver en pool');

  const inteAn = namn => { throw fel(501, namn + ' är inte implementerad än'); };

  return {
    kontonyckel,
    aktiverad: AKTIVERAD,

    // ---- bryggkörningar (fas 3) ----------------------------------------------------------------
    async registreraKorning() { return inteAn('registreraKorning'); },

    // ---- sessionsbeslut (fas 4) ----------------------------------------------------------------
    async startaLive() { return { stale: false, workspaces: [] }; },
    async avslutaLive() { return { ended: false }; },

    // Maskinvägen. Fail-closed två gånger om: först flaggan, sedan token.
    async startaLiveViaHttp() { return inteAn('startaLiveViaHttp'); },

    // ---- administrativ återöppning (fas 4) -----------------------------------------------------
    async tillatRumIgen() { return inteAn('tillatRumIgen'); },

    // ---- nollställning (fas 6) -----------------------------------------------------------------
    async nollstall() { return false; },
    async nollstallMal() { return inteAn('nollstallMal'); },
    async nollstallKampanjer() { return inteAn('nollstallKampanjer'); },

    // ---- utkorg (fas 7) ------------------------------------------------------------------------
    async publiceraUtkorg() { return 0; },
    async tillampaEnGang() { return false; },
    async giftigaHandelser() { return []; },
  };
}

module.exports = { skapaStreamSessions, kontonyckel };
