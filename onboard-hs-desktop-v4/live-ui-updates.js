'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const API_PATH='repos/JosephMatt04/onboard-hs-dashboard/contents/onboard-hs-desktop-v4/app/index.html?ref=main';
const MAX_HTML_BYTES=2*1024*1024;
function validateUi(html){
 if(typeof html!=='string'||Buffer.byteLength(html,'utf8')>MAX_HTML_BYTES)throw Error('Dashboard interface file is invalid or too large');
 if(!html.startsWith('<!doctype html>')||!html.includes('id="content"')||!html.includes('window.onboardDesktop'))throw Error('Downloaded file is not the expected dashboard interface');
 if(/<base\b/i.test(html))throw Error('Unexpected base URL in interface');
 const scripts=[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m=>m[1]);
 if(scripts.length!==2||scripts[0]!=='browser-bridge.js'||scripts[1]!=='auto-backup.js')throw Error('Dashboard script dependencies have changed; use a desktop update instead');
 return html;
}
function createLiveUiUpdates({app,getWindow,bundledUi,runGh=async args=>(await exec('gh',args,{timeout:90000,maxBuffer:4*1024*1024,windowsHide:true})).stdout}){
 const home=path.join(app.getPath('userData'),'live-ui');
 const liveFile=path.join(home,'index.html');
 let busy=false,lastCheck='',lastError='',source='Bundled interface',lastHash='';
 const baseUrl=require('node:url').pathToFileURL(path.dirname(bundledUi)+path.sep).href;
 const injectBase=html=>html.replace('<head>','<head>\n<base href="'+baseUrl+'">');
 const defaultUi=()=>bundledUi;
 const activeUi=()=>{
  try{if(fs.existsSync(liveFile)){const html=fs.readFileSync(liveFile,'utf8');if(html.includes('<base href="'+baseUrl+'">')&&html.includes('id="content"')){source='Refreshable interface';return liveFile}}}catch{}
  return defaultUi();
 };
 async function loadCurrent(){
  const win=getWindow();
  if(win&&!win.isDestroyed())await win.loadFile(activeUi());
 }
 function status(){return {enabled:true,busy,lastCheck,lastError,source,hash:lastHash};}
 async function refresh(){
  if(busy)return {...status(),detail:'An interface refresh is already running.'};
  busy=true;
  try{
   const response=String(await runGh(['api',API_PATH,'--jq','.content'])).replace(/\s/g,'');
   if(!response||!/^[A-Za-z0-9+/]*={0,2}$/.test(response)||response.length>MAX_HTML_BYTES*2)throw Error('Invalid GitHub response');
   const bytes=Buffer.from(response,'base64');
   if(bytes.length>MAX_HTML_BYTES||bytes.length<1000)throw Error('Invalid interface file size');
   const html=validateUi(bytes.toString('utf8'));
   const nextHash=crypto.createHash('sha256').update(html).digest('hex');
   const currentHash=fs.existsSync(liveFile)?crypto.createHash('sha256').update(fs.readFileSync(liveFile,'utf8').replace('<base href="'+baseUrl+'">','')).digest('hex'):'';
   if(nextHash!==currentHash){
    fs.mkdirSync(home,{recursive:true});
    const tmp=liveFile+'.tmp';
    try{fs.writeFileSync(tmp,injectBase(html),{encoding:'utf8',mode:0o600});fs.renameSync(tmp,liveFile)}
    finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}
   }
   lastHash=nextHash;lastCheck=new Date().toISOString();lastError='';source='Refreshable interface';
   await loadCurrent();
   return {...status(),detail:nextHash===currentHash?'Interface reloaded — already up to date.':'Latest dashboard interface loaded. No installer needed.'};
  }catch(e){
   lastError=String(e.message||e);
   return {...status(),detail:'Refresh failed; existing dashboard unchanged: '+lastError};
  }finally{busy=false}
 }
 async function restore(){
  if(fs.existsSync(liveFile))fs.unlinkSync(liveFile);
  source='Bundled interface';lastError='';
  await loadCurrent();
  return {...status(),detail:'Restored the interface included with this desktop version.'};
 }
 return {status,refresh,restore,activeUi,liveFile,bundledUi};
}
module.exports={createLiveUiUpdates,validateUi};
