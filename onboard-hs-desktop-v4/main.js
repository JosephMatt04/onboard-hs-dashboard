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
    if (!data || typeof data !== 'object' || !['risk','ssow','ppe','incidents','assets'].every(k => Array.isArray(data[k]))) throw new Error('Invalid register data');
    const text = JSON.stringify(data);
    if (Buffer.byteLength(text, 'utf8') > MAX_DATA_BYTES) throw new Error('Data file exceeds 300 MB');
    const directory = path.dirname(dbFile());
    fs.mkdirSync(directory, {recursive:true});
    const temp = dbFile() + '.tmp';
    const previous = dbFile() + '.previous.json';
    try {
      fs.writeFileSync(temp, text, {encoding:'utf8', flag:'w'});
      if (fs.existsSync(dbFile())) fs.copyFileSync(dbFile(), previous);
      fs.renameSync(temp, dbFile());
    } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
    return result(true);
  } catch(e) { return result(false, null, 'Could not save records: ' + e.message); }
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
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
