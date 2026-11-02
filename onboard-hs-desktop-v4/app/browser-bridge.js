(function(){
'use strict';
if(window.onboardDesktop)return;
window.browserReady=new Promise((resolve,reject)=>{
const request=indexedDB.open('OnboardLocalRecords',1);
request.onupgradeneeded=()=>request.result.createObjectStore('data');
request.onerror=()=>reject(request.error||Error('IndexedDB cannot open'));
request.onsuccess=()=>{
const db=request.result;
const read=db.transaction('data','readonly').objectStore('data').get('records');
read.onerror=()=>reject(read.error||Error('Cannot read records'));
read.onsuccess=()=>{
let records=read.result||null;
let pending=0;
let latest=Promise.resolve();
let failed=false;
const banner=document.createElement('div');
banner.setAttribute('role','status');
banner.style.cssText='position:fixed;bottom:12px;left:12px;z-index:9999;border-radius:8px;padding:8px 12px;font:13px Segoe UI,Arial,sans-serif;box-shadow:0 2px 12px #0002;background:#fff;color:#31422b;border:1px solid #dfe7d8;display:none';
document.body.appendChild(banner);
function status(message,error){banner.textContent=message;banner.style.display='block';banner.style.color=error?'#a52020':'#31422b';if(!error&&!pending)setTimeout(()=>{if(!pending&&!failed)banner.style.display='none'},1800)}
function persisted(snapshot){return new Promise((resolve,reject)=>{
const tx=db.transaction('data','readwrite');
tx.objectStore('data').put(snapshot,'records');
tx.oncomplete=resolve;
tx.onerror=()=>reject(tx.error||Error('Storage write failed'));
tx.onabort=()=>reject(tx.error||Error('Storage write aborted'));
})}
window.addEventListener('beforeunload',event=>{
if(pending||failed){event.preventDefault();event.returnValue='Your dashboard has unsaved changes. Please remain on this page.';}
});
window.onboardDesktop=Object.freeze({
read:()=>({ok:true,data:records}),
write:data=>{
try{
const snapshot=structuredClone(data);
records=snapshot;
pending++;
status('Saving dashboard changes…',false);
latest=latest.catch(()=>{}).then(()=>persisted(snapshot)).then(()=>{
pending--;failed=false;if(!pending)status('All changes saved to this browser',false);
},e=>{
pending--;failed=true;status('Save failed — export a backup now. '+e.message,true);alert('Dashboard storage failure: '+e.message+'. Export a backup before closing the page.');
});
window.browserSavePending=()=>latest;
return {ok:true};
}catch(e){failed=true;status('Save failed: '+e.message,true);return {ok:false,error:e.message}}
},
dataFolder:()=>Promise.resolve('Browser IndexedDB — local to this browser profile and file location'),
updateStatus:()=>Promise.resolve({enabled:false}),
checkUpdates:()=>Promise.resolve({enabled:false})
});
window.browserSavePending=()=>latest;
resolve();
};
};
});
window.browserReady.catch(e=>alert('Browser storage unavailable: '+e.message));
})();