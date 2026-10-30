'use strict';
const {app, BrowserWindow, ipcMain, dialog} = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const MAX_DATA_BYTES = 300 * 1024 * 1024;
let mainWindow;
const dbFile = () => path.join(app.getPath('userData'), 'records.json');
function result(ok, data, error) { return {ok, data, error}; }
function readRecords() {
  try {
    if (!fs.existsSync(dbFile())) return result(true, null);
    const value = fs.readFileSync(dbFile(), 'utf8');
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || !['risk','ssow','ppe','incidents','assets'].every(k => Array.isArray(parsed[k]))) {
      throw new Error('Saved records have an unexpected structure.');
    }
    return result(true, parsed);
  } catch(e) { return result(false, null, 'Could not read saved data: ' + e.message + '. Your files have not been changed.'); }
}
function writeRecords(data) {
  try {
    if (!data || typeof data !== 'object' || !['risk','ssow','ppe','incidents','assets'].every(k => Array.isArray(data[k])) || ((data.ppeStock !== undefined && !Array.isArray(data.ppeStock)) || (data.training !== undefined && !Array.isArray(data.training)))) throw new Error('Invalid register data');
    const text = JSON.stringify(data);
    if (Buffer.byteLength(text, 'utf8') > MAX_DATA_BYTES) throw new Error('Data file exceeds 300 MB');
    const directory = path.dirname(dbFile());
    fs.mkdirSync(directory, {recursive:true});
    const temp = dbFile() + '.tmp';
    const previous = dbFile() + '.previous.json';
    try {
      fs.writeFileSync(temp, text, {encoding:'utf8', flag:'w'});
      if (fs.existsSync(dbFile())) {
        const older = dbFile() + '.older.json';
        if (fs.existsSync(previous)) fs.copyFileSync(previous, older);
        fs.copyFileSync(dbFile(), previous);
      }
      fs.renameSync(temp, dbFile());
    } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
    return result(true);
  } catch(e) { return result(false, null, 'Could not save records: ' + e.message); }
}

// The updater stays disabled until IT supplies an approved HTTPS feed and signed releases.
// No GitHub credentials are embedded in the application.
let updater = null;
let updateDownloaded = false;
const updateConfig = require('./update-config.json');
function updaterReady() {
  return app.isPackaged && process.platform === 'win32' &&
    updateConfig.enabled === true &&
    typeof updateConfig.feedUrl === 'string' &&
    /^https:\/\/[a-z0-9.-]+(?::443)?\//i.test(updateConfig.feedUrl);
}
function updateStatus() {
  return { enabled: updaterReady(), version: app.getVersion(),
    detail: updaterReady() ? 'Ready to check approved update feed' :
      'Automatic updates are awaiting IT-approved hosting and code signing.' };
}
function initUpdater() {
  if (!updaterReady()) return;
  const {autoUpdater} = require('electron-updater');
  updater = autoUpdater;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.setFeedURL({provider:'generic',url:updateConfig.feedUrl});
  updater.on('update-available', async (info) => {
    if (!mainWindow) return;
    const answer = await dialog.showMessageBox(mainWindow,{
      type:'question', buttons:['Download update','Not now'], defaultId:1,cancelId:1,
      title:'Dashboard update available',
      message:'Version '+info.version+' is available',
      detail:'Your local H&S records will not be included in the download. Back up before applying updates.'
    });
    if(answer.response===0) updater.downloadUpdate().catch(e=>dialog.showErrorBox('Update failed',e.message));
  });
  updater.on('update-downloaded',async()=>{
    updateDownloaded=true;
    if (!mainWindow) return;
    const answer=await dialog.showMessageBox(mainWindow,{
      type:'question',buttons:['Restart and install','Later'],defaultId:1,cancelId:1,
      title:'Dashboard update ready',message:'Update downloaded',
      detail:'Save or export a backup before installing. Restart the dashboard to apply the approved update.'
    });
    if(answer.response===0) updater.quitAndInstall(false,true);
  });
  updater.on('error',e=>{if(mainWindow)dialog.showMessageBox(mainWindow,{type:'warning',message:'Update check failed',detail:e.message});});
}
async function checkApprovedUpdates() {
  if (!updater) return updateStatus();
  try {await updater.checkForUpdates();return {enabled:true,detail:'Update check completed',version:app.getVersion()};}
  catch(e){return {enabled:true,error:e.message,version:app.getVersion()};}
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width:1350, height:880, minWidth:850, minHeight:600,
    title:'Onboard Corrugated — Health & Safety Dashboard',
    backgroundColor:'#f7f9f7',
    webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://') || !url.endsWith('/app/index.html')) event.preventDefault();
  });
  mainWindow.loadFile(path.join(__dirname,'app','index.html'));
}
app.whenReady().then(() => {
  ipcMain.on('records:read', (event) => {event.returnValue = readRecords();});
  ipcMain.on('records:write', (event, data) => {event.returnValue = writeRecords(data);});
  ipcMain.handle('records:location', () => path.dirname(dbFile()));
  app.on('web-contents-created', (_e, wc) => {wc.on('will-attach-webview',e=>e.preventDefault());});
  createWindow();
  initUpdater();
  ipcMain.handle('updates:status', () => updateStatus());
  ipcMain.handle('updates:check', () => checkApprovedUpdates());
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
