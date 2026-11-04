'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const ALLOWED=['risk','ssow','ppe','ppeStock','training','incidents','assets','sites','audits','briefings','inductions','permits','assetChecks','lone','contractors'];
const DEFAULT=['training','incidents','ppe'];
function createSectionPin(settingsFile,{now=()=>Date.now()}={}){
 let cfg=null,unlocked=false,failures=0,blockedUntil=0;
 try{
  const loaded=JSON.parse(fs.readFileSync(settingsFile,'utf8'));
  if(loaded&&typeof loaded.salt==='string'&&/^[a-f0-9]{32}$/.test(loaded.salt)&&typeof loaded.hash==='string'&&/^[a-f0-9]{128}$/.test(loaded.hash)&&Array.isArray(loaded.sections)){
   cfg={salt:loaded.salt,hash:loaded.hash,sections:loaded.sections.filter(s=>ALLOWED.includes(s))};
  }
 }catch{}
 const hash=(pin,salt)=>crypto.scryptSync(pin,Buffer.from(salt,'hex'),64,{N:16384,r:8,p:1}).toString('hex');
 function valid(pin){return typeof pin==='string'&&/^\d{6,12}$/.test(pin)}
 const status=()=>({enabled:!!cfg,sections:cfg?cfg.sections:DEFAULT,unlocked:!!cfg&&unlocked,blockedSeconds:Math.max(0,Math.ceil((blockedUntil-now())/1000))});
 function verify(pin){
  if(!cfg)return {ok:false,error:'Set up a PIN first',...status()};
  if(now()<blockedUntil)return {ok:false,error:'Too many attempts. Please try again later.',...status()};
  // Always perform a KDF for any candidate of bounded length.
  const candidate=typeof pin==='string'&&pin.length<=128?pin:'';
  const test=Buffer.from(hash(candidate,cfg.salt),'hex');
  if(crypto.timingSafeEqual(test,Buffer.from(cfg.hash,'hex'))){failures=0;blockedUntil=0;unlocked=true;return {ok:true,...status()}}
  failures++;
  if(failures>=5){failures=0;blockedUntil=now()+10*60*1000;}
  return {ok:false,error:'Incorrect PIN',...status()};
 }
 function configure(pin,sections,currentPin){
  if(cfg){
   const auth=verify(currentPin);
   if(!auth.ok)return auth;
  }
  if(!valid(pin))return {ok:false,error:'Use a numeric PIN between 6 and 12 digits.',...status()};
  if(!Array.isArray(sections)||sections.some(s=>!ALLOWED.includes(s))||new Set(sections).size!==sections.length) return {ok:false,error:'Invalid protected sections.',...status()};
  if(sections.length===0)return {ok:false,error:'Select at least one section.',...status()};
  const salt=crypto.randomBytes(16).toString('hex');
  cfg={salt,hash:hash(pin,salt),sections};
  fs.mkdirSync(path.dirname(settingsFile),{recursive:true});
  const tmp=settingsFile+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(cfg),'utf8');
  fs.renameSync(tmp,settingsFile);
  unlocked=false;failures=0;blockedUntil=0;
  return {ok:true,...status()};
 }
 function lock(){unlocked=false;return status()}
 return {status,verify,configure,lock,ALLOWED};
}
module.exports={createSectionPin,ALLOWED,DEFAULT};
