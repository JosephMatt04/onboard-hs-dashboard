'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createLiveUiUpdates,validateUi}=require('./live-ui-updates');
const bundled=path.join(__dirname,'app','index.html');
const latest=fs.readFileSync(bundled,'utf8');

test('accepts existing dashboard HTML; refuses unexpected script dependency and base',()=>{
 assert.equal(validateUi(latest),latest);
 assert.throws(()=>validateUi(latest.replace('src="auto-backup.js"','src="malicious-remote.js"')),/dependencies/);
 assert.throws(()=>validateUi(latest.replace('<head>','<head><base href="https://elsewhere.example/">')),/base/);
});
test('a successful UI refresh caches only HTML, uses packaged local assets, and can restore',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'onboard-refresh-test-'));
 const loaded=[];
 try{
  const updater=createLiveUiUpdates({
   app:{getPath:name=>name==='userData'?dir:''},
   bundledUi:bundled,
   getWindow:()=>({isDestroyed:()=>false,loadFile:async file=>loaded.push(file)}),
   runGh:async args=>{
    assert.deepEqual(args.slice(0,1),['api']);
    assert.ok(args[1].includes('?ref=main'));
    return Buffer.from(latest).toString('base64')+'\n';
   }
  });
  assert.equal(updater.activeUi(),bundled);
  const status=await updater.refresh();
  assert.equal(status.lastError,'');
  assert.ok(fs.existsSync(updater.liveFile));
  assert.equal(updater.activeUi(),updater.liveFile);
  assert.ok(fs.readFileSync(updater.liveFile,'utf8').includes('<base href="file:'));
  assert.equal(loaded.at(-1),updater.liveFile);
  assert.equal((await updater.restore()).source,'Bundled interface');
  assert.equal(updater.activeUi(),bundled);
  assert.equal(loaded.at(-1),bundled);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('bad updates leave a previously cached interface in place',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'onboard-refresh-fail-'));
 try{
  let valid=true;
  const updater=createLiveUiUpdates({
   app:{getPath:()=>dir},
   bundledUi:bundled,
   getWindow:()=>({isDestroyed:()=>false,loadFile:async()=>{}}),
   runGh:async()=>Buffer.from(valid?latest:'not html').toString('base64')
  });
  assert.equal((await updater.refresh()).lastError,'');
  const original=fs.readFileSync(updater.liveFile,'utf8');
  valid=false;
  assert.ok((await updater.refresh()).lastError);
  assert.equal(fs.readFileSync(updater.liveFile,'utf8'),original);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
