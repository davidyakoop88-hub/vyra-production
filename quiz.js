// quiz.js — QUIZ (David 2026-11-07, sparad prototyp "Quiz"). En egen widgettyp, templateQuiz, med tre designer:
// Frågerad, Spelkort och Quiz Show. Tre startpaket (Allmänbildning, Sport, Gaming) med källor, plus egna frågor.
//
// GRATIS ANMÄLAN. Alla som svarar A, B eller C i chatten är med. Prototypens gåvokrav byggs INTE: en gåva som
// villkor för att få delta kan bryta mot TikToks LIVE-regler, och det ska kontrolleras innan det övervägs.
// Inga priser och inga utbetalningar.
//
// EN MODERATOR STARTAR OMGÅNGEN med !quiz i chatten (eller streamern med ▶ i studion, bara studion). Sedan går
// frågorna av sig själva: svarsfönster (standard 20 s), rättning och paus (standard 6 s), till slutställningen.
// Ett svar per tittare och fråga — det första räknas, och poängen nycklas på userId.
//
// SAMMA RESULTAT I VARJE OBS-KÄLLA. Tidslinjen räknas från startkommandots tidsstämpel (servertid) och varje svar
// bedöms på sin egen tidsstämpel — inte på när en viss webbläsare råkade få det. Svarsalternativens ordning är
// bestämd av ett frö (frågans id + omgångens start), aldrig Math.random. Läget överlever en omladdning.
(function () {
  'use strict';
  if (typeof wh !== 'function' || window.VyraQuiz) return;

  const TYP = 'templateQuiz';
  const OVERLAY = (() => { try { return document.documentElement.classList.contains('overlay-output') || new URLSearchParams(location.search).has('overlay'); } catch (_) { return false; } })();
  const DESIGNER = [['fragerad', 'Frågerad', 'Smal rad med turkos kant'], ['spelkort', 'Spelkort', 'Ljust kort som en spelbiljett'], ['quizshow', 'Quiz Show', 'Blå tv-studio med runda svar']];
  const DESIGN = Object.fromEntries(DESIGNER.map(d => [d[0], d]));
  const FARSKT_MS = 15000, LAGRING = 'vyra-quiz-', BOKSTAVER = ['A', 'B', 'C'];
  // Prototypens tre startpaket, med källorna ordagrant.
  const PAKET = {
    allman: { namn: 'Allmänbildning', fragor: [
      ['g1', 'Vilken planet kallas den röda planeten?', ['Venus', 'Mars', 'Jupiter'], 1, 'https://science.nasa.gov/mars/facts/'],
      ['g2', 'Vilken är solsystemets största planet?', ['Jorden', 'Saturnus', 'Jupiter'], 2, 'https://science.nasa.gov/jupiter/'],
      ['g3', 'Hur många sidor har en hexagon?', ['Fem', 'Sex', 'Åtta'], 1, 'Matematisk definition: hexagon är en sexhörning.']] },
    sport: { namn: 'Sport', fragor: [
      ['s1', 'Hur många spelare får ett lag högst ha på planen i vanlig elvamannafotboll?', ['Nio', 'Elva', 'Tretton'], 1, 'https://www.theifab.com/laws/latest/the-players/'],
      ['s2', 'Hur många spelare per lag är på planen i vanlig 5 mot 5-basket?', ['Fem', 'Sex', 'Sju'], 0, 'https://about.fiba.basketball/en/our-sport/official-basketball-rules'],
      ['s3', 'Vilken av dessa sporter spelas med en basketboll?', ['Badminton', 'Basket', 'Ishockey'], 1, 'https://about.fiba.basketball/en/our-sport/official-basketball-rules']] },
    gaming: { namn: 'Gaming', fragor: [
      ['v1', 'Vad heter Marios bror?', ['Wario', 'Toad', 'Luigi'], 2, 'https://mario.nintendo.com/ca/characters/'],
      ['v2', 'Vilken typ har Pikachu i Pokémon-spelen?', ['Eld', 'Elektrisk', 'Vatten'], 1, 'https://www.pokemon.com/uk/pokedex/pikachu'],
      ['v3', 'Vilken Minecraft-varelse är känd för att explodera?', ['Creeper', 'Ko', 'Bybo'], 0, 'https://www.minecraft.net/en-us/article/meet-creeper']] },
    // Svåra paket (2026-11-23): tolv till femton frågor vardera, för tittare som redan klarar startpaketen.
    allmansvar: { namn: 'Allmänbildning · svår', fragor: [
      ['ha1', 'Vilken svensk fick Nobelpriset i litteratur 1909, som första svensk?', ['Verner von Heidenstam', 'Selma Lagerlöf', 'Pär Lagerkvist'], 1, 'https://sv.wikipedia.org/wiki/Selma_Lagerl%C3%B6f'],
      ['ha2', 'Vilket år sjönk regalskeppet Vasa på sin jungfruresa?', ['1618', '1628', '1648'], 1, 'https://sv.wikipedia.org/wiki/Vasa_(skepp)'],
      ['ha3', 'Vilken gas utgör störst del av jordens atmosfär?', ['Syre', 'Koldioxid', 'Kväve'], 2, 'https://en.wikipedia.org/wiki/Atmosphere_of_Earth'],
      ['ha4', 'Vilken sjö är den djupaste i världen?', ['Bajkalsjön', 'Tanganyikasjön', 'Vänern'], 0, 'https://en.wikipedia.org/wiki/Lake_Baikal'],
      ['ha5', 'Vilken stad är Australiens huvudstad?', ['Sydney', 'Melbourne', 'Canberra'], 2, 'https://en.wikipedia.org/wiki/Canberra'],
      ['ha6', 'Vilket grundämne har atomnummer 79?', ['Silver', 'Guld', 'Platina'], 1, 'https://en.wikipedia.org/wiki/Gold'],
      ['ha7', 'Vilket år publicerade Einstein sin allmänna relativitetsteori?', ['1905', '1915', '1925'], 1, 'https://en.wikipedia.org/wiki/General_relativity'],
      ['ha8', 'Vilket fördrag avslutade trettioåriga kriget 1648?', ['Westfaliska freden', 'Versaillesfreden', 'Wienkongressen'], 0, 'https://sv.wikipedia.org/wiki/Westfaliska_freden'],
      ['ha9', 'Vilket organ tillverkar insulin?', ['Levern', 'Njurarna', 'Bukspottkörteln'], 2, 'https://en.wikipedia.org/wiki/Insulin'],
      ['ha10', 'Hur många kromosomer har en människas vanliga kroppscell?', ['23', '46', '48'], 1, 'https://en.wikipedia.org/wiki/Chromosome'],
      ['ha11', 'Vilket är Afrikas högsta berg?', ['Mount Kenya', 'Kilimanjaro', 'Ruwenzori'], 1, 'https://en.wikipedia.org/wiki/Mount_Kilimanjaro'],
      ['ha12', 'Vilken blodgrupp används som universalgivare av röda blodkroppar?', ['AB positiv', 'A positiv', '0 negativ'], 2, 'https://en.wikipedia.org/wiki/Blood_type'],
      ['ha13', 'Vilket kemiskt tecken har wolfram?', ['W', 'Wo', 'Tu'], 0, 'https://en.wikipedia.org/wiki/Tungsten'],
      ['ha14', 'Vilken är jordens längsta bergskedja ovan havsytan?', ['Himalaya', 'Anderna', 'Klippiga bergen'], 1, 'https://en.wikipedia.org/wiki/Andes'],
      ['ha15', 'Vilken stad var Rysslands huvudstad strax före revolutionen 1917?', ['Kiev', 'Novgorod', 'Sankt Petersburg'], 2, 'https://en.wikipedia.org/wiki/Saint_Petersburg'],
      ['ha16', 'Vilken stjärna ligger närmast solen?', ['Alfa Centauri A', 'Proxima Centauri', 'Sirius'], 1, 'https://en.wikipedia.org/wiki/Proxima_Centauri'],
      ['ha17', 'Hur många ben har en vuxen människa?', ['186', '206', '226'], 1, 'https://en.wikipedia.org/wiki/Human_skeleton'],
      ['ha18', 'Vilket grundämne är vanligast i jordskorpan?', ['Kisel', 'Syre', 'Järn'], 1, 'https://en.wikipedia.org/wiki/Abundance_of_elements_in_Earth%27s_crust'],
      ['ha19', 'Vem målade Flickan med pärlörhänget?', ['Rembrandt', 'Vermeer', 'Rubens'], 1, 'https://en.wikipedia.org/wiki/Girl_with_a_Pearl_Earring'],
      ['ha20', 'Vem komponerade De fyra årstiderna?', ['Bach', 'Vivaldi', 'Händel'], 1, 'https://en.wikipedia.org/wiki/The_Four_Seasons_(Vivaldi)'],
      ['ha21', 'Vilket språk har flest modersmålstalare?', ['Engelska', 'Spanska', 'Mandarin'], 2, 'https://en.wikipedia.org/wiki/List_of_languages_by_number_of_native_speakers'],
      ['ha22', 'Vem var den första kvinnan som fick ett Nobelpris?', ['Bertha von Suttner', 'Marie Curie', 'Selma Lagerlöf'], 1, 'https://en.wikipedia.org/wiki/Marie_Curie'],
      ['ha23', 'Vilket år grundades Förenta nationerna?', ['1919', '1945', '1957'], 1, 'https://sv.wikipedia.org/wiki/F%C3%B6renta_nationerna'],
      ['ha24', 'Vilket år blev Sverige medlem i EU?', ['1991', '1995', '2000'], 1, 'https://sv.wikipedia.org/wiki/Sveriges_anslutning_till_Europeiska_unionen'],
      ['ha25', 'Vilken stad är Schweiz huvudstad?', ['Zürich', 'Genève', 'Bern'], 2, 'https://en.wikipedia.org/wiki/Bern'],
      ['ha26', 'Vad kallas rädslan för höjder?', ['Klaustrofobi', 'Akrofobi', 'Agorafobi'], 1, 'https://en.wikipedia.org/wiki/Acrophobia'],
      ['ha27', 'Vilken filosof skrev: Jag tänker, alltså finns jag?', ['Kant', 'Descartes', 'Nietzsche'], 1, 'https://en.wikipedia.org/wiki/Cogito,_ergo_sum'],
      ['ha28', 'Vilket är det hårdaste naturligt förekommande materialet?', ['Kvarts', 'Korund', 'Diamant'], 2, 'https://en.wikipedia.org/wiki/Mohs_scale_of_mineral_hardness'],
      ['ha29', 'Vilken färg får koppar när det oxiderar med tiden?', ['Blå', 'Grön', 'Röd'], 1, 'https://en.wikipedia.org/wiki/Patina']] },
    sportsvar: { namn: 'Sport · svår', fragor: [
      ['hs1', 'Vilket land har vunnit flest herr-VM i fotboll?', ['Tyskland', 'Brasilien', 'Italien'], 1, 'https://en.wikipedia.org/wiki/FIFA_World_Cup'],
      ['hs2', 'Hur långt är ett maratonlopp?', ['40 km', '42,195 km', '45 km'], 1, 'https://en.wikipedia.org/wiki/Marathon'],
      ['hs3', 'Vilket år hölls de första moderna olympiska sommarspelen?', ['1888', '1896', '1900'], 1, 'https://en.wikipedia.org/wiki/1896_Summer_Olympics'],
      ['hs4', 'Hur många Wimbledon-titlar i rad vann Björn Borg 1976–1980?', ['Tre', 'Fem', 'Sju'], 1, 'https://en.wikipedia.org/wiki/Bj%C3%B6rn_Borg'],
      ['hs5', 'Vilken stad arrangerade sommar-OS 1912?', ['Stockholm', 'Antwerpen', 'Paris'], 0, 'https://sv.wikipedia.org/wiki/Olympiska_sommarspelen_1912'],
      ['hs6', 'Hur många poäng ger en touchdown i amerikansk fotboll, utan extrapoäng?', ['Fem', 'Sex', 'Sju'], 1, 'https://en.wikipedia.org/wiki/Touchdown'],
      ['hs7', 'Vilket land vann herrarnas fotbolls-VM 2010?', ['Nederländerna', 'Tyskland', 'Spanien'], 2, 'https://en.wikipedia.org/wiki/2010_FIFA_World_Cup'],
      ['hs8', 'Vad kallas det i golf när man klarar ett hål på två slag under par?', ['Birdie', 'Eagle', 'Albatross'], 1, 'Golfens poängtermer: birdie är ett slag under par, eagle två och albatross tre.'],
      ['hs9', 'Hur lång är en olympisk simbassäng?', ['25 meter', '50 meter', '100 meter'], 1, 'https://en.wikipedia.org/wiki/Olympic-size_swimming_pool'],
      ['hs10', 'På vilken höjd över golvet hänger en basketkorg?', ['2,85 meter', '3,05 meter', '3,25 meter'], 1, 'https://about.fiba.basketball/en/our-sport/official-basketball-rules'],
      ['hs11', 'Hur bred är ett fotbollsmål mellan stolparna?', ['6,32 meter', '7,32 meter', '8,32 meter'], 1, 'https://www.theifab.com/laws/latest/the-field-of-play/'],
      ['hs12', 'Hur många set måste en herrspelare vinna för att ta en match i en Grand Slam-turnering?', ['Två', 'Tre', 'Fyra'], 1, 'https://en.wikipedia.org/wiki/Grand_Slam_(tennis)'],
      ['hs13', 'Hur många spelare per lag är på planen samtidigt i handboll, målvakten inräknad?', ['Sex', 'Sju', 'Åtta'], 1, 'https://en.wikipedia.org/wiki/Handball'],
      ['hs14', 'Vilken stad arrangerade sommar-OS 2000?', ['Aten', 'Atlanta', 'Sydney'], 2, 'https://en.wikipedia.org/wiki/2000_Summer_Olympics'],
      ['hs15', 'Vilket underlag spelas French Open på?', ['Gräs', 'Grus', 'Hardcourt'], 1, 'https://en.wikipedia.org/wiki/French_Open'],
      ['hs16', 'Hur lång är Vasaloppet från Sälen till Mora?', ['70 km', '90 km', '110 km'], 1, 'https://sv.wikipedia.org/wiki/Vasaloppet'],
      ['hs17', 'Hur många spelare per lag är på planen samtidigt i volleyboll?', ['Fem', 'Sex', 'Sju'], 1, 'https://en.wikipedia.org/wiki/Volleyball'],
      ['hs18', 'Vilket år vann Sverige OS-guld i herrfotboll?', ['1936', '1948', '1960'], 1, 'https://sv.wikipedia.org/wiki/Olympiska_sommarspelen_1948'],
      ['hs19', 'Hur många poäng ger en perfekt bowlingomgång?', ['200', '300', '400'], 1, 'https://en.wikipedia.org/wiki/Ten-pin_bowling'],
      ['hs20', 'Vilken är den högsta poängen man kan avsluta på (checkout) i dart?', ['160', '170', '180'], 1, 'https://en.wikipedia.org/wiki/Darts'],
      ['hs21', 'Vilket land har vunnit flest herr-VM-guld i ishockey?', ['Sverige', 'Kanada', 'Ryssland'], 1, 'https://en.wikipedia.org/wiki/IIHF_World_Championship'],
      ['hs22', 'Vilket år hölls det första fotbolls-VM:et?', ['1926', '1930', '1934'], 1, 'https://en.wikipedia.org/wiki/1930_FIFA_World_Cup'],
      ['hs23', 'Vilket land var värd för fotbolls-VM 1958, där Pelé slog igenom?', ['Brasilien', 'Schweiz', 'Sverige'], 2, 'https://en.wikipedia.org/wiki/1958_FIFA_World_Cup'],
      ['hs24', 'Vad kallas ställningen 40–40 i tennis?', ['Advantage', 'Deuce', 'Tiebreak'], 1, 'https://en.wikipedia.org/wiki/Tennis_scoring_system'],
      ['hs25', 'Hur lång är ett varv på en vanlig friidrottsbana, innerbanan?', ['300 meter', '400 meter', '500 meter'], 1, 'https://en.wikipedia.org/wiki/Running_track'],
      ['hs26', 'Vilket land vann herrarnas fotbolls-EM 2004?', ['Portugal', 'Grekland', 'Tjeckien'], 1, 'https://en.wikipedia.org/wiki/UEFA_Euro_2004']] },
    gamingsvar: { namn: 'Gaming · svår', fragor: [
      ['hv1', 'Vilket år släpptes Minecraft i version 1.0?', ['2009', '2011', '2013'], 1, 'https://en.wikipedia.org/wiki/Minecraft'],
      ['hv2', 'Vilket företag utvecklade The Witcher 3: Wild Hunt?', ['BioWare', 'Bethesda', 'CD Projekt Red'], 2, 'https://en.wikipedia.org/wiki/The_Witcher_3:_Wild_Hunt'],
      ['hv3', 'Vad heter kungariket där The Legend of Zelda oftast utspelar sig?', ['Hyrule', 'Termina', 'Lorule'], 0, 'https://en.wikipedia.org/wiki/Hyrule'],
      ['hv4', 'Vilket år släpptes de första Pokémon-spelen i Japan?', ['1994', '1996', '1998'], 1, 'https://en.wikipedia.org/wiki/Pok%C3%A9mon'],
      ['hv5', 'Vilken spelmotor är Fortnite byggt i?', ['Unity', 'Source', 'Unreal Engine'], 2, 'https://en.wikipedia.org/wiki/Fortnite'],
      ['hv6', 'I vilket spel finns undervattensstaden Rapture?', ['BioShock', 'Fallout', 'Dishonored'], 0, 'https://en.wikipedia.org/wiki/BioShock'],
      ['hv7', 'Vilket svenskt spelbolag köpte Microsoft 2014 för cirka 2,5 miljarder dollar?', ['DICE', 'Mojang', 'King'], 1, 'https://en.wikipedia.org/wiki/Mojang_Studios'],
      ['hv8', 'Vilken stad utspelar sig Grand Theft Auto V i?', ['Vice City', 'Liberty City', 'Los Santos'], 2, 'https://en.wikipedia.org/wiki/Grand_Theft_Auto_V'],
      ['hv9', 'Vilket år släpptes den första PlayStation-konsolen i Japan?', ['1992', '1994', '1996'], 1, 'https://en.wikipedia.org/wiki/PlayStation_(console)'],
      ['hv10', 'I vilket spel dök Mario först upp, då under namnet Jumpman?', ['Super Mario Bros.', 'Donkey Kong', 'Mario Bros.'], 1, 'https://en.wikipedia.org/wiki/Donkey_Kong_(video_game)'],
      ['hv11', 'Hur många Pokémon fanns i den första generationen?', ['150', '151', '251'], 1, 'https://en.wikipedia.org/wiki/Pok%C3%A9mon'],
      ['hv12', 'Vad kallas valutan i Animal Crossing?', ['Rupees', 'Bells', 'Caps'], 1, 'https://en.wikipedia.org/wiki/Animal_Crossing'],
      ['hv13', 'Vilket år släpptes det första The Legend of Zelda?', ['1984', '1986', '1989'], 1, 'https://en.wikipedia.org/wiki/The_Legend_of_Zelda_(video_game)'],
      ['hv14', 'Vilket spel började Counter-Strike som en modifikation av?', ['Quake', 'Half-Life', 'Unreal Tournament'], 1, 'https://en.wikipedia.org/wiki/Counter-Strike'],
      ['hv15', 'Vilket spel var Dota ursprungligen en modifikation av?', ['StarCraft', 'Age of Empires II', 'Warcraft III'], 2, 'https://en.wikipedia.org/wiki/Dota_(mod)'],
      ['hv16', 'Vad heter staden där Cyberpunk 2077 utspelar sig?', ['Night City', 'Neo Tokyo', 'Los Santos'], 0, 'https://en.wikipedia.org/wiki/Cyberpunk_2077'],
      ['hv17', 'Vad heter huvudpersonen i det första Half-Life?', ['Adrian Shephard', 'Gordon Freeman', 'Alyx Vance'], 1, 'https://en.wikipedia.org/wiki/Half-Life_(video_game)'],
      ['hv18', 'Vilket år släpptes World of Warcraft?', ['2002', '2004', '2006'], 1, 'https://en.wikipedia.org/wiki/World_of_Warcraft'],
      ['hv19', 'Hur många spöken jagar Pac-Man i det ursprungliga spelet?', ['Tre', 'Fyra', 'Fem'], 1, 'https://en.wikipedia.org/wiki/Pac-Man'],
      ['hv20', 'Vilket år släpptes The Elder Scrolls V: Skyrim?', ['2009', '2011', '2013'], 1, 'https://en.wikipedia.org/wiki/The_Elder_Scrolls_V:_Skyrim'],
      ['hv21', 'Vad kallas spelvärlden i Elden Ring?', ['Lordran', 'The Lands Between', 'Azeroth'], 1, 'https://en.wikipedia.org/wiki/Elden_Ring'],
      ['hv22', 'Vem skapade Metal Gear-serien?', ['Shigeru Miyamoto', 'Hideo Kojima', 'Hidetaka Miyazaki'], 1, 'https://en.wikipedia.org/wiki/Hideo_Kojima'],
      ['hv23', 'Vad heter Master Chiefs AI-följeslagare i Halo?', ['GLaDOS', 'EDI', 'Cortana'], 2, 'https://en.wikipedia.org/wiki/Cortana_(Halo)'],
      ['hv24', 'Vilket år släpptes Nintendo Switch?', ['2015', '2017', '2019'], 1, 'https://en.wikipedia.org/wiki/Nintendo_Switch'],
      ['hv25', 'Vilket år lanserades Sega Dreamcast i Japan?', ['1996', '1998', '2000'], 1, 'https://en.wikipedia.org/wiki/Dreamcast'],
      ['hv26', 'Vilket svenskt studio utvecklar Battlefield-serien?', ['DICE', 'Mojang', 'Avalanche'], 0, 'https://en.wikipedia.org/wiki/Battlefield_(video_game_series)']] },
    historiasvar: { namn: 'Historia · svår', fragor: [
      ['hh1', 'Vilket år erövrade osmanerna Konstantinopel?', ['1453', '1492', '1517'], 0, 'https://en.wikipedia.org/wiki/Fall_of_Constantinople'],
      ['hh2', 'Vilket år stupade Gustav II Adolf i slaget vid Lützen?', ['1611', '1632', '1648'], 1, 'https://sv.wikipedia.org/wiki/Gustav_II_Adolf'],
      ['hh3', 'Vilken drottning regerade Sverige 1632–1654?', ['Ulrika Eleonora', 'Margareta', 'Kristina'], 2, 'https://sv.wikipedia.org/wiki/Kristina_av_Sverige'],
      ['hh4', 'I vilken fred förlorade Sverige Finland 1809?', ['Fredrikshamn', 'Roskilde', 'Nystad'], 0, 'https://sv.wikipedia.org/wiki/Freden_i_Fredrikshamn'],
      ['hh5', 'Vilket år bildades Kalmarunionen?', ['1319', '1397', '1523'], 1, 'https://sv.wikipedia.org/wiki/Kalmarunionen'],
      ['hh6', 'Vem var Roms förste kejsare?', ['Julius Caesar', 'Nero', 'Augustus'], 2, 'https://en.wikipedia.org/wiki/Augustus'],
      ['hh7', 'Vilket år avsattes den siste västromerske kejsaren, Romulus Augustulus?', ['410', '476', '527'], 1, 'https://en.wikipedia.org/wiki/Romulus_Augustulus'],
      ['hh8', 'Vilket år stod slaget vid Poltava?', ['1700', '1709', '1718'], 1, 'https://sv.wikipedia.org/wiki/Slaget_vid_Poltava'],
      ['hh9', 'Vilket år föll Berlinmuren?', ['1987', '1989', '1991'], 1, 'https://en.wikipedia.org/wiki/Berlin_Wall'],
      ['hh10', 'Vilken farao lät enligt traditionen bygga Cheopspyramiden?', ['Khufu', 'Ramses II', 'Tutankhamon'], 0, 'https://en.wikipedia.org/wiki/Great_Pyramid_of_Giza'],
      ['hh11', 'Vilket år dog Karl XII?', ['1709', '1718', '1721'], 1, 'https://sv.wikipedia.org/wiki/Karl_XII'],
      ['hh12', 'Vilket år valdes Gustav Vasa till Sveriges kung?', ['1521', '1523', '1527'], 1, 'https://sv.wikipedia.org/wiki/Gustav_Vasa'],
      ['hh13', 'Vilket år undertecknades Magna Carta?', ['1066', '1215', '1348'], 1, 'https://en.wikipedia.org/wiki/Magna_Carta'],
      ['hh14', 'Vilket år stod slaget vid Hastings?', ['1066', '1016', '1096'], 0, 'https://en.wikipedia.org/wiki/Battle_of_Hastings'],
      ['hh15', 'Vilket år var D-dagen, då de allierade landsteg i Normandie?', ['1942', '1944', '1945'], 1, 'https://en.wikipedia.org/wiki/Normandy_landings'],
      ['hh16', 'Vid vilket slag besegrades Napoleon slutgiltigt 1815?', ['Waterloo', 'Austerlitz', 'Leipzig'], 0, 'https://en.wikipedia.org/wiki/Battle_of_Waterloo'],
      ['hh17', 'Vilket år sjönk Titanic?', ['1912', '1905', '1918'], 0, 'https://en.wikipedia.org/wiki/Titanic'],
      ['hh18', 'Vilken kung var far till Karl XII?', ['Karl XI', 'Karl X Gustav', 'Gustav II Adolf'], 0, 'https://sv.wikipedia.org/wiki/Karl_XI'],
      ['hh19', 'Vilket år avskaffades slaveriet i hela USA genom det trettonde tillägget?', ['1863', '1865', '1870'], 1, 'https://en.wikipedia.org/wiki/Thirteenth_Amendment_to_the_United_States_Constitution'],
      ['hh20', 'Vilket år spikade Martin Luther upp sina 95 teser, enligt traditionen?', ['1492', '1555', '1517'], 2, 'https://en.wikipedia.org/wiki/Ninety-five_Theses'],
      ['hh21', 'Vilket år upplöstes Sovjetunionen?', ['1989', '1991', '1993'], 1, 'https://en.wikipedia.org/wiki/Dissolution_of_the_Soviet_Union'],
      ['hh22', 'Vilket år grundades Stockholm, enligt traditionen?', ['1252', '1187', '1397'], 0, 'https://sv.wikipedia.org/wiki/Stockholms_historia'],
      ['hh23', 'Vilket år ägde Stockholms blodbad rum?', ['1397', '1523', '1520'], 2, 'https://sv.wikipedia.org/wiki/Stockholms_blodbad'],
      ['hh24', 'Vilket år upplöstes unionen mellan Sverige och Norge?', ['1814', '1905', '1920'], 1, 'https://sv.wikipedia.org/wiki/Unionsuppl%C3%B6sningen_1905'],
      ['hh25', 'Vilket år undertecknades Versaillesfreden?', ['1918', '1920', '1919'], 2, 'https://en.wikipedia.org/wiki/Treaty_of_Versailles'],
      ['hh26', 'Vilket år bröt första världskriget ut?', ['1914', '1912', '1916'], 0, 'https://en.wikipedia.org/wiki/World_War_I']] },
    geografisvar: { namn: 'Geografi · svår', fragor: [
      ['hg1', 'Vilken är Europas längsta flod?', ['Donau', 'Volga', 'Rhen'], 1, 'https://en.wikipedia.org/wiki/Volga'],
      ['hg2', 'Vilket land har flest invånare?', ['Kina', 'USA', 'Indien'], 2, 'https://en.wikipedia.org/wiki/List_of_countries_by_population_(United_Nations)'],
      ['hg3', 'Vilken stad är Kanadas huvudstad?', ['Toronto', 'Ottawa', 'Montréal'], 1, 'https://en.wikipedia.org/wiki/Ottawa'],
      ['hg4', 'Vilken stad är Brasiliens huvudstad?', ['Rio de Janeiro', 'São Paulo', 'Brasília'], 2, 'https://en.wikipedia.org/wiki/Bras%C3%ADlia'],
      ['hg5', 'Vilken är världens största ö?', ['Grönland', 'Nya Guinea', 'Borneo'], 0, 'https://en.wikipedia.org/wiki/Greenland'],
      ['hg6', 'Vilket är Sveriges högsta berg?', ['Sarektjåkkå', 'Kebnekaise', 'Åreskutan'], 1, 'https://sv.wikipedia.org/wiki/Kebnekaise'],
      ['hg7', 'Vilket är världens minsta land till ytan?', ['Monaco', 'San Marino', 'Vatikanstaten'], 2, 'https://en.wikipedia.org/wiki/Vatican_City'],
      ['hg8', 'Vilket land har flest öar i världen?', ['Indonesien', 'Sverige', 'Filippinerna'], 1, 'https://en.wikipedia.org/wiki/List_of_countries_by_number_of_islands'],
      ['hg9', 'Vilken är världens största varma öken?', ['Gobi', 'Kalahari', 'Sahara'], 2, 'https://en.wikipedia.org/wiki/Sahara'],
      ['hg10', 'Vilket sund skiljer Asien från Nordamerika?', ['Berings sund', 'Gibraltar sund', 'Magellans sund'], 0, 'https://en.wikipedia.org/wiki/Bering_Strait'],
      ['hg11', 'Vilket är världens högsta vattenfall?', ['Niagarafallen', 'Angel Falls', 'Victoriafallen'], 1, 'https://en.wikipedia.org/wiki/Angel_Falls'],
      ['hg12', 'Vilken flod rinner genom Budapest?', ['Donau', 'Wisła', 'Elbe'], 0, 'https://en.wikipedia.org/wiki/Danube'],
      ['hg13', 'Vilket är Sydamerikas högsta berg?', ['Chimborazo', 'Huascarán', 'Aconcagua'], 2, 'https://en.wikipedia.org/wiki/Aconcagua'],
      ['hg14', 'Vilket afrikanskt land har flest invånare?', ['Egypten', 'Nigeria', 'Etiopien'], 1, 'https://en.wikipedia.org/wiki/Demographics_of_Africa'],
      ['hg15', 'Vilken stad är Turkiets huvudstad?', ['Ankara', 'Istanbul', 'Izmir'], 0, 'https://en.wikipedia.org/wiki/Ankara'],
      ['hg16', 'Vilken stad är Nya Zeelands huvudstad?', ['Auckland', 'Christchurch', 'Wellington'], 2, 'https://en.wikipedia.org/wiki/Wellington'],
      ['hg17', 'Vilken sjö ligger lägst belägen på land?', ['Kaspiska havet', 'Döda havet', 'Bajkalsjön'], 1, 'https://en.wikipedia.org/wiki/Dead_Sea'],
      ['hg18', 'I vilket land ligger Kilimanjaro?', ['Kenya', 'Uganda', 'Tanzania'], 2, 'https://en.wikipedia.org/wiki/Mount_Kilimanjaro'],
      ['hg19', 'Vilken är världens största insjö till ytan?', ['Överstesjön', 'Kaspiska havet', 'Victoriasjön'], 1, 'https://en.wikipedia.org/wiki/Caspian_Sea'],
      ['hg20', 'I vilket land ligger staden Timbuktu?', ['Mali', 'Niger', 'Mauretanien'], 0, 'https://en.wikipedia.org/wiki/Timbuktu'],
      ['hg21', 'Vilken stad ligger på både den europeiska och den asiatiska sidan av ett sund?', ['Kairo', 'Moskva', 'Istanbul'], 2, 'https://en.wikipedia.org/wiki/Istanbul'],
      ['hg22', 'Vilket land är världens näst största till ytan?', ['Kina', 'Kanada', 'USA'], 1, 'https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_area'],
      ['hg23', 'Vilken är Sveriges djupaste sjö?', ['Vättern', 'Vänern', 'Hornavan'], 2, 'https://sv.wikipedia.org/wiki/Hornavan'],
      ['hg24', 'Vilken stad är Mongoliets huvudstad?', ['Ulan Bator', 'Astana', 'Bisjkek'], 0, 'https://en.wikipedia.org/wiki/Ulaanbaatar'],
      ['hg25', 'Vilket hav ligger mellan Italien och Balkanhalvön?', ['Joniska havet', 'Adriatiska havet', 'Egeiska havet'], 1, 'https://en.wikipedia.org/wiki/Adriatic_Sea'],
      ['hg26', 'Vilken är Sveriges största ö?', ['Öland', 'Orust', 'Gotland'], 2, 'https://sv.wikipedia.org/wiki/Gotland']] }
  };

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const klamp = (v, min, max, f) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : f; };
  const norm = s => String(s == null ? '' : s).normalize('NFC').trim().replace(/^[!#]+/, '').replace(/\s+/g, ' ').toLocaleUpperCase('sv-SE');
  const design = w => DESIGN[w && w.qzDesign] ? w.qzDesign : 'fragerad';
  const tider = w => ({ svar: klamp(w && w.qzTid, 10, 60, 20) * 1000, paus: klamp(w && w.qzPaus, 3, 30, 6) * 1000 });

  // ---------- ren logik (provas utan DOM i tests/quiz.test.js) ----------
  // Egna frågor: en per rad, "Fråga | svar A | svar B | svar C | rätt bokstav".
  function egnaFragor(text) {
    return String(text || '').split(/\r?\n/).map((rad, i) => rad.split('|').map(x => x.trim())).map((d, i) => {
      if (d.length < 5) return null;
      const ratt = BOKSTAVER.indexOf(norm(d[4]));
      if (ratt < 0 || !d[0] || !d[1] || !d[2] || !d[3]) return null;
      return ['e' + i, d[0].slice(0, 140), [d[1], d[2], d[3]].map(x => x.slice(0, 60)), ratt, ''];
    }).filter(Boolean).slice(0, 50);
  }
  function fragor(w) {
    const egna = egnaFragor(w && w.qzEgna);
    if (w && w.qzPaket === 'egna') return egna;
    const p = PAKET[w && w.qzPaket] || PAKET.allman;
    return p.fragor.slice(0, klamp(w && w.qzAntal, 1, 10, p.fragor.length));
  }
  function fro(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function slump(f) { let a = f >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // Svarsalternativen i en bestämd ordning för just den här omgången. Returnerar [{text, ratt}] i visningsordning.
  function alternativ(fraga, start) {
    const r = slump(fro(fraga[0] + '#' + start)), ordning = [0, 1, 2];
    for (let i = 2; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ordning[i], ordning[j]] = [ordning[j], ordning[i]]; }
    return ordning.map(k => ({ text: fraga[2][k], ratt: k === fraga[3] }));
  }
  // Var i tidslinjen är vi? { fas: 'vila'|'fraga'|'svar'|'slut', i, kvar } — bara ur start och klockan.
  function fas(w, start, nu) {
    if (!start) return { fas: 'vila', i: -1, kvar: 0 };
    const n = fragor(w).length, t = tider(w), varv = t.svar + t.paus, gatt = nu - start;
    if (gatt < 0) return { fas: 'vila', i: -1, kvar: 0 };
    const i = Math.floor(gatt / varv);
    if (i >= n) return { fas: 'slut', i: n - 1, kvar: 0 };
    const inne = gatt - i * varv;
    return inne < t.svar ? { fas: 'fraga', i, kvar: Math.ceil((t.svar - inne) / 1000) } : { fas: 'svar', i, kvar: 0 };
  }
  // Vad en chattrad betyder: { start } (moderatorns !quiz), { svar: 0..2 } eller null.
  function tolka(e) {
    const text = norm(e && (e.comment || e.text || ''));
    if (!text) return null;
    if ((e.isModerator || e.isHost) && /^(QUIZ|STARTA QUIZ)$/.test(text)) return { start: true };
    const k = BOKSTAVER.indexOf(text);
    return k >= 0 ? { svar: k } : null;
  }

  // ---------- läget per widget ----------
  const LAGE = new Map();   // id → { start, svar: {i: {uid: k}}, namn: {uid: namn} }
  const widgetar = () => { try { return (typeof state !== 'undefined' && state && Array.isArray(state.widgets)) ? state.widgets.filter(w => w && w.type === TYP) : []; } catch (_) { return []; } };
  function lage(w) {
    const id = String(w.id);
    let s = LAGE.get(id);
    if (!s) {
      s = { start: 0, svar: {}, namn: {} };
      try { const sp = JSON.parse(localStorage.getItem(LAGRING + id) || 'null'); if (sp && Number.isFinite(sp.start)) { s.start = sp.start; s.svar = sp.svar || {}; s.namn = sp.namn || {}; } } catch (_) {}
      LAGE.set(id, s);
    }
    return s;
  }
  function spara(w) { const s = LAGE.get(String(w.id)); if (!s) return; try { localStorage.setItem(LAGRING + w.id, JSON.stringify(s)); } catch (_) {} }
  // Poängen: frågor som är rättade (fas svar/slut efter dem), rätt svar ger qzPoang.
  function poang(w, nu) {
    const s = lage(w), f = fas(w, s.start, nu), lista = fragor(w), p = klamp(w.qzPoang, 1, 1000, 100), ut = {};
    for (let i = 0; i < lista.length; i++) {
      const rattad = f.fas === 'slut' || i < f.i || (i === f.i && f.fas === 'svar');
      if (!rattad) break;
      const alt = alternativ(lista[i], s.start), rattK = alt.findIndex(a => a.ratt);
      for (const [uid, k] of Object.entries(s.svar[i] || {})) if (k === rattK) ut[uid] = (ut[uid] || 0) + p;
    }
    return Object.entries(ut).map(([uid, p]) => ({ uid, namn: s.namn[uid] || 'Tittare', p })).sort((a, b) => b.p - a.p || a.namn.localeCompare(b.namn, 'sv'));
  }
  function starta(w, at) { const s = lage(w); s.start = Number(at) || Date.now(); s.svar = {}; s.namn = {}; spara(w); ritaOm(); }
  function nollstall(w) { const s = lage(w); s.start = 0; s.svar = {}; s.namn = {}; spara(w); ritaOm(); }
  // En chattrad mot en widget, bedömd på radens egen tid. Returnerar vad som hände.
  function hantera(w, e, nu) {
    const t = tolka(e), at = Number(e && e.at) || nu || Date.now();
    if (!t) return null;
    if (t.start) { const f = fas(w, lage(w).start, at); if (f.fas === 'fraga' || f.fas === 'svar') return null; starta(w, at); return 'start'; }
    const s = lage(w), f = fas(w, s.start, at);
    if (f.fas !== 'fraga') return null;
    const uid = String(e.userId || e.username || '');
    if (!uid) return null;
    const svar = s.svar[f.i] || (s.svar[f.i] = {});
    if (uid in svar) return 'redan';
    svar[uid] = t.svar;
    s.namn[uid] = String(e.nickname || e.username || 'Tittare').slice(0, 40);
    spara(w);
    return 'svar';
  }
  // I OBS RITAS BARA DEN HÄR WIDGETENS EGNA NODER OM — ALDRIG HELA LAYOUTEN (2026-11-09).
  // render() bygger om varje widget i layouten. Under en sändning rev det allt annat som just spelade
  // (uppmätt med Match 1 vs 1, som gjorde samma sak varje sekund: Battle MVP syntes 0,8 s i stället
  // för 10 s och Top Gifts gåvovideo kom aldrig igång). I overlayn finns ingen panel att bygga om, så
  // där skrivs widgetens egen nod om med wh() — samma mönster som triggerBattleMvp i media.js.
  // I studion är det render() som förut: där ska panelen och katalogen följa med.
  function ritaEgna() {
    if (typeof wh !== 'function') return false;
    const noder = [...document.querySelectorAll('.widget[data-id]')];
    let alla = true;
    for (const w of widgetar()) {
      if (w.hidden) continue;
      const mina = noder.filter(n => n.dataset.id === String(w.id));
      if (!mina.length) { alla = false; continue; }
      const html = wh(w);
      for (const n of mina) n.outerHTML = html;
    }
    return alla;
  }
  const ritaOm = () => { try { if (OVERLAY && ritaEgna()) return; if (typeof render === 'function') render(); } catch (_) {} };

  // ---------- render ----------
  let STILLA = false;
  const oldWh = wh;
  wh = function (w) {
    if (!w || w.type !== TYP) return oldWh(w);
    const s = lage(w), nu = Date.now(), lista = fragor(w);
    let f = STILLA ? { fas: 'fraga', i: 0, kvar: tider(w).svar / 1000 } : fas(w, s.start, nu);
    const visa = f.fas === 'vila' ? (OVERLAY ? null : { fas: 'vila', i: 0 }) : f;
    const valt = !OVERLAY && typeof selected !== 'undefined' && selected === w.id;
    const skala = klamp(w.widgetScale, 0.1, 5, 1) * (klamp(w.width, 180, 900, 300) / 300);
    const kropp = (() => {
      if (!lista.length) return '<div class="qz-fraga">Inga frågor ännu</div><div class="qz-tips">Välj ett paket eller skriv egna frågor i panelen.</div>';
      if (!visa) return '';
      if (visa.fas === 'slut') {
        const topp = poang(w, nu).slice(0, 3);
        return `<div class="qz-fraga">Slutställning</div>` + (topp.length ? `<ol class="qz-topp">${topp.map(t => `<li><span>${esc(t.namn)}</span><b>${t.p}</b></li>`).join('')}</ol>` : '<div class="qz-tips">Ingen svarade rätt den här gången.</div>');
      }
      const fr = lista[Math.max(0, visa.i)], alt = alternativ(fr, s.start || 0), rattad = visa.fas === 'svar';
      const antal = Object.keys(s.svar[visa.i] || {}).length;
      return `<div class="qz-fraga">${esc(fr[1])}</div><div class="qz-alt">${alt.map((a, k) => `<div class="qz-rad${rattad ? (a.ratt ? ' qz-ratt' : ' qz-fel') : ''}"><b>${BOKSTAVER[k]}</b><span>${esc(a.text)}</span></div>`).join('')}</div>`
        + `<div class="qz-tips">${visa.fas === 'vila' ? 'En moderator skriver !quiz i chatten för att starta' : rattad ? 'Rätt svar: ' + BOKSTAVER[alt.findIndex(a => a.ratt)] : 'Skriv A, B eller C · ett svar per person'}${visa.fas !== 'vila' ? ' · ' + antal + ' svar' : ''}</div>`;
    })();
    const topp = visa && visa.fas !== 'slut' && visa.fas !== 'vila' ? poang(w, nu).slice(0, 1) : [];
    return `<div class="widget vyra-quiz qz-${design(w)}${visa ? '' : ' qz-dold'}${valt ? ' selected' : ''}" data-id="${esc(w.id)}" style="left:${Number(w.x) || 0}px;top:${Number(w.y) || 0}px;zoom:${skala.toFixed(3)};z-index:${Number(w.layer) || 1}">`
      + `<div class="qz-kort"><div class="qz-topprad"><span>${visa && visa.fas !== 'slut' && visa.fas !== 'vila' ? 'FRÅGA ' + (visa.i + 1) + ' / ' + lista.length : esc(String(w.qzRubrik == null ? 'QUIZ' : w.qzRubrik).slice(0, 24) || 'QUIZ')}</span>`
      + `<span class="qz-klocka">${visa && visa.fas === 'fraga' ? visa.kvar + ' s' : visa && visa.fas === 'svar' ? 'RÄTTNING' : visa && visa.fas === 'slut' ? 'KLART' : 'SVARA I CHATTEN'}</span></div>`
      + kropp + (topp.length ? `<div class="qz-ledare">Leder: ${esc(topp[0].namn)} · ${topp[0].p}</div>` : '') + `</div>`
      + (valt ? '<span class="resize-handle">↘</span>' : '') + '</div>';
  };
  // Klockan: rita om varje sekund medan en omgång pågår (bara då).
  let senastFas = '';
  setInterval(() => {
    if (STILLA) return;
    const nu = Date.now();
    const aktiv = widgetar().filter(w => !w.hidden && lage(w).start && fas(w, lage(w).start, nu).fas !== 'vila');
    const nyckel = aktiv.map(w => { const f = fas(w, lage(w).start, nu); return w.id + f.fas + f.i + f.kvar; }).join('|');
    if (nyckel !== senastFas) { senastFas = nyckel; if (aktiv.length) ritaOm(); }
  }, 500);

  // ---------- chatten ----------
  window.addEventListener('vyra-live-event', ev => {
    const e = ev && ev.detail;
    if (!e) return;
    const typ = String(e.type || '').toLowerCase();
    if (typ !== 'chat' && typ !== 'chatcommand') return;
    const at = Number(e.at || (e.timestamp && Date.parse(e.timestamp)));
    if (Number.isFinite(at) && at > 0 && Date.now() - at > FARSKT_MS) return;
    for (const w of widgetar()) if (!w.hidden) { try { if (hantera(w, e, Date.now())) ritaOm(); } catch (_) {} }
  });

  // ---------- panelen ----------
  const oldProps = props;
  props = function () {
    const w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
    if (!w || w.type !== TYP) return oldProps();
    const lista = fragor(w), d = design(w);
    const paket = w.qzPaket === 'egna' ? 'egna' : PAKET[w.qzPaket] ? w.qzPaket : 'allman';
    return `<h3>QUIZ</h3><div class="template-badge">CHATTEN SVARAR A, B ELLER C · LIVE</div><div hidden><input id="pt" value="Quiz"><input id="pv" value=""></div>`
      + `<div class="property-group"><h4>FRÅGORNA</h4><label>Paket<select id="qzPaket">${Object.entries(PAKET).map(([k, p]) => `<option value="${k}"${k === paket ? ' selected' : ''}>${esc(p.namn)} · ${p.fragor.length} frågor</option>`).join('')}<option value="egna"${paket === 'egna' ? ' selected' : ''}>Egna frågor</option></select></label>`
      + `<label>Egna frågor (en per rad: Fråga | A | B | C | rätt bokstav)<textarea id="qzEgna" rows="4" placeholder="Vilken färg har himlen? | Grön | Blå | Röd | B">${esc(w.qzEgna || '')}</textarea></label>`
      + `<small>${lista.length} frågor i omgången.${paket !== 'egna' ? ' Källor finns för startpaketens frågor.' : ''}</small></div>`
      + `<div class="property-group"><h4>OMGÅNGEN</h4><label>Svarstid per fråga (sekunder)<input id="qzTid" type="number" min="10" max="60" value="${tider(w).svar / 1000}"></label>`
      + `<label>Paus efter rättningen (sekunder)<input id="qzPaus" type="number" min="3" max="30" value="${tider(w).paus / 1000}"></label>`
      + `<label>Poäng för rätt svar<input id="qzPoang" type="number" min="1" max="1000" value="${klamp(w.qzPoang, 1, 1000, 100)}"></label>`
      + `<small>En moderator startar med !quiz i chatten. Alla som svarar A, B eller C är med — ingen gåva krävs, inga priser. Ett svar per person och fråga; det första räknas.</small></div>`
      + `<div class="property-group"><h4>DESIGN</h4><label>Design<select id="qzDesign">${DESIGNER.map(x => `<option value="${x[0]}"${x[0] === d ? ' selected' : ''}>${esc(x[1])}</option>`).join('')}</select></label><label>Rubrik<input id="qzRubrik" maxlength="24" value="${esc(w.qzRubrik == null ? 'QUIZ' : w.qzRubrik)}"></label></div>`
      + `<div class="property-group"><h4>TESTA</h4><button type="button" id="qzStarta">▶ Starta här</button> <button type="button" id="qzTestsvar">Låt testtittare svara</button> <button type="button" id="qzNoll">Nollställ</button><small>Bara här i studion. I OBS startar en moderator med !quiz.</small></div>`
      + `<div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="${Number(w.x) || 0}"></label><label>Y<input id="propY" type="number" value="${Number(w.y) || 0}"></label><label>Bredd<input id="propWidth" type="number" value="${klamp(w.width, 180, 900, 300)}"></label><label>Lager<input id="propLayer" type="number" value="${Number(w.layer) || 1}"></label></div></div>`
      + `<button class="delete" id="del">Ta bort</button>`;
  };

  // ---------- katalogen ----------
  function katalog() {
    const cat = document.querySelector('.widget-catalog');
    if (!cat || cat.querySelector('[data-qz-skapa]')) return;
    const sek = document.createElement('section');
    sek.className = 'qz-katalog';
    sek.innerHTML = '<h4>QUIZ</h4>';
    DESIGNER.forEach(([id, namn, text]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.qzSkapa = id; b.dataset.catalogKey = 'catalog:vyrapaket:quiz:' + id;
      b.innerHTML = `<span><b>Quiz · ${esc(namn)}</b><small>${esc(text)}</small></span>`;
      b.onclick = () => {
        if (!window.VyraWidgets || typeof state === 'undefined') return;
        const w = window.VyraWidgets.create('catalog:vyrapaket:quiz:' + id);
        state.widgets.push(w); selected = w.id;
        if (typeof save === 'function') save(); ritaOm();
        if (typeof toast === 'function') toast('Quiz · ' + namn + ' tillagd');
      };
      sek.append(b);
    });
    cat.append(sek);
  }

  const oldBind = bind;
  bind = function () {
    oldBind();
    if (typeof view === 'undefined' || (view !== 'editor' && view !== 'overlay')) return;
    katalog();
    const w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
    if (!w || w.type !== TYP) return;
    const q = s => document.querySelector(s);
    const satt = (falt, v) => { w[falt] = v; if (typeof save === 'function') save(); ritaOm(); };
    let el;
    if ((el = q('#qzPaket'))) el.onchange = e => satt('qzPaket', e.target.value === 'egna' || PAKET[e.target.value] ? e.target.value : 'allman');
    if ((el = q('#qzEgna'))) el.onchange = e => satt('qzEgna', String(e.target.value || '').slice(0, 10000));
    if ((el = q('#qzTid'))) el.onchange = e => satt('qzTid', klamp(Math.round(+e.target.value), 10, 60, 20));
    if ((el = q('#qzPaus'))) el.onchange = e => satt('qzPaus', klamp(Math.round(+e.target.value), 3, 30, 6));
    if ((el = q('#qzPoang'))) el.onchange = e => satt('qzPoang', klamp(Math.round(+e.target.value), 1, 1000, 100));
    if ((el = q('#qzDesign'))) el.onchange = e => satt('qzDesign', DESIGN[e.target.value] ? e.target.value : 'fragerad');
    if ((el = q('#qzRubrik'))) el.onchange = e => satt('qzRubrik', String(e.target.value || '').slice(0, 24));
    if ((el = q('#qzStarta'))) el.onclick = () => starta(w, Date.now());
    if ((el = q('#qzTestsvar'))) el.onclick = () => { ['A', 'B', 'C'].forEach((b, i) => hantera(w, { type: 'chat', userId: 'test-' + i, nickname: 'Testtittare ' + (i + 1), comment: b, at: Date.now() }, Date.now())); ritaOm(); };
    if ((el = q('#qzNoll'))) el.onclick = () => nollstall(w);
  };

  // Stillbild för pixelvakten: första frågan öppen, full tid kvar, inga svar.
  function stilla() { STILLA = true; for (const w of widgetar()) { const s = lage(w); s.start = 1; s.svar = {}; s.namn = {}; } ritaOm(); return document.querySelectorAll('.vyra-quiz').length; }

  window.VyraQuiz = Object.freeze({ typ: TYP, DESIGNER, PAKET, egnaFragor, fragor, alternativ, fas, tolka, hantera, poang, lage, starta, nollstall, stilla, _lage: LAGE });
  ritaOm();
})();
