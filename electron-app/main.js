const { app, BrowserWindow, Menu, session, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { startLocalServer } = require('./local-server');
const { createTikTokService } = require('./tiktok-service');
const { createObsService } = require('./obs-service');
const Updater = require('./updater');

const PORT = 4173;
const CLOUD_ORIGIN = 'https://vyralive.app';
let splash, main, httpServer;
let updateCheckRunning=false;
let desktopAuthTimer;
// Ett terminalt hinder forklaras en gang per korning, inte en gang per pollning.
let entryReasonShown=false;

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
  main.loadURL(`${CLOUD_ORIGIN}/studio.html?desktop-auth=1`);
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
  main.webContents.on('did-fail-load', (e, code, desc) => log('main did-fail-load', code, desc));
  main.webContents.on('render-process-gone', (e, details) => log('main render-process-gone', JSON.stringify(details)));
  main.once('ready-to-show', () => {
    log('main ready-to-show');
    main.show();
    if (splash && !splash.isDestroyed()) splash.destroy();
  });
  main.on('closed', () => { clearInterval(desktopAuthTimer); log('main closed'); main = null; app.quit(); });
}

async function checkForUpdates(){
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
      cloudOrigin: CLOUD_ORIGIN
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
