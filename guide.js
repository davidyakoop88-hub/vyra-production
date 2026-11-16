// Guide — en samlad, tydlig förklaring av hela VYRA för användaren. Egen dedikerad sida (som
// TTS Chat/Sound Alerts), inte en modal eller tooltip, eftersom detta är tänkt att vara den
// naturliga första platsen en ny användare landar på för att förstå vad varje del av appen gör
// och var den hittas — inte bara en snabb definition i förbifarten.
(() => {
  const STEPS = [
    { n: 1, title: 'Anslut TikTok LIVE', body: 'Verifiera först din e-post: öppna länken i mejlet vi skickade när du skapade kontot, annars går TikTok inte att ansluta. Klicka sedan på "Anslut TikTok" uppe till höger och skriv in ditt användarnamn. Anslutningen är riktig och kopplar direkt till din pågående livesändning — du måste vara live på TikTok för att den ska lyckas.' },
    { n: 2, title: 'Bygg din overlay', body: 'Gå till <b>Overlay</b> i menyn. Dra in widgets (mål, alerts, topplistor, TTS-text m.m.) från katalogen, placera dem som du vill och spara. Under <b>Layout</b> finjusterar du placeringen i ett eget redigeringsfönster, i mobil- eller datorformat.' },
    { n: 3, title: 'Lägg overlayen i OBS', body: 'Kopiera overlay-länken från Overlay-sidan och lägg den som en <b>Browser Source</b> i OBS, Streamlabs eller liknande program. Allt du bygger och ändrar i VYRA uppdateras live i OBS automatiskt — du behöver aldrig ladda om källan.' }
  ];

  const FEATURES = [
    { icon: '🖥️', title: 'Overlay & Layout', where: 'Overlay / Layout', nav: 'overlay', body: 'Din skärmyta för streamen. Dra-och-släpp widgets (mål, alerts, topplistor, klockor m.m.), placera och storleksändra fritt. Layout-sidan öppnar samma widgets i ett eget redigeringsfönster där du finjusterar placeringen i mobil- eller datorformat.' },
    { icon: '⚡', title: 'Action & Event', where: 'Action & Event', nav: 'actions', badge: 'LIVE', body: 'Hjärtat i automationen. Skapa <b>Events</b> (t.ex. "gåva mottagen", "chattkommando !hype", "ny följare") och koppla dem till <b>Actions</b> (visa overlay, spela ljud/video, läs upp text, byt OBS-scen, lägg till poäng m.m.). Kan gatas på publik (följare/prenumeranter/moderatorer/specifik användare) och kosta poäng.' },
    { icon: '🚀', title: 'Startpaket', where: 'Action & Event → Startpaket', nav: 'actions', body: 'Färdiga Actions och Events med ett klick: tacka för gåvor, välkomna nya tittare, chattkommandon och Battle. Allt hamnar på Scen 1 och går att ändra efteråt — ett bra första steg när listorna är tomma.' },
    { icon: '📋', title: 'Körlogg', where: 'Action & Event → 03 Körlogg', nav: 'actions', body: 'Visar varje händelse som ett event lyssnar på och vad som hände: vilken Action som kördes, eller varför ingenting hände (väntetid, scenen offline, kön full, fel gåva, för lite poäng). Med "Spela igen" kör du samma Actions en gång till utan att poäng dras.' },
    { icon: '⚔️', title: 'Battle-triggers', where: 'Action & Event → Koppla Event → Händelse i en battle', nav: 'actions', body: 'Låt en Action starta när något händer i en TikTok-battle: matchen börjar, ett boost-fönster öppnar, ni tar ledningen, motståndaren tar ledningen, matchen slutar, ni vinner, förlorar eller det blir oavgjort. Ledningen räknas först när den hållit i 3 sekunder och fyrar högst var 15:e sekund. Ledning och resultat kräver att din battle-widget visar riktiga poäng, inte 0–0.' },
    { icon: '⏫', title: 'Prioritet och slump', where: 'Action & Event → Skapa Action → Avancerade val', nav: 'actions', body: 'Kryssa i "Hög prioritet" så spelas actionen före vanliga actions i kön — bra för stora gåvor. Är kön full knuffas den senast köade vanliga ut, och tittaren får tillbaka sina poäng. "Kör en av dessa slumpmässigt" i ett Event spelar alla valda Actions innan någon upprepas.' },
    { icon: '💾', title: 'Backup av automatiken', where: 'Action & Event → Avancerat → Backup', nav: 'actions', body: 'Exportera sparar alla Actions, Events och timers — med dina egna ljud, bilder och videor — i en fil. Importera läser in den igen: Lägg till behåller det du har, Ersätt allt byter ut allt och går att ångra tills du laddar om sidan.' },
    { icon: '🔊', title: 'Sound Alerts', where: 'Sound Alerts', nav: 'soundAlerts', body: 'Ett bibliotek med färdiga ljudklipp du snabbt kan koppla till gåvor och händelser, utan att gå via hela Action & Event-flödet. Klicka ▶ för att förhandslyssna, och <b>＋ Ny sound alert</b> för att välja vad som ska spela ljudet.' },
    { icon: '🗣️', title: 'TTS Chat', where: 'TTS Chat', nav: 'ttsChat', body: 'Läser upp tittarnas chattkommentarer automatiskt med en riktig röst — molnröster ingår i Premium utan extra kostnad (kvinnlig och manlig svensk röst, ingen installation krävs). Du styr vem som får använda det, vilka kommentarer som läses (alla, eller bara de som börjar med t.ex. "!tts"), spamskydd och om det ska kosta poäng.' },
    { icon: '🤖', title: 'Chatbot', where: 'Chatbot', nav: 'chatbot', badge: 'AI', body: 'Skapa egna chattkommandon (t.ex. "!discord" → svarar med din Discord-länk) och automatiska modereringsregler.' },
    { icon: '⭐', title: 'Poängsystem', where: 'Action & Event → Avancerat → Poängsystem', nav: 'actions', body: 'Tittare tjänar poäng automatiskt bara genom att vara aktiva (gåvor, delningar, likes, tid i chatten). Poängen kan spenderas på events du skapar (t.ex. TTS eller en overlay-effekt) och ger tittarna nivåer ju mer de tjänat totalt.' },
    { icon: '🎵', title: 'Spotify', where: 'Spotify', nav: 'spotify', body: 'Koppla ditt Spotify-konto oberoende av TikTok LIVE. Visa vilken låt som spelas i chatten med "!song", låt moderatorer byta låt med "!skip", eller koppla en gåva till att spela en specifik låt.' },
    { icon: '🎬', title: 'Vip-paket', where: 'Vip-widget', nav: 'packages', badge: 'PRO', body: 'Färdiga, tema-paketerade video-effekter (t.ex. Pink Princess, Royal Ruby) du kan lägga direkt på din overlay-canvas — praktiskt för battle-boosts och liknande visuella effekter.' },
    { icon: '🎨', title: 'Färgschema', where: 'Knappen "🎨 Färgschema" högst upp', body: 'Sätt bakgrund, highlight, text, sekundär text och typsnitt EN gång. Alla widgets som har "Ärv färgschema" ikryssat använder automatiskt dessa värden istället för sina egna — praktiskt för att hålla hela overlayen visuellt enhetlig.' },
    { icon: '🎥', title: 'OBS-koppling', where: 'Action & Event → Avancerat → OBS-anslutning', nav: 'actions', body: 'Låt Actions byta OBS-scen eller aktivera/inaktivera en OBS-källa automatiskt, t.ex. vid en stor gåva. Kräver VYRA Desktop (skrivbordsappen) och att OBS WebSocket Server är påslaget i OBS.', handling: { text: 'Ladda ner VYRA Desktop', attribut: 'data-ladda-desktop href="/api/downloads/windows"' } },
    { icon: '📊', title: 'Statistik', where: 'Statistik', nav: 'analytics', body: 'Se din tillväxt över tid, dina största supportrar, och (efter några sändningar) rekommendationer för bästa tid att gå live baserat på dina egna tidigare sändningar.' }
  ];

  const FAQ = [
    { q: 'Fungerar VYRA i både webbläsaren (vyralive.app) och skrivbordsappen?', a: 'Ja. Skrivbordsappen heter VYRA Desktop här i appen och VYRA Studio i Microsoft Store — det är samma program. Dina inställningar och din overlay synkas via molnet mellan dem. Men allt fungerar inte på båda ställena:<ul class="guide-kapacitet">'
      + '<li><b>I webbläsaren:</b> bygga overlay och widgets, Action &amp; Event, testevent (Event Simulator och LIVE-kontroll → Skicka testgåva), TTS med molnröster, Sound Alerts, Spotify, Stream Deck via molnet med parkopplingskod, samt export och import av layouten som JSON-fil.</li>'
      + '<li><b>Kräver VYRA Desktop:</b> OBS-anslutningen (byta scen och slå av/på källor från en Action), Stream Deck utan parkopplingskod, och automatisk backup med versionshistorik.</li>'
      + '<li><b>Kräver OBS (eller Streamlabs):</b> att overlayen syns i sändningen — lägg overlay-länken som en Browser Source.</li></ul>' },
    { q: 'Var sparas mina inställningar?', a: 'Lokalt i webbläsaren direkt, och synkas sedan automatiskt till molnet så du kan logga in på en annan dator och få tillbaka samma overlay och inställningar.' },
    { q: 'Måste jag vara riktigt live för att testa något?', a: 'Nej. Under Action &amp; Event → Avancerat finns <b>Event Simulator</b>, och LIVE-kontroll har <b>Skicka testgåva</b>. Båda skickar ett låtsas-event genom hela systemet (målgrupp, villkor, allt) så du kan se att en hel automation fungerar — i webbläsaren räcker det att vara inloggad. TTS Chats knapp <b>Testa röst</b> är enklare — den testar bara själva rösten/uppspelningen, inte målgrupp eller filter.' },
    { q: 'Kostar VYRA något?', a: 'VYRA kostar 15 USD per månad. Du får 3 dagar gratis att testa allt innan betalningen börjar, och kan säga upp när som helst.' },
    { q: 'Varför hände ingenting när någon skickade en gåva?', a: 'Öppna Action & Event och titta i 03 Körlogg. Där står det för varje gåva vad som kördes, eller varför ingenting hände: inget event väntade på just den gåvan, väntetiden var inte slut, scenen var offline i OBS, kön var full eller automatiken var pausad.' },
    { q: 'Hur kommer jag igång med battles?', a: 'Klicka på Startpaket i Action & Event och lägg till Battle. Då får du en alert när matchen börjar, när ni tar ledningen och när ni vinner, och ett tack när ni förlorar. Vill du hellre bygga själv: Koppla Event → Händelse i en battle → välj vad i matchen. Battle-paketens X2-, X3-, Glove- och Snipe-klipp spelas som förut, automatiskt.' },
    { q: 'Hur fungerar battle-paketens video-effekter?', a: 'Lägg ett battle-paket på din overlay, så väljer VYRA klippen själv under matchen: Tap Tap när matchen börjar. Den första bonustiden är tyst. När en dubbel- eller trippelboost öppnar spelas X2 eller X3, och handsken (Glove) när 30 sekunder återstår av boosten. När 30 sekunder återstår av matchen spelas Snipe, och när 20 sekunder återstår spelas handsken igen.' },
    { q: 'Var ser jag vad som gick fel under sändningen?', a: 'Öppna LIVE-kontroll. Rutan Problem i sändningen säger till när något inte blir som det ska — och varför: när avataren ignorerar ett kommando (till exempel "!s" utan text, eller en avsändare som TikTok inte räknar som moderator), när ett battle-klipp väntar eller hoppas över, hur många sekunder efter matchslut MVP visades, och när TTS eller Sound Alerts inte kunde spela. Spara som fil ger en fil du kan skicka till oss efter sändningen.' },
    { q: 'Var spelas TTS-rösten — i studion eller i OBS?', a: 'Du väljer under TTS Chat → Rösten läses i. Studion / VYRA Desktop (förvalt): datorn läser och OBS fångar datorljudet, så håll studion öppen under sändningen. OBS-overlayn: ljudet följer med overlay-länken. Bara ett av ställena läser, så rösten hörs aldrig två gånger.' },
    { q: 'Vad är VYRA-röster i TTS Chat?', a: 'Sju egna röster som körs på VYRA:s server: NST och Alma på svenska, och Kristin, Cori, John och Bryce på engelska. De ingår utan extra kostnad, är märkta "VYRA-röst" i röstlistan och läser upp automatiskt om de vanliga molnrösterna inte svarar — så att det inte blir tyst mitt i en sändning.' },
    { q: 'Kan jag spara mina Actions och Events om jag byter dator?', a: 'Ja. Under Action & Event → Avancerat → Backup exporterar du allt till en fil, även dina egna ljud, bilder och videor, och läser in den på den nya datorn. Dina inställningar synkas dessutom via molnet när du loggar in.' },
    { q: 'TTS Chat visar bara en röst / ingen kvinnlig röst — vad gör jag?', a: 'Molnrösterna (märkta ☁ i röstlistan) fungerar alltid oavsett dator, inklusive en kvinnlig och en manlig svensk röst, utan extra kostnad inom Premium och utan installation. De lokala rösterna i listan ovanför beror på vad som är installerat i Windows — det går att lägga till fler under Windows-inställningar → Tillgänglighet → Berättarröst.' }
  ];

  function guideHtml() {
    return `<div class="page-header section-head"><div><h2>Guide — så fungerar VYRA</h2><p>Allt du behöver veta för att komma igång och använda VYRA fullt ut.</p></div></div>
    <section class="card guide-steps-card">
      <header><h3>Kom igång på 3 steg</h3></header>
      <div class="guide-steps">${STEPS.map(s => `<article class="guide-step"><b>${s.n}</b><div><h4>${s.title}</h4><p>${s.body}</p></div></article>`).join('')}</div>
    </section>
    <section class="guide-features-head"><h3>Funktioner i VYRA</h3><p>Klicka dig fram i menyn till vänster — här ser du vad varje sida gör.</p></section>
    <div class="guide-features-grid">${FEATURES.map(f => `<article class="card guide-feature"><header><span class="guide-feature-icon">${f.icon}</span><h4>${f.title}${f.badge ? ` <b class="nav-badge ${f.badge === 'PRO' ? 'nav-badge-pro' : f.badge === 'LIVE' ? 'nav-badge-live' : 'nav-badge-ai'}">${f.badge}</b>` : ''}</h4></header><p>${f.body}</p>${f.handling ? `<a class="guide-feature-handling" ${f.handling.attribut}>${f.handling.text}</a>` : ''}${f.nav ? `<button type="button" class="guide-feature-where" data-guide-nav="${f.nav}">📍 ${f.where}</button>` : `<small class="guide-feature-where">📍 ${f.where}</small>`}</article>`).join('')}</div>
    <section class="card guide-faq-card">
      <header><h3>Vanliga frågor</h3></header>
      <div class="guide-faq">${FAQ.map(f => `<details class="guide-faq-item"><summary>${f.q}</summary><div class="guide-faq-svar">${f.a}</div></details>`).join('')}</div>
    </section>`;
  }

  function renderGuide() {
    if (!document.querySelector('[data-extra="guide"]')?.classList.contains('active')) return;
    document.querySelector('#title').textContent = 'Guide';
    document.querySelector('#view').innerHTML = guideHtml();
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-extra="guide"]')) setTimeout(renderGuide, 0) }, true);
  // Granskning 2026-10-17 F26: platsangivelserna var bara text, och en av dem ("Automationer")
  // pekade på ett menyval som inte syns. Nu är varje plats med ett menyval en knapp som klickar
  // just det menyvalet — finns det inte, händer ingenting i stället för att guiden pekar fel.
  document.addEventListener('click', e => {
    const knapp = e.target.closest && e.target.closest('[data-guide-nav]');
    if (!knapp) return;
    const mal = knapp.dataset.guideNav;
    const val = document.querySelector(`aside [data-extra="${mal}"], aside [data-view="${mal}"]`);
    if (val) val.click();
  });
})();
