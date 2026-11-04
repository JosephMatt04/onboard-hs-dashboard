'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {createGithubDirectUpdates}=require('./github-direct-updates');
function makeFixture({buildVersion='4.9.7',currentVersion='4.9.6',conclusion='success'}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'onboard-github-'));
 let called=0,offered=null;
 const app={getVersion:()=>currentVersion,getPath:()=>root,once:()=>{}};
 const updateEngine={checkFromFolder:async(folder,manual)=>{offered={folder,manual};return {detail:'Installer prompt shown'}}};
 const runGh=async args=>{
  if(args[0]==='run'&&args[1]==='list')return JSON.stringify([{databaseId:123456,status:'completed',conclusion}]);
  if(args[0]==='run'&&args[1]==='download'){
   called++;
   const target=args[args.indexOf('--dir')+1];
   const filename='Onboard-HS-Dashboard-Setup-'+buildVersion+'-x64.exe';
   const bytes=Buffer.from('test Windows installer bytes');
   fs.writeFileSync(path.join(target,filename),bytes);
   fs.writeFileSync(path.join(target,'onboard-hs-update.json'),JSON.stringify({version:buildVersion,file:filename,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}));
   return '';
  }
  throw Error('Unexpected gh command '+args.join(' '));
 };
 const updater=createGithubDirectUpdates({app,updateEngine,runGh,platform:'win32',startTimers:false});
 return {updater,called:()=>called,offered:()=>offered,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('new private GitHub build downloads automatically, uses verified updater and reuses cache',async()=>{
 const f=makeFixture();
 try{
  const first=await f.updater.check(true);
  assert.match(first.detail,/Installer prompt/);
  assert.ok(f.offered().folder.includes('run-123456'));
  assert.equal(f.offered().manual,true);
  assert.equal(f.called(),1);
  await f.updater.check(false);
  assert.equal(f.called(),1);
 }finally{f.cleanup()}
});
test('same or older version is not offered to install',async()=>{
 const f=makeFixture({buildVersion:'4.9.6'});
 try{const s=await f.updater.check(true);assert.match(s.detail,/up to date/i);assert.equal(f.offered(),null)}finally{f.cleanup()}
});
test('failed latest workflow never installs older successful build',async()=>{
 const f=makeFixture({conclusion:'failure'});
 try{const s=await f.updater.check(true);assert.match(s.detail,/failure/i);assert.equal(f.called(),0)}finally{f.cleanup()}
});
