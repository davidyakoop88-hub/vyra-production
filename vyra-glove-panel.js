(function () {
  'use strict';
  // GLOVE SNIPE I PANELRAMEN — PR 15 i panelspecifikationen (avsnitt 5.19, 2.4 `glove`, 4.2), gjord i samma gren
  // som Fan Level 50 (vyra-fl50-panel.js).
  //
  // De fem modellerna är Video FX-paketen, "hela paketet" (templateGloveSnipe med battleEventKind 'pack'): ett
  // paket = en widget som spelar paketets klipp när battlen säger till — Tap Tap när matchen börjar, X2/X3 när en
  // boost startar, Glove när 30 s återstår av boosten och Snipe när 30 s återstår av matchen. Två poster:
  //   * WebM med Snipe (Pink Princess, Royal Ruby, Cloud Fox), adaptern 'glove', fem klipp,
  //   * MP4 utan Snipe (Koi Pearl Lagoon, Masquerade Ball), adaptern 'glove-mp4', fyra klipp.
  // En klassisk Glove Snipe (en widget per klipp, inte i katalogen längre) har ingen post och får dagens panel.
  //
  // MÄTT INNAN REGISTRET SKREVS (spec 5.19; panel-krav-metoden: varje fält ändrat för sig, widgetens DOM, beräknade
  // stil och skärmbild jämförda före och efter, i vila med widgeten vald — då visas affischen; skript och utfall i
  // PR-texten). Koi Pearl (MP4) och Pink Princess (WebM):
  //   * verkar: X, Y, Bredd, Storlek och Rotation,
  //   * ingen verkan, 0 px: hela TEXT (widgeten har inget textblad — bara klippet och affischen), Lager (paketets
  //     renderare skriver inget z-index — PR 16), Glöd/Handskens färg (--glove/--glove2 läses inte av paketets CSS),
  //     och ett påtvingat färgschema (inheritBrandKit med testschemat): 0 px. Färgarv erbjuds därför inte,
  //   * BAKGRUND: Färg, Styrka och Innerkant ritar en ruta bakom affischen i editorn, men klippet är en effekt
  //     ovanpå sändningen (WebM med alfa, MP4 täcker rutan) och spec 1.5 tar inte med bakgrunden för effekter och
  //     fasta bildmotiv. Hörn och Ta bort bakgrund: 0 px. Gruppen visas inte,
  //   * Höjd är låst till 16:9 (inaktiverad i dag) och visas inte; ingen Återställ utseende, för paketet har inga
  //     utseendefält (färgerna verkar inte). Mallarna (Spara/Ladda) står kvar i sektion 7.
  //
  // TESTKNAPPARNA ÄR BORTA (spec 2.5): ▶ X2/X3/Tap Tap/Glove/Snipe i gruppen TESTA I LAYOUTEN. De spelade på den
  // riktiga widgeten och hade ingen stoppknapp. ▶ Testa widget spelar i stället valt klipp på KLONEN genom
  // VyraBattlePaket.spelaPa (media.js gloveSpelaPa — samma uppspelning som triggern, utan filter, utan att skriva
  // på widgeten och utan save). Klippen är 10 s (WebM) och 7 s (MP4).
  //
  // HEADLESS-CHROMIUM kan inte avkoda H.264, så MP4-paketens klipp går inte att se i proven: de mäter DOM och
  // konfiguration (klippets källa, klasserna, autoplay), inte bildrutor.

  const R = window.VyraPanelregister;
  if (!R || typeof R.definiera !== 'function') return;

  const DETALJ = { koiPearl: 'Koi Pearl Lagoon', masquerade: 'Masquerade Ball', pinkPrincess: 'Pink Princess', royalRuby: 'Royal Ruby', cloudFox: 'Cloud Fox' };
  const modell = w => (w && w.battleEventKind === 'pack' ? String(w.boostPack || '') : 'klassisk');
  const LIVE_WEBM = 'Klippet väljs av battlen: Tap Tap när matchen börjar, X2 eller X3 när en boost startar, Glove när 30 s återstår av boosten och Snipe när 30 s återstår av matchen.';
  const LIVE_MP4 = 'Klippet väljs av battlen: Tap Tap när matchen börjar, X2 eller X3 när en boost startar och Glove när 30 s återstår av boosten. Paketet har inget Snipe-klipp.';

  const post = (galler, test, live) => R.definiera({
    typ: 'templateGloveSnipe',
    modell,
    galler,
    rubrik: w => DETALJ[w.boostPack] || 'Video FX',
    marke: w => 'Video FX · ' + (DETALJ[w.boostPack] || 'hela paketet'),
    katalognyckel: w => 'catalog:glovesnipe:' + w.boostPack + ':pack:2',
    test,
    ersatter: ['[data-paket-test]', '.paket-testknappar'],
    utanText: true,
    kontroller: [
      { sektion: 2, kalla: 'live', typ: 'text', etikett: live },
      { sektion: 3, typ: 'std-position', utan: ['hojd', 'las', 'lager'] },
      { sektion: 7, typ: 'std-aterstall' },
    ],
  });
  post(['pinkPrincess', 'royalRuby', 'cloudFox'], 'glove', LIVE_WEBM);
  post(['koiPearl', 'masquerade'], 'glove-mp4', LIVE_MP4);

  // ---- Testadaptrarna ---------------------------------------------------------------------------------
  //
  // Typväljaren i sektion 1 väljer klippet. Klonen är osynlig i vila (battle-pack-images.css: synlig bara vald eller
  // .pack-active), och spelaPa tänder den med klippet — samma väg som en riktig händelse. Visningen är klippets längd,
  // eller widgetens tak (gloveDuration, 4–30 s) om det är kortare. stoppa() stänger klippet (timern i media.js och
  // videon) innan motorn tar bort klonen.
  const T = window.VyraTestspel;
  if (!T || typeof T.registrera !== 'function') return;
  const KLIPP_MS = { webm: 10000, mp4: 7042 };
  const KLIPP = [['boost-x2', 'X2'], ['boost-x3', 'X3'], ['tap', 'Tap Tap'], ['glove', 'Glove']];
  const ENTRE = 200, UTGANG = 500;
  const adapter = typer => ({
    typer,
    typEtikett: 'Klipp',
    spela(nod, k, ex, ctl) {
      const B = window.VyraBattlePaket;
      if (!B || typeof B.spelaPa !== 'function') throw new Error('media.js saknar VyraBattlePaket.spelaPa');
      const klipp = ctl.typ || typer[0][0];
      const fil = B.fil(k, klipp);
      if (!fil) throw new Error('paketet har inget klipp ' + klipp);
      if (!B.spelaPa(nod, k, { klipp })) throw new Error('klonen saknar paketets video');
      const tak = Math.max(4, Math.min(30, Number(k.gloveDuration) || 20)) * 1000;
      const total = Math.min(/\.webm$/i.test(fil) ? KLIPP_MS.webm : KLIPP_MS.mp4, tak);
      return { entre: ENTRE, visning: total - ENTRE - UTGANG, utgang: UTGANG };
    },
    stoppa(nod, k) {
      if (window.VyraBattlePaket && typeof window.VyraBattlePaket.stang === 'function') window.VyraBattlePaket.stang(k.id);
      const v = nod.querySelector('video');
      if (v) { try { v.pause(); } catch (_) {} v.removeAttribute('src'); try { v.load(); } catch (_) {} }
    },
  });
  if (!(T.harAdapter && T.harAdapter('glove'))) T.registrera('glove', adapter([...KLIPP, ['snipe', 'Snipe']]));
  if (!(T.harAdapter && T.harAdapter('glove-mp4'))) T.registrera('glove-mp4', adapter(KLIPP));
})();
