'use strict';
// GRANSKADE SEEDNINGSKONTRAKT — vad en komplett gåvokatalog SKA innehålla, per region.
//
// VARFÖR FILEN FINNS. Kontrolltalen låg tidigare i anropets kropp, alltså i samma payload som
// gåvolistan. Då är de inte oberoende: den som skickar en trunkerad lista skickar matchande sänkta
// tal och får seedningen markerad `klar`. Ett kontrolltal som följer med det den ska kontrollera
// kontrollerar ingenting.
//
// Här går talen i stället genom kodgranskning och CI innan de kan användas. Att ändra vad som
// räknas som en komplett katalog kräver en pull request — inte ett HTTP-anrop.
//
// HUR MAN LÄGGER TILL EN REGION. Mät först: hämta `webcast/gift/list/` från en INLOGGAD session i
// den regionen, räkna poster, distinkta id och poster utan id, och skriv in dem här tillsammans
// med datum och källa. Gissa aldrig. En region utan kontrakt kan inte seedas, och det är avsikten.

const KONTRAKT = {
  // OMMATT 2026-08-30 (senare samma dag) mot en INLOGGAD SE-session utan rumskontext:
  //   775 poster, 771 distinkta id (fyra id forekommer tva ganger), 0 poster utan id.
  //
  // TIDIGARE VARDE: 783/779/0, matt 2026-08-29 och digestat 2026-08-30. Listan drev alltsa med
  // atta poster inom ett dygn. Det ar inte ett fel i kedjan — spärren fangade det och vagrade
  // seeda, vilket ar precis vad den finns for.
  //
  // MATT KONTEXT, och den maste stå har. Utan den gar vardet inte att reproducera:
  //   endpoint      webcast/gift/list/?aid=1988
  //   konto         david.yakoop88@gmail.com, inloggad TikTok-session
  //   rumskontext   INGEN — anropet gjordes utan room_id
  //   region        appContext SE. Svaret bar inget eget regionfalt (`data.region` saknas helt).
  //
  // ⚠️ RUMSKONTEXT AR INTE EN OVERMANGD. Uppmatt 2026-08-30 mot ett aktivt live-rum:
  //   utan rum   775 poster / 771 unika
  //   med rum    771 poster / 766 unika  — 4 gavor TILLKOM, 9 FOLL BORT
  // Rumsvyn ar alltsa en ANNAN vy, inte en storre. Att lagga till room_id for att "fa med allt"
  // gor listan mindre och byter ut medlemmar. Mat alltid utan rumskontext for det har kontraktet.
  //
  // `is_full_gift_data` var false i bada matningarna — TikTok sager sjalv att svaret ar
  // kontextuellt, vilket ar precis darfor talen binds till EN region och en dokumenterad kontext.
  SE: {
    poster: 775,
    unikaId: 771,
    utanId: 0,
    // MEDLEMSKAPSBEVIS — SHA-256 over en sorterad multimangd av alla 775 normaliserade id.
    //
    // Kontrolltalen bevisar bara ANTAL. En lista kan ha 775/771/0 och anda sakna ett id ur den
    // observerade katalogen och bara ett annat i stallet — digesten ar det som fangar det.
    //
    // BERAKNINGEN, identisk pa bada sidor: normalisera varje id som servern gor
    // (`String(v ?? '').slice(0,160)`, tomma bort), sortera ALLA 775 inklusive dubbletter, sla
    // ihop med radbrytning (radmatning, teckenkod 10), SHA-256, hex.
    //
    // KORSKONTROLLERAD 2026-08-30 pa en syntetisk lista som traffar alla fyra
    // normaliseringsfallorna — sortering, tomt id, `gift_id`-reserven och tal-till-strang.
    // Webblasarens berakning och serverns Gavokatalog.digestAvPoster gav BITIDENTISKT varde:
    //   4d1540ac7b1f92ad e48b115ee2f0d345 5fda5aa1c3b14653 00a46220e6bcd7a2
    //
    // Att andra det har vardet ar att andra vad som raknas som en komplett SE-katalog. Det kraver
    // en granskad PR — aldrig ett anrop.
    digest: 'b869f2617c99b43f0c1798f3823f8d7eb00619505f39b7120c70c82ebbfdc834',
    matt_at: '2026-08-30',
    kalla: 'webcast/gift/list/?aid=1988 fran inloggad SE-session, UTAN room_id (rumskontext ger en annan mangd)'
  }
};

// Slår upp kontraktet på EXAKT regionkod. Ingen normalisering: `se` ger null, inte `SE`. En
// anropare som skickar fel form har troligen fel källa också, och ett tyst normaliserat uppslag
// hade dolt det.
function forRegion(region) {
  if (typeof region !== 'string' || !/^[A-Z]{2}$/.test(region)) return null;
  const k = KONTRAKT[region];
  if (!k) return null;
  return { poster: k.poster, unikaId: k.unikaId, utanId: k.utanId,
           digest: k.digest, matt_at: k.matt_at, kalla: k.kalla };
}

const regioner = () => Object.keys(KONTRAKT).sort();

module.exports = { for: forRegion, forRegion, regioner };
