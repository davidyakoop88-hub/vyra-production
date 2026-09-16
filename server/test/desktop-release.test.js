'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{release,safeVersion}=require('../desktop-release');
test('desktop releases require an HTTPS installer URL',()=>{assert.throws(()=>release({DESKTOP_DOWNLOAD_URL:'http://example.com/VYRA.exe'}),error=>error.status===503);assert.throws(()=>release({DESKTOP_DOWNLOAD_URL:''}),error=>error.status===503)});
test('desktop release metadata is validated and normalized',()=>{const out=release({DESKTOP_DOWNLOAD_URL:'https://downloads.example/VYRA-Setup.exe',DESKTOP_VERSION:'1.2.3',DESKTOP_SHA256:'A'.repeat(64),DESKTOP_SIZE_BYTES:'2048'});assert.equal(out.version,'1.2.3');assert.equal(out.sha256,'a'.repeat(64));assert.equal(out.sizeBytes,2048);assert.equal(safeVersion(' 1.0.0 '),'1.0.0')});
test('incomplete release metadata is rejected',()=>{assert.throws(()=>release({DESKTOP_DOWNLOAD_URL:'https://downloads.example/VYRA.exe',DESKTOP_VERSION:'1.0.0',DESKTOP_SHA256:'bad',DESKTOP_SIZE_BYTES:'2048'}));assert.throws(()=>release({DESKTOP_DOWNLOAD_URL:'https://downloads.example/VYRA.exe',DESKTOP_VERSION:'',DESKTOP_SHA256:'a'.repeat(64),DESKTOP_SIZE_BYTES:'2048'}));assert.throws(()=>release({DESKTOP_DOWNLOAD_URL:'https://downloads.example/VYRA.exe',DESKTOP_VERSION:'1.0.0',DESKTOP_SHA256:'a'.repeat(64),DESKTOP_SIZE_BYTES:'1'}))});
// Store-länken: frivillig, men ALDRIG godtyckligt. Är variabeln satt ska den peka på Microsofts
// produktsida — annars stoppas den, i stället för att en felskriven länk skickas ut till alla.
const GRUND={DESKTOP_DOWNLOAD_URL:'https://downloads.example/VYRA-Setup.exe',DESKTOP_VERSION:'1.2.4',DESKTOP_SHA256:'a'.repeat(64),DESKTOP_SIZE_BYTES:'2048'};
test('utan DESKTOP_STORE_URL saknas storeUrl helt — .exe-vägen är oförändrad',()=>{const out=release(GRUND);assert.equal('storeUrl' in out,false);assert.equal(out.url,'https://downloads.example/VYRA-Setup.exe');assert.equal(release({...GRUND,DESKTOP_STORE_URL:'   '}).storeUrl,undefined)});
test('DESKTOP_STORE_URL följer med som storeUrl när den pekar på apps.microsoft.com',()=>{const out=release({...GRUND,DESKTOP_STORE_URL:'https://apps.microsoft.com/detail/9PPKZN2SCJM2'});assert.equal(out.storeUrl,'https://apps.microsoft.com/detail/9PPKZN2SCJM2');assert.equal(out.url,'https://downloads.example/VYRA-Setup.exe','302-målet får inte bytas — det är .exe-kanalen');assert.equal(release({...GRUND,DESKTOP_STORE_URL:'https://apps.microsoft.com/detail/9PPKZN2SCJM2?hl=sv-SE&gl=SE'}).storeUrl,'https://apps.microsoft.com/detail/9PPKZN2SCJM2?hl=sv-SE&gl=SE')});
test('en Store-länk som inte är Microsofts produktsida stoppas',()=>{for(const fel of['http://apps.microsoft.com/detail/9PPKZN2SCJM2','https://apps.microsoft.com/','https://apps.microsoft.com/store/detail/9PPKZN2SCJM2','https://example.com/detail/9PPKZN2SCJM2','https://user:pw@apps.microsoft.com/detail/9PPKZN2SCJM2','ms-windows-store://pdp/?productid=9PPKZN2SCJM2','inte en url'])assert.throws(()=>release({...GRUND,DESKTOP_STORE_URL:fel}),error=>error.status===503&&/DESKTOP_STORE_URL/.test(error.message),`skulle stoppats: ${fel}`)});

// UPPDATERARENS VÄG. Grinden i 5b05da7 dödade självuppdateringen tyst: uppdateraren skickar ingen
// cookie och fick 401. Proven låser fast BÅDA sidorna — att uppdateraren släpps igenom, och att
// hemsidans webbläsaranrop fortfarande möter grinden. Faller det ena är fixen verkningslös; faller
// det andra är premiumgrinden borta.
const {fromBrowser,arUppdaterare,slapperForbi}=require('../desktop-release');
test('uppdateraren känns igen: ett anrop utan webbläsarhuvuden är inte en webbläsare',()=>{
  assert.equal(fromBrowser({}),false,'ren Node-fetch — uppdateraren');
  assert.equal(fromBrowser({accept:'application/json','user-agent':'node'}),false,'accept och user-agent gör det inte till en webbläsare');
  assert.equal(fromBrowser(undefined),false);
  assert.equal(fromBrowser({origin:'   '}),false,'tomt huvud räknas inte');
});
test('varje webbläsarhuvud för sig räcker för att grinden ska gälla',()=>{
  for(const namn of ['origin','referer','sec-fetch-site','sec-fetch-dest','sec-ch-ua'])
    assert.equal(fromBrowser({[namn]:'x'}),true,`${namn} ensamt skulle räknats som webbläsare`);
});
// FACIT, UPPMATT mot postman-echo 2026-09-14: exakt detta skickar Node:s fetch — alltsa exakt
// vad uppdateraren i den installerade appen skickar. Provet fanns inte forst, och da slank
// 'sec-fetch-mode' in i webblasarlistan: uppdateraren fick 401 anda, och curl (som inte skickar
// nagot sec-fetch-huvud) visade gront. Ett prov med RATT klient hade fallit direkt.
test('Node:s fetch — uppdateraren — klassas ALDRIG som webbläsare',()=>{
  assert.equal(fromBrowser({'accept':'*/*','accept-encoding':'gzip, br','accept-language':'*','host':'api.example','sec-fetch-mode':'cors','user-agent':'node'}),false,'sec-fetch-mode:cors kommer fran Node:s fetch och far inte rakna som webbläsare');
  assert.equal(fromBrowser({'sec-fetch-mode':'cors'}),false);
  assert.equal(fromBrowser({'user-agent':'node'}),false);
});

test('ett riktigt webbläsaranrop från hemsidan möter grinden',()=>{
  assert.equal(fromBrowser({origin:'https://vyralive.app',referer:'https://vyralive.app/','sec-fetch-site':'same-origin','sec-fetch-mode':'navigate','sec-fetch-dest':'document',cookie:'vyra=1'}),true);
});

// POSITIVT KANNETECKEN (#424). fromBrowser() kan bara svara "nej, detta ar ingen webblasare", och
// det svaret agde undici — inte vi. Tva PR:er i rad (#419, #421) behovdes nar Node bytte vilka
// Sec-Fetch-huvuden dess fetch skickar. arUppdaterare() vander pa fragan.
//
// Provet som mater detta med en RIKTIG fetch mot en riktig server ligger i
// electron-app/test/uppdaterargrind.test.js — dar finns bade klienten och servern att kora mot.
// Har star enhetsreglerna, i det paket som ager grinden.
test('arUppdaterare kraver exakt "1"',()=>{
  assert.equal(arUppdaterare({'x-vyra-updater':'1'}),true);
  assert.equal(arUppdaterare({'x-vyra-updater':' 1 '}),true,'blanksteg runt vardet ska inte spela roll');
  // Allt annat ar nej. Ett huvud som rakar finnas med nagot annat varde far inte oppna grinden —
  // samma regel som BETRODD_PROXY i security.js, och av samma skal: en halvsatt flagga ar inte ett ja.
  for(const v of ['true','0','ja','yes','','x',undefined,null,1])
    assert.equal(arUppdaterare({'x-vyra-updater':v}),false,`"${v}" skulle inte raknats som ett ja`);
  assert.equal(arUppdaterare({}),false);
  assert.equal(arUppdaterare(),false,'ett anrop utan huvuden far inte kasta');
});

test('slapperForbi: kannetecknet slar igenom aven nar anropet ser ut som en webblasare',()=>{
  // DET HAR AR HELA POANGEN MED #424. Sa lange undici inte skickar nagot av BROWSER_HEADERS slapps
  // uppdateraren igenom anda, och da mater ingenting att allowlistan finns. Provet spelar darfor
  // upp dagen da undici borjar skicka ett av dem.
  const framtida={'sec-fetch-dest':'empty','user-agent':'node'};
  assert.equal(fromBrowser(framtida),true,'kontrollmatning: den gamla vagen skulle stoppat detta');
  assert.equal(slapperForbi(framtida),false,'utan kannetecken ska den stoppas');
  assert.equal(slapperForbi({...framtida,'x-vyra-updater':'1'}),true,
    'kannetecknet bar inte ensamt — grinden ar da ater beroende av undicis nycker mellan versioner');
});

test('slapperForbi lamnar betalvaggen kvar for webblasare',()=>{
  assert.equal(slapperForbi({origin:'https://vyralive.app',referer:'https://vyralive.app/'}),false);
  assert.equal(slapperForbi({origin:'https://vyralive.app','x-vyra-updater':'true'}),false,
    'fel varde pa kannetecknet oppnade grinden');
  // Och det som ALLTID sluppit igenom gor det fortfarande: curl, och Node:s fetch som den ser ut i dag.
  assert.equal(slapperForbi({'user-agent':'curl/8.0'}),true);
  assert.equal(slapperForbi({'sec-fetch-mode':'cors','user-agent':'node'}),true);
});

// ================================================================================================
// PLATTFORMSADMIN OCH BETALVAGGEN
//
// `is_platform_admin` slapper redan forbi betalgrinden i Studion (entitlement-gate.js:52), men
// .exe-rutten kravde `plan === 'premium'` utan undantag. Samma flagga gav alltsa tva svar: admin
// kom in i Studion och mottes anda av "Premium kravs" pa nedladdningen.
//
// Proven halls i tva halvor med flit. Den forsta matar BESLUTET, den andra att RUTTEN faktiskt
// stallt beslutet pa ratt plats — ett gront modulprov sager ingenting om rutten, och det ar exakt
// sa jsonb-buggen i /mfa/confirm overlevde fyra manader.
const {premiumKravs}=require('../desktop-release');

test('plattformsadmin slipper premiumkravet',()=>{
  assert.equal(premiumKravs({is_platform_admin:true}),false);
  assert.equal(premiumKravs({is_platform_admin:false}),true);
  assert.equal(premiumKravs({}),true,'en session utan flaggan ar inte admin');
  assert.equal(premiumKravs(null),true,'ingen session ar inte admin');
  assert.equal(premiumKravs(undefined),true);
});

test('bara aktat sant duger — inget sanningsvarde smyger forbi betalvaggen',()=>{
  // Kolumnen kan forsvinna ur en omskriven SELECT, och den kan komma tillbaka som strang ur en
  // annan drivrutin. Bada lagena ska betyda "inte admin", inte "sant nog".
  for(const varde of ['','0','false','true',0,1,null,undefined,NaN,[],{}])
    assert.equal(premiumKravs({is_platform_admin:varde}),true,
      `${JSON.stringify(varde)} slapptes forbi betalvaggen`);
});

test('rutten stallt beslutet pa ratt plats — och bara premiumdelen ligger innanfor',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const kod=fs.readFileSync(path.join(__dirname,'..','index.js'),'utf8');
  const start=kod.indexOf("if(p==='/api/downloads/windows'");
  assert.ok(start>0,'nedladdningsrutten hittades inte');
  const rutt=kod.slice(start,kod.indexOf("if(p==='/api/public/status'",start));

  const iAdminfall=rutt.indexOf('if(desktopPremiumKravs(dls)){');
  assert.ok(iAdminfall>0,'rutten fragar aldrig om anroparen ar plattformsadmin');

  // Premiumkontrollen MASTE ligga efter oppningen — annars ar undantaget verkningslost.
  const i402=rutt.indexOf('entitlementRequired:true');
  assert.ok(i402>iAdminfall,'402-svaret ligger utanfor adminfallet — undantaget gor da ingenting');

  // Och e-postverifieringen MASTE ligga FORE. Hamnar den innanfor slapper adminflaggan forbi ett
  // bevis pa kontroll over adressen, vilket ar en helt annan sak an att slippa betala.
  const i403=rutt.indexOf('emailVerificationRequired:true');
  assert.ok(i403>0&&i403<iAdminfall,
    'e-postverifieringen hamnade innanfor adminfallet — admin ar ett betalundantag, inte ett sakerhetsundantag');

  // Arbetsytefragan ska ocksa ligga innanfor: en admin ska inte kosta en databasfraga i onodan.
  assert.ok(rutt.indexOf('FROM workspace_members m JOIN workspaces w')>iAdminfall,
    'arbetsytefragan kors aven for admin');
});
