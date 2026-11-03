/* Offline, permission-based automatic backups into an IT-approved folder. */
(function(){
'use strict';
const supported=typeof window.showDirectoryPicker==='function'&&typeof indexedDB!=='undefined';
const SETTINGS_DB='OnboardLocalBackupFolder';
const FILE_LATEST='onboard-hs-latest.json';
let folder=null,ready=false,enabled=false,dirty=false,timer=null,processing=Promise.resolve();
let lastSuccess='',lastError='',lastFolderName='';
let storage=null;
function notify(){const el=document.getElementById('backup-live-status');if(el)el.textContent=statusLine()}
function statusLine(){
 if(!supported)return 'Automatic folder backup is not supported in this browser context. Continue using Export Backup.';
 if(!folder)return 'Not set up — choose an approved company OneDrive folder.';
 if(!enabled)return 'Folder access required — click Reconnect Folder to resume automatic backups.';
 if(lastError)return 'Backup warning: '+lastError;
 return lastSuccess?'Last backup saved: '+new Date(lastSuccess).toLocaleString('en-GB'):'Folder connected — awaiting first backup.';
}
function openSettings(){
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(SETTINGS_DB,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('settings'))req.result.createObjectStore('settings')};
  req.onerror=()=>reject(req.error||Error('Backup settings database unavailable'));
  req.onsuccess=()=>{storage=req.result;resolve()};
 });
}
function settingGet(key){return new Promise((resolve,reject)=>{
 const req=storage.transaction('settings','readonly').objectStore('settings').get(key);
 req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('Cannot read backup settings'));
})}
function settingPut(key,value){return new Promise((resolve,reject)=>{
 const tx=storage.transaction('settings','readwrite');tx.objectStore('settings').put(value,key);
 tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||Error('Cannot save backup settings'));
})}
function permission(mode){return folder?folder.queryPermission({mode:mode||'readwrite'}):Promise.resolve('denied')}
function schedule(){if(!folder||!enabled)return;dirty=true;if(timer)clearTimeout(timer);timer=setTimeout(()=>{timer=null;flush()},4000);notify()}
function flush(){processing=processing.catch(()=>{}).then(async()=>{
 if(!dirty||!enabled||!folder)return;
 dirty=false;
 try{
  if(await permission()!=='granted'){enabled=false;throw Error('Folder permission expired — reconnect from Backup Settings')}
  if(typeof window.browserSavePending==='function')await window.browserSavePending();
  const response=window.onboardDesktop.read();
  if(!response.ok||!response.data)throw Error('Saved dashboard records unavailable');
  const payload=JSON.stringify({app:'Onboard Corrugated H&S Dashboard',version:2,exportedAt:new Date().toISOString(),data:response.data},null,2);
  const bytes=new Blob([payload],{type:'application/json'});
  const day=new Date().toISOString().slice(0,10);
  // Keep one current copy plus a separate per-day recovery point.
  for(const name of [FILE_LATEST,'onboard-hs-'+day+'.json']){
   const handle=await folder.getFileHandle(name,{create:true});
   const writer=await handle.createWritable();await writer.write(bytes);await writer.close();
  }
  lastSuccess=new Date().toISOString();lastError='';
  if(storage)await settingPut('lastSuccess',lastSuccess);
 }catch(e){lastError=e.message||String(e);console.error('Automatic backup failed',e)}
 finally{notify()}
 if(dirty&&enabled)schedule();
});return processing}
async function attachFolder(handle){
 folder=handle;lastFolderName=handle.name||'Selected folder';
 await settingPut('folder',handle);
 enabled=true;lastError='';dirty=true;notify();return flush()
}
async function chooseFolder(){
 if(!supported){alert('This Edge/browser mode cannot choose a local backup folder. Use Export Backup instead.');return}
 try{
  const handle=await window.showDirectoryPicker({id:'onboard-hs-backups',mode:'readwrite'});
  if(await handle.queryPermission({mode:'readwrite'})!=='granted'){
   const result=await handle.requestPermission({mode:'readwrite'});
   if(result!=='granted')throw Error('Write access was not granted');
  }
  await attachFolder(handle);
  alert(lastError?'Folder selected, but backup failed: '+lastError:'Backup folder connected. An initial backup has been created.');
 }catch(e){if(e.name!=='AbortError')alert('Could not set up backups: '+e.message)}
 notify()
}
async function reconnect(){
 if(!folder)return chooseFolder();
 try{
  const result=await folder.requestPermission({mode:'readwrite'});
  if(result!=='granted')throw Error('Folder access was not granted');
  enabled=true;lastError='';dirty=true;await flush();
  if(lastError)alert('Backup issue: '+lastError)
 }catch(e){lastError=e.message;alert('Unable to reconnect: '+e.message)}
 notify()
}
async function backupNow(){
 if(!folder)return chooseFolder();
 if(!enabled)return reconnect();
 dirty=true;await flush();
 if(lastError)alert('Backup failed: '+lastError);else alert('Backup saved successfully to '+lastFolderName)
}
function renderSettings(){
 return '<section class="panel backup-settings"><div class="section-title"><h2>Automatic Backup</h2><span class="muted">Local browser version</span></div>'+
 '<p>Choose an <strong>IT-approved company OneDrive folder</strong> once. While this page is open and folder permission remains available, changes to H&S records will automatically create backup copies in that folder.</p>'+
 '<div class="backup-status"><strong>Backup status</strong><p id="backup-live-status">'+escapeHtml(statusLine())+'</p><small>Folder: '+escapeHtml(lastFolderName||'None selected')+'</small></div>'+
 '<div class="backup-actions"><button type="button" class="btn primary" data-backup-action="choose">Choose backup folder</button>'+
 '<button type="button" class="btn" data-backup-action="reconnect">Reconnect folder</button>'+
 '<button type="button" class="btn" data-backup-action="now">Back up now</button></div>'+
 '<p class="file-tip">Backups are named '+FILE_LATEST+' and onboard-hs-YYYY-MM-DD.json (one recovery point per day). They include attachments and are saved only to the folder you choose. The browser may ask for permission again after restarting.</p>'+
 '<p class="notice"><strong>Important:</strong> Automatic folder backups work only while this dashboard is open and authorised. Check the last successful backup and your organisation’s OneDrive sync/retention policy. Never put employee records in a personal or unapproved folder.</p>'+
 '</section>';
}
function escapeHtml(v){return String(v||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function bindControls(){document.querySelectorAll('[data-backup-action]').forEach(btn=>{
 btn.onclick=()=>{const action=btn.dataset.backupAction;if(action==='choose')chooseFolder();else if(action==='reconnect')reconnect();else if(action==='now')backupNow()}
})}
if(window.onboardDesktop&&typeof window.onboardDesktop.backupStatus==='function'){
 let nativeState=null;
 const nativeStatus=()=>nativeState
  ?nativeState.lastError?'Backup warning: '+nativeState.lastError
   :!nativeState.folder?'No folder selected — choose an approved company OneDrive folder.'
   :nativeState.lastSuccess?'Last backup: '+new Date(nativeState.lastSuccess).toLocaleString('en-GB')
   :'Folder selected. A backup will be saved when records are written.'
  :'Checking backup settings…';
 const nativeRender=()=>{
  window.onboardDesktop.backupStatus().then(state=>{nativeState=state;const el=document.getElementById('backup-live-status');if(el)el.textContent=nativeStatus()}).catch(e=>console.warn('Could not load backup state',e));
  return '<section class="panel backup-settings"><div class="section-title"><h2>Automatic Backup</h2><span class="muted">Windows desktop version</span></div><p>Select an IT-approved company OneDrive folder. The EXE will save a current backup and a dated copy automatically whenever you save records.</p><div class="backup-status"><strong>Backup status</strong><p id="backup-live-status">'+escapeHtml(nativeStatus())+'</p></div><div class="backup-actions"><button class="btn primary" type="button" data-backup-action="choose-native">Choose backup folder</button><button class="btn" type="button" data-backup-action="now-native">Back up now</button></div><p class="file-tip">Your records also remain in the Windows application data folder, separate from the browser version. Confirm company OneDrive has synced the files. Automatic backups are not a substitute for your organisation\'s backup and retention policy.</p></section>';
 };
 const nativeBind=()=>document.querySelectorAll('[data-backup-action]').forEach(button=>button.onclick=async()=>{
  try{
   const state=button.dataset.backupAction==='choose-native'?await window.onboardDesktop.chooseBackupFolder():await window.onboardDesktop.backupNow();
   nativeState=state;
   const el=document.getElementById('backup-live-status');if(el)el.textContent=nativeStatus();
   if(state.lastError)alert('Backup problem: '+state.lastError);
  }catch(e){alert('Could not access backup folder: '+e.message)}
 });
 window.onboardAutoBackup={renderSettings:nativeRender,bindControls:nativeBind,statusLine:nativeStatus};
 return;
}
const api={renderSettings,bindControls,statusLine,chooseFolder,reconnect,backupNow};
window.onboardAutoBackup=api;
Promise.resolve(window.browserReady).then(async()=>{
 if(!supported){ready=true;notify();return}
 try{
  await openSettings();
  folder=await settingGet('folder')||null;
  lastSuccess=await settingGet('lastSuccess')||'';
  lastFolderName=folder?.name||'';
  if(folder)enabled=await permission()==='granted';
  // Wrap only the synchronous write interface; never alter record data.
  const original=window.onboardDesktop;
  window.onboardDesktop={...original,write(data){const result=original.write(data);if(result?.ok)schedule();return result}};
  ready=true;notify();
 }catch(e){lastError=e.message;console.error('Automatic backup initialisation failed',e);notify()}
});
window.addEventListener('pagehide',()=>{if(timer){clearTimeout(timer);timer=null}if(dirty&&enabled)flush()});
})();
