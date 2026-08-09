// Guide — en samlad, tydlig förklaring av hela VYRA för användaren. Egen dedikerad sida (som
// TTS Chat/Sound Alerts), inte en modal eller tooltip, eftersom detta är tänkt att vara den
// naturliga första platsen en ny användare landar på för att förstå vad varje del av appen gör
// och var den hittas — inte bara en snabb definition i förbifarten.
(() => {
  const STEPS = [
    { n: 1, title: 'Anslut TikTok LIVE', body: 'Klicka på "Anslut TikTok" uppe till höger och skriv in ditt användarnamn. Anslutningen är riktig och kopplar direkt till din pågående livesändning — du måste vara live på TikTok för att den ska lyckas.' },
    { n: 2, title: 'Bygg din overlay', body: 'Gå till <b>Overlay</b> i menyn. Dra in widgets (mål, alerts, topplistor, TTS-text m.m.) från katalogen, placera dem som du vill och spara. Under <b>Layout</b> kan du spara flera olika layouter och byta mellan dem.' },
    { n: 3, title: 'Lägg overlayen i OBS', body: 'Kopiera overlay-länken från Overlay-sidan och lägg den som en <b>Browser Source</b> i OBS, Streamlabs eller liknande program. Allt du bygger och ändrar i VYRA uppdateras live i OBS automatiskt — du behöver aldrig ladda om källan.' }
  ];

  const FEATURES = [
    { icon: '🖥️', title: 'Overlay & Layout', where: 'Overlay / Layout', body: 'Din skärmyta för streamen. Dra-och-släpp widgets (mål, alerts, topplistor, klockor m.m.), placera och storleksändra fritt. Layout-sidan låter dig spara flera uppsättningar och växla mellan dem, t.ex. en för vanliga streams och en för battles.' },
    { icon: '⚡', title: 'Automatik', where: 'Automatik', badge: 'LIVE', body: 'Hjärtat i automationen. Skapa <b>Events</b> (t.ex. "gåva mottagen", "chattkommando !hype", "ny följare") och koppla dem till <b>Actions</b> (visa overlay, spela ljud/video, läs upp text, byt OBS-scen, lägg till poäng m.m.). Kan gatas på publik (följare/prenumeranter/moderatorer/specifik användare) och kosta poäng.' },
    { icon: '🔊', title: 'Sound Alerts', where: 'Sound Alerts', body: 'Ett bibliotek med färdiga ljudklipp du snabbt kan koppla till events, utan att gå via hela Action & Event-flödet. Klicka ▶ för att förhandslyssna, sedan "Koppla till event".' },
    { icon: '🗣️', title: 'TTS Chat', where: 'TTS Chat', body: 'Läser upp tittarnas chattkommentarer automatiskt med en riktig röst — helt gratis molnröster ingår (kvinnlig och manlig svensk röst, ingen installation krävs). Du styr vem som får använda det, vilka kommentarer som läses (alla, eller bara de som börjar med t.ex. "!tts"), spamskydd och om det ska kosta poäng.' },
    { icon: '🤖', title: 'Chatbot', where: 'Chatbot', badge: 'AI', body: 'Skapa egna chattkommandon (t.ex. "!discord" → svarar med din Discord-länk) och automatiska modereringsregler.' },
    { icon: '🔗', title: 'Automationer', where: 'Automationer', body: 'Ett enklare, visuellt sätt att koppla ihop en trigger med en action i ett svep — bra för snabba, enkla kopplingar utan att öppna hela Action & Event-panelen.' },
    { icon: '⭐', title: 'Poängsystem', where: 'Automatik → Poängsystem', body: 'Tittare tjänar poäng automatiskt bara genom att vara aktiva (gåvor, delningar, likes, tid i chatten). Poängen kan spenderas på events du skapar (t.ex. TTS eller en overlay-effekt) och ger tittarna nivåer ju mer de tjänat totalt.' },
    { icon: '🎵', title: 'Spotify', where: 'Spotify', body: 'Koppla ditt Spotify-konto oberoende av TikTok LIVE. Visa vilken låt som spelas i chatten med "!song", låt moderatorer byta låt med "!skip", eller koppla en gåva till att spela en specifik låt.' },
    { icon: '🎬', title: 'Vip-paket', where: 'Vip-widget', badge: 'PRO', body: 'Färdiga, tema-paketerade video-effekter (t.ex. Koi Pearl Lagoon, Masquerade Ball) du kan lägga direkt på din overlay-canvas — praktiskt för battle-boosts och liknande visuella effekter.' },
    { icon: '🎨', title: 'Färgschema', where: 'Knappen "🎨 Färgschema" högst upp', body: 'Sätt bakgrund, highlight, text, sekundär text och typsnitt EN gång. Alla widgets som har "Ärv färgschema" ikryssat använder automatiskt dessa värden istället för sina egna — praktiskt för att hålla hela overlayen visuellt enhetlig.' },
    { icon: '🎥', title: 'OBS-koppling', where: 'Automatik → OBS-anslutning', body: 'Låt Actions byta OBS-scen eller aktivera/inaktivera en OBS-källa automatiskt, t.ex. vid en stor gåva. Kräver VYRA Desktop (skrivbordsappen) och att OBS WebSocket Server är påslaget i OBS.' },
    { icon: '📊', title: 'Statistik', where: 'Statistik', body: 'Se din tillväxt över tid, dina största supportrar, och (efter några sändningar) rekommendationer för bästa tid att gå live baserat på dina egna tidigare sändningar.' }
  ];

  const FAQ = [
    { q: 'Fungerar VYRA i både webbläsaren (vyralive.app) och skrivbordsappen?', a: 'Ja, alla funktioner är byggda för att fungera identiskt på båda — dina inställningar och overlay synkas via molnet mellan dem. Ett fåtal saker (som riktig OBS-scenkontroll) kräver skrivbordsappen specifikt eftersom de behöver köra lokalt på din dator.' },
    { q: 'Var sparas mina inställningar?', a: 'Lokalt i webbläsaren direkt, och synkas sedan automatiskt till molnet så du kan logga in på en annan dator och få tillbaka samma overlay och inställningar.' },
    { q: 'Måste jag vara riktigt live för att testa något?', a: 'Nej. Action & Event och Event Simulator har "Testa"/"Simulera"-knappar som skickar ett låtsas-event genom hela systemet (målgrupp, villkor, allt) så du kan se att en hel automation fungerar. TTS Chats "Röstprovare" är enklare — den testar bara själva rösten/uppspelningen, inte målgrupp eller filter.' },
    { q: 'Kostar VYRA något?', a: 'Grundfunktionerna är gratis. Vissa märkta funktioner (t.ex. Vip-paket) är PRO och kräver en betald plan.' },
    { q: 'TTS Chat visar bara en röst / ingen kvinnlig röst — vad gör jag?', a: 'Molnrösterna (märkta ☁ i röstlistan) fungerar alltid oavsett dator, inklusive en kvinnlig och en manlig svensk röst, helt gratis och utan installation. De lokala rösterna i listan ovanför beror på vad som är installerat i Windows — det går att lägga till fler under Windows-inställningar → Tillgänglighet → Berättarröst.' }
  ];

  function guideHtml() {
    return `<div class="page-header section-head"><div><h2>Guide — så fungerar VYRA</h2><p>Allt du behöver veta för att komma igång och använda VYRA fullt ut.</p></div></div>
    <section class="card guide-steps-card">
      <header><h3>Kom igång på 3 steg</h3></header>
      <div class="guide-steps">${STEPS.map(s => `<article class="guide-step"><b>${s.n}</b><div><h4>${s.title}</h4><p>${s.body}</p></div></article>`).join('')}</div>
    </section>
    <section class="guide-features-head"><h3>Funktioner i VYRA</h3><p>Klicka dig fram i menyn till vänster — här ser du vad varje sida gör.</p></section>
    <div class="guide-features-grid">${FEATURES.map(f => `<article class="card guide-feature"><header><span class="guide-feature-icon">${f.icon}</span><h4>${f.title}${f.badge ? ` <b class="nav-badge ${f.badge === 'PRO' ? 'nav-badge-pro' : f.badge === 'LIVE' ? 'nav-badge-live' : 'nav-badge-ai'}">${f.badge}</b>` : ''}</h4></header><p>${f.body}</p><small class="guide-feature-where">📍 ${f.where}</small></article>`).join('')}</div>
    <section class="card guide-faq-card">
      <header><h3>Vanliga frågor</h3></header>
      <div class="guide-faq">${FAQ.map(f => `<details class="guide-faq-item"><summary>${f.q}</summary><p>${f.a}</p></details>`).join('')}</div>
    </section>`;
  }

  function renderGuide() {
    if (!document.querySelector('[data-extra="guide"]')?.classList.contains('active')) return;
    document.querySelector('#title').textContent = 'Guide';
    document.querySelector('#view').innerHTML = guideHtml();
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-extra="guide"]')) setTimeout(renderGuide, 0) }, true);
})();
