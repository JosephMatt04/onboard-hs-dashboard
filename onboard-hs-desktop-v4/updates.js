'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');

const MAX_INSTALLER_BYTES = 600 * 1024 * 1024;
const MANIFEST_FILE = 'onboard-hs-update.json';
function versionParts(value) {
  if(typeof value!=='string'||!/^\d+\.\d+\.\d+$/.test(value))return null;
  const parts=value.split('.').map(Number);
  return parts.every(x=>Number.isSafeInteger(x)&&x>=0)?parts:null;
}
function newerVersion(candidate, current) {
  const a=versionParts(candidate),b=versionParts(current);
  if(!a||!b)return false;
  for(let i=0;i<3;i++){if(a[i]>b[i])return true;if(a[i]<b[i])return false}
  return false;
}
function validateManifest(manifest) {
  if(!manifest||typeof manifest!=='object')throw Error('Update manifest is missing');
  if(!versionParts(manifest.version))throw Error('Invalid update version');
  if(typeof manifest.file!=='string'||!/^Onboard-HS-Dashboard-Setup-[a-zA-Z0-9._-]+\.exe$/.test(manifest.file)||manifest.file.includes('..'))throw Error('Invalid installer filename');
  if(!/^[a-f0-9]{64}$/i.test(manifest.sha256||''))throw Error('Invalid installer checksum');
  if(!Number.isSafeInteger(manifest.size)||manifest.size<=0||manifest.size>MAX_INSTALLER_BYTES)throw Error('Invalid installer size');
  return manifest;
}
function hashFile(filename){return new Promise((resolve,reject)=>{
 const hash=crypto.createHash('sha256');
 const stream=fs.createReadStream(filename);
 stream.on('data',chunk=>hash.update(chunk));stream.on('error',reject);stream.on('end',()=>resolve(hash.digest('hex')));
})}
function createUpdates({app,dialog,getWindow,settingsFile,platform=process.platform,watchMs=4*60*60*1000,initialMs=15000,spawnInstaller=spawn}) {
 let folder='',timer=null,interval=null,busy=false,available=null,detail='Choose a restricted update folder to enable automatic checks.',lastCheck='',lastError='';
 try{const stored=JSON.parse(fs.readFileSync(settingsFile,'utf8'));if(typeof stored.folder==='string')folder=stored.folder}catch{}
 const status=()=>({enabled:Boolean(folder)&&platform==='win32',folder,version:app.getVersion(),detail,lastCheck,lastError,availableVersion:available?.manifest.version||''});
 async function inspect() {
  if(!folder)throw Error('Select an approved update folder first');
  const raw=fs.readFileSync(path.join(folder,MANIFEST_FILE),'utf8');
  if(Buffer.byteLength(raw,'utf8')>16384)throw Error('Update manifest too large');
  const manifest=validateManifest(JSON.parse(raw));
  if(!newerVersion(manifest.version,app.getVersion()))return null;
  const file=path.join(folder,manifest.file);
  const stats=fs.statSync(file);
  if(!stats.isFile()||stats.size!==manifest.size)throw Error('Installer size does not match the manifest');
  const digest=await hashFile(file);
  if(digest.toLowerCase()!==manifest.sha256.toLowerCase())throw Error('Installer checksum mismatch — do not install');
  return {manifest,file};
 }
 async function check(manual=false) {
  if(platform!=='win32')return {...status(),detail:'Windows updates are only available in the Windows application'};
  if(busy)return {...status(),detail:'An update check is already running'};
  if(!folder)return {...status(),detail:'Choose an approved folder in Update Settings to enable checking'};
  busy=true;
  try{
   available=await inspect();
   lastCheck=new Date().toISOString();lastError='';
   detail=available?'Version '+available.manifest.version+' is available in your approved folder.':'Your installed version is up to date with the selected folder.';
   if(available&&manual)await offerInstall();
  }catch(e){available=null;lastError=e.message;detail='Update check failed: '+e.message;}
  finally{busy=false}
  return status();
 }
 async function offerInstall(){
  if(!available)return status();
  // Verify once again immediately before launching. Folder contents may have changed.
  let candidate;
  try{candidate=await inspect()}catch(e){lastError=e.message;return {...status(),error:e.message}}
  if(!candidate||candidate.manifest.sha256!==available.manifest.sha256){available=null;return {...status(),error:'Update changed. Please check for updates again'}}
  const w=getWindow();
  const response=await dialog.showMessageBox(w,{
   type:'question',title:'Approved dashboard update',
   message:'Install Onboard H&S Dashboard '+candidate.manifest.version+'?',
   detail:'Installer: '+candidate.manifest.file+'\nFrom your restricted update folder. The SHA256 checksum matches. The installer must also be approved by company IT; the EXE is not digitally signed. Your local records are stored separately. Close your work and keep a backup before proceeding.',
   buttons:['Install update','Later'],defaultId:1,cancelId:1
  });
  if(response.response!==0)return {...status(),detail:'Update deferred. Check again when ready.'};
  try{
   const child=spawnInstaller(candidate.file,[],{detached:true,stdio:'ignore',windowsHide:false});
   child.unref();
   detail='Update installer started. Finish the installation in Windows.';
   setImmediate(()=>app.quit());
  }catch(e){lastError=e.message;return {...status(),error:'Installer could not start: '+e.message}}
  return status();
 }
 async function chooseFolder(){
  const w=getWindow();
  const selection=await dialog.showOpenDialog(w,{title:'Choose approved H&S update folder',properties:['openDirectory']});
  if(selection.canceled||!selection.filePaths?.[0])return status();
  const selected=selection.filePaths[0];
  if(!fs.statSync(selected).isDirectory())throw Error('Please select a folder');
  fs.mkdirSync(path.dirname(settingsFile),{recursive:true});
  fs.writeFileSync(settingsFile,JSON.stringify({folder:selected},null,2),'utf8');
  folder=selected;available=null;detail='Folder connected. Checking for an approved installer.';
  return check(false);
 }
 function start(){
  if(platform!=='win32')return;
  timer=setTimeout(()=>{check(false).catch(()=>{});interval=setInterval(()=>check(false).catch(()=>{}),watchMs);interval.unref?.()},initialMs);
  timer.unref?.();
  app.once('before-quit',()=>{clearTimeout(timer);clearInterval(interval)});
 }
 return {start,check,status,chooseFolder,offerInstall};
}
module.exports={createUpdates,newerVersion,validateManifest,hashFile,MANIFEST_FILE};
