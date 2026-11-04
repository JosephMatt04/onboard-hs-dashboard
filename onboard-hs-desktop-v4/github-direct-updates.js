'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {newerVersion,validateManifest,hashFile,MANIFEST_FILE}=require('./updates');
const exec=promisify(execFile);
const REPO='JosephMatt04/onboard-hs-dashboard';
const WORKFLOW='build-windows.yml';
const ARTIFACT='Onboard-HS-Windows-Installer';
const GITHUB_CHECK_DELAY=18000;
const CHECK_PERIOD=4*60*60*1000;

// This app uses the user's *existing* GitHub CLI login. No credentials are copied,
// embedded in the installer, saved by the app, or sent to a publisher service.
function createGithubDirectUpdates({
 app,updateEngine,
 platform=process.platform,
 runGh=async args=>(await exec('gh',args,{timeout:180000,maxBuffer:1024*1024,windowsHide:true})).stdout,
 clock=()=>new Date(),
 startTimers=true
}){
 let busy=false,lastCheck='',lastError='',detail='Sign in once using GitHub CLI to enable direct updates.',lastRunId='',timer=null,interval=null;
 const state=()=>({enabled:platform==='win32',folder:'Private GitHub Actions',version:app.getVersion(),lastCheck,lastError,detail,runId:lastRunId});
 async function ghJson(args){
  const out=await runGh(args);
  return JSON.parse(String(out).trim());
 }
 async function check(manual=false){
  if(platform!=='win32')return {...state(),detail:'GitHub updates are only supported in the installed Windows application.'};
  if(busy)return {...state(),detail:'A GitHub update check is already running.'};
  busy=true;
  try{
   const runs=await ghJson(['run','list','--repo',REPO,'--workflow',WORKFLOW,'--branch','main','--limit','1','--json','databaseId,status,conclusion']);
   if(!Array.isArray(runs)||runs.length===0)throw Error('No GitHub Windows builds have been found.');
   const run=runs[0];
   if(!Number.isSafeInteger(run.databaseId)||run.databaseId<=0)throw Error('Invalid GitHub build identifier.');
   lastRunId=String(run.databaseId);
   if(run.status!=='completed'||run.conclusion!=='success'){
    detail='Latest GitHub build is '+String(run.status)+' / '+String(run.conclusion)+'. The dashboard will keep its current version.';
    lastError='';lastCheck=clock().toISOString();return state();
   }
   const cacheRoot=path.join(app.getPath('userData'),'github-update-cache');
   const cacheDir=path.join(cacheRoot,'run-'+lastRunId);
   fs.mkdirSync(cacheRoot,{recursive:true});
   let manifest,installer;
   const validateCached=async()=>{
    const manifestPath=path.join(cacheDir,MANIFEST_FILE);
    if(!fs.existsSync(manifestPath))return false;
    if(fs.statSync(manifestPath).size>16384)throw Error('GitHub manifest is too large.');
    manifest=validateManifest(JSON.parse(fs.readFileSync(manifestPath,'utf8')));
    if(manifest.file!=='Onboard-HS-Dashboard-Setup-'+manifest.version+'-x64.exe')throw Error('GitHub installer version does not match the manifest.');
    installer=path.join(cacheDir,manifest.file);
    if(!fs.existsSync(installer))return false;
    if(fs.lstatSync(installer).isSymbolicLink())throw Error('Installer is a symbolic link.');
    const stats=fs.statSync(installer);
    if(!stats.isFile()||stats.size!==manifest.size)throw Error('GitHub installer size mismatch.');
    if((await hashFile(installer)).toLowerCase()!==manifest.sha256.toLowerCase())throw Error('GitHub installer checksum mismatch.');
    return true;
   };
   let validCache=false;
   try{validCache=await validateCached()}catch(e){
    // Corrupt cache never gets reused. Replace it from the authenticated build.
    fs.rmSync(cacheDir,{recursive:true,force:true});
   }
   if(!validCache){
    fs.mkdirSync(cacheDir,{recursive:true});
    try{
     await runGh(['run','download',lastRunId,'--repo',REPO,'--name',ARTIFACT,'--dir',cacheDir]);
     if(!await validateCached())throw Error('GitHub build download is incomplete.');
    }catch(e){
     fs.rmSync(cacheDir,{recursive:true,force:true});
     throw e;
    }
   }
   lastError='';lastCheck=clock().toISOString();
   if(!newerVersion(manifest.version,app.getVersion())){
    detail='Your dashboard is up to date (v'+app.getVersion()+').';
    return state();
   }
   detail='GitHub version '+manifest.version+' downloaded and verified. Offering installation.';
   const status=await updateEngine.checkFromFolder(cacheDir,manual);
   if(status.lastError)throw Error(status.lastError);
   detail=status.detail||detail;
   return state();
  }catch(e){
   lastError=String(e.message||e);
   detail=/\bgh\b.*(ENOENT|not found|recognized)/i.test(lastError)
    ?'GitHub CLI was not found. Install it and sign in using gh auth login.'
    : 'GitHub update check failed: '+lastError+'. The existing Z: updater remains available.';
   return state();
  }finally{busy=false}
 }
 function start(){
  if(platform!=='win32'||!startTimers)return;
  timer=setTimeout(()=>{
   check(false).catch(()=>{});
   interval=setInterval(()=>check(false).catch(()=>{}),CHECK_PERIOD);
   interval.unref?.();
  },GITHUB_CHECK_DELAY);
  timer.unref?.();
  app.once('before-quit',()=>{clearTimeout(timer);clearInterval(interval)});
 }
 return {start,check,status:state};
}
module.exports={createGithubDirectUpdates};
