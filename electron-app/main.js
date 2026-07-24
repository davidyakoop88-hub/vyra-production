const { app, BrowserWindow, Menu, session, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { startLocalServer } = require('./local-server');
const Updater = require('./updater');

const PORT = 4173;
const CLOUD_ORIGIN = 'https://vyralive.app';
let splash, main, httpServer;
let updateCheckRunning=false;
let desktopAuthTimer;

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

function createMainWindow() {
  log('createMainWindow()');
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
  main.loadURL(`${CLOUD_ORIGIN}/studio.html?desktop-auth=1`);
  main.webContents.setWindowOpenHandler(({url})=>{
    if(isTrustedAppUrl(url))return{action:'allow',overrideBrowserWindowOptions:{webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true}}};
    if(/^https:\/\//i.test(url))shell.openExternal(url);
    return{action:'deny'};
  });
  main.webContents.on('will-navigate',(event,url)=>{if(!isTrustedAppUrl(url))event.preventDefault()});
  main.webContents.on('did-finish-load',()=>{
    clearInterval(desktopAuthTimer);
    if(!main||main.isDestroyed()||!main.webContents.getURL().startsWith(CLOUD_ORIGIN))return;
    const openLocalStudioWhenEntitled=async()=>{
      if(!main||main.isDestroyed()||!main.webContents.getURL().startsWith(CLOUD_ORIGIN))return clearInterval(desktopAuthTimer);
      try{
        const account=await main.webContents.executeJavaScript(
          `(async()=>{
            try {
              const meResponse=await fetch('/api/auth/me',{credentials:'include',cache:'no-store',headers:{accept:'application/json'}});
              if(!meResponse.ok)return null;
              const me=await meResponse.json();
              const workspace=me.workspaces?.[0];
              if(!workspace)return null;
              if(me.user?.isPlatformAdmin)return {user:me.user,workspace,plan:'admin',status:'active'};
              const billingResponse=await fetch('/api/workspaces/'+encodeURIComponent(workspace.id)+'/billing',{credentials:'include',cache:'no-store',headers:{accept:'application/json'}});
              if(!billingResponse.ok)return null;
              const billing=await billingResponse.json();
              if(billing.plan!=='premium'||!['active','trialing','past_due'].includes(billing.subscription?.status))return null;
              return {user:me.user,workspace,plan:billing.plan,status:billing.subscription.status};
            } catch { return null; }
          })()`
        );
        if(account){
          clearInterval(desktopAuthTimer);
          const profile=encodeURIComponent(Buffer.from(JSON.stringify(account),'utf8').toString('base64'));
          await main.loadURL(`${localOrigin}/studio.html?desktop=1&profile=${profile}`);
        }
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
    httpServer = await startLocalServer(appRoot(), PORT);
    log('local server listening on', PORT, 'root =', appRoot());
  } catch (err) {
    log('local server failed to start:', err.message);
  }
  createMainWindow();
  setTimeout(checkForUpdates,15000).unref();
}).catch(err => log('app.whenReady chain threw:', err.stack || err.message));

function stopServer() {
  if (httpServer) { try { httpServer.close(); } catch { /* already closed */ } }
}

app.on('window-all-closed', () => { stopServer(); if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', stopServer);
