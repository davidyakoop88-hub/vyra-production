'use strict';
// KEDJEVAKT för TikTok-verifieringen. Proven i server/test/ täcker logiken; det här täcker att
// delarna fortfarande är KOPPLADE till varandra. En widget med färdig logik och utan trigger har
// redan drabbat fem widgetar i det här repot — samma sak gäller en knapp.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const ROT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROT, f), 'utf8');

test('studio.html har verifieringsknappen och fritextblocket som går att dölja', () => {
  const html = las('studio.html');
  assert.match(html, /id="verifieraTikTok"/, 'knappen saknas i modalen');
  assert.match(html, /id="tikFritext"/, 'fritextblocket måste ha ett eget id för att kunna döljas');
  // Fritexten ligger kvar med flit tills flaggan sätts — den får inte försvinna av misstag.
  assert.match(html, /id="tikUser"/);
  assert.match(html, /id="connectNow"/);
});

test('studio.css har en EGEN [hidden]-regel för modalen', () => {
  // Studions egna selektorer sätter display på breda grupper, så webbläsarens inbyggda
  // [hidden]-regel förlorar. Utan den här raden syns fritextfältet trots block.hidden=true —
  // och då är spärren osynlig för ögat men synlig för användaren. Fällan har kostat en gång förut.
  assert.match(las('studio.css'), /#connectModal\s*\[hidden\]\s*\{[^}]*display\s*:\s*none/,
    'utan en egen regel döljer [hidden] ingenting i studio.html');
});

test('studio-live.js binder knappen och anropar VyraLive.verifiera', () => {
  const live = las('studio-live.js');
  assert.match(live, /verifieraTikTok/, 'knappen är inte bunden — då gör den ingenting vid klick');
  assert.match(live, /VyraLive\.verifiera/, 'klicket leder inte till någon verifiering');
  assert.match(live, /tikFritext/, 'fritextblocket döljs aldrig när servern kräver verifiering');
});

test('studio-live.js läser av alla lägen callbacken kan skicka tillbaka', () => {
  const live = las('studio-live.js');
  // Varje läge kräver olika handling av användaren. Faller ett av dem tillbaka på "det gick inte"
  // får användaren felsöka i blindo — exakt det som redan lagats en gång i den här filen.
  for (const lage of ['klar', 'avbruten', 'utgangen', 'upptaget', 'dubblett', 'fullt', 'fel']) {
    assert.match(live, new RegExp(`\\b${lage}\\s*:`), `läget "${lage}" saknar egen text`);
  }
});

test('live-client.js exponerar verifiera i BÅDA lägena — webb och skrivbord', () => {
  const klient = las('live-client.js');
  const traffar = klient.match(/verifiera\s*:\s*async/g) || [];
  assert.equal(traffar.length, 2,
    'verifiera måste finnas på både moln-VyraLive och skrivbordets VyraLive — annars gör knappen '
    + 'ingenting i det ena läget, utan att något felmeddelande säger varför');
});

test('KRITISK: callbacken ligger FÖRE sessionsgrinden i server/index.js', () => {
  // S.sessionCookie() sätter SameSite=Strict. En omdirigering från tiktok.com tillbaka hit är en
  // korssajts-navigering, och en Strict-kaka följer INTE med en sådan. Flyttas rutten bakom
  // sessionsraden svarar varje verifiering 401 — i produktion, aldrig i ett prov som anropar
  // rutten direkt med kakan satt. Det är därför den här vakten finns.
  const index = las('server/index.js');
  const callback = index.indexOf("p==='/api/auth/callback/tiktok'");
  const grind = index.indexOf('const s=await session(req,{csrf:');
  assert.ok(callback > 0, 'callback-rutten saknas helt');
  assert.ok(grind > 0, 'sessionsgrinden hittades inte — vakten mäter fel sak');
  assert.ok(callback < grind,
    'callbacken ligger BAKOM sessionsgrinden: SameSite=Strict gör att kakan inte följer med '
    + 'tillbaka från tiktok.com, så varje verifiering skulle svara 401 i produktion');
});

test('KONTROLLMÄTNING: vakten ovan kan faktiskt falla', () => {
  // En vakt som ger samma svar oavsett vad koden gör mäter ingenting. Här bevisas att jämförelsen
  // är riktig genom att vända på den mot samma fil.
  const index = las('server/index.js');
  const callback = index.indexOf("p==='/api/auth/callback/tiktok'");
  const grind = index.indexOf('const s=await session(req,{csrf:');
  assert.ok(!(callback > grind), 'kontrollmätningen är meningslös om båda påståendena kan vara sanna');
  assert.notEqual(callback, grind);
});

test('redirect-URI:n härleds med URL, inte med strängkonkatenering', () => {
  // APP_ORIGIN valideras bara som https-adress, så ett avslutande snedstreck slipper igenom.
  // `${ORIGIN}/api/...` hade då gett en dubbel slash, och TikTok jämför redirect_uri tecken för
  // tecken mot appens registrerade värde. Felet syns bara hos TikTok, aldrig i vår egen logg.
  const index = las('server/index.js');
  assert.match(index, /TIKTOK_REDIRECT\s*=\s*new URL\(/,
    'TIKTOK_REDIRECT byggs som sträng — ett snedstreck i APP_ORIGIN spräcker hela varvet');
  // Kontrollmätning: de två formerna måste faktiskt ge samma resultat.
  const med = new URL('/api/auth/callback/tiktok', 'https://vyralive.app/').toString();
  const utan = new URL('/api/auth/callback/tiktok', 'https://vyralive.app').toString();
  assert.equal(med, utan);
  assert.ok(!med.includes('//api/'), 'härledningen ger fortfarande dubbel slash');
});

test('flaggan spärrar fritextvägen i SERVERN, inte bara i gränssnittet', () => {
  const index = las('server/index.js');
  // Ett dolt formulärfält är ingen spärr: rutten är anropbar utan vår egen klient.
  assert.match(index, /TIKTOK_VERIFIERING_KRAVS\)return send\(res,403/,
    'PUT /tiktok-connection avvisar inte fritext när flaggan är satt');
});

test('capacity-gate nollställer verifieringen vid varje skrivning', () => {
  // Utan nollställningen ärver en fritextskrivning stämpeln från en tidigare verifiering: raden
  // visar "verifierad" bredvid ett handtag som ingen bevisat. En stämpel som ljuger är värre än
  // ingen stämpel.
  assert.match(las('server/capacity-gate.js'), /verifierad_at=NULL/,
    'en fritextskrivning kan ärva en gammal verifieringsstämpel');
});

test('Dockerfilens COPY-lista bär de nya servermodulerna', () => {
  // Filerna finns i repot men inte i imagen = krasch vid uppstart i Railway, grönt i alla prov.
  const docker = las('server/Dockerfile');
  assert.match(docker, /tiktok-verifiering\.js/);
  assert.match(docker, /tiktok-handtagslas\.js/);
});

test('inga TikTok-hemligheter har hamnat i klientfilerna', () => {
  for (const f of ['studio.html', 'studio-live.js', 'live-client.js', 'studio.css']) {
    const text = las(f);
    assert.ok(!/TIKTOK_CLIENT_SECRET|client_secret/i.test(text), `${f} nämner client_secret`);
    assert.ok(!/\bawhw7[a-z0-9]+/i.test(text), `${f} innehåller ett client_key`);
  }
});
