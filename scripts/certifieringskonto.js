#!/usr/bin/env node
// FRIEXEMPLAR AV PREMIUM till ett konto — utan Stripe, utan kort.
//
// Skrivet för Microsoft Store-certifieringen. En testare hos Microsoft måste kunna använda appen
// fullt ut, men VYRA Desktop släpper bara in konton med aktivt Premium (electron-app/main.js:128).
// Alternativen var sämre:
//
//   isPlatformAdmin  — main.js:122 släpper igenom utan betalning, MEN flaggan öppnar också
//                      /api/admin/support/tickets, som lämnar ut ANDRA ANVÄNDARES e-postadresser.
//                      Att lösa ett certifieringsproblem genom att ge en främling den nyckeln är
//                      att byta bort ett dataskyddsproblem mot ett certifieringsproblem.
//   Stripes provperiod — tre dygn. Certifieringen tar dagar till veckor, så provperioden hinner
//                      löpa ut MITT UNDER granskningen och testaren möter "Kontot saknar aktivt
//                      Premium". Vi hade fällt oss själva.
//
// Den här vägen ger exakt den upplevelse en betalande kund har — vilket också är bättre
// certifieringstäckning — utan förhöjd behörighet och utan något som tar slut.
//
// VARFÖR DET RÄCKER ATT SKRIVA I DATABASEN: server/billing.js:29 `entitlement()` läser BARA
// subscriptions-tabellen och ringer aldrig Stripe. `stripe_subscription_id` får vara NULL
// (kolumnen är UNIQUE, och Postgres tillåter flera NULL).
//
// Kräver DATABASE_URL i miljön. Skriptet letar aldrig upp produktionsuppgifter själv:
//   railway run --service <api> -- node scripts/certifieringskonto.js <e-post> --pa --dry-run
//
// Användning:
//   node scripts/certifieringskonto.js <e-post>                 visa läget, ändra ingenting
//   node scripts/certifieringskonto.js <e-post> --pa            ge Premium
//   node scripts/certifieringskonto.js <e-post> --av            ta tillbaka Premium
//
// Flaggor:
//   --dry-run          visa exakt vad som skulle ändras, utan att ändra något
//   --operator <namn>  namn som skrivs i audit-loggen; annars OS-användaren
'use strict';

const { pool } = require('../server/db');
const { normalizeEmail } = require('../server/security');
const os = require('os');

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

function operatorInfo(explicit) {
  return { operator: explicit || os.userInfo().username || 'okänd', hostname: os.hostname() };
}

// Best-effort audit-spår, samma tabell som appens egna händelser men under ett eget action-namn så
// att en kompad plan aldrig kan förväxlas med en betald. Får aldrig blockera själva ändringen: ett
// skript som körs via `railway run` har ingen inloggad appanvändare, så actor_user_id lämnas NULL.
async function recordAudit(workspaceId, action, metadata) {
  try {
    await pool.query(
      `INSERT INTO audit_log(workspace_id, actor_user_id, action, target_type, target_id, metadata)
       VALUES($1, NULL, $2, 'subscription', $3, $4)`,
      [workspaceId, action, workspaceId, metadata]
    );
  } catch (error) {
    console.warn(`[certifieringskonto] Kunde inte skriva audit-loggen (ändringen gick ändå igenom): ${error.message}`);
  }
}

// ARBETSYTAN MÅSTE VARA DEN APPEN TITTAR PÅ. Skrivbordssonden läser `me.body.workspaces[0]`, och
// /api/auth/me sorterar på w.created_at (server/index.js:341). Ger man Premium till någon ANNAN av
// användarens arbetsytor händer ingenting alls — appen frågar om den första och får "free".
// Sorteringen här är därför en kopia av appens, med flit.
async function lasKonto(email) {
  const { rows: users } = await pool.query(
    `SELECT id, email, display_name, disabled_at, email_verified_at, mfa_enabled_at, is_platform_admin
     FROM users WHERE email = $1`,
    [email]
  );
  if (!users[0]) return null;
  const user = users[0];

  const { rows: workspaces } = await pool.query(
    `SELECT w.id, w.name, w.created_at, m.role
     FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
     WHERE m.user_id = $1 ORDER BY w.created_at`,
    [user.id]
  );

  const forsta = workspaces[0] || null;
  let sub = null;
  if (forsta) {
    const { rows } = await pool.query(
      `SELECT plan, status, stripe_subscription_id, current_period_end, cancel_at_period_end
       FROM subscriptions WHERE workspace_id = $1`,
      [forsta.id]
    );
    sub = rows[0] || null;
  }
  return { user, workspaces, forsta, sub };
}

function beskriv({ user, workspaces, forsta, sub }) {
  const rader = [
    `  e-post:            ${user.email}`,
    `  visningsnamn:      ${user.display_name || '(inget)'}`,
    `  konto avstängt:    ${user.disabled_at ? 'JA — ' + user.disabled_at.toISOString() : 'nej'}`,
    `  e-post verifierad: ${user.email_verified_at ? 'ja' : 'NEJ'}`,
    `  tvåfaktor:         ${user.mfa_enabled_at ? 'PÅ' : 'av'}`,
    `  plattformsadmin:   ${user.is_platform_admin ? 'JA' : 'nej'}`,
    `  arbetsytor:        ${workspaces.length}`,
  ];
  if (forsta) rader.push(`  appens arbetsyta:  ${forsta.name} (${forsta.id})`);
  rader.push(sub
    ? `  abonnemang:        plan=${sub.plan} status=${sub.status} stripe=${sub.stripe_subscription_id || '(inget — kompad)'}`
    : '  abonnemang:        (ingen rad)');
  return rader.join('\n');
}

// Hinder som gör kontot oanvändbart för en certifieringstestare, oavsett vad prenumerationen säger.
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
// slutkod. Bara 'ge' och 'ta' skriver något.
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

async function satt(email, flags) {
  const konto = await lasKonto(email);
  if (!konto) {
    console.log(`Ingen användare med e-postadressen ${email}.`);
    process.exitCode = 1;
    return;
  }

  console.log('Konto:');
  console.log(beskriv(konto));

  const hinder = hinderForTestare(konto);
  if (hinder.length) {
    console.log('\nHINDER FÖR EN CERTIFIERINGSTESTARE:');
    hinder.forEach(h => console.log(`  - ${h}`));
  }

  const vad = beslut(konto, flags);
  if (vad.atgard === 'visa' || vad.atgard === 'stopp') {
    console.log('\n' + vad.text);
    if (vad.kod) process.exitCode = vad.kod;
    return;
  }

  const { forsta } = konto;

  if (vad.atgard === 'ge') {
    const slutar = new Date(Date.now() + KOMPAD_TID_DAGAR * 86400000);
    if (flags.dryRun) {
      console.log(`\n[--dry-run] Skulle ge "${forsta.name}" plan=premium status=active till ${slutar.toISOString()}.`);
      console.log('Inget ändrades.');
      return;
    }
    await pool.query(
      `INSERT INTO subscriptions(workspace_id, stripe_subscription_id, plan, status, current_period_end, updated_at)
       VALUES($1, NULL, 'premium', 'active', $2, now())
       ON CONFLICT(workspace_id) DO UPDATE
         SET plan='premium', status='active', current_period_end=EXCLUDED.current_period_end, updated_at=now()`,
      [forsta.id, slutar]
    );
    const { operator, hostname } = operatorInfo(flags.operator);
    await recordAudit(forsta.id, 'subscription_comped_cli', {
      operator, hostname, source: 'scripts/certifieringskonto.js',
      email: konto.user.email, skal: 'Microsoft Store-certifiering', till: slutar.toISOString(),
    });
    // DATUMET ÄR DOKUMENTATION, INTE EN SPÄRR. entitlement() (server/billing.js:29) hämtar
    // current_period_end men jämför den ALDRIG mot now() — bara `status` avgör. För Stripe-rader
    // gör det inget: webhooken flyttar status till canceled när perioden tar slut. En kompad rad
    // har ingen sådan motpart, och ingenting i systemet städar den. Att skriva "Premium till <datum>"
    // hade därför varit ett löfte som inte infrias: raden blir kvar för alltid.
    console.log(`\n✓ "${forsta.name}" har nu Premium. (${operator}@${hostname})`);
    console.log(`  Slutdatum i raden: ${slutar.toISOString()} — men det är BARA dokumentation.`);
    console.log('  Premium TAR INTE SLUT av sig självt. Det gäller tills någon kör:');
    console.log('    node scripts/certifieringskonto.js ' + email + ' --av');
    return;
  }

  if (flags.dryRun) {
    console.log(`\n[--dry-run] Skulle sätta "${forsta.name}" till plan=free status=inactive. Inget ändrades.`);
    return;
  }
  await pool.query(
    `UPDATE subscriptions SET plan='free', status='inactive', current_period_end=NULL, updated_at=now()
     WHERE workspace_id=$1 AND stripe_subscription_id IS NULL`,
    [forsta.id]
  );
  const { operator, hostname } = operatorInfo(flags.operator);
  await recordAudit(forsta.id, 'subscription_uncomped_cli', {
    operator, hostname, source: 'scripts/certifieringskonto.js', email: konto.user.email,
  });
  console.log(`\n✓ Premium borttaget från "${forsta.name}". (${operator}@${hostname})`);
}

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  if (!positional[0]) {
    console.log('Användning: node scripts/certifieringskonto.js <e-post> [--pa|--av] [--dry-run] [--operator "Namn"]');
    process.exitCode = 2;
    return;
  }
  if (flags.operatorSaknasVarde) {
    console.log('--operator kräver ett namn efter sig. Skrev du "--operator --dry-run" hade');
    console.log('torrkörningen stängts av utan att säga något. Ange namnet: --operator "David".');
    process.exitCode = 2;
    return;
  }
  let email;
  try {
    email = normalizeEmail(positional[0]);
  } catch {
    console.log(`"${positional[0]}" är ingen giltig e-postadress.`);
    process.exitCode = 2;
    return;
  }
  await satt(email, flags);
}

// Provet laddar modulen för att komma åt `beslut` och `hinderForTestare`. Utan den här grinden
// skulle bara `require()` starta en körning mot DATABASE_URL — alltså mot produktion, om skriptet
// råkar laddas i ett skal där Railway har injicerat miljön.
if (require.main === module) {
  main()
    .catch(error => { console.error(error.stack || String(error)); process.exitCode = 1 })
    .finally(() => pool.end().catch(() => {}));
}

module.exports = { beslut, hinderForTestare, parseArgs, KOMPAD_TID_DAGAR };
