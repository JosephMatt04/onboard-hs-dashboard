(function(){
if(window.onboardDesktop)return;
window.browserReady=new Promise((resolve,reject)=>{
const request=indexedDB.open('OnboardLocalRecords',1);
request.onupgradeneeded=()=>request.result.createObjectStore('data');
request.onerror=()=>reject(request.error);
request.onsuccess=()=>{
const db=request.result;
const read=db.transaction('data').objectStore('data').get('records');
read.onerror=()=>reject(read.error);
read.onsuccess=()=>{
let records=read.result||null;
window.onboardDesktop=Object.freeze({
read:()=>({ok:true,data:records}),
write:data=>{
try{
const snapshot=structuredClone(data);
const tx=db.transaction('data','readwrite');
tx.objectStore('data').put(snapshot,'records');
tx.onerror=()=>alert('Browser storage failed. Export a backup.');
records=snapshot;
return {ok:true};
}catch(e){return {ok:false,error:e.message}}
},
dataFolder:()=>Promise.resolve('Local browser storage'),
updateStatus:()=>Promise.resolve({enabled:false}),
checkUpdates:()=>Promise.resolve({enabled:false})
});
resolve();
};
};
});
window.browserReady.catch(e=>alert('Cannot access browser storage: '+e.message));
})();