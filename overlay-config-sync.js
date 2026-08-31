'use strict';
// KONFIGURATION UTAN OMLADDNING — beslutslogiken, och ingenting annat.
//
// Problemet: en OBS-widget hamtar sin konfiguration EN gang vid start. Andrar agaren nagot i
// Studion star OBS kvar med den gamla bilden tills kallan laddas om for hand.
//
// Upplagget (beslutat med David 2026-08-22): servern publicerar bara ett TECKEN pa den strom
// widgeten redan lyssnar pa — `{overlayId, revision}`, inte konfigurationen. Klienten hamtar
// darefter om fran den enda kallan. Skickade vi konfigurationen over strommen skulle den ha tva
// kallor, och en gammal och en ny kopia kunde krocka i OBS.
//
// ALL TID AR INJICERAD. `nu`, `schemalagg` och `avbryt` kommer utifran, sa hela beteendet gar att
// prova utan att ett prov behover sova. Prov som sover blir langsamma prov, och langsamma prov
// kors inte fore push.
//
// FAIL-SAFE ar regeln genom hela filen: en trasig hamtning far ALDRIG slacka en overlay som redan
// fungerar. Den gamla bilden star kvar tills en ny faktiskt kommit hem.
(function (root) {
  // Hopslagningsfonstret. Studion sparar vid varje andring, sa ett drag i ett reglage ger tiotals
  // sparningar pa nagra sekunder. 400 ms ar valt for att vara KORTARE an vad ett oga uppfattar som
  // trog (~500 ms) men langre an en dragserie.
  //
  // Medvetet INTE 1800 ms: den siffran finns redan i det har repot pa ett annat stalle och gor att
  // gransnittet ser trasigt ut medan man vantar. Se [[vyra-obs-link-model]].
  const HOPSLAGNING_MS = 400;
  // Forsta omforsoket efter en misslyckad hamtning. Vaxer sedan, sa ett langre natavbrott inte
  // hamrar servern medan den redan har problem.
  const FORSTA_OMFORSOK_MS = 1000;
  const LANGSTA_OMFORSOK_MS = 30000;

  function skapaKonfigSync({ overlayId, hamta, applicera, logg, nu, schemalagg, avbryt }) {
    // Revisionen vi FAKTISKT visar. Uppdateras nar en hamtning gatt hela vagen, aldrig nar ett
    // meddelande kommer in — annars hade en misslyckad hamtning fatt oss att tro att vi visar
    // nagot vi inte visar, och nasta meddelande hade avfardats som "redan sett".
    let visad = -1;
    // Hogsta revision nagon sagt oss om. Kan ligga fore `visad` medan en hamtning pagar.
    let onskad = -1;
    let vantande = null;
    let hamtar = false;
    let omforsok = FORSTA_OMFORSOK_MS;
    // ATERANSLUTNINGENS EGEN FRAGA: "jag vet inte vilken revision som ar senast — ge mig den som
    // finns NU". Den avsikten gar INTE att uttrycka som ett revisionsnummer. Ett tal som ar hogt
    // nog att alltid sla igenom ar ocksa for hogt for att nagonsin uppnas av ett svar, och da tar
    // onskemalet aldrig slut.
    //
    // Sa var det: `ateranslot()` skrev sentinelvardet Number.MAX_SAFE_INTEGER i `onskad`. Nar
    // `visad` sedan blev serverns riktiga version (1, 2, 3 ...) stod villkoret `onskad > visad` i
    // finally-grenen kvar som sant FOR ALLTID, och varje avslutad hamtning planerade nasta.
    // UPPMATT 2026-08-26 i riktig Chrome genom hela kedjan, foto mot foto pa samma binar med bara
    // appfilerna utbytta: 78 bootstrap-hamtningar och 78 FULLSTANDIGA overlay-omritningar pa 32
    // sekunder — 2,4 Hz, resten av sandningen — mot 4 efter fixen. Utlosaren i drift ar
    // uppstartsluckan: det ar bootstrapsvarets `session`-falt som staller den forsta fragan, sa
    // varje OBS-kalla som oppnades under en pagaende sandning hamnade i slingan.
    //
    // TVA TAL I STALLET FOR ETT. `fragor` stegas nar nagon fragar; `besvarad` satts till den fraga
    // som var stalld nar hamtningen GICK IVAG. En fraga som kom medan ett svar redan var i luften
    // kan darmed inte bli besvarad av det svaret — det gick ju ivag innan den ens stalldes. Att
    // rakna dem sa ar ocksa hela skillnaden mot "sluta planera i finally", som hade dodat slingan
    // men lamnat en revision som kom in mitt under en hamtning oupphamtad till nasta sparning.
    let fragor = 0;
    let besvarad = 0;

    const planera = (ms) => {
      // En redan planerad hamtning ersatts — det ar sjalva hopslagningen. Tio sparningar i rad
      // skjuter fram samma enda hamtning i stallet for att ko upp tio.
      if (vantande) { try { avbryt(vantande) } catch (e) {} vantande = null }
      vantande = schemalagg(kor, ms);
    };

    async function kor() {
      vantande = null;
      if (hamtar) return;              // en pagaende hamtning fangar upp det som hunnit andras
      // Ingenting nytt att hamta: ingen obesvarad fraga OCH ingen revision vi inte redan visar.
      if (fragor <= besvarad && onskad <= visad) return;
      // Biljetten tas FORE forfragan, av samma skal som i live-session-client.js: den avgor sedan
      // vilken fraga svaret faktiskt besvarar.
      const biljett = fragor;
      hamtar = true;
      try {
        const konfig = await hamta();
        // Revisionen i SVARET ar sanningen, inte den i meddelandet: mellan meddelande och
        // hamtning kan agaren ha hunnit spara igen, och da har vi redan den nyare.
        const rev = Number(konfig && konfig.revision);
        const nyRev = Number.isFinite(rev) ? rev : onskad;
        if (nyRev < visad) {
          // Kan handa om tva hamtningar korsar varandra. Att applicera den aldre hade rullat
          // tillbaka designen till nagot agaren redan andrat bort.
          logg(`hoppar over revision ${nyRev}: visar redan ${visad}`);
          besvarad = biljett;          // ett svar kom hem, aven om det var for gammalt att anvanda
          return;
        }
        applicera(konfig);
        visad = nyRev;
        if (onskad < visad) onskad = visad;
        besvarad = biljett;
        omforsok = FORSTA_OMFORSOK_MS;
      } catch (err) {
        // DEN GAMLA DESIGNEN STAR KVAR. Ingenting slacks, ingenting toms.
        logg(`kunde inte hamta overlay-konfigurationen: ${(err && err.message) || err}`);
        planera(omforsok);
        omforsok = Math.min(omforsok * 2, LANGSTA_OMFORSOK_MS);
      } finally {
        hamtar = false;
        // Hann det komma en nyare revision — eller en ny fraga — medan vi hamtade? Ta den nu.
        // Bada leden MASTE kunna bli falska igen, annars ar det en slinga och inte en uppfoljning.
        if (!vantande && (fragor > besvarad || onskad > visad)) planera(HOPSLAGNING_MS);
      }
    }

    return {
      // Ett meddelande fran strommen.
      async taEmot(besked) {
        if (!besked || besked.overlayId !== overlayId) return;   // fel scen — ror den inte
        const rev = Number(besked.revision);
        if (!Number.isFinite(rev)) return;
        if (rev <= visad || rev <= onskad) return;               // gammalt eller redan pa vag
        onskad = rev;
        planera(HOPSLAGNING_MS);
      },
      // Efter ett avbrott: handelser som missades kommer aldrig igen som handelser, sa
      // ateranslutningen maste sjalv fraga efter det senaste.
      async ateranslot() {
        fragor += 1;
        planera(0);
      },
      // For prov och felsokning.
      lage: () => ({ visad, onskad, hamtar, obesvarade: fragor - besvarad }),
    };
  }

  if (typeof module === 'object' && module.exports) module.exports = { skapaKonfigSync };
  else root.VyraKonfigSync = { skapaKonfigSync };
})(typeof window !== 'undefined' ? window : globalThis);
