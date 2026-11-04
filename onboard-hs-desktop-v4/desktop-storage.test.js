'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');

const main=fs.readFileSync(path.join(__dirname,'main.js'),'utf8');
function storageFixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'onboard-storage-'));
 const userData=path.join(root,'user-data');
 const backupFolder=path.join(root,'backups');
 fs.mkdirSync(backupFolder,{recursive:true});
 const app={getPath:()=>userData,getVersion:()=> '4.9.6',whenReady:()=>({then:()=>{}}),on:()=>{}};
 const electron={app,BrowserWindow:function(){},ipcMain:{on:()=>{},handle:()=>{}},dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[backupFolder]})}};
 const req=name=>{
  if(name==='electron')return electron;
  if(name==='node:path')return path;
  if(name==='node:fs')return fs;
  if(name==='./updates')return {createUpdates:()=>({start:()=>{},status:()=>({})})};
  if(name==='./github-direct-updates')return {createGithubDirectUpdates:()=>({start:()=>{},status:()=>({})})};
  if(name==='./section-pin')return {createSectionPin:()=>({status:()=>({})})};
  throw Error('Unexpected require: '+name);
 };
 const context={require:req,Buffer,console,Date,Error,setImmediate,setTimeout,clearTimeout,process};
 vm.createContext(context);
 vm.runInContext(main+'\nthis.storageTest={writeRecords,readRecords,chooseBackupFolder,backupNow,backupStatus}',context,{timeout:1000});
 return {...context.storageTest,root,backupFolder,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
function example(){
 return {risk:[],ssow:[],ppe:[],incidents:[],assets:[],ppeStock:[],training:[],sites:[]};
}
test('Windows data and dated/latest backups are saved without changing register structure',async()=>{
 const x=storageFixture();
 try{
  assert.equal(x.backupNow().lastError,'No saved dashboard records to back up');
  await x.chooseBackupFolder();
  const records=example();
  records.sites.push({id:'test-location',name:'Test Warehouse',status:'Operational'});
  assert.equal(x.writeRecords(records).ok,true);
  assert.equal(fs.existsSync(path.join(x.backupFolder,'onboard-hs-latest.json')),true);
  assert.equal(fs.existsSync(path.join(x.backupFolder,'onboard-hs-'+new Date().toISOString().slice(0,10)+'.json')),true);
  const latest=JSON.parse(fs.readFileSync(path.join(x.backupFolder,'onboard-hs-latest.json'),'utf8'));
  assert.equal(latest.data.sites[0].name,'Test Warehouse');
  const persisted=x.readRecords();
  assert.equal(persisted.ok,true);
  assert.equal(persisted.data.sites[0].name,'Test Warehouse');
  assert.equal(x.backupNow().lastError,'');
 }finally{x.cleanup()}
});
test('Windows data writer preserves the previous version for rollback and rejects malformed records',()=>{
 const x=storageFixture();
 try{
  const original=example();original.risk.push({id:'ra1',title:'First'});
  assert.equal(x.writeRecords(original).ok,true);
  const updated=example();updated.risk.push({id:'ra1',title:'Second'});
  assert.equal(x.writeRecords(updated).ok,true);
  assert.equal(fs.existsSync(path.join(x.root,'user-data','records.json.previous.json')),true);
  const previous=JSON.parse(fs.readFileSync(path.join(x.root,'user-data','records.json.previous.json'),'utf8'));
  assert.equal(previous.risk[0].title,'First');
  assert.equal(x.readRecords().data.risk[0].title,'Second');
  assert.equal(x.writeRecords({risk:[]}).ok,false);
  assert.equal(x.readRecords().data.risk[0].title,'Second');
 }finally{x.cleanup()}
});
