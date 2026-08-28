const { app, BrowserWindow, Menu, session, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { startLocalServer } = require('./local-server');
const { createTikTokService } = require('./tiktok-service');
const { createObsService } = require('./obs-service');
const Updater = require('./updater');

const BRYT = String.fromCharCode(10);
const PORT = 4173;
const CLOUD_ORIGIN = 'https://vyralive.app';
let splash, main, httpServer;
let updateCheckRunning=false;
let desktopAuthTimer;
// Ett terminalt hinder forklaras en gang per korning, inte en gang per pollning.
let entryReasonShown=false;
// Molnets sessionskaka, bryggad hit nar inloggningen ar klar. Den ar satt for vyralive.app och
// skickas aldrig till 127.0.0.1, sa den lokala Studion har ingen egen session — den lokala servern
// faster den har pa anrop den vidarebefordrar. Vardet stannar i huvudprocessen och nar aldrig
// sidans JS.
let cloudSessionCookie='';
// Workspace-id:t som TikTok-eventen ska bokforas pa. Satts pa samma stalle som kakan ovan, av samma
// skal: bada ar kanda forst nar behorighetsgrinden svarat ok. Utan det speglar local-server.js
// ingenting till molnet, och da sparas ingen statistik alls.
let cloudWorkspaceId='';

// Diagnostics: this process runs detached (no visible console), so log to a file we can inspect —
// console.log alone is invisible once packaged.
const logPath = path.join(app.getPath('temp'), 'vyra-electron-debug.log');
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
  try { fs.appendFileSync(logPath, line); } catch { /* ignore */ }
}
process.on('uncaughtException', err => log('UNCAUGHT EXCEPTION:', err.stack || err.message));
process.on('unhandledRejection', err => log('UNHANDLED REJECTION:', err?.stack || err));

app.commandLine.appendSwitch('disable-gpu');
log('main.js starting, isPackaged =', app.isPackaged, 'log at', logPath);

function appRoot() {
  // Dev: electron-app/ sits inside the repo, the actual app files are one level up.
  // Packaged: electron-builder copied them into resources/app via extraResources.
  return app.isPackaged ? path.join(process.resourcesPath, 'app') : path.join(__dirname, '..');
}

const iconPath = path.join(__dirname, 'icon.ico');

function createSplash() {
  log('createSplash()');
  splash = new BrowserWindow({
    width: 520, height: 340, frame: false, resizable: false, movable: true,
    center: true, show: true, backgroundColor: '#0a0611', icon: iconPath,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true }
  });
  splash.loadFile(path.join(__dirname, 'splash.html'));
  splash.setMenu(null);
  splash.webContents.on('did-fail-load', (e, code, desc) => log('splash did-fail-load', code, desc));
  splash.on('closed', () => log('splash closed'));
}

async function createMainWindow() {
  log('createMainWindow()');
  // A reinstall or update must never revive cached frontend files from an older VYRA build.
  // Keep cookies/localStorage (account and layouts), but remove HTTP, service-worker and Cache API
  // content before either the cloud Studio or the bundled local Studio is opened.
  await session.defaultSession.clearCache();
  await session.defaultSession.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] });
  main = new BrowserWindow({
    width: 1360, height: 860, minWidth: 1000, minHeight: 680,
    show: false, backgroundColor: '#08090d', autoHideMenuBar: true, icon: iconPath,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true }
  });
  Menu.setApplicationMenu(null);
  const localOrigin=`http://127.0.0.1:${PORT}`;
  const isTrustedAppUrl=url=>{
    try{return [localOrigin,CLOUD_ORIGIN].includes(new URL(url).origin)}catch{return false}
  };
  const isSpotifyAuthUrl=url=>{
    try{return new URL(url).origin==='https://accounts.spotify.com'}catch{return false}
  };
  main.loadURL(`${CLOUD_ORIGIN}/studio.html?desktop-auth=1`)
    .catch(err => log('forsta laddningen mot molnet foll:', err.message));
  main.webContents.setWindowOpenHandler(({url})=>{
    if(isTrustedAppUrl(url))return{action:'allow',overrideBrowserWindowOptions:{webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true}}};
    if(isSpotifyAuthUrl(url))return{action:'allow',overrideBrowserWindowOptions:{width:520,height:760,autoHideMenuBar:true,webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true}}};
    if(/^https:\/\//i.test(url))shell.openExternal(url);
    return{action:'deny'};
  });
  main.webContents.on('did-create-window',(child)=>{
    child.setMenu(null);
    child.webContents.on('will-navigate',(event,url)=>{
      if(!isSpotifyAuthUrl(url)&&!isTrustedAppUrl(url))event.preventDefault();
    });
    child.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  });
  main.webContents.on('will-navigate',(event,url)=>{if(!isTrustedAppUrl(url))event.preventDefault()});
  main.webContents.on('did-finish-load',()=>{
    clearInterval(desktopAuthTimer);
    if(!main||main.isDestroyed()||!main.webContents.getURL().startsWith(CLOUD_ORIGIN))return;
    const openLocalStudioWhenEntitled=async()=>{
      if(!main||main.isDestroyed()||!main.webContents.getURL().startsWith(CLOUD_ORIGIN))return clearInterval(desktopAuthTimer);
      try{
        // Sonden lamnar ett SKAL, aldrig null. Tidigare blev varje misslyckande samma `null` och
        // Node-sidan gjorde `if(account)`, sa 401, MFA-krav och "inget premium" blev identisk tyst
        // vantan — for alltid, utan ett ord. Det ar darfor appen ser ut att kasta ut en: man loggar
        // in, det lyckas, sidan star kvar.
        //
        // `wait` skiljer lagen som loser sig av sig sjalva (du haller pa att logga in, du fyller i
        // MFA, natet hackade) fran dem som aldrig gor det (inget premium, inget workspace). Bara de
        // senare stoppar pollningen och sager till.
        /* desktop-entry-probe */
        const verdict=await main.webContents.executeJavaScript(
          `(async()=>{
            const get=async u=>{const r=await fetch(u,{credentials:'include',cache:'no-store',headers:{accept:'application/json'}});return {res:r,body:await r.json().catch(()=>null)}};
            try {
              const me=await get('/api/auth/me');
              if(me.res.status===401)return {ok:false,reason:'not-logged-in',wait:true};
              if(me.body&&me.body.mfaRequired)return {ok:false,reason:'mfa',wait:true};
              if(!me.res.ok)return {ok:false,reason:'me-failed',wait:false,code:me.res.status};
              const workspace=me.body.workspaces&&me.body.workspaces[0];
              if(!workspace)return {ok:false,reason:'no-workspace',wait:false};
              if(me.body.user&&me.body.user.isPlatformAdmin)
                return {ok:true,account:{user:me.body.user,workspace,plan:'admin',status:'active'}};
              const billing=await get('/api/workspaces/'+encodeURIComponent(workspace.id)+'/billing');
              if(!billing.res.ok)return {ok:false,reason:'billing-unavailable',wait:false,code:billing.res.status};
              const plan=billing.body&&billing.body.plan;
              const status=billing.body&&billing.body.subscription&&billing.body.subscription.status;
              if(plan!=='premium'||['active','trialing','past_due'].indexOf(status)===-1)
                return {ok:false,reason:'not-premium',wait:false,plan:plan||'okänd',status:status||'ingen'};
              return {ok:true,account:{user:me.body.user,workspace,plan,status}};
            } catch(e) { return {ok:false,reason:'network',wait:true,detail:String(e&&e.message||e)}; }
          })()`
        );
        if(verdict&&verdict.ok){
          clearInterval(desktopAuthTimer);
          // Brygga sessionen INNAN vi lamnar molnorigin. Efter navigeringen kor Studion pa
          // 127.0.0.1, dar molnets kaka inte finns — utan det har steget svarar molnet 401 pa allt
          // sidan fragar om, och auth-client visar en inloggningsruta som inte kan fungera.
          try{
            const jar=await session.defaultSession.cookies.get({url:CLOUD_ORIGIN});
            cloudSessionCookie=jar.map(c=>`${c.name}=${c.value}`).join('; ');
            log('bridged cloud session:',jar.length,'cookies');
          }catch(error){log('cookie bridge failed:',error.message)}
          cloudWorkspaceId=String((verdict.account&&verdict.account.workspace&&verdict.account.workspace.id)||'');
          log('cloud workspace for event mirroring:',cloudWorkspaceId||'(saknas)');
          const profile=encodeURIComponent(Buffer.from(JSON.stringify(verdict.account),'utf8').toString('base64'));
          await main.loadURL(`${localOrigin}/studio.html?desktop=1&profile=${profile}`);
          return;
        }
        if(!verdict||verdict.wait)return;                 // loser sig av sig sjalv — fortsatt polla
        clearInterval(desktopAuthTimer);                  // annars: sluta polla och sag varfor,
        if(entryReasonShown)return;                       // en gang, inte en gang i sekunden
        entryReasonShown=true;
        log('desktop entry blocked:',verdict.reason,JSON.stringify(verdict));
        const TEXT={
          'not-premium':['Kontot saknar aktivt Premium',`VYRA Desktop kräver Premium. Kontots plan är "${verdict.plan}" med status "${verdict.status}".\n\nAktivera Premium på vyralive.app och starta om appen.`],
          'no-workspace':['Kontot har ingen arbetsyta','Logga in på vyralive.app och skapa din första overlay, starta sedan om appen.'],
          'billing-unavailable':['Kunde inte läsa kontots plan',`Servern svarade ${verdict.code} på betalningsstatus. Försök igen om en stund.`],
          'me-failed':['Kunde inte läsa kontot',`Servern svarade ${verdict.code}. Försök igen om en stund.`]
        };
        const [message,detail]=TEXT[verdict.reason]||['VYRA kunde inte öppnas',`Okänt hinder: ${verdict.reason}`];
        if(main&&!main.isDestroyed())dialog.showMessageBox(main,{type:'warning',title:'VYRA Desktop',message,detail,buttons:['OK']}).catch(()=>{});
      }catch(error){log('desktop auth check failed:',error.message)}
    };
    desktopAuthTimer=setInterval(openLocalStudioWhenEntitled,1000);
    desktopAuthTimer.unref?.();
    openLocalStudioWhenEntitled();
  });
  /* moln-onabart */
  // NAR MOLNET INTE GAR ATT NA sa hande ingenting: did-fail-load loggade till en fil i
  // temp-katalogen, pollningen som forklarar hinder startas inuti did-finish-load och startade
  // alltsa aldrig, och ready-to-show visade fonstret anda. Anvandaren fick en svart ruta utan ett
  // ord. Samma felklass som behorighetshindret (desktop-entry-reason) — tyst vantan dar ett skal
  // behovdes — fast ett steg tidigare i kedjan.
  //
  // -3 (ABORTED) hoppas over med flit: den fyrar aven vid normala omnavigeringar, till exempel
  // nar vi sjalva byter till den lokala Studion efter lyckad inloggning.
  let molnFelVisat = false, molnForsok = 0, molnTimer;
  main.webContents.on('did-fail-load', (e, code, desc, url, isMainFrame) => {
    log('main did-fail-load', code, desc, url);
    if (!isMainFrame || code === -3) return;
    if (!String(url || '').startsWith(CLOUD_ORIGIN)) return;
    // Splashen ligger annars kvar ovanpa ett tomt fonster: ready-to-show ar inte garanterad nar
    // laddningen fallit, och den ar enda stallet som stanger den i det lyckade flodet.
    if (splash && !splash.isDestroyed()) splash.destroy();
    if (main && !main.isDestroyed() && !main.isVisible()) main.show();
    // Ett nedslaget moln kommer tillbaka. Vi forsoker igen med vaxande mellanrum sa att
    // anvandaren slipper starta om appen nar natet ar dar igen — men vi sager till EN gang.
    molnForsok += 1;
    clearTimeout(molnTimer);
    molnTimer = setTimeout(() => {
      if (main && !main.isDestroyed()) main.loadURL(`${CLOUD_ORIGIN}/studio.html?desktop-auth=1`)
        .catch(err => log('omforsok mot molnet foll:', err.message));
    }, Math.min(30000, 3000 * molnForsok));
    molnTimer.unref?.();
    if (molnFelVisat) return;
    molnFelVisat = true;
    if (main && !main.isDestroyed()) dialog.showMessageBox(main, {
      type: 'warning', title: 'VYRA Desktop',
      message: 'Kunde inte nå vyralive.app',
      detail: 'VYRA hämtar Studion från vyralive.app och kom inte fram.' + BRYT + BRYT
        + 'Kontrollera din internetanslutning. Appen försöker igen automatiskt — du behöver inte '
        + 'starta om den.' + BRYT + BRYT
        + `Teknisk orsak: ${desc || 'okänd'} (${code}).`,
      buttons: ['OK'],
    }).catch(() => {});
  });
  main.webContents.on('did-finish-load', () => { molnFelVisat = false; molnForsok = 0; clearTimeout(molnTimer) });
  main.webContents.on('render-process-gone', (e, details) => log('main render-process-gone', JSON.stringify(details)));
  main.once('ready-to-show', () => {
    log('main ready-to-show');
    main.show();
    if (splash && !splash.isDestroyed()) splash.destroy();
  });
  main.on('closed', () => { clearInterval(desktopAuthTimer); log('main closed'); main = null; app.quit(); });
}

// STORE-VERSIONEN UPPDATERAR SIG INTE SJALV. Microsoft Store ager uppdateringarna for ett
// MSIX/AppX-paket, och en app som laddar ner och kor en .exe forbi butiken bryter mot
// certifieringskraven — dessutom ar installationskatalogen skrivskyddad, sa forsoket hade anda
// fallit, bara senare och otydligare.
//
// Villkoret ar RUNTIME, inte en byggflagga: process.windowsStore ar sant exakt nar appen kor ur ett
// Store-paket och odefinierat annars. En byggflagga hade kunnat sattas fel eller glommas, och felet
// hade da synts forst i certifieringen.
const arStoreversion = () => process.windowsStore === true;

async function checkForUpdates(){
  if(arStoreversion())return;
  if(!app.isPackaged||updateCheckRunning)return;updateCheckRunning=true;
  try{
    const config=Updater.readConfig(path.join(__dirname,'update-config.json'));if(!config||config.apiOrigin.includes('example.com'))return;
    const release=await Updater.fetchRelease(config.apiOrigin);if(!Updater.isNewer(release.version,app.getVersion()))return;
    const choice=await dialog.showMessageBox(main,{type:'info',title:'Ny VYRA-version',message:`VYRA ${release.version} är tillgänglig`,detail:'Uppdateringen verifieras innan den kan installeras.',buttons:['Ladda ner','Senare'],defaultId:0,cancelId:1,noLink:true});
    if(choice.response!==0)return;
    const target=path.join(app.getPath('temp'),`VYRA-Setup-${release.version}.exe`);
    if(fs.existsSync(target)){const hash=await Updater.sha256File(target);if(hash!==release.sha256)fs.rmSync(target,{force:true})}
    if(!fs.existsSync(target))await Updater.downloadRelease(config.apiOrigin,release,target);
    const install=await dialog.showMessageBox(main,{type:'question',title:'Uppdateringen är verifierad',message:`Installera VYRA ${release.version}?`,detail:'VYRA stängs och den signerade Windows-installationen öppnas.',buttons:['Installera nu','Senare'],defaultId:0,cancelId:1,noLink:true});
    if(install.response===0){const error=await shell.openPath(target);if(error)throw new Error(error);app.quit()}
  }catch(error){log('update check failed:',error.message)}
  finally{updateCheckRunning=false}
}

app.whenReady().then(async () => {
  log('app ready');
  session.defaultSession.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  createSplash();
  try {
    httpServer = await startLocalServer(appRoot(), PORT, {
      createLiveConnector: callbacks => createTikTokService({ ...callbacks, log }),
      obsService: createObsService({ log }),
      cloudOrigin: CLOUD_ORIGIN,
      // Lases vid varje proxat anrop, inte en gang vid start: servern startar fore inloggningen.
      cloudSession: () => cloudSessionCookie,
      // Lases vid varje event, av samma skal som kakan: grinden har inte svarat nar servern startar.
      cloudIdentity: () => ({workspaceId: cloudWorkspaceId}),
      // Anvandardata hor hemma i userData, aldrig i installationskatalogen. Se local-server.js.
      dataDir: app.getPath('userData')
    });
    log('local server listening on', PORT, 'root =', appRoot());
  } catch (err) {
    log('local server failed to start:', err.message);
  }
  await createMainWindow();
  setTimeout(checkForUpdates,15000).unref();
}).catch(err => log('app.whenReady chain threw:', err.stack || err.message));

function stopServer() {
  if (httpServer) { try { httpServer.close(); } catch { /* already closed */ } }
}

app.on('window-all-closed', () => { stopServer(); if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', stopServer);
