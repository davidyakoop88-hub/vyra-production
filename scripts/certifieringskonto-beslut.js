'use strict';
// REN BESLUTSLOGIK, UTAN DATABAS.
//
// Delarna har lag forst i certifieringskonto.js, som kraver ../server/db och darmed `pg`. Provet
// ligger i ROTENS svit, och roten har inte `pg` — det ar ett beroende i server/. Lokalt syntes det
// inte, for en arbetskopia med server/node_modules installerat loser det anda. I CI foll provet pa
// 'Cannot find module pg' innan en enda assertion hunnit kora.
//
// Fyra paket = fyra provsviter. Ett prov i tests/ far bara bero pa rotens beroenden.
// Beslutet behovde aldrig databasen — det tar emot ett redan last konto och svarar vad som ska handa.

const KOMPAD_TID_DAGAR = 365;

function parseArgs(argv) {
  const args = { flags: {}, positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') args.flags.dryRun = true;
    else if (arg === '--pa' || arg === '--på') args.flags.pa = true;
    else if (arg === '--av') args.flags.av = true;
    // `--operator` far ALDRIG sluka nasta argument blint. Skrivs `--operator --dry-run` skulle en
    // naiv `argv[++i]` gora "--dry-run" till operatorsnamn OCH ata upp flaggan — torrkorningen
    // stangs av tyst och skriptet skriver skarpt mot produktion, fast anvandaren bad om motsatsen.
    else if (arg === '--operator') {
      const varde = argv[i + 1];
      if (varde === undefined || varde.startsWith('--')) {
        args.flags.operatorSaknasVarde = true;
      } else { args.flags.operator = varde; i++ }
    }
    else args.positional.push(arg);
  }
  return args;
}

function hinderForTestare({ user, forsta }) {
  const hinder = [];
  if (user.disabled_at) hinder.push('Kontot är avstängt — ingen kan logga in på det.');
  if (!user.email_verified_at) {
    // GRINDEN SLÄPPER IGENOM, SEDAN VÄGRAR ALLT SPARA. server/index.js:374 svarar 403 på VARJE
    // icke-GET utan verifierad e-post. Grinden i main.js gör bara GET (/api/auth/me och
    // billing-rutten), så den märker ingenting — testaren kommer in i en Studio där overlays inte
    // går att spara, OBS-länkar inte går att skapa och inget testevent kan skickas.
    hinder.push(
      'E-POSTEN ÄR INTE VERIFIERAD. Grinden i main.js gör bara GET och märker det inte, men\n'
      + '    server/index.js:374 svarar 403 "Verifiera din e-postadress innan du sparar eller\n'
      + '    publicerar" på VARJE POST/PUT/DELETE. Testaren får en app som öppnas men vägrar spara.\n'
      + '    Klicka länken i verifieringsmejlet innan kontot lämnas över.');
  }
  if (user.mfa_enabled_at) {
    hinder.push(
      'TVÅFAKTOR ÄR PÅ. main.js:118 svarar {reason:"mfa", wait:true}, vilket betyder att appen\n'
      + '    fortsätter polla i TYSTHET utan felruta. Testaren ser en app som hänger efter\n'
      + '    inloggning och kan omöjligt gissa varför. Stäng av tvåfaktorn på det här kontot.');
  }
  if (!forsta) {
    hinder.push(
      'Kontot har ingen arbetsyta. main.js stoppar på "no-workspace" och visar\n'
      + '    "Kontot har ingen arbetsyta". Logga in på vyralive.app och skapa en overlay först.');
  }
  return hinder;
}

// BESLUTET ÄR EN REN FUNKTION, med flit. Två av spärrarna här kan göra tyst skada mot produktion —
// att skriva över ett betalt Stripe-abonnemang, och att sätta Premium på fel arbetsyta — och båda
// måste gå att bevisa utan en databas. Ligger de inbakade i en async-funktion som pratar med `pool`
// kan de bara provas mot riktig Postgres, alltså i praktiken inte alls.
//
// Returnerar { atgard, kod, text } där `atgard` är vad som ska hända och `kod` är processens

function beslut(konto, flags) {
  if (flags.pa && flags.av) return { atgard: 'stopp', kod: 2, text: '--pa och --av samtidigt går inte.' };
  if (!flags.pa && !flags.av) {
    return { atgard: 'visa', kod: 0, text: 'Ingen ändring begärd. Lägg till --pa för att ge Premium, --av för att ta tillbaka.' };
  }

  const { forsta, sub } = konto;
  if (!forsta) {
    return { atgard: 'stopp', kod: 1, text: 'Avbryter: utan arbetsyta finns ingen rad att sätta abonnemanget på.' };
  }

  // RÖR ALDRIG ETT RIKTIGT STRIPE-ABONNEMANG. Att skriva över det skulle få databasen att säga en
  // sak medan Stripe fortsätter fakturera — och nästa webhook skriver ändå tillbaka Stripes bild, så
  // ändringen vore både farlig och verkningslös. Spärren gäller ÅT BÅDA HÅLLEN: `--av` på ett betalt
  // abonnemang skulle stänga av en kund som betalar.
  if (sub && sub.stripe_subscription_id) {
    return {
      atgard: 'stopp', kod: 3,
      text: `Avbryter: arbetsytan har ett RIKTIGT Stripe-abonnemang (${sub.stripe_subscription_id}).\n`
        + 'Det här skriptet rör bara kompade rader. Hantera betalda abonnemang i Stripe.',
    };
  }

  if (flags.pa) {
    if (sub && sub.plan === 'premium' && ['active', 'trialing', 'past_due'].includes(sub.status)) {
      return { atgard: 'visa', kod: 0, text: 'Kontot har redan aktivt Premium. Inget att göra.' };
    }
    return { atgard: 'ge', kod: 0, text: '' };
  }

  if (!sub || sub.plan !== 'premium') {
    return { atgard: 'visa', kod: 0, text: 'Kontot har inget kompat Premium att ta tillbaka.' };
  }
  return { atgard: 'ta', kod: 0, text: '' };
}

module.exports = { beslut, hinderForTestare, parseArgs, KOMPAD_TID_DAGAR };
