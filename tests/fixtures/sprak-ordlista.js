'use strict';
// EN kalla for spraket i Studion. Bada vakterna (kallkodsskannern och DOM-vandraren) laser
// harifran, sa listorna inte glider isar. Beslut 2026-08-09 (Etapp 4, PR A):
//
//   - Produktord BEHALLS: Overlay, Layout, Sound Alerts, TTS Chat, Chatbot — plus varumarken
//     (OBS, TikTok, Spotify, VYRA) och badges (LIVE, PRO, AI). "Media" ar samma ord pa svenska.
//   - Allt annat anvandarvant ar svenska. Events -> Handelser, Analytics -> Statistik
//     (nav + titlar; Automatik-vyns interna domantermer "Action"/"Event" ar produktbegrepp
//     i den funktionen och ror inte den har listan).
//
// KALLKOD_MONSTER ar precisionsmonster for kallkodsskannern: bara traffar som ar entydigt
// anvandarvanda i kalltext (markup, mallstrangar). Enstaka ord som "Preview" eller "Events"
// skannas INTE pa kallkodsniva — de forekommer legitimt i identifierare (owg-preview,
// VyraActionEvent) och skulle drunkna i falsklarm. Dem tar DOM-vandraren, som bara ser
// renderad synlig text dar identifierare aldrig dyker upp.
const KALLKOD_MONSTER = [
  { namn: 'Configure-knapp', re: /⚙\s*Configure/ },
  { namn: 'Preview-knapp', re: /▶\s*Preview/ },
  { namn: 'Preview/Configure-instruktion', re: /Preview\/Configure/ },
  { namn: 'Configure-modalrubrik', re: /Configure \$\{/ },
  { namn: 'Preview som eyebrow/etikett', re: />Preview</ },
  { namn: 'Top supporters', re: /Top supporters/i },
  { namn: 'All time', re: /All time/ },
  { namn: 'Command Center', re: /COMMAND CENTER/i },
  { namn: 'Live Pulse', re: /LIVE PULSE/i },
  { namn: 'Media Library', re: /Media Library/i },
  { namn: 'Overlay Preview', re: /Overlay Preview/i },
  { namn: 'Engelsk grupprubrik i navet', re: /nav-section-label">(Core|Automation|Insights)</ },
  { namn: 'Engelskt navval', re: /<span>(Events|Analytics)<\/span>/ },
  // 'Action & Event' STOD har till 2026-09-18 och ar medvetet borttaget.
  //
  // Etapp 4 (#154) dopte om navvalet 'Action & Event' till 'Automatik' och satte det pa den har
  // listan for att guiden inte skulle peka pa det gamla namnet. Beslutet ar aterkallat av David:
  // navet heter 'Action & Event' igen. Skalet ar att termerna ar produktens EGNA — CLAUDE.md
  // beskriver flodet som "Action skapas forst; Event valjer sedan vilken Action som triggas" —
  // och att guiden aldrig slutade anvanda dem: FAQ-svaret i guide.js kallade funktionen
  // 'Action & Event' hela tiden, medan navet sa 'Automatik'. Vakten skyddade alltsa en
  // inkonsekvens. Dessutom stod grupprubriken 'Automatik' over ett navval som ocksa het
  // 'Automatik', bredvid ett tredje som heter 'Automationer'.
  //
  // 'Vip-paket' och 'Analytics' ar KVAR: de ar aldrig produkttermer, bara gamla engelska namn.
  { namn: 'Guide pekar pa gammalt navnamn', re: /where: '(Vip-paket|Analytics)/ },
];

// Fraser som aldrig far synas i renderad text, oavsett vy. Matchas radvis, skiftlagesokansligt.
const DOM_FRASER = ['Configure', 'Preview', 'Top supporters', 'All time', 'Command Center',
  'Live Pulse', 'Media Library'];

// Ord som ar forbjudna i navetiketter, grupprubriker, sidtitel och brodsmula — men tillatna
// som domantermer inne i en vy (Automatik-vyns "Events"-kolumn).
const NAV_TITEL_ORD = ['Events', 'Analytics', 'Core', 'Insights', 'Automation'];

// Tillatlistan — dokumentation av beslutet, och skydd om framtida monster breddas.
const TILLATNA = ['Overlay', 'Layout', 'Sound Alerts', 'TTS Chat', 'Chatbot',
  'LIVE', 'PRO', 'AI', 'OBS', 'TikTok', 'Spotify', 'VYRA', 'Media'];


// Pastaenden som togs bort ur landningssidan i PR 172 och inte far komma tillbaka.
//
// TVA GRUPPER, och skillnaden ar inte kosmetisk:
//
//   personer      tre uppdiktade streamers med citat, daribland "okade mina donationer med
//                 40 %". De har ingen legitim anvandning nagonstans i repot — inte i UI, inte
//                 i en kommentar, inte i ett prov. Forbjudna overallt.
//
//   konkurrenter  BetterTok och TikFinity stod i en jamforelsetabell med pastaenden om vad de
//                 kan och inte kan. Namnen forekommer OCKSA i sex JS-filer som kommentarer som
//                 beskriver konkurrentens beteende av tekniska skal ("matching TikFinity's
//                 viewer-economy model"). Det ar arlig teknisk dokumentation, och att forbjuda
//                 den hade tagit bort kunskap for att komma at ett pastaende. Forbjudna bara i
//                 det en besokare laser.
const FORBJUDNA_PASTAENDEN = {
  personer: ['StreamKing', 'LiveQueen', 'TikPro'],
  konkurrenter: ['BetterTok', 'TikFinity'],
  anvandarvandaFiler: ['index.html', 'privacy.html', 'terms.html', 'status.html'],
};

module.exports = { KALLKOD_MONSTER, DOM_FRASER, NAV_TITEL_ORD, TILLATNA, FORBJUDNA_PASTAENDEN };
