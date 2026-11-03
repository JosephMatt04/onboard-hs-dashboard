'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {createUpdates,newerVersion,validateManifest}=require('./updates');

function setup(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'onboard-private-update-'));
 const app=Object.assign(new EventEmitter(),{getVersion:()=> '4.9.2',quit(){this.quitting=true}});
 const settingsFile=path.join(dir,'settings.json');
 const file='Onboard-HS-Dashboard-Setup-4.9.3-x64.exe';
 const content=Buffer.from('test-installer-content');
 fs.writeFileSync(path.join(dir,file),content);
 const manifest={version:'4.9.3',file,size:content.length,sha256:crypto.createHash('sha256').update(content).digest('hex')};
 fs.writeFileSync(path.join(dir,'onboard-hs-update.json'),JSON.stringify(manifest));
 let response=1,installed=null;
 const dialog={
  showOpenDialog:async()=>({canceled:false,filePaths:[dir]}),
  showMessageBox:async()=>({response})
 };
 const updates=createUpdates({app,dialog,getWindow:()=>null,settingsFile,platform:'win32',spawnInstaller:(file)=>{installed=file;return {unref(){}}}});
 return {updates,dir,app,manifest,file,reply:v=>response=v,installed:()=>installed,cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('strict version comparison rejects same, older and malformed versions',()=>{
 assert.equal(newerVersion('4.9.3','4.9.2'),true);
 assert.equal(newerVersion('4.9.2','4.9.2'),false);
 assert.equal(newerVersion('4.9.1','4.9.2'),false);
 assert.equal(newerVersion('../4.9.5','4.9.2'),false);
});
test('manifest rejects traversal and untrusted filenames',()=>{
 assert.throws(()=>validateManifest({version:'4.9.3',file:'../../evil.exe',sha256:'a'.repeat(64),size:20}));
 assert.throws(()=>validateManifest({version:'4.9.3',file:'Onboard-HS-Dashboard-Setup-4.9.3-x64.exe',sha256:'bad',size:20}));
});
test('update checks require an explicitly chosen private folder',async()=>{
 const x=setup();try{
  const before=await x.updates.check();
  assert.match(before.detail,/Choose an approved folder/);
  const after=await x.updates.chooseFolder();
  assert.equal(after.availableVersion,'4.9.3');
  assert.equal(after.enabled,true);
 }finally{x.cleanup()}
});
test('tampered installer is rejected before offering installation',async()=>{
 const x=setup();try{
  await x.updates.chooseFolder();
  fs.writeFileSync(path.join(x.dir,x.file),Buffer.from('tampered-installer-contents'));
  const result=await x.updates.check(true);
  assert.match(result.lastError,/size|checksum/);
  assert.equal(x.installed(),null);
 }finally{x.cleanup()}
});
test('newer update requires approval before launch',async()=>{
 const x=setup();try{
  await x.updates.chooseFolder();
  await x.updates.check(true);
  assert.equal(x.installed(),null);
  x.reply(0);
  await x.updates.check(true);
  assert.equal(x.installed(),path.join(x.dir,x.file));
 }finally{x.cleanup()}
});
