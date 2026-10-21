// vyra-sprak-en.js — engelsk ordlista för vyra-sprak.js. Nyckeln är den svenska texten exakt som den
// står på sidan (blanktecken hopslagna), värdet är den engelska. Text som inte står här lämnas på
// svenska. `monster` tar texter med ett värde i (tider, antal).
//
// Steg 1 (2026-10-21): de publika sidorna — index.html, landing-login.js, landing-hamta.js,
// privacy.html, terms.html, status.html och status-client.js — och de serverfel inloggningen visar.
// Namn som ska stå kvar på engelska i båda språken (Top Gifters, Gift Alerts, Action & Event,
// Sound Alerts, TTS Chat …) står inte i ordlistan alls.
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  const text = {
    // ---- index.html: huvud och hjälte -----------------------------------------------------------
    'VYRA — TikTok LIVE, under kontroll': 'VYRA — TikTok LIVE, under control',
    'BYGGD FÖR TIKTOK LIVE': 'BUILT FOR TIKTOK LIVE',
    'som får din': 'that make your',
    'att sticka ut': 'stand out',
    'Top Gifters, Gift Alerts & Leaderboards. Ingen kodning — funkar direkt med OBS, Streamlabs och TikTok Live Studio.':
      'Top Gifters, Gift Alerts & Leaderboards. No coding — works right away with OBS, Streamlabs and TikTok Live Studio.',
    'Top Gifters, Gift Alerts och topplistor för din TikTok Live — direkt i OBS, Streamlabs och TikTok Live Studio. Ingen kodning. 3 dagar gratis, därefter 15 USD/månad.':
      'Top Gifters, Gift Alerts and leaderboards for your TikTok Live — right in OBS, Streamlabs and TikTok Live Studio. No coding. 3 days free, then 15 USD/month.',
    'VYRA — overlays som får din TikTok Live att sticka ut': 'VYRA — overlays that make your TikTok Live stand out',
    'Top Gifters, Gift Alerts och topplistor — direkt i OBS, Streamlabs och TikTok Live Studio. Ingen kodning.':
      'Top Gifters, Gift Alerts and leaderboards — right in OBS, Streamlabs and TikTok Live Studio. No coding.',
    'VYRA — overlays för TikTok Live': 'VYRA — overlays for TikTok Live',

    // ---- inloggningskortet (index.html + landing-login.js) --------------------------------------
    'Logga in eller skapa konto': 'Log in or create an account',
    'Logga in': 'Log in',
    'Skapa konto': 'Create account',
    'Visningsnamn': 'Display name',
    'E-post': 'Email',
    'Lösenord': 'Password',
    'Visa': 'Show',
    'Dölj': 'Hide',
    'Visa lösenord': 'Show password',
    'Minst 12 tecken.': 'At least 12 characters.',
    'Håll mig inloggad': 'Keep me logged in',
    'Glömt lösenord?': 'Forgot password?',
    'Använd inte på en delad dator.': "Don't use on a shared computer.",
    'Efter registreringen skickar vi ett mejl.': "After you sign up we'll send you an email.",
    'Verifiera din e-post': 'Verify your email',
    'med länken i det innan du ansluter TikTok LIVE.': 'with the link in it before you connect TikTok LIVE.',
    'Genom att välja Skapa konto godkänner du': 'By choosing Create account you accept the',
    'användarvillkoren': 'terms of use',
    'och bekräftar att du har läst': 'and confirm that you have read the',
    'integritetspolicyn': 'privacy policy',
    'Tvåstegsverifiering — ange den sexsiffriga koden från din autentiseringsapp.': 'Two-step verification — enter the six-digit code from your authenticator app.',
    'Säkerhetskod': 'Security code',
    'Bekräfta': 'Confirm',
    'Använd en återställningskod': 'Use a recovery code',
    'Återställningskod': 'Recovery code',
    'Ange en av återställningskoderna du sparade när tvåstegsverifieringen slogs på. Varje kod fungerar en gång.':
      'Enter one of the recovery codes you saved when two-step verification was turned on. Each code works once.',
    'Använd koden från appen': 'Use the code from the app',
    'Avbryt och byt konto': 'Cancel and switch account',
    'Har du förlorat både autentiseringsappen och dina återställningskoder?': 'Lost both your authenticator app and your recovery codes?',
    'Kontakta supporten': 'Contact support',
    'från kontots e-postadress.': "from the account's email address.",
    'Skriv din e-postadress. Om kontot finns skickar vi en säker engångslänk för att välja ett nytt lösenord.':
      "Enter your email address. If the account exists, we'll send a secure one-time link to choose a new password.",
    'Skicka länk': 'Send link',
    '← Tillbaka till inloggningen': '← Back to log in',
    'Om kontot finns är länken på väg — kolla din inkorg. Länken kan bara användas en gång.':
      'If the account exists, the link is on its way — check your inbox. The link can only be used once.',
    'Säker inloggning · lösenordet sparas aldrig i webbläsaren': 'Secure login · your password is never stored in the browser',
    'Välkommen in': 'Welcome in',
    'Öppna Studio': 'Open Studio',
    'För många försök. Vänta en stund och försök igen.': 'Too many attempts. Wait a moment and try again.',
    'Servern svarade inte. Försök igen om en stund.': "The server didn't respond. Try again in a moment.",
    'Det gick inte just nu. Försök igen om en stund.': "That didn't work right now. Try again in a moment.",
    'Serverfel': 'Server error',
    // Serverns egna meddelanden som inloggningskortet visar ordagrant.
    'Fel e-post eller lösenord': 'Wrong email or password',
    'Kontot är tillfälligt spärrat efter flera försök. Försök igen senare.': 'The account is temporarily locked after several attempts. Try again later.',
    'Visningsnamn saknas': 'Display name is missing',
    'Kontot finns redan': 'The account already exists',
    'Lösenordet måste vara 12–128 tecken': 'The password must be 12–128 characters',
    'Ogiltig e-postadress': 'Invalid email address',
    'Fel kod': 'Wrong code',
    'Fel säkerhetskod': 'Wrong security code',
    'För många försök — vänta en stund': 'Too many attempts — wait a moment',
    'För många försök': 'Too many attempts',
    'Inte inloggad': 'Not logged in',

    // ---- pris och provperiod ----------------------------------------------------------------------
    '3 dagar gratis att använda': '3 days free to use',
    '/månad': '/month',
    '3 dagar gratis provperiod, därefter 15 USD/månad med automatisk förnyelse.': '3-day free trial, then 15 USD/month with automatic renewal.',
    '3 dagar gratis': '3 days free',
    'Så funkar det': 'How it works',
    'Om provperioden': 'About the trial',
    'Ladda ner appen': 'Download the app',
    'Ladda ner · Microsoft Store': 'Download · Microsoft Store',

    // ---- studiobilden i hjälten (en målad förhandsvisning) ----------------------------------------
    '1 284 tittare': '1,284 viewers',
    'Förhandsvisa': 'Preview',
    'Publicera': 'Publish',
    'Automationer': 'Automations',
    'Testläge': 'Test mode',
    'Mål': 'Goal',
    'Likes & följare': 'Likes & followers',
    'Gåvor & events': 'Gifts & events',
    'Topplista': 'Leaderboard',
    'Live ranking': 'Live ranking',
    'Chatt': 'Chat',
    'Meddelanden': 'Messages',
    'skickade Galaxy': 'sent Galaxy',
    'KVÄLLENS MÅL': "TONIGHT'S GOAL",
    'Vilken grym stream! 🔥': 'What a great stream! 🔥',
    'Nu kör vi!': "Let's go!",
    'INSTÄLLNINGAR': 'SETTINGS',
    'Stil': 'Style',
    'Varaktighet': 'Duration',
    'Visa avatar': 'Show avatar',
    '▶ Testa alert': '▶ Test alert',
    'Inställningar': 'Settings',
    'Profil': 'Profile',

    // ---- så funkar det ----------------------------------------------------------------------------
    'Från widget till OBS i tre steg': 'From widget to OBS in three steps',
    'Ingen kodning och inget att installera för att komma igång — allt sker i webbläsaren.': 'No coding and nothing to install to get started — everything happens in the browser.',
    'Välj widget': 'Pick a widget',
    'Plocka mål, gift alerts, topplistor och effekter ur katalogen under': 'Pick goals, gift alerts, leaderboards and effects from the catalog under',
    'Anpassa': 'Customize',
    'Ändra text, färger och placering, och bestäm i': 'Change text, colors and placement, and decide in',
    'vad som ska hända när någon skickar en gåva.': 'what should happen when someone sends a gift.',
    'Lägg i OBS': 'Add to OBS',
    'Kopiera overlay-länken och lägg den som': 'Copy the overlay link and add it as a',
    'i OBS eller Streamlabs. Det du ändrar i VYRA syns där direkt.': 'in OBS or Streamlabs. What you change in VYRA shows up there right away.',
    '(Windows 10/11) behövs bara för OBS-scenstyrning, Stream Deck utan parkopplingskod och automatisk backup med versionshistorik.':
      '(Windows 10/11) is only needed for OBS scene control, Stream Deck without a pairing code and automatic backup with version history.',

    // ---- provperioden -----------------------------------------------------------------------------
    'Så fungerar provperioden': 'How the trial works',
    'De 3 gratisdagarna börjar när du startar provperioden i appen och godkänner abonnemanget hos PayPal — inte när du skapar kontot. E-posten behöver vara verifierad först.':
      'The 3 free days start when you start the trial in the app and approve the subscription with PayPal — not when you create the account. Your email needs to be verified first.',
    'Du betalar via PayPal, med PayPal-saldo eller kort.': 'You pay through PayPal, with your PayPal balance or a card.',
    'Säger du upp innan provperioden slutar dras ingenting. Annars förnyas Premium automatiskt för 15 USD per månad. Du kan säga upp när som helst, direkt i VYRA.':
      'If you cancel before the trial ends, nothing is charged. Otherwise Premium renews automatically for 15 USD per month. You can cancel at any time, right in VYRA.',
    'Priset debiteras i USD. Skatter och eventuell valutaväxling kan tillkomma.': 'The price is charged in USD. Taxes and any currency conversion may apply.',
    'Läs villkoren': 'Read the terms',
    'FUNGERAR MED VERKTYGEN DU REDAN ANVÄNDER': 'WORKS WITH THE TOOLS YOU ALREADY USE',

    // ---- agencyportalen ---------------------------------------------------------------------------
    'AGENCYPORTAL': 'AGENCY PORTAL',
    'Agency-directory, publicering och land i samma mörka vy.': 'Agency directory, publishing and country in one dark view.',
    'Byggd för teams som vill se vilka agencies som är öppna, vilket land som stöds och när det är dags att ansöka eller publicera. Mindre widget-känsla, mer riktig agency-yta.':
      "Built for teams who want to see which agencies are open, which country is supported and when it's time to apply or publish. Less widget feel, more of a real agency space.",
    '24 agencies online': '24 agencies online',
    '7 öppna platser': '7 open spots',
    'Hitta rätt agency innan du går live.': 'Find the right agency before you go live.',
    'Filtrera per region, se status direkt och välj om du vill publicera från din nuvarande agency eller skicka en ny ansökan till ett öppet team.':
      'Filter by region, see status at a glance and choose whether to publish from your current agency or send a new application to an open team.',
    'Sverige': 'Sweden',
    'Tyskland': 'Germany',
    'Storbritannien': 'United Kingdom',
    'Danmark': 'Denmark',
    'Frankrike': 'France',
    'Verifierad publicering': 'Verified publishing',
    'Öppen för creators': 'Open to creators',
    'Snabb publicering': 'Fast publishing',
    'Land: Sverige': 'Country: Sweden',
    '22 matchningar': '22 matches',
    'ANSÖKAN': 'APPLICATION',
    'Redo att byta agency?': 'Ready to switch agency?',
    'Se vilka team som tar emot creators just nu och skicka ansökan med rätt marknad, kontaktperson och publiceringsyta.':
      'See which teams are taking creators right now and apply with the right market, contact person and publishing space.',
    'Ansök nu': 'Apply now',
    'ÖPPNA AGENCIES': 'OPEN AGENCIES',
    '324 creators · 46 127 live-pass': '324 creators · 46,127 live passes',

    // ---- sidfot -----------------------------------------------------------------------------------
    'Integritet & cookies': 'Privacy & cookies',
    'Användarvillkor': 'Terms of use',
    'Driftstatus': 'System status',
    '© 2026 VYRA. Inte anslutet till TikTok.': '© 2026 VYRA. Not affiliated with TikTok.',
    'Språk': 'Language',

    // ---- privacy.html -----------------------------------------------------------------------------
    'Integritet och cookies · VYRA': 'Privacy and cookies · VYRA',
    'Gäller från 23 juli 2026': 'Effective from 23 July 2026',
    'Integritet och cookies': 'Privacy and cookies',
    'VYRA samlar bara in uppgifter som behövs för att leverera, skydda och förbättra tjänsten. Vi säljer inte personuppgifter.':
      'VYRA only collects the information needed to deliver, protect and improve the service. We do not sell personal data.',
    'Personuppgiftsansvarig:': 'Data controller:',
    'VYRA. Frågor och rättighetsbegäranden skickas till': 'VYRA. Questions and requests about your rights are sent to',
    'och besvaras av den som ansvarar för tjänsten.': 'and are answered by the person responsible for the service.',
    'Uppgifter vi behandlar': 'Information we process',
    'Ändamål och rättslig grund': 'Purpose and legal basis',
    'Leverantörer': 'Providers',
    'Dina rättigheter': 'Your rights',
    'Konto: e-postadress, visningsnamn, verifieringsstatus och säkerhetsinställningar.': 'Account: email address, display name, verification status and security settings.',
    'Tjänsteinnehåll: overlays, widgetinställningar, uppladdade mediafiler och workspace-medlemskap.': 'Service content: overlays, widget settings, uploaded media files and workspace memberships.',
    'LIVE-data: event som behövs för valda widgets och automationer. VYRA ska inte använda sådan data för fristående profilering.':
      'LIVE data: events needed for the widgets and automations you choose. VYRA shall not use such data for standalone profiling.',
    'Betalning: abonnemangsstatus, period och PayPal-abonnemangsreferens. Fullständiga kortuppgifter lagras inte av VYRA.':
      'Payment: subscription status, period and PayPal subscription reference. Full card details are not stored by VYRA.',
    'Säkerhet: sessionshistorik, förenklat enhetsnamn, hashad nätverksidentifierare och säkerhetshändelser.':
      'Security: session history, simplified device name, hashed network identifier and security events.',
    'Kontodata, innehåll och betalningsstatus behandlas för att fullgöra avtalet. Säkerhetsloggar, bedrägeriskydd och teknisk drift behandlas utifrån VYRAs berättigade intresse av en säker och stabil tjänst. Lagstadgade bokföringsuppgifter kan sparas för att uppfylla rättsliga skyldigheter.':
      "Account data, content and payment status are processed to perform the contract. Security logs, fraud protection and technical operations are processed on the basis of VYRA's legitimate interest in a secure and stable service. Statutory accounting records may be kept to meet legal obligations.",
    'Leverantörer och överföringar': 'Providers and transfers',
    'VYRA använder PayPal för betalning, en e-postleverantör för service- och säkerhetsmejl samt drift-, databas- och objektlagringsleverantörer. De får bara behandla uppgifter enligt VYRAs instruktioner. TikTok-data hämtas när användaren ansluter en LIVE och omfattas även av TikToks villkor. Lämpliga skyddsåtgärder ska användas vid överföring utanför EU/EES.':
      "VYRA uses PayPal for payment, an email provider for service and security emails, and hosting, database and object storage providers. They may only process data according to VYRA's instructions. TikTok data is fetched when the user connects a LIVE and is also covered by TikTok's terms. Appropriate safeguards shall be used for transfers outside the EU/EEA.",
    'Lagringstid': 'Retention',
    'Aktiva kontouppgifter sparas så länge kontot finns. Utgångna sessioner och engångslänkar rensas automatiskt. Säkerhetsloggar rensas normalt efter 180 dagar. Efter en begäran om kontoborttagning finns en ångerperiod på 7 dagar, därefter raderas kontot och ägda workspace-data. Uppgifter som måste bevaras enligt lag kan undantas.':
      'Active account data is kept as long as the account exists. Expired sessions and one-time links are removed automatically. Security logs are normally removed after 180 days. After a request to delete the account there is a 7-day cancellation period, after which the account and owned workspace data are deleted. Data that must be kept by law may be exempt.',
    'Cookies och lokal lagring': 'Cookies and local storage',
    'VYRA använder endast strikt nödvändiga cookies för säker inloggning och CSRF-skydd. Sessionscookien är HttpOnly, Secure och SameSite=Strict. Lokala inställningar kan sparas i webbläsarens localStorage för att komma ihåg layout och preferenser. Inga annonserings- eller spårningscookies används i denna version, därför visas ingen vilseledande samtyckesbanner. Webbplatsen använder cookielös webbanalys (Plausible, EU-hostad) som inte lagrar någon information på din enhet och inte sätter cookies. Denna mätning sker med stöd av berättigat intresse och omfattar sidvisningar samt anonyma händelser: registrering och nedladdningsklick från webbläsaren, samt aggregerade räknare för första sändning, påbörjad provperiod och genomförd betalning som skickas från våra servrar. Ingen av händelserna bär konto-, workspace- eller enhetsidentifierare, och de kan inte kopplas till en enskild användare. Inga personuppgifter samlas in och ingen data delas med tredje part utöver Plausible som databehandlare.':
      "VYRA only uses strictly necessary cookies for secure login and CSRF protection. The session cookie is HttpOnly, Secure and SameSite=Strict. Local settings may be saved in the browser's localStorage to remember layout and preferences. No advertising or tracking cookies are used in this version, which is why no misleading consent banner is shown. The website uses cookieless web analytics (Plausible, EU-hosted) that stores no information on your device and sets no cookies. This measurement is based on legitimate interest and covers page views and anonymous events: sign-ups and download clicks from the browser, plus aggregated counters for first broadcast, started trial and completed payment sent from our servers. None of the events carries account, workspace or device identifiers, and they cannot be linked to an individual user. No personal data is collected and no data is shared with third parties other than Plausible as data processor.",
    'Du kan begära tillgång, rättelse, dataportabilitet, begränsning, invändning och radering. Kontoexport och kontoborttagning finns under Inställningar. Du kan också kontakta privacy@vyralive.app och har rätt att lämna klagomål till Integritetsskyddsmyndigheten.':
      'You can request access, rectification, data portability, restriction, objection and erasure. Account export and account deletion are found under Settings. You can also contact privacy@vyralive.app and have the right to lodge a complaint with the Swedish Authority for Privacy Protection (IMY).',
    'Säkerhet och ändringar': 'Security and changes',
    'VYRA använder krypterade anslutningar, hashade lösenord och tokens, åtkomstkontroll, MFA och säkerhetsloggning. Ingen tjänst kan garantera absolut säkerhet. Väsentliga policyändringar meddelas i tjänsten eller via e-post innan de börjar gälla.':
      'VYRA uses encrypted connections, hashed passwords and tokens, access control, MFA and security logging. No service can guarantee absolute security. Material policy changes are announced in the service or by email before they take effect.',
    'Villkor': 'Terms',
    'Integritetskontakt': 'Privacy contact',

    // ---- terms.html -------------------------------------------------------------------------------
    'Användarvillkor · VYRA': 'Terms of use · VYRA',
    'Dessa villkor reglerar användningen av VYRA-webbplatsen, desktopappen, LIVE-anslutningen och tillhörande molntjänster.':
      'These terms govern the use of the VYRA website, the desktop app, the LIVE connection and related cloud services.',
    'VYRA är ett oberoende verktyg och är inte sponsrat, godkänt eller drivet av TikTok. Frågor om vem som tillhandahåller tjänsten skickas till':
      'VYRA is an independent tool and is not sponsored, endorsed or operated by TikTok. Questions about who provides the service are sent to',
    'Konto och behörighet': 'Account and eligibility',
    'Du måste lämna korrekta kontouppgifter, skydda dina inloggningsuppgifter och vara minst 18 år eller ha en vårdnadshavares godkännande där det är tillåtet. Du ansvarar för aktiviteter i ditt konto och för att workspace-behörigheter tilldelas rätt personer.':
      "You must provide accurate account details, protect your login credentials and be at least 18 years old or have a guardian's consent where permitted. You are responsible for activity in your account and for granting workspace permissions to the right people.",
    'Premium, gratisperiod och betalning': 'Premium, free trial and payment',
    'VYRA Premium kostar 15 USD per månad. Nya kvalificerade kunder får en gratis provperiod på 3 dagar. Om du inte säger upp innan provperioden slutar övergår den automatiskt till ett betalt månadsabonnemang. Abonnemanget förnyas automatiskt varje månad tills det sägs upp. Skatter och eventuell valutaväxling kan tillkomma.':
      'VYRA Premium costs 15 USD per month. New eligible customers get a free 3-day trial. If you do not cancel before the trial ends, it automatically becomes a paid monthly subscription. The subscription renews automatically every month until it is cancelled. Taxes and any currency conversion may apply.',
    'Du kan säga upp direkt i VYRA eller under Automatiska betalningar i ditt PayPal-konto. Betalningen sker via PayPal, med PayPal-saldo eller kort. Efter uppsägning behåller du normalt åtkomsten till den betalda periodens slut och inga nya perioder debiteras. Lagstadgad ångerrätt och återbetalningsrätt påverkas inte av villkoren.':
      'You can cancel right in VYRA or under Automatic payments in your PayPal account. Payment is made through PayPal, with your PayPal balance or a card. After cancelling you normally keep access until the end of the paid period, and no new periods are charged. Statutory withdrawal and refund rights are not affected by these terms.',
    'Tillåten användning': 'Permitted use',
    'Du får skapa och visa lagliga overlays och automationer för egna eller behöriga LIVE-sändningar. Du får inte använda VYRA för bedrägeri, trakasserier, intrång, manipulation av plattformar, skadlig kod, olagligt spelinnehåll eller innehåll som bryter mot TikToks eller andra anslutna tjänsters regler.':
      "You may create and show lawful overlays and automations for your own or authorized LIVE broadcasts. You may not use VYRA for fraud, harassment, intrusion, platform manipulation, malicious code, illegal gambling content or content that breaks TikTok's or other connected services' rules.",
    'Ditt innehåll': 'Your content',
    'Du behåller rättigheterna till ditt material och ger VYRA en begränsad rätt att lagra, bearbeta och visa det endast för att leverera tjänsten. Du ansvarar för att du har rättigheter till bilder, ljud, profilbilder, varumärken och annat innehåll du använder.':
      'You keep the rights to your material and give VYRA a limited right to store, process and display it only to deliver the service. You are responsible for having the rights to images, sounds, profile pictures, trademarks and other content you use.',
    'VYRAs rättigheter': "VYRA's rights",
    'Programvara, design, varumärke, mallar och egenutvecklade system tillhör VYRA eller dess licensgivare. Abonnemanget ger en begränsad, personlig eller workspace-baserad nyttjanderätt. Det är inte tillåtet att kringgå åtkomstkontroller, sälja vidare tjänsten, extrahera skyddade tillgångar eller kopiera proprietär serverlogik.':
      'Software, design, trademark, templates and in-house systems belong to VYRA or its licensors. The subscription gives a limited, personal or workspace-based right of use. It is not permitted to bypass access controls, resell the service, extract protected assets or copy proprietary server logic.',
    'Tillgänglighet och tredjepart': 'Availability and third parties',
    'VYRA strävar efter hög tillgänglighet men kan behöva underhållas eller påverkas av TikTok, PayPal, nätverk och andra tredjeparter. Funktioner kan ändras när plattformars API:er eller regler ändras. VYRA garanterar inte en viss LIVE-intäkt, tittarnivå eller exponering.':
      "VYRA aims for high availability but may need maintenance or be affected by TikTok, PayPal, networks and other third parties. Features may change when platforms' APIs or rules change. VYRA does not guarantee any particular LIVE income, viewer level or exposure.",
    'Avstängning och upphörande': 'Suspension and termination',
    'VYRA får begränsa eller stänga av konto vid säkerhetsrisk, betalningsproblem eller allvarligt regelbrott. Du kan exportera dina uppgifter och begära kontoborttagning i Inställningar. Kontoborttagning har en ångerperiod på 7 dagar och stoppar automatisk abonnemangsförnyelse.':
      'VYRA may restrict or suspend an account in case of security risk, payment problems or serious rule violations. You can export your data and request account deletion in Settings. Account deletion has a 7-day cancellation period and stops automatic subscription renewal.',
    'Ansvar och lag': 'Liability and law',
    'VYRA ansvarar inte för indirekta skador, utebliven intäkt eller fel hos tredjeparter i den utsträckning lagen tillåter. Begränsningen påverkar inte ansvar som inte får begränsas enligt tvingande konsumenträtt. Svensk lag tillämpas och konsumenter behåller skyddet i sitt bosättningsland. Tvist kan även prövas av Allmänna reklamationsnämnden där det är tillämpligt.':
      'VYRA is not liable for indirect damage, lost income or errors by third parties to the extent the law allows. This limitation does not affect liability that cannot be limited under mandatory consumer law. Swedish law applies and consumers keep the protection of their country of residence. Disputes may also be heard by the Swedish National Board for Consumer Disputes (ARN) where applicable.',
    'Kontakt och ändringar': 'Contact and changes',
    'Kontakta': 'Contact',
    '. Väsentliga ändringar meddelas innan de börjar gälla. Fortsatt användning efter ikraftträdandet innebär att de nya villkoren gäller, i den utsträckning lagen tillåter.':
      '. Material changes are announced before they take effect. Continued use after they take effect means the new terms apply, to the extent the law allows.',
    'Integritet': 'Privacy',

    // ---- status.html + status-client.js -----------------------------------------------------------
    'Driftstatus · VYRA': 'System status · VYRA',
    'Offentlig driftinformation': 'Public service information',
    'Kontrollerar systemen…': 'Checking the systems…',
    'Delar': 'Components',
    'Kontrollerar…': 'Checking…',
    'Senaste incidenter': 'Recent incidents',
    'Laddar…': 'Loading…',
    '© 2026 VYRA · Uppdateras automatiskt var 60:e sekund': '© 2026 VYRA · Updates automatically every 60 seconds',
    'Fungerar': 'Operational',
    'Inloggning och molnsynk': 'Login and cloud sync',
    'Realtid till overlay och studio': 'Real-time to overlay and studio',
    'TikTok-anslutning och betalning': 'TikTok connection and payments',
    'Ingen automatisk kontroll': 'No automatic check',
    'Störning': 'Disruption',
    'Kunde inte kontrolleras': 'Could not be checked',
    'TikTok-anslutningen och betalningen kontrolleras inte automatiskt här. Störningar där publiceras som incidenter nedan.':
      'The TikTok connection and payments are not checked automatically here. Disruptions there are published as incidents below.',
    'Alla system fungerar': 'All systems operational',
    'Nedsatt funktion': 'Degraded performance',
    'Större driftstörning': 'Major outage',
    'Status kunde inte hämtas': 'Status could not be fetched',
    'Försök igen om en stund.': 'Try again in a moment.',
    'Statusservern svarar inte just nu.': 'The status server is not responding right now.',
    'Inga incidenter rapporterade de senaste 7 dagarna.': 'No incidents reported in the last 7 days.',
  };

  // Texter med ett värde i. Ersättningen får $1 osv. från uttrycket.
  const monster = [
    [/^Senast kontrollerad (.+?) · statusen är inte färsk$/, 'Last checked $1 · the status is not fresh'],
    [/^Senast kontrollerad (.+)$/, 'Last checked $1'],
    [/^Senaste lyckade kontroll (.+?) · statusen är inte färsk\. Försök igen om en stund\.$/, 'Last successful check $1 · the status is not fresh. Try again in a moment.'],
  ];

  window.VyraSprakEn = { text, monster };
})();
