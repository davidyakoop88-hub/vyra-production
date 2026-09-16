'use strict';
function safeVersion(value){return String(value||'').replace(/[^0-9A-Za-z.+-]/g,'').slice(0,40)}
// Store-länken är FRIVILLIG och pekar på Microsofts egen produktsida. Är den satt byter klienten
// nedladdningsknappen från .exe-rutten till butiken; .exe-rutten (302) står orörd bredvid.
// Bara https://apps.microsoft.com/... godtas — en butikslänk som pekar någon annanstans är en
// felkonfiguration, inte en variant, och ska stoppa i stället för att skickas ut till användarna.
function storeUrl(raw){const value=String(raw||'').trim();if(!value)return undefined;let url;try{url=new URL(value)}catch{url=null}if(!url||url.protocol!=='https:'||url.hostname!=='apps.microsoft.com'||url.username||url.password||!/^\/detail\/[A-Za-z0-9]{12}(?:\/|$)/.test(url.pathname))throw Object.assign(new Error('DESKTOP_STORE_URL är ogiltig — ska vara https://apps.microsoft.com/detail/<Store-ID>'),{status:503});return url.toString()}
function release(env=process.env){const raw=String(env.DESKTOP_DOWNLOAD_URL||''),version=safeVersion(env.DESKTOP_VERSION),sha256=String(env.DESKTOP_SHA256||'').toLowerCase(),size=Number(env.DESKTOP_SIZE_BYTES||0);let url;try{url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password)throw Error()}catch{throw Object.assign(new Error('Desktopversionen är inte publicerad ännu'),{status:503})}if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)||!/^[a-f0-9]{64}$/.test(sha256)||!Number.isSafeInteger(size)||size<1024)throw Object.assign(new Error('Desktopversionens metadata är ofullständig'),{status:503});const out={url:url.toString(),version,sha256,sizeBytes:size,platform:'Windows 10/11',format:'EXE installer'};const butik=storeUrl(env.DESKTOP_STORE_URL);if(butik)out.storeUrl=butik;return out}
// UPPDATERARENS VAG FORBI NEDLADDNINGSGRINDEN.
// Grinden (session -> verifierad e-post -> premium) lades pa .exe-rutten i 5b05da7 for HEMSIDANS
// knapp. Uppdateraren i den installerade appen fanns redan da, anropar samma rutt med ren fetch och
// skickar varken cookie eller token — den fick darfor 401 och kunde ALDRIG hamta en uppdatering.
// Felet var tyst: appen sag den nya versionen via ?meta=1, forsokte hamta, och sa ingenting.
//
// En klientfix nar inte de installationer som redan ar ute — deras uppdaterare ar inbrand i .exe:n.
// Darfor skiljer SERVERN pa anroparna: en webblasare skickar alltid minst ett av huvudena nedan,
// en Node-fetch skickar inget av dem. Saknas de helt ar det inte en webblasare, och da lamnas filen
// ut. Grinden star kvar orord for alla anrop som kommer fran en webblasare.
//
// Att huvudena gar att forfalska sanker inget skydd: DESKTOP_DOWNLOAD_URL pekar pa en PUBLIK
// GitHub-release. Grinden doljer en adress, den skyddar ingen fil.
// MATT, INTE GISSAT: Node:s fetch skickar 'sec-fetch-mode: cors' och 'user-agent: node' — inget
// annat av huvudena nedan. Sec-Fetch-Mode far DARFOR inte sta i listan; med den dar klassades
// uppdateraren som webblasare och fick 401, vilket ar precis felet som skulle lagas. curl skickar
// inga sec-fetch-huvuden alls och dolde det — prova alltid med den KLIENT som ska fungera.
// Kvar star huvuden som bara en webblasare satter: navigering och sidanrop bar alltid minst ett.
const BROWSER_HEADERS=['origin','referer','sec-fetch-site','sec-fetch-dest','sec-ch-ua'];
function fromBrowser(headers){const h=headers||{};return BROWSER_HEADERS.some(name=>{const value=h[name];return typeof value==='string'&&value.trim()!==''})}
// POSITIVT KANNETECKEN, tillagt i #424. fromBrowser() kan bara fraga "ar detta INTE en webblasare?",
// och svaret hangde darfor pa vilka huvuden undici (Node:s fetch) rakade skicka i den version
// anvandaren hade. Tva PR:er i rad (#419, #421) behovdes nar den mangden andrades. Fragan ar nu
// vand: "ar detta uppdateraren?" - och det svaret ager VI, inte en tredjepartsklient.
//
// EXAKT '1', inte vilket sanningsvarde som helst. Ett huvud som rakar finnas med nagot annat varde
// ska inte oppna grinden; det ar samma regel som BETRODD_PROXY i security.js och av samma skal.
//
// Att huvudet gar att forfalska sanker ingenting. Grinden ar en BETALVAGG, inte ett skydd:
// DESKTOP_DOWNLOAD_URL pekar pa en publik GitHub-release, och curl far redan 302 rakt till filen.
// Den doljer en adress, den skyddar ingen fil.
const UPPDATERARHUVUD='x-vyra-updater';
function arUppdaterare(headers){const v=(headers||{})[UPPDATERARHUVUD];return typeof v==='string'&&v.trim()==='1'}

// Grindens hela beslut pa ETT stalle, sa rutten inte bar halva regeln. Uppdateraren slapps igenom
// pa sitt egna kannetecken; allt annat som inte ser ut som en webblasare slapps igenom som forut.
function slapperForbi(headers){return arUppdaterare(headers)||!fromBrowser(headers)}
// PLATTFORMSADMIN BETALAR INTE — OCH FLAGGAN SKA BETYDA SAMMA SAK OVERALLT.
//
// `is_platform_admin` slapper redan forbi betalgrinden i Studion (entitlement-gate.js), men
// .exe-rutten kravde `plan === 'premium'` rakt av. En administrator utan prenumeration kom darfor
// in i Studion och mottes anda av "Premium kravs" pa nedladdningen — samma flagga, tva svar.
//
// Grinden ar en BETALVAGG, inte ett skydd (se slapperForbi ovan), sa undantaget oppnar ingenting
// som inte redan ar publikt. Den VERIFIERADE E-POSTEN star kvar aven for admin: den ar ett bevis pa
// kontroll over adressen, inte ett betalningskrav, och den regeln hor inte hemma har.
//
// EXPLICIT `=== true`. Sessionsraden kommer ur en SELECT som kan sakna kolumnen om nagon skriver om
// fragan; `undefined` ska da betyda "inte admin", inte "sant nog".
function premiumKravs(session){return (session&&session.is_platform_admin)!==true}
module.exports={release,safeVersion,storeUrl,fromBrowser,BROWSER_HEADERS,arUppdaterare,slapperForbi,UPPDATERARHUVUD,premiumKravs};
