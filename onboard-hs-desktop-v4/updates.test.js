'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {createUpdates} = require('./updates');
function fixture(packaged=true) {
  const app = Object.assign(new EventEmitter(), {isPackaged:packaged,getVersion:()=> '4.9.1'});
  const updater = Object.assign(new EventEmitter(), {setFeedURL(value){this.feed=value;},checkForUpdates:async()=>{updater.emit('update-not-available');return null;},quitAndInstall(){this.installed=true;}});
  let answer=1;
  const api=createUpdates({app,platform:'win32',config:{enabled:true,owner:'JosephMatt04',repo:'onboard-hs-dashboard'},getUpdater:()=>updater,getWindow:()=>({isDestroyed:()=>false}),dialog:{showMessageBox:async()=>({response:answer})}});
  api.start();
  return {api,updater,app,answer(value){answer=value;}};
}
test('development never enables updater',async()=>{const f=fixture(false);assert.equal(f.api.status().enabled,false);assert.equal(f.updater.feed,undefined);});
test('release checks use GitHub and auto download without auto install',async()=>{const f=fixture();try{assert.equal(f.updater.feed.provider,'github');assert.equal(f.updater.autoDownload,true);assert.equal(f.updater.autoInstallOnAppQuit,false);assert.match((await f.api.check()).detail,/latest/);}finally{f.app.emit('before-quit');}});
test('offline failures are returned without interrupting the dashboard',async()=>{const f=fixture();try{f.updater.checkForUpdates=async()=>{throw Error('offline');};assert.equal((await f.api.check()).error,'offline');}finally{f.app.emit('before-quit');}});
test('downloaded update waits for consent and can be installed later',async()=>{const f=fixture();try{f.updater.emit('update-downloaded');await new Promise(resolve=>setImmediate(resolve));assert.equal(f.updater.installed,undefined);f.answer(0);await f.api.check(true);assert.equal(f.updater.installed,true);}finally{f.app.emit('before-quit');}});
