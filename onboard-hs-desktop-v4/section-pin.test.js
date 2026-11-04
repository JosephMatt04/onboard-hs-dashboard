'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createSectionPin}=require('./section-pin');
test('PIN settings persist salted hash, protect selected sections and reset unlock on restart',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'onboard-pin-'));const file=path.join(dir,'pin.json');
 try{
  const pin=createSectionPin(file);
  assert.equal(pin.status().enabled,false);
  assert.equal(pin.configure('1234',['training']).ok,false);
  assert.equal(pin.configure('837194',['training','incidents','ppe']).ok,true);
  const stored=fs.readFileSync(file,'utf8');
  assert.equal(stored.includes('837194'),false);
  assert.equal(pin.status().unlocked,false);
  assert.equal(pin.verify('999999').ok,false);
  assert.equal(pin.verify('837194').ok,true);
  assert.equal(pin.status().unlocked,true);
  assert.equal(pin.lock().unlocked,false);
  const reopened=createSectionPin(file);
  assert.equal(reopened.status().enabled,true);
  assert.equal(reopened.status().unlocked,false);
  assert.deepEqual(reopened.status().sections,['training','incidents','ppe']);
  assert.equal(reopened.configure('928164',['sites'],'invalid').ok,false);
  assert.equal(reopened.configure('928164',['sites'],'837194').ok,true);
  assert.equal(reopened.verify('837194').ok,false);
  assert.equal(reopened.verify('928164').ok,true);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('PIN enforces retry cooldown and disallows unrecognized sections',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'onboard-pin-'));let time=0;
 try{
  const pin=createSectionPin(path.join(dir,'pin.json'),{now:()=>time});
  assert.equal(pin.configure('123456',['madeUp']).ok,false);
  assert.equal(pin.configure('123456',['training']).ok,true);
  for(let i=0;i<5;i++)assert.equal(pin.verify('000000').ok,false);
  assert.equal(pin.verify('123456').ok,false);
  assert.equal(pin.status().blockedSeconds,600);
  time=600001;
  assert.equal(pin.verify('123456').ok,true);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
