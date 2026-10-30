'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const host='127.0.0.1',port=38471,root=path.join(__dirname,'app');
const folder=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'Onboard-HS-Local');
const filename=path.join(folder,'records.json'),token=crypto.randomBytes(32).toString('hex'),limit=300*1024*1024;
const valid=d=>d&&typeof d==='object'&&['risk','ssow','ppe','incidents','assets'].every(k=>Array.isArray(d[k]))&&['ppeStock','training'].every(k=>d[k]===undefined||Array.isArray(d[k]));
const reply=(res,status,value,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'});res.end(typeof value==='string'?value:JSON.stringify(value))};
function read(){try{if(!fs.existsSync(filename))return{ok:true,data:null};const d=JSON.parse(fs.readFileSync(filename,'utf8'));if(!valid(d))throw Error('Invalid data format');return{ok:true,data:d}}catch(e){return{ok:false,error:e.message}}}
function write(d){try{if(!valid(d))throw Error('Invalid record structure');const s=JSON.stringify(d);if(Buffer.byteLength(s)>limit)throw Error('Records exceed 300 MB');fs.mkdirSync(folder,{recursive:true});const temp=filename+'.tmp';fs.writeFileSync(temp,s);try{if(fs.existsSync(filename))fs.copyFileSync(filename,filename+'.previous.json');fs.renameSync(temp,filename)}finally{if(fs.existsSync(temp))fs.unlinkSync(temp)}return{ok:true}}catch(e){return{ok:false,error:e.message}}}
const bridge='(function(){if(window.onboardDesktop)return;const token='+JSON.stringify(token)+';function call(action,data){const x=new XMLHttpRequest();x.open("POST","/api/"+action,false);x.setRequestHeader("Content-Type","application/json");x.setRequestHeader("X-Onboard-Token",token);try{x.send(JSON.stringify(data||{}));return JSON.parse(x.responseText)}catch(e){return{ok:false,error:e.message}}}window.onboardDesktop=Object.freeze({read:()=>call("read"),write:d=>call("write",d),dataFolder:()=>Promise.resolve("Local browser dashboard"),updateStatus:()=>Promise.resolve({enabled:false}),checkUpdates:()=>Promise.resolve({enabled:false})})})();';
const server=http.createServer((req,res)=>{
 const route=(req.url||'').split('?')[0];
 if(req.headers.host!==host+':'+port)return reply(res,403,'Forbidden','text/plain');
 if(route.startsWith('/api/')){
  if(req.method!=='POST'||req.headers['x-onboard-token']!==token||(req.headers.origin&&req.headers.origin!=='http://'+host+':'+port))return reply(res,403,{ok:false,error:'Forbidden'});
  let chunks=[],length=0;req.on('data',b=>{length+=b.length;if(length>limit)req.destroy();else chunks.push(b)});
  req.on('end',()=>{if(route==='/api/read')return reply(res,200,read());if(route==='/api/write'){try{return reply(res,200,write(JSON.parse(Buffer.concat(chunks).toString('utf8'))))}catch(e){return reply(res,400,{ok:false,error:e.message})}}reply(res,404,{ok:false,error:'Unknown API'})});return;
 }
 if(req.method!=='GET')return reply(res,405,'Method not allowed','text/plain');
 if(route==='/local-bridge.js')return reply(res,200,bridge,'text/javascript');
 const rel=route==='/'?'index.html':route.slice(1);
 if(!/^[\w.\/-]+$/.test(rel)||rel.includes('..'))return reply(res,404,'Not found','text/plain');
 const full=path.resolve(root,rel);if(!full.startsWith(root+path.sep))return reply(res,404,'Not found','text/plain');
 try{const bytes=fs.readFileSync(full),ext=path.extname(full).toLowerCase();res.writeHead(200,{'Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.css':'text/css'}[ext]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'});res.end(bytes)}catch{reply(res,404,'Not found','text/plain')}
});
server.listen(port,host,()=>{console.log('Local dashboard: http://'+host+':'+port);console.log('Data: '+folder);if(process.platform==='win32')spawn('cmd',['/c','start','','http://'+host+':'+port],{windowsHide:true,stdio:'ignore'})});
server.on('error',e=>{console.error(e.message);process.exitCode=1});
