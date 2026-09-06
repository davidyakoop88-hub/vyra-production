'use strict';
// BRYGGAN FÅR INTE LÄSA ETT FÄLT SOM TIKTOK INTE SKICKAR.
//
// Det här provet finns för att två fält lästes i produktion som inte existerade i payloaden, och
// ingenting sa emot:
//
//   `data.comment`     chattexten. Fältet heter `content`. Uppmätt över åtta inspelningar:
//                      997 chattmeddelanden, 997 med `content`, NOLL med `comment`. Följden var
//                      att VARJE chattrad gick ut tom — TTS Chat, chat-triggade Actions och
//                      chatbotens kommandon fick alla tom sträng, och typen `chatcommand`
//                      skickades aldrig (''.startsWith('!') är alltid falskt).
//
//   `data.viewerCount` tittarantalet. Fälten heter `total` (samtidiga) och `totalUser`
//   `data.userCount`   (kumulativt unika). `number()` gör undefined till 0, så alla
//                      viewer-händelser bar `count: 0`. Uppmätt: 548 av 548 nollor i en sändning
//                      där `total` toppade på 38 och `totalUser` slutade på 332.
//
// BÅDA ÖVERLEVDE PROVSVITEN, för proven matade in syntetiska payloads i den form koden förväntade
// sig. En fixtur som beskriver en payload produktionen aldrig tar emot bevisar att koden fungerar
// GIVET något som inte finns.
//
// DÄRFÖR: fixturen här är UPPMÄTT, inte skriven. `hjalp/uppmatta-payloadfalt.json` är genererad ur
// åtta riktiga inspelningar (21 039 händelser) och innehåller BARA fältnamn — inga värden, inga
// id, inga namn. Se filens `_om`-block för härkomst.
//
// När TikTok byter ett fältnamn faller det här provet, i stället för att en funktion tystnar.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const FORM = JSON.parse(fs.readFileSync(path.join(__dirname, 'hjalp', 'uppmatta-payloadfalt.json'), 'utf8'));
const las = f => fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8');

// Vad varje brygga läser ur payloaden, per händelsetyp. Listan är MANUELL med flit: den som ändrar
// vilket fält koden läser måste lägga till det här, och då kontrolleras det mot verkligheten.
const LASER = [
  { typ: 'chat', falt: ['content'], varfor: 'chattexten' },
  { typ: 'viewer', falt: ['total'], varfor: 'antalet samtidiga tittare' },
];

// Reservfält som medvetet läses trots att de INTE finns i dagens payload. De står här för att
// beroendet är `^2` i package.json — biblioteket kan byta namn åt båda hållen vid nästa
// npm install, och då är reserven det som räddar oss.
const RESERVER = { chat: ['comment'], viewer: ['viewerCount', 'userCount'] };

for (const { typ, falt, varfor } of LASER) {
  test(`${typ}: fälten bryggan läser för ${varfor} finns i verkliga payloads`, () => {
    const uppmatt = FORM.typer[typ];
    assert.ok(uppmatt, `ingen uppmätt form för typen ${typ} — fixturen behöver genereras om`);
    for (const f of falt) {
      assert.ok(uppmatt.nycklar.includes(f),
        `bryggan läser \`${f}\` för ${typ}, men det fältet finns inte i någon av ${uppmatt.antal} ` +
        `uppmätta payloads. Nycklar som FINNS: ${uppmatt.nycklar.join(', ')}`);
    }
  });
}

test('reserverna är verkligen frånvarande — annars är de inte reserver', () => {
  // Kontrollmätning. Står ett reservfält plötsligt i den uppmätta formen har biblioteket bytt
  // tillbaka, och då ska någon ta ställning i stället för att båda grenarna tyst finns kvar.
  for (const [typ, falt] of Object.entries(RESERVER)) {
    const uppmatt = FORM.typer[typ];
    if (!uppmatt) continue;
    for (const f of falt) {
      assert.ok(!uppmatt.nycklar.includes(f),
        `\`${f}\` finns numera i ${typ}-payloaden. Reserven är inte längre en reserv — ta ställning.`);
    }
  }
});

// Källvakten. Ovanstående bevisar att `content` och `total` FINNS. Den här bevisar att koden
// faktiskt läser dem — i BÅDA bryggorna, som har varsin kopia av samma lyssnare.
const BRYGGOR = [
  { fil: 'tiktok-bridge/bridge.js', namn: 'molnbryggan' },
  { fil: 'electron-app/tiktok-service.js', namn: 'skrivbordsappen' },
];

for (const { fil, namn } of BRYGGOR) {
  test(`${namn} läser content och total, inte de fält som inte finns`, () => {
    const src = las(fil);
    assert.match(src, /data\??\.?\??\.content/,
      `${fil} läser inte \`content\` — chattexten blir tom`);
    assert.match(src, /data\?\.total\b/,
      `${fil} läser inte \`total\` — tittarräknaren blir 0`);
    // Och de gamla namnen får bara förekomma som RESERV, aldrig som förstahandsval.
    assert.doesNotMatch(src, /const comment = data\.comment \|\|/,
      `${fil} läser \`data.comment\` först — det fältet finns inte`);
    assert.doesNotMatch(src, /count: *\w*\.?number\(data\?\.viewerCount/,
      `${fil} läser \`viewerCount\` först — det fältet finns inte`);
  });
}
