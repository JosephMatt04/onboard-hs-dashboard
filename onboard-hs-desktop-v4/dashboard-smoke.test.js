'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'app','index.html'),'utf8');
const start=html.lastIndexOf('<script>');
const end=html.lastIndexOf('</script>');
const inline=html.slice(start+8,end);
const core=inline.slice(inline.indexOf("'use strict';"),inline.lastIndexOf("document.addEventListener('keydown'"));
assert.ok(core.startsWith("'use strict'"));
function harness({locked=true,sections=['training','incidents','ppe'],writeFails=false,confirmResult=true}={}){
 const elements=new Map();
 const elem=id=>{
  if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',hidden:false,onclick:null,listeners:{},focused:false,focus(){this.focused=true},querySelectorAll:()=>[],setAttribute(){},addEventListener(type,handler){this.listeners[type]=handler},classList:{add(){},remove(){},toggle(){},contains(){return false}},value:''});
  return elements.get(id);
 };
 elem('modal-root').querySelector=selector=>selector==='.modal-backdrop'?elem('ppe-issue-modal-backdrop'):selector.startsWith('#')?elem(selector.slice(1)):null;
 const issueButtons=[];
 const document={getElementById:elem,querySelectorAll:selector=>selector==='[data-ppe-issue-remove]'?issueButtons:[],querySelector:()=>null,documentElement:{setAttribute(){},getAttribute(){return 'dark'}}};
 let writes=0;
 const openedAttachments=[];
 const window={
  localStorage:{getItem:()=>null,setItem:()=>{}},
  onboardDesktop:{
   read:()=>({ok:true,data:null}),
   write:()=>{writes++;return writeFails?{ok:false,error:'Simulated storage failure'}:{ok:true}},
   openAttachment:(section,id,index)=>{openedAttachments.push({section,id,index});return Promise.resolve({ok:true})},
   pinStatus:()=>({enabled:true,sections,unlocked:!locked}),
   pinConfigure:()=>Promise.resolve({ok:true}),
   pinLock:()=>Promise.resolve({enabled:true,sections,unlocked:false})
  },
  onboardAutoBackup:{renderSettings:()=>'<p>Backups</p>',bindControls:()=>{}}
 };
 const errors=[];
 const dashboard=new Function('window','document','alert','confirm','setTimeout','clearTimeout',core+"\nreturn {go,db,config,pinRestricted,save,lockProtectedTabs,render,handleAction,sectionWorkflow,checkPpeStockCorrection,ppeIssueRecordsFiltered,ppeEmployeeIssueRecordsHTML,bindPpeIssueSearch,removePpeIssueRecord,openPpeIssueRemovalDialog,refreshPpeIssueRecords,ppeWorkspaceTabs,ppeAllocationHTML,printPpeDeskRegister,ppeRollLabelDocument,spreadsheetRange,spreadsheetDisplayValue,ppeBarcodeSvg,ppeProductPrefix,ppeLookupProduct,ppeLookupUnit,openAttachmentDirectly,attachmentHTML,bindPpeAllocation,createPpeAllocation,issuePpeAllocation,individualPpeLabelsHTML,printPpeLabels,nextPpeBarcode,nextPpeUnitBarcode,ppeTabForItem,ppeVisibleStockItems,ppeStockRegisterHTML,ensurePpeBarcodes,bindPpeScanner,receivePpeStock,ppeReceiveHTML,bindPpeReceive,setRiskCategory:(name)=>{riskCategoryFilter=name;updateRows()}};")(window,document,msg=>errors.push(String(msg)),()=>confirmResult,()=>0,()=>{});
 return {dashboard,elem,errors,openedAttachments,issueButtons,getWrites:()=>writes};
}
test('all registers render their current workflows without crashing',()=>{
 const {dashboard,elem}=harness({locked:false});
 const names=Object.keys(dashboard.config);
 assert.equal(names.length,20);
 for(const k of names){
  dashboard.go(k);
  const page=elem('content').innerHTML;
  assert.ok(page.length>200,'Missing section content: '+k);
  if(k==='risk')assert.ok(page.includes('Assessment categories'));
  if(k==='ssow')assert.ok(page.includes('SSOW Categories'));
  assert.ok(dashboard.config[k].fields.length>7,k);
  assert.ok(dashboard.sectionWorkflow(k).length>200,k);
 }
});

test('PIN-locked sections do not render records, actions or row filters',()=>{
 const {dashboard,elem}=harness();
 for(const k of ['training','incidents','ppe']){
  dashboard.go(k);
  assert.ok(elem('content').innerHTML.includes('PIN protected section'),k);
  assert.ok(!elem('content').innerHTML.includes('Live register checks'),k);
 }
 dashboard.go('home');
 assert.ok(elem('content').innerHTML.includes('🔒'));
 assert.equal(elem('pin-global-lock').hidden,true);
 dashboard.go('assets');
 assert.ok(elem('content').innerHTML.includes('Live register checks'));
});
test('PIN back button opens a safe PPE menu without exposing locked stock',()=>{
 const {dashboard,elem}=harness({locked:true,sections:['ppeStock','ppe']});
 dashboard.db.ppeStock.push({id:'private-ppe-test',item:'PRIVATE_STOCK_REFERENCE',stock:'10'});
 dashboard.go('ppeStock');
 assert.ok(elem('content').innerHTML.includes('PIN protected section'));
 assert.equal(typeof elem('pin-back-dashboard').onclick,'function');
 elem('pin-back-dashboard').onclick();
 const menu=elem('content').innerHTML;
 assert.ok(menu.includes('PPE Stock Management'));
 assert.ok(menu.includes('Safety Boot Claims'));
 assert.ok(!menu.includes('PRIVATE_STOCK_REFERENCE'));
 dashboard.go('ppeStock');
 assert.ok(elem('content').innerHTML.includes('PIN protected section'));
});
test('generic Hi-Vis Jacket is replaced with Parka and Bomber variants without losing legacy stock',()=>{
 const {dashboard}=harness({locked:false});
 const old={id:'legacy-jacket',item:'Hi-Vis Jacket',category:'High Visibility Clothing',size:'XL',colour:'Orange',stock:'7',barcode:'HIJXL',status:'Available',notes:''};
 dashboard.db.ppeStock.push(old);
 dashboard.go('ppeStock');
 assert.equal(old.item,'Hi-Vis Jacket - Legacy (type unconfirmed)');
 assert.equal(old.stock,'7');
 assert.equal(old.barcode,'HIJXL');
 assert.ok(dashboard.db.ppeStock.some(x=>x.item==='Hi-Vis Jacket - Parka'&&x.size==='XL'&&x.stock==='0'));
 assert.ok(dashboard.db.ppeStock.some(x=>x.item==='Hi-Vis Jacket - Bomber'&&x.size==='XL'&&x.stock==='0'));
 const count=dashboard.db.ppeStock.length;
 dashboard.go('ppeStock');
 assert.equal(dashboard.db.ppeStock.length,count);
 assert.notEqual(dashboard.db.ppeStock.find(x=>x.item==='Hi-Vis Jacket - Parka'&&x.size==='XL').barcode, dashboard.db.ppeStock.find(x=>x.item==='Hi-Vis Jacket - Bomber'&&x.size==='XL').barcode);
});
test('PPE jacket catalogue shows only yellow Parka and Bomber and excludes older jacket variants',()=>{
 const {dashboard}=harness({locked:false});
 dashboard.db.ppeStock.push(
 {id:'old-generic',item:'Hi-Vis Jacket',size:'L',colour:'Yellow',stock:'4'},
 {id:'old-legacy',item:'Hi-Vis Jacket - Legacy (type unconfirmed)',size:'XL',colour:'Yellow',stock:'2'},
 {id:'old-orange',item:'Hi-Vis Jacket - Parka',size:'L',colour:'Orange',stock:'3'},
 {id:'current-yellow',item:'Hi-Vis Jacket - Bomber',size:'L',colour:'Yellow',stock:'5'}
 );
 const visible=dashboard.ppeVisibleStockItems();
 assert.ok(visible.some(x=>x.id==='current-yellow'));
 for(const id of ['old-generic','old-legacy','old-orange'])assert.ok(!visible.some(x=>x.id===id),id);
 for(const id of ['old-generic','old-legacy','old-orange'])assert.ok(dashboard.db.ppeStock.some(x=>x.id===id));
 const options=dashboard.ppeReceiveHTML();
 assert.ok(options.includes('Hi-Vis Jacket - Bomber'));
 assert.ok(!options.includes('Hi-Vis Jacket - Legacy'));
 assert.ok(!options.includes('Hi-Vis Jacket - Parka · L · Orange'));
});
test('PPE inventory hides the catalogue loader but retains receive and add controls',()=>{
 const {dashboard}=harness({locked:false});
 const page=dashboard.ppeStockRegisterHTML();
 assert.ok(!page.includes('Load PPE catalogue'));
 assert.ok(page.includes('Receive Stock'));
 assert.ok(page.includes('Add PPE item'));
});

test('topbar lock hides sensitive content without deleting records',async()=>{
 const {dashboard,elem}=harness({locked:false});
 const existing=dashboard.db.training.length;
 dashboard.go('training');
 assert.equal(elem('pin-global-lock').hidden,false);
 await dashboard.lockProtectedTabs();
 assert.equal(elem('pin-global-lock').hidden,true);
 assert.ok(elem('content').innerHTML.includes('PIN protected section'));
 assert.equal(dashboard.db.training.length,existing);
});
test('new section-specific record fields and save preserve array structure',()=>{
 const {dashboard,getWrites}=harness({locked:false});
 assert.ok(dashboard.config.risk.fields.some(x=>x[0]==='residualRisk'));
 assert.ok(dashboard.config.ssow.fields.some(x=>x[0]==='guards'));
 assert.ok(dashboard.config.sites.fields.some(x=>x[0]==='emergencyAccess'));
 assert.ok(dashboard.config.incidents.fields.some(x=>x[0]==='witnesses'));
 assert.ok(dashboard.config.permits.fields.some(x=>x[0]==='plantIsolated'));
 dashboard.db.sites.push({id:'test-site-1',name:'Test site',status:'Operational'});
 assert.equal(dashboard.save(),true);
 assert.equal(getWrites(),1);
 assert.equal(dashboard.db.sites.at(-1).name,'Test site');
});

test('operations homepage renders current KPIs and quick actions',()=>{
 const {dashboard,elem}=harness({locked:false});
 dashboard.go('home');
 const page=elem('content').innerHTML;
 assert.ok(page.includes('Health &amp; Safety Dashboard'));
 assert.equal((page.match(/class="ops-kpi"/g)||[]).length,5);
 assert.equal((page.match(/class="ops-quick-button"/g)||[]).length,4);
 for(const section of ['risk','ssow','training','incidents']){
  assert.ok(page.includes('data-nav="'+section+'"'),section);
 }
});

test('homepage hides locked risk record names and counts',()=>{
 const {dashboard,elem}=harness({locked:true,sections:['risk','ssow','incidents','training','ppeStock','assets']});
 dashboard.db.risk.push({id:'secret-test',title:'SECRET_MACHINE_REFERENCE',status:'Draft',reviewDate:'2020-01-01'});
 dashboard.go('home');
 const page=elem('content').innerHTML;
 assert.ok(page.includes('🔒'));
 assert.ok(!page.includes('SECRET_MACHINE_REFERENCE'));
 assert.ok(!page.includes('2020-01-01'));
});

test('risk register retains document control, review priority and evidence filters',()=>{
 const {dashboard,elem}=harness({locked:false});
 dashboard.go('risk');
 const page=elem('content').innerHTML;
 assert.ok(page.includes('Assessment categories'));
 assert.ok(!page.includes('Assessment assurance'));
 assert.ok(page.includes('Missing document'));
 assert.ok(page.includes('Missing residual score'));
 assert.ok(page.includes('Missing sign-off'));
 assert.ok(dashboard.config.risk.columns.some(x=>x[0]==='reviewHealth'));
 for(const field of ['reference','revision','lastReview','approvedBy']){
  assert.ok(dashboard.config.risk.fields.some(x=>x[0]===field),field);
 }
});
test('risk status and missing-evidence filters work without mutating records',()=>{
 const {dashboard,elem}=harness({locked:false});
 dashboard.db.risk.push({id:'risk-filter-example',title:'FILTER_TARGET_SAFE',area:'Testing',status:'In Progress',person:'Tester',reviewDate:'',attachments:[],signatures:[],residualRisk:''});
 dashboard.go('risk');
 const setFilter=value=>{elem('filter').value=value;elem('filter').onchange({target:{value}});return elem('tbody').innerHTML;};
 assert.ok(setFilter('In Progress').includes('FILTER_TARGET_SAFE'));
 assert.ok(setFilter('Missing document').includes('FILTER_TARGET_SAFE'));
 assert.ok(setFilter('Missing residual score').includes('FILTER_TARGET_SAFE'));
 assert.ok(setFilter('Missing sign-off').includes('FILTER_TARGET_SAFE'));
 assert.equal(dashboard.db.risk.at(-1).status,'In Progress');
});

test('risk categories replace assessment quality panel and preserve legacy assessments',()=>{
 const {dashboard,elem}=harness({locked:false});
 dashboard.go('risk');
 const page=elem('content').innerHTML;
 assert.ok(page.includes('Assessment categories'));
 assert.ok(!page.includes('Assessment quality'));
 assert.ok(!page.includes('Assessment assurance'));
 assert.ok(page.includes('Plant &amp; Equipment'));
 assert.ok(page.includes('Uncategorised'));
 assert.ok(dashboard.config.risk.fields.some(x=>x[0]==='category'));
 assert.ok(dashboard.config.risk.columns.some(x=>x[0]==='category'));
});
test('risk category filter handles default, custom and uncategorised categories',()=>{
 const {dashboard,elem}=harness({locked:false});
 dashboard.db.risk.push({id:'category-a',title:'FORKLIFT_CATEGORY_TEST',category:'Plant & Equipment',status:'Current',reviewDate:'2027-05-01'});
 dashboard.db.risk.push({id:'category-b',title:'OFFICE_CATEGORY_TEST',category:'Office Activities',status:'Current',reviewDate:'2027-05-01'});
 dashboard.go('risk');
 dashboard.setRiskCategory('Plant & Equipment');
 assert.ok(elem('tbody').innerHTML.includes('FORKLIFT_CATEGORY_TEST'));
 assert.ok(!elem('tbody').innerHTML.includes('OFFICE_CATEGORY_TEST'));
 dashboard.setRiskCategory('Office Activities');
 assert.ok(elem('tbody').innerHTML.includes('OFFICE_CATEGORY_TEST'));
 assert.ok(!elem('tbody').innerHTML.includes('FORKLIFT_CATEGORY_TEST'));
 dashboard.setRiskCategory('Uncategorised');
 assert.ok(!elem('tbody').innerHTML.includes('FORKLIFT_CATEGORY_TEST'));
 dashboard.setRiskCategory('All');
 assert.ok(elem('tbody').innerHTML.includes('FORKLIFT_CATEGORY_TEST'));
 assert.ok(elem('tbody').innerHTML.includes('OFFICE_CATEGORY_TEST'));
});

test('risk review status panel replaces guide with four clickable review filters',()=>{
 const {dashboard,elem}=harness({locked:false});
 dashboard.go('risk');
 const html=elem('content').innerHTML;
 assert.ok(html.includes('Assessment review status'));
 assert.ok(!html.includes('ONBOARD · MODULE GUIDE'));
 assert.equal((html.match(/class="risk-review-card /g)||[]).length,4);
 for(const status of ['Overdue review','Due in 30 days','In Progress','No date']){
  assert.ok(html.includes('data-review-filter="'+status+'"'),status);
 }
 assert.ok(html.includes('Assessment categories'));
});
test('risk review filters show matching assessments without changing records',()=>{
 const {dashboard,elem}=harness({locked:false});
 dashboard.db.risk.push({id:'review-filter-a',title:'OVERDUE_RA_EXAMPLE',reviewDate:'2020-01-01',status:'Current'});
 dashboard.db.risk.push({id:'review-filter-b',title:'IN_PROGRESS_RA_EXAMPLE',reviewDate:'2030-01-01',status:'In Progress'});
 dashboard.go('risk');
 const filterBy=value=>{elem('filter').onchange({target:{value}});return elem('tbody').innerHTML};
 assert.ok(filterBy('Overdue review').includes('OVERDUE_RA_EXAMPLE'));
 assert.ok(!filterBy('Overdue review').includes('IN_PROGRESS_RA_EXAMPLE'));
 assert.ok(filterBy('In Progress').includes('IN_PROGRESS_RA_EXAMPLE'));
 assert.ok(!filterBy('In Progress').includes('OVERDUE_RA_EXAMPLE'));
 assert.equal(dashboard.db.risk.at(-1).status,'In Progress');
});

test('risk categories render distinct visual themes without changing filter semantics',()=>{
 const {dashboard,elem}=harness({locked:false});
 dashboard.db.risk.push({id:'custom-chip-test',title:'Custom Category Record',category:'Warehouse Operations',status:'Current',reviewDate:'2030-01-01'});
 dashboard.go('risk');
 const page=elem('content').innerHTML;
 for(const theme of ['plant','chemical','electrical','fire','handling','transport','height','health','premises','other','uncategorised','custom']){
  assert.ok(page.includes('data-category-theme="'+theme+'"'),theme);
 }
 assert.ok(page.includes('class="risk-category-pictogram"'));
 dashboard.setRiskCategory('Warehouse Operations');
 assert.ok(elem('tbody').innerHTML.includes('Custom Category Record'));
 dashboard.setRiskCategory('All');
 assert.ok(elem('tbody').innerHTML.includes('Custom Category Record'));
});

test('premium light web-app theme covers navigation, registers, cards and edit forms',()=>{
 assert.ok(html.includes('Premium light web-app design'));
 assert.ok(!html.includes('dark Command Centre visual system'));
 for(const selector of ['.side .nav button.active','.portal-module.active','.home-new-hero','.risk-category-chip.themed','.risk-review-card.active','tbody tr:hover td','.modal,.preview-modal']){
  assert.ok(html.includes(selector),selector);
 }
 const {dashboard,elem}=harness({locked:false});
 for(const section of ['home','risk','ssow','training','assets','incidents']){
  dashboard.go(section);
  assert.ok(elem('content').innerHTML.length>100,section);
 }
});

test('risk assessment category chips provide themed keyboard-accessible micro animations',()=>{
 const {dashboard,elem}=harness({locked:false});
 dashboard.go('risk');
 const html=elem('content').innerHTML;
 assert.equal((html.match(/class="risk-chip-microfx"/g)||[]).length,12);
 assert.ok(html.includes('class="transport-scene-truck"'));
 assert.ok(html.includes('scene-fire-flame'));
 assert.ok(html.includes('scene-electric-bolt'));
 assert.ok(html.includes('scene-gear-large'));
 assert.ok(html.includes('scene-bubble'));
 assert.ok(html.includes('data-category-theme="electrical"'));
 assert.ok(html.includes('data-category-theme="fire"'));
 assert.ok(html.includes('aria-hidden="true"'));
});

test('risk category backgrounds contain scenes behind readable category names',()=>{
 const {dashboard,elem}=harness({locked:false});
 dashboard.db.risk.push({id:'scene-custom',title:'Scene test assessment',category:'Fire & Emergency',status:'Current'});
 dashboard.go('risk');
 const page=elem('content').innerHTML;
 assert.ok(page.includes('data-category-theme="fire"'));
 assert.ok(page.includes('risk-chip-microfx'));
 assert.ok(page.includes('scene-fire-flame'));
 assert.ok(page.includes('Fire &amp; Emergency'));
 dashboard.setRiskCategory('Fire & Emergency');
 assert.ok(elem('tbody').innerHTML.includes('Scene test assessment'));
 dashboard.setRiskCategory('All');
 assert.ok(elem('tbody').innerHTML.includes('Scene test assessment'));
});

test('all Risk Assessment categories use distinct offline artwork rather than remote videos',()=>{
 const {dashboard,elem}=harness({locked:false});
 dashboard.go('risk');
 const page=elem('content').innerHTML;
 assert.equal((page.match(/class="risk-chip-video-layer"/g)||[]).length,0);
 assert.equal((page.match(/class="risk-chip-microfx"/g)||[]).length,12);
 for(const scene of ['scene-electrical','scene-fire','scene-plant','scene-chemical','scene-handling','scene-height','scene-premises','scene-all','scene-other','scene-uncategorised','transport-scene-truck','ecg-trace']){
  assert.ok(page.includes(scene),scene);
 }
 assert.ok(!page.includes('https://www.pexels.com/download/video/'));
 assert.ok(page.includes('aria-pressed="true"'));
 assert.ok(page.includes('class="risk-category-name"'));
});

test('desktop dashboard exposes instant refresh button and recovery panel',()=>{
 assert.ok(html.includes('id="refresh-interface"'));
 assert.ok(html.includes('window.onboardDesktop.refreshDashboard()'));
 assert.ok(html.includes('Restore bundled dashboard'));
 const {dashboard,elem}=harness({locked:false});
 dashboard.go('risk');
 assert.ok(elem('content').innerHTML.includes('Assessment categories'));
});

test('minimal video-first risk category tabs use a proper lightning bolt and preserve filtering',()=>{
 const {dashboard,elem}=harness({locked:false});
 dashboard.db.risk.push({id:'bolt-test',title:'Electrical assessment check',category:'Electrical Safety',status:'Current'});
 dashboard.go('risk');
 const page=elem('content').innerHTML;
 assert.ok(page.includes('class="risk-bolt-icon"'));
 assert.ok(page.includes('viewBox="0 0 24 24"'));
 assert.equal((page.match(/class="risk-chip-video-layer"/g)||[]).length,0);
 assert.equal((page.match(/class="risk-chip-microfx"/g)||[]).length,12);
 dashboard.setRiskCategory('Electrical Safety');
 assert.ok(elem('tbody').innerHTML.includes('Electrical assessment check'));
 dashboard.setRiskCategory('Fire & Emergency');
 assert.ok(!elem('tbody').innerHTML.includes('Electrical assessment check'));
});

test('electrical lightning and occupational health ECG animate entirely offline',()=>{
 const {dashboard,elem}=harness({locked:false});
 dashboard.go('risk');
 const page=elem('content').innerHTML;
 assert.ok(page.includes('class="scene-electric-bolt"'));
 assert.ok(page.includes('class="risk-bolt-icon"'));
 assert.ok(page.includes('class="ecg-trace"'));
 assert.ok(page.includes('class="ecg-grid"'));
 assert.ok(html.includes('@keyframes ocElectricalFlash'));
 assert.ok(html.includes('@keyframes ecgTravelAcross'));
 assert.equal((page.match(/class="risk-chip-video-layer"/g)||[]).length,0);
});

test('occupational health animated ECG remains visible independently of network video playback',()=>{
 const {dashboard,elem}=harness({locked:false});
 dashboard.go('risk');
 const output=elem('content').innerHTML;
 assert.ok(output.includes('class="ecg-trace"'));
 assert.ok(output.includes('class="ecg-grid"'));
 assert.ok(!output.includes('data-risk-video="health"'));
 assert.ok(html.includes('@keyframes ecgTravelAcross'));
 assert.ok(html.includes('prefers-reduced-motion:reduce'));
});

test('Risk Assessment entry groups essentials and retains every underlying saved field',()=>{
 assert.ok(html.includes("Essential information"));
 assert.ok(html.includes('risk-form-extras'));
 assert.ok(html.includes('Additional details'));
 assert.ok(html.includes("const primary=['title','category','area','reviewDate','person','reference','status']"));
 assert.ok(html.includes("const optional=config[k].fields.map"));
 assert.ok(html.includes("const hasExtra=!!record"));
 assert.ok(html.includes("for(const [f,,type]of config[k].fields"));
 assert.ok(html.includes('id="entry-form"'));
});

test('dashboard has a persistent light and dark appearance switch',()=>{
 assert.ok(html.includes('id="theme-toggle"'));
 assert.ok(html.includes("THEME_KEY='onboard_hs_appearance_v1'"));
 assert.ok(html.includes('window.localStorage?.getItem(THEME_KEY)'));
 assert.ok(html.includes('window.localStorage?.setItem(THEME_KEY'));
 assert.ok(html.includes('data-theme="dark"'));
 assert.ok(html.includes('body .modal'));
 assert.ok(html.includes('body .risk-category-chip.themed'));
 const {dashboard,elem}=harness({locked:false});
 dashboard.go('risk');
 assert.ok(elem('content').innerHTML.includes('Assessment categories'));
 dashboard.go('training');
 assert.ok(elem('content').innerHTML.includes('Live register checks'));
});

test('video hover handler plays, pauses and protects against stale pending play requests',async()=>{
 const begin=inline.indexOf('function bindRiskCategoryVideos()');
 const end=inline.indexOf('function riskCategoryPanel()',begin);
 assert.ok(begin>=0&&end>begin);
 const source=inline.slice(begin,end);
 const listeners={};const mediaListeners={};const sourceListeners={};const classes=new Set();
 let hovered=false,playCount=0,loadCount=0,pauseCount=0;
 let resolvePlay,rejectPlay;
 const chip={
  classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v)},
  addEventListener:(name,fn)=>{listeners[name]=fn},
  matches:()=>hovered,
  contains:()=>false
 };
 const video={
  dataset:{},currentTime:12,
  closest:()=>chip,
  addEventListener:(name,fn)=>{mediaListeners[name]=fn},
  querySelector:()=>({addEventListener:(name,fn)=>{sourceListeners[name]=fn}}),
  load:()=>{loadCount++},pause:()=>{pauseCount++},
  play:()=>{playCount++;return new Promise((res,rej)=>{resolvePlay=res;rejectPlay=rej})}
 };
 const document={querySelectorAll:()=>[video]};
 const window={matchMedia:()=>({matches:false})};
 new Function('document','window','section',source+';bindRiskCategoryVideos()')(document,window,'risk');
 hovered=true;listeners.mouseenter();assert.equal(playCount,1);assert.equal(loadCount,1);
 resolvePlay();await Promise.resolve();assert.equal(classes.has('risk-video-playing'),true);
 hovered=false;listeners.mouseleave();assert.equal(classes.has('risk-video-playing'),false);
 hovered=true;listeners.mouseenter();assert.equal(playCount,2);
 hovered=false;listeners.mouseleave();
 rejectPlay(Object.assign(new Error('interrupted'),{name:'AbortError'}));await Promise.resolve();await Promise.resolve();
 assert.equal(classes.has('risk-video-unavailable'),false,'normal hover cancellation is not a broken video');
 hovered=true;listeners.mouseenter();assert.equal(playCount,3);
 resolvePlay();await Promise.resolve();assert.equal(classes.has('risk-video-playing'),true);
 mediaListeners.error();assert.equal(classes.has('risk-video-unavailable'),true);
 assert.equal(classes.has('risk-video-playing'),false);
 listeners.mouseenter();assert.equal(playCount,3,'failed media throttled to avoid download floods');
 assert.ok(pauseCount>=2);
 assert.ok(sourceListeners.error);
});

test('video handler avoids playback with reduced motion and gracefully handles synchronous play failures',()=>{
 const source=inline.slice(inline.indexOf('function bindRiskCategoryVideos()'),inline.indexOf('function riskCategoryPanel()'));
 for(const reduce of [true,false]){
  const handlers={};const classes=new Set();
  const chip={classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v)},addEventListener:(n,fn)=>{handlers[n]=fn},matches:()=>true,contains:()=>false};
  let calls=0;
  const video={dataset:{},closest:()=>chip,addEventListener:()=>{},querySelector:()=>null,pause:()=>{},load:()=>{},play:()=>{calls++;throw Error('media failed')}};
  new Function('document','window','section',source+';bindRiskCategoryVideos()')({querySelectorAll:()=>[video]},{matchMedia:()=>({matches:reduce})},'risk');
  assert.doesNotThrow(()=>handlers.mouseenter());
  assert.equal(calls,reduce?0:1);
  assert.equal(classes.has('risk-video-unavailable'),!reduce);
 }
});

test('offline category animation retains focus accessibility and a reduced-motion mode',()=>{
 const {dashboard,elem}=harness({locked:false});
 dashboard.go('risk');
 const page=elem('content').innerHTML;
 assert.equal((page.match(/class="risk-chip-video-layer"/g)||[]).length,0);
 assert.equal((page.match(/class="risk-chip-microfx"/g)||[]).length,12);
 assert.ok(page.includes('class="ecg-trace"'));
 assert.ok(page.includes('aria-pressed="true"'));
 assert.ok(html.includes('focus-visible'));
 assert.ok(html.includes('prefers-reduced-motion:reduce'));
 assert.ok(html.includes('scene-art *'));
});

test('light and dark appearance styling remains available for current dashboard',()=>{
 const styles=html.slice(html.indexOf('<style>'),html.indexOf('</style>'));
 assert.ok(styles.includes('html[data-theme="dark"]'));
 assert.ok(styles.includes('.risk-category-chip'));
 assert.ok(html.includes("setAppearance(initialTheme,false)"));
 const {dashboard,elem}=harness({locked:false});
 dashboard.go('risk');
 assert.ok(elem('content').innerHTML.includes('Assessment categories'));
 dashboard.go('ssow');
 assert.ok(elem('content').innerHTML.includes('SSOW Categories'));
});

test('current dashboard homepage KPI and action panels retain themed surfaces',()=>{
 const styles=html.slice(html.indexOf('<style>'),html.indexOf('</style>'));
 for(const selector of ['.ops-home','.ops-kpi','.ops-panel','.ops-quick-button']){
  assert.ok(styles.includes(selector),selector);
 }
 const {dashboard,elem}=harness({locked:false});
 dashboard.go('home');
 const page=elem('content').innerHTML;
 assert.equal((page.match(/class="ops-kpi"/g)||[]).length,5);
 assert.ok(page.includes('ops-quick-button'));
});

test('operations homepage keeps live KPI cards, review alerts and safety actions',()=>{
 const {dashboard,elem}=harness({locked:false});
 dashboard.go('home');
 const page=elem('content').innerHTML;
 assert.ok(page.includes('Health &amp; Safety Dashboard'));
 assert.ok(page.includes('Needs Attention'));
 assert.ok(page.includes('Upcoming Reviews'));
 assert.ok(page.includes('Incident Follow-Ups'));
 assert.equal((page.match(/class="ops-kpi"/g)||[]).length,5);
 assert.equal((page.match(/class="ops-quick-button"/g)||[]).length,4);
 assert.ok(page.includes('data-action="add" data-section="risk"'));
 assert.ok(page.includes('data-nav="incidents"'));
 dashboard.go('risk');
 assert.ok(elem('content').innerHTML.includes('Assessment categories'));
});

test('workshop charcoal theme applies to active dashboard and current homepage',()=>{
 const styles=html.slice(html.indexOf('<style>'),html.indexOf('</style>'));
 const palette=styles.slice(styles.indexOf('/* ONBOARD WORKSHOP / charcoal'));
 assert.ok(palette.includes('--work-bg:#171d1f'));
 assert.ok(palette.includes('--work-lime:#c5f322'));
 assert.ok(html.includes("let initialTheme='dark'"));
 const {dashboard,elem}=harness({locked:false});
 for(const section of ['home','risk','ssow','incidents','training','ppeStock','assets']){
  dashboard.go(section);
  assert.ok(elem('content').innerHTML.length>300,section);
 }
 dashboard.go('home');
 const page=elem('content').innerHTML;
 assert.equal((page.match(/class="ops-kpi"/g)||[]).length,5);
 assert.ok(page.includes('ops-actions'));
});

test('charcoal theme overrides legacy white surfaces across every module and every risk category',()=>{
 const css=html.slice(html.indexOf('<style>'),html.indexOf('</style>'));
 const fix=css.slice(css.indexOf('/* CHARCOAL COMPLETENESS PASS'));
 const surfaces=['.toolbar','.table-wrap','table thead','.ssow-metrics>div',
  '.risk-assurance-metrics>div','.risk-review-card','.ppe-tabs','.audit-question',
  '.ptw-check','.incident-action-row','.backup-status','.callout','.section-guide',
  '.attachment-list','.preview-modal','.module-tile','.asset-profile-field',
  '.risk-category-chip.themed.active','.risk-category-pictogram','.risk-category-count',
  '.side .nav .nav-pictogram','.status.warn','.status.bad','.recent-item .btn.small'];
 for(const name of surfaces)assert.ok(fix.includes(name),'Missing dark surface override '+name);
 assert.ok(fix.includes('html[data-theme="dark"]'));
 assert.ok(fix.includes('background:#30393c!important'));
 assert.ok(fix.includes('background:#303a3d!important'));
 assert.equal((fix.match(/\{/g)||[]).length,(fix.match(/\}/g)||[]).length);
 const {dashboard,elem}=harness({locked:false});
 for(const name of ['home','risk','ssow','training','incidents','assets','ppeStock','audits','permits']){
  dashboard.go(name);
  assert.ok(elem('content').innerHTML.length>300,name);
 }
 dashboard.go('risk');
 assert.equal((elem('content').innerHTML.match(/class="risk-category-chip themed/g)||[]).length,12);
 assert.equal((elem('content').innerHTML.match(/class="risk-chip-video-layer"/g)||[]).length,0);
});

test('Vehicles & Transport shows offline animated HGV with no external video request',()=>{
 const {dashboard,elem}=harness({locked:false});
 dashboard.go('risk');
 const page=elem('content').innerHTML;
 assert.ok(page.includes('data-category-theme="transport"'));
 assert.ok(page.includes('class="transport-scene-truck"'));
 assert.ok(page.includes('class="transport-scene-road"'));
 assert.ok(page.includes('class="transport-wheel"'));
 assert.ok(!page.includes('data-risk-video="transport"'));
 assert.ok(!page.includes('https://www.pexels.com/download/video/39966866/'));
 assert.ok(html.includes('@keyframes onboardTruckDrive'));
 assert.ok(html.includes('@keyframes onboardRoadMove'));
 assert.ok(html.includes('@keyframes onboardTruckWheels'));
 assert.ok(html.includes('prefers-reduced-motion:reduce'));
});

test('all custom category SVG animations have movement keyframes and never stream media',()=>{
 const {dashboard,elem}=harness({locked:false});
 dashboard.go('risk');
 const page=elem('content').innerHTML;
 for(const theme of ['all','plant','chemical','electrical','fire','handling','transport','height','health','premises','other','uncategorised'])
  assert.ok(page.includes('data-category-theme="'+theme+'"'),theme);
 for(const motion of ['ocElectricalFlash','ocFlameDance','ocGearSpin','ocBubbleRise','ocLiftArrow','ocLadderClimb','ocDoorRise','ocCheckPulse','ocQuestionPulse','ecgTravelAcross','onboardTruckDrive'])
  assert.ok(html.includes('@keyframes '+motion),motion);
 assert.ok(!page.includes('<video'));
 assert.ok(!page.includes('pexels.com'));
 assert.equal((page.match(/class="risk-chip-microfx"/g)||[]).length,12);
});

test('Word preview creates real risk matrix tables and preserves formatted paragraph runs',()=>{
 const start=inline.indexOf('function docxChildren(');
 const end=inline.indexOf('async function previewAttachment(',start);
 assert.ok(start>=0&&end>start);
 const source=inline.slice(start,end);
 const node=(name,children=[],attr={},value='')=>({
  nodeType:1,localName:name,childNodes:children,textContent:value,
  getAttribute:k=>attr[k]||null
 });
 function element(tag){
  return {tag,children:[],style:{setProperty(k,v){this[k]=v}},className:'',
   classList:{add(k){this[k]=true}},append(...c){this.children.push(...c)},
   set colSpan(n){this.span=n},set textContent(v){this.text=v},get textContent(){return this.text||this.children.map(c=>c.textContent||'').join('')},
   querySelector:()=>null};
 }
 const document={createElement:element,createTextNode:v=>({nodeType:3,textContent:v})};
 const renderer=new Function('document',source+';return {docxRenderParagraph,docxRenderTable,docxChildren};')(document);
 const run=node('r',[node('rPr',[node('b')]),node('t',[],{},'Likelihood')]);
 const para=node('p',[run],{},'Likelihood');
 const table=node('tbl',[
  node('tblGrid',[node('gridCol',[],{'w:w':'2000'}),node('gridCol',[],{'w:w':'3000'})]),
  node('tr',[
   node('tc',[node('tcPr',[node('gridSpan',[],{'w:val':'2'}),node('shd',[],{'w:fill':'D7EAD8'})]),para]),
   node('tc',[node('p',[node('r',[node('t',[],{},'Risk Category')])])])
  ])
 ]);
 const out=renderer.docxRenderTable(table);
 const tbl=out.children[0];
 assert.equal(tbl.tag,'table');
 assert.equal(tbl.children[0].tag,'colgroup');
 const row=tbl.children[1];
 assert.equal(row.tag,'tr');
 assert.equal(row.children[0].span,2);
 assert.ok(row.children[0].classList['docx-shaded-cell']);
 assert.equal(row.children[0].children[0].children[0].tag,'strong');
 assert.equal(row.children[0].children[0].textContent,'Likelihood');
 assert.equal(row.children[1].children[0].textContent,'Risk Category');
});
test('DOCX preview is clearly labelled approximate and leaves original untouched',()=>{
 assert.ok(html.includes('async function renderDocxPreview(blob,target)'));
 assert.ok(html.includes('docxRenderTable(child)'));
 assert.ok(html.includes('docxRenderParagraph(child)'));
 assert.ok(html.includes('Not suitable for checking approved risk assessment layout'));
 assert.ok(html.includes("className=\'docx-preview-sheet\'"));
 assert.ok(html.includes('html[data-theme="dark"] body .docx-preview-sheet'));
 assert.ok(!html.includes('Basic Word text preview'));
});

test('PPE barcode generator supports scanner-readable Onboard identifiers',()=>{
 const {dashboard}=harness({locked:false});
 assert.ok(dashboard.ppeBarcodeSvg('OI001').includes('OI001'));
 assert.ok(dashboard.ppeBarcodeSvg('oc001').includes('OC001'));
 assert.throws(()=>dashboard.ppeBarcodeSvg('OI 001'),/Invalid PPE QR identifier/);
 assert.throws(()=>dashboard.ppeBarcodeSvg('<script>'),/Invalid PPE QR identifier/);
});
test('PPE scanning creates short descriptive QR code identifiers',()=>{
 const {dashboard}=harness({locked:false});
 const item={id:'test-item',item:'Hi-Vis Vest',barcode:'OC001',stock:'1',size:'XL',colour:'Orange'};
 dashboard.db.ppeStock.push(item);
 dashboard.db.ppeUnits.push({id:'test-unit',itemId:item.id,barcode:'OI001',status:'In Stock'});
 assert.equal(dashboard.nextPpeBarcode(item),'HIVXL');
 assert.equal(dashboard.ensurePpeBarcodes(),true);
 assert.equal(item.barcode,'HIVXL');
 assert.ok(item.legacyBarcodes.includes('OC001'));
 assert.equal(dashboard.nextPpeUnitBarcode(item),'HIVXL1');
});

test('retired Hi-Vis clothing is hidden from existing inventory without deleting data',()=>{
 const {dashboard}=harness({locked:false});
 const items=[
  ['Hi-Vis Vest','High Visibility Clothing'],
  ['Hi-Vis Jacket','High Visibility Clothing'],
  ['Hi-Vis Sweatshirt','High Visibility Clothing'],
  ['Hi-Vis Waterproof Coat','High Visibility Clothing'],
  ['Hi-Vis Trousers','High Visibility Clothing'],
  ['Safety Gloves - Cut Resistant','Hand Protection']
 ];
 for(let i=0;i<items.length;i++)dashboard.db.ppeStock.push({id:'visibility-test-'+i,item:items[i][0],category:items[i][1],size:'XL',colour:'Orange',stock:'0',barcode:'OC'+String(i+1).padStart(3,'0')});
 const visible=dashboard.ppeVisibleStockItems();
 for(const removed of ['Hi-Vis Sweatshirt','Hi-Vis Waterproof Coat','Hi-Vis Trousers']){
  assert.ok(dashboard.db.ppeStock.some(r=>r.item===removed),'Original PPE data must remain');
  assert.ok(!visible.some(r=>r.item===removed),'Removed type must not appear');
 }
 for(const retained of ['Hi-Vis Vest','Hi-Vis Jacket','Safety Gloves - Cut Resistant'])assert.ok(visible.some(r=>r.item===retained),retained);
 const page=dashboard.ppeStockRegisterHTML();
 assert.ok(!page.includes('Hi-Vis Sweatshirt'));
 assert.ok(!page.includes('Hi-Vis Waterproof Coat'));
 assert.ok(!page.includes('Hi-Vis Trousers'));
 assert.ok(page.includes('Hi-Vis Vest'));
 assert.ok(page.includes('Hi-Vis Jacket'));
});


test('scanner recognises OI codes without submitting on scanner Enter and identifies the correct variant',()=>{
 const {dashboard,elem}=harness({locked:false});
 const item={id:'scan-a',item:'Hi-Vis Vest',barcode:'OC101',stock:'2',size:'XL',colour:'Orange',status:'Available'};
 dashboard.db.ppeStock.push(item);
 dashboard.db.ppeUnits.push({id:'scan-u1',itemId:item.id,itemName:item.item,barcode:'OI002',status:'In Stock',colour:'Orange',size:'XL',issuedTo:'',issuedAt:''});
 dashboard.bindPpeScanner();
 elem('ppe-scan-type').value='issue';
 elem('ppe-scan-code').value='oi002';
 elem('ppe-scan-code').listeners.input();
 assert.ok(elem('ppe-scan-result').textContent.includes('Orange'));
 assert.ok(elem('ppe-scan-result').textContent.includes('XL'));
 const event={key:'Enter',prevented:false,preventDefault(){this.prevented=true}};
 elem('ppe-scan-code').listeners.keydown(event);
 assert.ok(event.prevented);
 assert.ok(elem('ppe-scan-employee').focused);
 assert.equal(item.stock,'2');
 assert.equal(dashboard.db.ppeTransactions.length,0);
});
test('scanner prevents unknown and previously issued unit codes from advancing focus',()=>{
 const {dashboard,elem}=harness({locked:false});
 dashboard.db.ppeStock.push({id:'scan-item',item:'Gloves',barcode:'OC101',stock:'1',size:'9',colour:'',status:'Available'});
 dashboard.db.ppeUnits.push({id:'scan-used',itemId:'scan-item',itemName:'Gloves',barcode:'OI008',status:'Issued',issuedTo:'Previous Worker',issuedAt:'2026-11-10'});
 dashboard.bindPpeScanner();
 elem('ppe-scan-code').value='OI999';
 elem('ppe-scan-code').listeners.keydown({key:'Enter',preventDefault(){}});
 assert.ok(elem('ppe-scan-code').focused);
 elem('ppe-scan-code').focused=false;
 elem('ppe-scan-code').value='OI008';
 elem('ppe-scan-code').listeners.input();
 assert.ok(elem('ppe-scan-result').textContent.includes('Already issued'));
 elem('ppe-scan-code').listeners.keydown({key:'Enter',preventDefault(){}});
 assert.ok(elem('ppe-scan-code').focused);
 assert.equal(dashboard.db.ppeTransactions.length,0);
});
test('OI issue reduces stock once and records employee, while repeat issue is blocked',()=>{
 const {dashboard,elem,errors}=harness({locked:false});
 const item={id:'scan-item',item:'Hi-Vis Jacket',barcode:'OC112',stock:'2',size:'L',colour:'Yellow',status:'Available',minStock:'0',issuedTo:'',lastIssued:''};
 dashboard.db.ppeStock.push(item);
 const unit={id:'scan-unit',itemId:item.id,itemName:item.item,barcode:'OI002',status:'In Stock',colour:'Yellow',size:'L',issuedTo:'',issuedAt:''};
 dashboard.db.ppeUnits.push(unit);
 dashboard.bindPpeScanner();
 elem('ppe-scan-code').value='OI002';
 elem('ppe-scan-type').value='issue';
 elem('ppe-scan-qty').value='1';
 elem('ppe-scan-employee').value='Test Employee';
 elem('ppe-scan-person').value='H&S Officer';
 elem('ppe-scan-notes').value='';
 elem('ppe-scan-form').listeners.submit({preventDefault(){}});
 assert.equal(item.stock,'1');
 assert.equal(unit.status,'Issued');
 assert.equal(dashboard.db.ppeTransactions.length,1);
 assert.equal(dashboard.db.ppeTransactions[0].employee,'Test Employee');
 elem('ppe-scan-code').value='OI002';
 elem('ppe-scan-qty').value='1';
 elem('ppe-scan-employee').value='Test Employee';
 elem('ppe-scan-person').value='H&S Officer';
 elem('ppe-scan-form').listeners.submit({preventDefault(){}});
 assert.equal(item.stock,'1');
 assert.equal(dashboard.db.ppeTransactions.length,1);
 assert.ok(errors.some(m=>m.includes('already been issued')));
});
test('failed save reverses PPE stock and individual unit issue',()=>{
 const {dashboard,elem,errors}=harness({locked:false,writeFails:true});
 const item={id:'scan-item',item:'Hi-Vis Vest',barcode:'OC112',stock:'2',size:'XL',colour:'Orange',status:'Available',minStock:'',issuedTo:'',lastIssued:''};
 const unit={id:'scan-unit',itemId:item.id,itemName:item.item,barcode:'OI002',status:'In Stock',colour:'Orange',size:'XL',issuedTo:'',issuedAt:''};
 dashboard.db.ppeStock.push(item);dashboard.db.ppeUnits.push(unit);
 dashboard.bindPpeScanner();
 elem('ppe-scan-code').value='OI002';elem('ppe-scan-type').value='issue';elem('ppe-scan-qty').value='1';
 elem('ppe-scan-employee').value='Test Employee';elem('ppe-scan-person').value='H&S Officer';elem('ppe-scan-notes').value='';
 elem('ppe-scan-form').listeners.submit({preventDefault(){}});
 assert.equal(item.stock,'2');
 assert.equal(unit.status,'In Stock');
 assert.equal(dashboard.db.ppeTransactions.length,0);
 assert.ok(errors.some(m=>m.includes('Unable to save')));
});
test('product QR codes retain old OC aliases and distinguish colour variants',()=>{
 const {dashboard}=harness({locked:false});
 dashboard.db.ppeStock.push(
  {id:'itemA',item:'Hi-Vis Vest',size:'XL',colour:'Yellow',barcode:'OC009',stock:'2'},
  {id:'itemB',item:'Hi-Vis Vest',size:'XL',colour:'Orange',barcode:'OC010',stock:'3'}
 );
 dashboard.db.ppeTransactions.push({itemId:'itemB',barcode:'OC010'});
 assert.equal(dashboard.ensurePpeBarcodes(),true);
 const [a,b]=dashboard.db.ppeStock;
 assert.equal(a.barcode,'HIVXL');
 assert.equal(b.barcode,'HIVXL-2');
 assert.ok(a.legacyBarcodes.includes('OC009'));
 assert.ok(b.legacyBarcodes.includes('OC010'));
 assert.equal(dashboard.ppeLookupProduct('OC010').id,'itemB');
});

test('scanner rejects issue without employee or with invalid quantity and leaves stock unchanged',()=>{
 const {dashboard,elem,errors}=harness({locked:false});
 const item={id:'validation-item',item:'Gloves',barcode:'OC311',stock:'2',size:'10',colour:'',status:'Available',minStock:''};
 dashboard.db.ppeStock.push(item);
 dashboard.bindPpeScanner();
 elem('ppe-scan-code').value='OC311';elem('ppe-scan-type').value='issue';
 elem('ppe-scan-qty').value='1';elem('ppe-scan-employee').value='';
 elem('ppe-scan-person').value='Safety Officer';elem('ppe-scan-notes').value='';
 elem('ppe-scan-form').listeners.submit({preventDefault(){}});
 assert.ok(errors.some(s=>s.includes('employee receiving')));
 assert.equal(item.stock,'2');assert.equal(dashboard.db.ppeTransactions.length,0);
 elem('ppe-scan-employee').value='Test Employee';
 elem('ppe-scan-qty').value='1.5';
 elem('ppe-scan-form').listeners.submit({preventDefault(){}});
 assert.ok(errors.some(s=>s.includes('valid whole-number')));
 assert.equal(item.stock,'2');assert.equal(dashboard.db.ppeTransactions.length,0);
 elem('ppe-scan-qty').value='3';
 elem('ppe-scan-form').listeners.submit({preventDefault(){}});
 assert.ok(errors.some(s=>s.includes('Not enough stock')));
 assert.equal(item.stock,'2');assert.equal(dashboard.db.ppeTransactions.length,0);
});
test('manual supplier receipt adds stock and keeps existing QR units unchanged',()=>{
 const {dashboard}=harness({locked:false});
 const item={id:'receipt-item',item:'Hi-Vis Vest',barcode:'OC321',stock:'2',size:'M',colour:'Orange',status:'Available',minStock:''};
 dashboard.db.ppeStock.push(item);
 dashboard.db.ppeUnits.push({id:'receipt-unit',itemId:item.id,itemName:item.item,barcode:'OI321',status:'In Stock',colour:'Orange',size:'M',issuedTo:'',issuedAt:''});
 const received=dashboard.receivePpeStock({itemId:item.id,quantity:'2',supplier:'Test Supplier',deliveryRef:'DEL-321',person:'Safety Officer'});
 assert.ok(received.ok);
 assert.equal(item.stock,'4');
 assert.equal(dashboard.db.ppeTransactions.length,1);
 assert.equal(dashboard.db.ppeTransactions[0].type,'receive');
 assert.equal(dashboard.db.ppeUnits[0].status,'In Stock');
 assert.equal(dashboard.db.ppeTransactions[0].supplier,'Test Supplier');
 assert.equal(dashboard.receivePpeStock({itemId:item.id,quantity:'2',supplier:'Test Supplier',deliveryRef:'DEL-321',person:'Safety Officer'}).ok,false);
 assert.equal(item.stock,'4');
 assert.ok(dashboard.ppeStockRegisterHTML().includes('Receive Stock'));
 assert.ok(dashboard.ppeReceiveHTML().includes('Receive PPE delivery'));
});
test('scanner requires available OI code when individual desk labels exist',()=>{
 const {dashboard,elem,errors}=harness({locked:false});
 const item={id:'desk-item',item:'Hi-Vis Jacket',barcode:'OC411',stock:'1',size:'S',colour:'Yellow',status:'Available',minStock:''};
 dashboard.db.ppeStock.push(item);
 dashboard.db.ppeUnits.push({id:'desk-unit',itemId:item.id,itemName:item.item,barcode:'OI411',status:'In Stock',colour:'Yellow',size:'S',issuedTo:'',issuedAt:''});
 dashboard.bindPpeScanner();
 elem('ppe-scan-code').value='OC411';elem('ppe-scan-type').value='issue';
 elem('ppe-scan-qty').value='1';elem('ppe-scan-employee').value='Test Employee';
 elem('ppe-scan-person').value='Safety Officer';elem('ppe-scan-notes').value='';
 elem('ppe-scan-form').listeners.submit({preventDefault(){}});
 assert.equal(item.stock,'1');
 assert.equal(dashboard.db.ppeTransactions.length,0);
 assert.ok(errors.some(s=>s.includes('individual QR code')));
});

test('verbal warnings is a separate register beneath incidents with confidential fields',()=>{
 const {dashboard,elem}=harness({locked:false});
 dashboard.go('home');
 const names=Object.keys(dashboard.config);
 assert.ok(names.includes('verbalWarnings'));
 const fields=dashboard.config.verbalWarnings.fields.map(f=>f[0]);
 for(const name of ['date','employee','area','subject','description','employeeResponse','expectedImprovement','issuedBy','followUpDate','status'])assert.ok(fields.includes(name),name);
 dashboard.db.verbalWarnings.push({id:'warning-test',date:'2026-11-16',employee:'Example Employee',area:'Warehouse',subject:'Unsafe conduct',description:'Safety discussion',expectedImprovement:'Follow safe procedure',issuedBy:'Example Manager',status:'Follow-up Required'});
 dashboard.go('verbalWarnings');
 assert.ok(elem('tbody').innerHTML.includes('Example Employee'));
 assert.ok(dashboard.sectionWorkflow('verbalWarnings').includes('Verbal warning follow-up'));
});
test('verbal warnings register respects its own PIN selection',()=>{
 const {dashboard,elem}=harness({locked:true,sections:['verbalWarnings']});
 dashboard.db.verbalWarnings.push({id:'secret',employee:'CONFIDENTIAL EXAMPLE',date:'2026-11-16',subject:'Safety issue'});
 dashboard.go('verbalWarnings');
 assert.ok(elem('content').innerHTML.includes('PIN protected section'));
 assert.ok(!elem('content').innerHTML.includes('CONFIDENTIAL EXAMPLE'));
});

test('verbal warnings navigation appears once directly beneath incidents',()=>{
 const {dashboard,elem}=harness({locked:false});
 dashboard.go('home');
 const nav=elem('nav').innerHTML;
 const incidents=nav.indexOf('data-nav="incidents"');
 const warnings=nav.indexOf('data-nav="verbalWarnings"');
 const assets=nav.indexOf('data-nav="assets"');
 assert.ok(incidents>=0&&warnings>incidents&&assets>warnings);
 assert.equal((nav.match(/data-nav="verbalWarnings"/g)||[]).length,1);
});

test('Allocate PPE tab displays employee allocation fields and does not issue on opening',()=>{
 const {dashboard,elem}=harness({locked:false});
 const item={id:'label-test',item:'Hi-Vis Vest',category:'High Visibility Clothing',size:'XL',colour:'Orange',stock:'2',barcode:'OC555'};
 dashboard.db.ppeStock.push(item);
 dashboard.go('ppeStock');
 assert.ok(elem('content').innerHTML.includes('Stock Management'));
 assert.ok(elem('content').innerHTML.includes('Receive PPE'));
 assert.ok(elem('content').innerHTML.includes('PPE Stock'));
 assert.ok(dashboard.ppeWorkspaceTabs().includes('data-ppe-workspace="allocate"'));
 assert.ok(dashboard.ppeWorkspaceTabs().includes('data-ppe-workspace="receive"'));
 assert.ok(dashboard.ppeWorkspaceTabs().includes('data-ppe-workspace="history"'));
 const page=dashboard.ppeAllocationHTML();
 assert.ok(page.includes('Employee full name'));
 assert.ok(page.includes('Generate &amp; print allocation labels'));
 assert.ok(page.includes('Scan label to issue PPE'));
 assert.ok(page.includes('Hi-Vis Vest'));
 assert.equal(item.stock,'2');
 assert.equal(dashboard.db.ppeTransactions.length,0);
});

test('allocated PPE scan Enter automatically deducts exactly once and creates employee record',()=>{
 const {dashboard,elem}=harness({locked:false});
 const item={id:'alloc-stock',item:'Hi-Vis Vest',category:'High Visibility Clothing',colour:'Orange',size:'XL',stock:'2',minStock:'',status:'Available'};
 dashboard.db.ppeStock.push(item);
 const result=dashboard.createPpeAllocation({employee:'Test Employee',department:'Production',itemId:item.id,quantity:1,person:'Safety Officer'});
 assert.ok(result.ok);
 assert.equal(item.stock,'2');
 assert.equal(dashboard.db.ppeTransactions.length,0);
 const barcode=result.allocations[0].barcode;
 dashboard.bindPpeAllocation();
 elem('ppe-allocate-scan-code').value=barcode;
 let prevented=false;
 elem('ppe-allocate-scan-code').listeners.keydown({key:'Enter',preventDefault(){prevented=true}});
 assert.ok(prevented);
 assert.equal(item.stock,'1');
 assert.equal(dashboard.db.ppeTransactions.length,1);
 assert.equal(dashboard.db.ppeTransactions[0].employee,'Test Employee');
 assert.equal(dashboard.db.ppeTransactions[0].department,'Production');
 assert.equal(dashboard.db.ppeTransactions[0].barcode,barcode);
 assert.equal(result.allocations[0].status,'Issued');
 elem('ppe-allocate-scan-code').value=barcode;
 elem('ppe-allocate-scan-code').listeners.keydown({key:'Enter',preventDefault(){}});
 assert.equal(item.stock,'1');
 assert.equal(dashboard.db.ppeTransactions.length,1);
});
test('allocated PPE scan fails safely when disk write fails',()=>{
 const {dashboard,elem}=harness({locked:false,writeFails:true});
 const item={id:'alloc-fail',item:'Gloves',category:'Hand Protection',size:'9',stock:'1',minStock:'',status:'Available'};
 dashboard.db.ppeStock.push(item);
 const unit={id:'alloc-unit',itemId:item.id,itemName:'Gloves',barcode:'OI773',status:'In Stock',issuedTo:'',issuedAt:''};
 const allocation={id:'alloc-pending',unitId:unit.id,itemId:item.id,itemName:'Gloves · 9',barcode:unit.barcode,employee:'Test Employee',department:'Production',person:'Safety Officer',notes:'',createdAt:new Date().toISOString(),status:'Pending',issuedAt:''};
 dashboard.db.ppeUnits.push(unit);dashboard.db.ppeAllocations.push(allocation);
 dashboard.bindPpeAllocation();
 elem('ppe-allocate-scan-code').value='OI773';
 elem('ppe-allocate-scan-code').listeners.keydown({key:'Enter',preventDefault(){}});
 assert.equal(item.stock,'1');
 assert.equal(unit.status,'In Stock');
 assert.equal(allocation.status,'Pending');
 assert.equal(dashboard.db.ppeTransactions.length,0);
});

test('scanner input without Enter deducts PPE and reflects updated stock tab',()=>{
 const {dashboard,elem}=harness({locked:false});
 const item={id:'scan-no-enter',item:'Hi-Vis Vest',category:'High Visibility Clothing',size:'XL',colour:'Orange',stock:'3',minStock:'',status:'Available'};
 dashboard.db.ppeStock.push(item);
 const created=dashboard.createPpeAllocation({employee:'Example Worker',department:'Production',itemId:item.id,quantity:1,person:'Safety Officer'});
 assert.ok(created.ok);
 const code=created.allocations[0].barcode;
 assert.equal(item.stock,'3');
 dashboard.bindPpeAllocation();
 elem('ppe-allocate-scan-code').value=code;
 elem('ppe-allocate-scan-code').listeners.input();
 assert.equal(item.stock,'2');
 assert.equal(dashboard.db.ppeTransactions.length,1);
 assert.equal(dashboard.db.ppeTransactions[0].before,3);
 assert.equal(dashboard.db.ppeTransactions[0].after,2);
 const display=dashboard.ppeAllocationHTML();
 assert.ok(display.includes('Stock: 3 → 2'));
 assert.ok(dashboard.ppeStockRegisterHTML().includes('<td>2</td>'));
 elem('ppe-allocate-scan-code').value=code;
 elem('ppe-allocate-scan-code').listeners.input();
 assert.equal(item.stock,'2');
 assert.equal(dashboard.db.ppeTransactions.length,1);
});

test('existing PPE stock quantity is editable and corrected counts are audited',()=>{
 assert.ok(html.includes('name="stock" type="number" min="0" step="1" required'));
 assert.ok(!html.includes('readonly title="Use Scan PPE to adjust stock'));
 assert.ok(html.includes('Stock correction reason'));
 assert.ok(html.includes("db.ppeStockAdjustments.push(adjustment)"));
 const {dashboard}=harness({locked:false});
 const item={id:'counted-item',item:'Hi-Vis Vest',colour:'Orange',size:'XL',stock:'10'};
 dashboard.db.ppeStock.push(item);
 const correction=dashboard.checkPpeStockCorrection(item,'12','Physical count','Safety Officer');
 assert.ok(correction.ok);
 assert.equal(correction.entry.before,10);
 assert.equal(correction.entry.after,12);
 assert.equal(correction.entry.reason,'Physical count');
 assert.equal(dashboard.checkPpeStockCorrection(item,'12','','').ok,false);
 assert.equal(dashboard.checkPpeStockCorrection(item,'9.5','Physical count','Officer').ok,false);
 assert.equal(dashboard.checkPpeStockCorrection(item,'10','','').entry,null);
});
test('stock corrections cannot invalidate reserved or ready individual PPE barcodes',()=>{
 const {dashboard}=harness({locked:false});
 const item={id:'counted-item',item:'Gloves',stock:'5'};
 dashboard.db.ppeStock.push(item);
 dashboard.db.ppeUnits.push({id:'stock-unit',itemId:item.id,itemName:'Gloves',barcode:'OI800',status:'In Stock'});
 dashboard.db.ppeAllocations.push({id:'stock-pending',itemId:item.id,barcode:'OI800',status:'Pending'});
 assert.equal(dashboard.checkPpeStockCorrection(item,0,'Counted','Officer').ok,false);
 assert.ok(dashboard.checkPpeStockCorrection(item,1,'Counted','Officer').ok);
 assert.ok(dashboard.checkPpeStockCorrection(item,6,'Delivery counted','Officer').ok);
 assert.equal(item.stock,'5');
});

test('employee PPE issue search filters partial names and other issue details without changing records',()=>{
 const {dashboard,elem}=harness({locked:false});
 dashboard.db.ppeTransactions.push(
  {id:'issue-search-1',type:'issue',timestamp:'2026-11-17T12:00:00.000Z',employee:'Joseph Smith',department:'Production',itemName:'Orange Hi-Vis Vest XL',barcode:'OI922',quantity:1,recordedBy:'H&S Officer'},
  {id:'issue-search-2',type:'issue',timestamp:'2026-11-17T13:00:00.000Z',employee:'Sarah Jones',department:'Warehouse',itemName:'Safety Gloves M',barcode:'OI923',quantity:1,recordedBy:'H&S Officer'},
  {id:'receipt-search-3',type:'receive',timestamp:'2026-11-17T14:00:00.000Z',employee:'',itemName:'Orange Hi-Vis Vest XL',barcode:'OC900',quantity:2,recordedBy:'H&S Officer'}
 );
 assert.equal(dashboard.ppeIssueRecordsFiltered('jo').length,2);
 assert.equal(dashboard.ppeIssueRecordsFiltered('joseph').length,1);
 assert.equal(dashboard.ppeIssueRecordsFiltered('WAREHOUSE').length,1);
 assert.equal(dashboard.ppeIssueRecordsFiltered('oi922').length,1);
 assert.equal(dashboard.ppeIssueRecordsFiltered('oc900').length,0);
 dashboard.go('ppeStock');
 assert.ok(dashboard.ppeEmployeeIssueRecordsHTML().includes('ppe-issue-search'));
 dashboard.bindPpeIssueSearch();
 elem('ppe-issue-search').value='Joseph';
 elem('ppe-issue-search').listeners.input();
 assert.ok(elem('ppe-issue-record-rows').innerHTML.includes('Joseph Smith'));
 assert.ok(!elem('ppe-issue-record-rows').innerHTML.includes('Sarah Jones'));
 assert.equal(elem('ppe-issue-record-count').textContent,'1 of 2 issues');
 elem('ppe-issue-search').value='not-an-employee';
 elem('ppe-issue-search').listeners.input();
 assert.ok(elem('ppe-issue-record-rows').innerHTML.includes('No matching PPE issue records'));
 assert.equal(dashboard.db.ppeTransactions.length,3);
});

test('employee PPE issue records offer a remove button that voids test entries without changing stock or barcode state',()=>{
 const {dashboard,elem,issueButtons,getWrites}=harness({locked:false});
 const item={id:'issue-item',item:'Safety Gloves',colour:'Grey',size:'L',stock:'5',status:'Available'};
 const unit={id:'unit-1',itemId:item.id,barcode:'OI888',status:'Issued',issuedTo:'Test Employee',issuedAt:'2026-11-18T10:00:00Z'};
 const allocation={id:'allocate-1',status:'Issued',barcode:'OI888',itemId:item.id,unitId:unit.id};
 const transaction={id:'test-issue-1',type:'issue',itemId:item.id,itemName:'Safety Gloves · Grey · L',barcode:'OI888',quantity:1,employee:'Test Employee',recordedBy:'Joe',timestamp:'2026-11-18T10:00:00Z',before:6,after:5,notes:''};
 dashboard.db.ppeStock.push(item);
 dashboard.db.ppeUnits.push(unit);
 dashboard.db.ppeAllocations.push(allocation);
 dashboard.db.ppeTransactions.push(transaction);
 dashboard.go('ppeStock');
 const rows=dashboard.ppeEmployeeIssueRecordsHTML();
 assert.match(rows,/data-ppe-issue-remove="test-issue-1"/);
 assert.match(rows,/Stock is not automatically restored/);
 issueButtons.push({dataset:{ppeIssueRemove:'test-issue-1'},onclick:null});
 dashboard.bindPpeIssueSearch();
 assert.equal(typeof issueButtons[0].onclick,'function');
 const beforeWrites=getWrites();
 issueButtons[0].onclick();
 assert.match(elem('modal-root').innerHTML,/Remove employee PPE issue/);
 assert.match(elem('modal-root').innerHTML,/The stock quantity will/);
 assert.equal(elem('ppe-issue-remove-reason').focused,true);
 assert.equal(getWrites(),beforeWrites);
 elem('ppe-issue-remove-reason').value='Test entry';
 elem('ppe-issue-remove-form').onsubmit({preventDefault(){}});
 assert.equal(getWrites(),beforeWrites+1);
 assert.equal(dashboard.ppeIssueRecordsFiltered().length,0);
 assert.equal(dashboard.db.ppeTransactions.length,1);
 assert.equal(transaction.voided,true);
 assert.equal(transaction.voidReason,'Test entry');
 assert.ok(transaction.voidedAt);
 assert.equal(item.stock,'5');
 assert.equal(unit.status,'Issued');
 assert.equal(allocation.status,'Issued');
 assert.match(elem('ppe-issue-record-rows').innerHTML,/No matching PPE issue records/);
 assert.equal(elem('ppe-issue-record-count').textContent,'0 of 0 issues');
 assert.match(html,/Voided issue ·/);
});

test('PPE removal dialog can be cancelled and requires a reason before saving',()=>{
 const transaction={id:'cancel-issue',type:'issue',employee:'Test Employee',itemName:'Safety Gloves',barcode:'OI898',timestamp:'2026-11-18T10:00:00Z'};
 const cancelled=harness({locked:false});
 cancelled.dashboard.db.ppeTransactions.push({...transaction});
 cancelled.issueButtons.push({dataset:{ppeIssueRemove:'cancel-issue'}});
 cancelled.dashboard.bindPpeIssueSearch();
 cancelled.issueButtons[0].onclick();
 assert.match(cancelled.elem('modal-root').innerHTML,/Reason for removal/);
 cancelled.elem('ppe-issue-remove-cancel').onclick();
 assert.equal(cancelled.elem('modal-root').innerHTML,'');
 assert.equal(cancelled.dashboard.db.ppeTransactions[0].voided,undefined);
 assert.equal(cancelled.getWrites(),0);
 const rejected=harness({locked:false});
 rejected.dashboard.db.ppeTransactions.push({...transaction});
 rejected.issueButtons.push({dataset:{ppeIssueRemove:'cancel-issue'}});
 rejected.dashboard.bindPpeIssueSearch();
 rejected.issueButtons[0].onclick();
 rejected.elem('ppe-issue-remove-reason').value='  ';
 rejected.elem('ppe-issue-remove-form').onsubmit({preventDefault(){}});
 assert.equal(rejected.getWrites(),0);
 assert.match(rejected.errors[0],/Enter a reason/);
 assert.equal(rejected.dashboard.removePpeIssueRecord('cancel-issue','').ok,false);
 assert.match(rejected.elem('modal-root').innerHTML,/Remove employee PPE issue/);
 assert.doesNotMatch(html,/\breason=prompt\(/);
});

test('failed disk write reverses PPE issue removal and duplicate removal is rejected',()=>{
 const issue={id:'fail-issue',type:'issue',employee:'Test Person',barcode:'OI899',itemName:'Safety Gloves'};
 const failed=harness({locked:false,writeFails:true});
 failed.dashboard.db.ppeTransactions.push(issue);
 assert.equal(failed.dashboard.removePpeIssueRecord(issue.id,'Test entry').ok,false);
 assert.equal(issue.voided,undefined);
 assert.equal(issue.voidedAt,undefined);
 assert.equal(issue.voidReason,undefined);
 assert.equal(failed.dashboard.ppeIssueRecordsFiltered().length,1);
 const successful=harness({locked:false});
 successful.dashboard.db.ppeTransactions.push({...issue});
 assert.equal(successful.dashboard.removePpeIssueRecord(issue.id,'Test entry').ok,true);
 assert.equal(successful.dashboard.removePpeIssueRecord(issue.id,'Test entry').ok,false);
 assert.equal(successful.dashboard.db.ppeTransactions.length,1);
});


test('PPE label document prints one 62 x 100 mm page per item, not an A4 sheet',()=>{
 const {dashboard}=harness({locked:false});
 const labels=[
  {itemName:'HI-VIS VEST',size:'XL',colour:'YELLOW',barcode:'OI002',productCode:'OC001'},
  {itemName:'SAFETY GLOVES',size:'L',colour:'GREY',barcode:'OI003',productCode:'OC002'}
 ];
 const page=dashboard.ppeRollLabelDocument(labels,'PPE label test');
 assert.match(page,/@page\{size:62mm 100mm;margin:0\}/);
 assert.doesNotMatch(page,/@page\{size:A4/);
 assert.equal((page.match(/<article class="ppe-roll-label">/g)||[]).length,2);
 assert.match(page,/HI-VIS VEST/);
 assert.match(page,/OI002/);
 assert.match(page,/ppe-roll-qr/);
 assert.match(page,/page-break-after:always/);
 assert.match(page,/SCAN TO ISSUE PPE/);
 assert.match(page,/\.ppe-roll-product strong\{display:block;font-size:12pt/);
 assert.match(page,/\.ppe-roll-size\{font-size:11pt/);
 assert.match(page,/height:28mm!important/);
});
test('PPE allocation labels include the recipient and the exact individual scan code',()=>{
 const {dashboard}=harness({locked:false});
 const page=dashboard.ppeRollLabelDocument([
  {itemName:'HI-VIS VEST',size:'XL',colour:'YELLOW',barcode:'OI004',productCode:'OC001',employee:'Test Employee',department:'Production'}
 ],'PPE allocation');
 assert.match(page,/Test Employee/);
 assert.match(page,/ISSUED TO/);
 assert.match(page,/OI004/);
 assert.match(page,/SCAN TO ISSUE PPE/);
 assert.match(page,/@page\{size:62mm 100mm;margin:0\}/);
});
test('PPE delivery label uses its OC product code rather than an issue instruction',()=>{
 const {dashboard}=harness({locked:false});
 const page=dashboard.ppeRollLabelDocument([{itemName:'Safety Gloves',size:'9',barcode:'GL9',productCode:'GL9'}],'PPE receipt');
 assert.match(page,/QR code GL9/);
 assert.match(page,/SCAN FOR STOCK DELIVERY/);
 assert.doesNotMatch(page,/SCAN TO ISSUE PPE/);
});

test('Excel boot claim preview preserves date meaning and merged expense form ranges',()=>{
 const {dashboard}=harness({locked:false});
 assert.equal(dashboard.spreadsheetDisplayValue('46344','n',{numFmtId:14}),'18/11/2026');
 assert.equal(dashboard.spreadsheetDisplayValue('46327','n',{numFmtId:165,format:'mmmm'}),'November');
 assert.equal(dashboard.spreadsheetDisplayValue('30','n',{numFmtId:166,format:'£#,##0.00'}),'£30.00');
 assert.equal(dashboard.spreadsheetDisplayValue('46344','s',{numFmtId:14}),'46344');
 assert.deepEqual(dashboard.spreadsheetRange('A1:C2'),{row:0,col:0,rowSpan:2,colSpan:3});
 assert.deepEqual(dashboard.spreadsheetRange('E6:E6'),{row:5,col:4,rowSpan:1,colSpan:1});
 assert.equal(dashboard.spreadsheetRange('C3:A1'),null);
 assert.ok(html.includes('Microsoft Excel') && html.includes('Show approximate grid (not exact)'));
 assert.ok(html.includes('spreadsheetStyles(await zip.read'));
});

test('Attachments offer an in-dashboard preview and keep opening the original as a fallback',async()=>{
 const {dashboard,openedAttachments,errors}=harness({locked:false});
 const filenames=['Boot Claim.xlsm','Boot Claim.xlsx','Risk Assessment.docx','Approved Permit.pdf','Training Record.jpg'];
 for(let i=0;i<filenames.length;i++)await dashboard.openAttachmentDirectly({name:filenames[i]},'ppe','claim-1',i);
 assert.deepEqual(openedAttachments,filenames.map((_,index)=>({section:'ppe',id:'claim-1',index})));
 assert.equal(errors.length,0);
 const controls=dashboard.attachmentHTML([{name:'Boot Claim.xlsm',size:1024}]);
 assert.ok(controls.includes('Preview document'));
 assert.ok(html.includes('previewAttachment(current[i],k,id)'));
 assert.ok(html.includes('previewAttachmentPdf(k,id,index)'));
 assert.ok(html.includes('Accurate print-layout preview generated by'));
 assert.ok(html.includes('Show approximate grid (not exact)'));
});

test('Preview button shows Office-generated PDF inside the dashboard for a saved XLSM claim',async()=>{
 const attachment={name:'Gokhan Turedi.xlsm',size:2048,data:'data:application/octet-stream;base64,ZXhjZWw='};
 const elements={
  '#preview-back':{},'#preview-download':{},'.modal-backdrop':{},'#preview-info':{textContent:''},
  '#preview-body':{children:[],append(node){this.children.push(node)}},
  '.modal-actions':{children:[],insertBefore(node){this.children.push(node)}}
 };
 let modalMarkup='',seenSelection=null;
 const root={querySelector:selector=>elements[selector]||null};
 Object.defineProperty(root,'innerHTML',{set:htmlText=>{modalMarkup=htmlText}});
 const document={getElementById:()=>root,createElement:tag=>({tagName:tag,className:'',textContent:''})};
 const window={onboardDesktop:{previewAttachmentPdf:async(section,id,index)=>{seenSelection={section,id,index};return {ok:true,data:'data:application/pdf;base64,JVBERi0xLjcK'}}}};
 const db={ppe:[{id:'claim-1',attachments:[attachment]}]};
 const start=inline.indexOf('async function previewAttachment('),end=inline.indexOf('function fileAsDataURL(',start);
 const preview=new Function('window','document','db','esc','matchingPdfForWord','attachmentBlob','downloadAttachment','documentPanel','renderSpreadsheetPreview','renderDocxPreview','openAttachmentDirectly','URL','alert',inline.slice(start,end)+'\nreturn previewAttachment')(
  window,document,db,s=>s,()=>null,file=>({data:file.data}),()=>{},()=>{},()=>{throw Error('Should not use approximate renderer')},()=>{},()=>{},
  {createObjectURL:()=> 'blob:office-pdf',revokeObjectURL:()=>{}},()=>{}
 );
 await preview(attachment,'ppe','claim-1');
 assert.deepEqual(seenSelection,{section:'ppe',id:'claim-1',index:0});
 assert.ok(modalMarkup.includes('Download original'));
 assert.match(elements['#preview-info'].textContent,/Accurate print-layout preview generated by Microsoft Excel/);
 assert.equal(elements['#preview-body'].children.length,1);
 assert.equal(elements['#preview-body'].children[0].tagName,'iframe');
 assert.equal(elements['#preview-body'].children[0].src,'blob:office-pdf');
 assert.equal(elements['.modal-actions'].children.length,0);
});

test('QR labels render offline SVG matrix with readable stock code',()=>{
 const {dashboard}=harness({locked:false});
 const code=dashboard.ppeBarcodeSvg('HIVXL1');
 assert.match(code,/<svg/);
 assert.match(code,/QR code HIVXL1/);
 assert.match(code,/HIVXL1/);
 assert.ok((code.match(/<path|<rect/g)||[]).length>0);
});
test('QR scan deducts one from stock and an old OI code stays valid as an alias',()=>{
 const {dashboard}=harness({locked:false});
 const item={id:'qr-v',item:'Hi-Vis Vest',category:'High Visibility Clothing',size:'XL',colour:'Orange',stock:'2',barcode:'OC007'};
 dashboard.db.ppeStock.push(item);
 dashboard.db.ppeUnits.push({id:'old-one',itemId:item.id,barcode:'OI007',status:'In Stock',itemName:item.item,issuedTo:'',issuedAt:''});
 const created=dashboard.createPpeAllocation({employee:'Test Employee',department:'Production',itemId:item.id,quantity:1,person:'Safety Officer'});
 assert.ok(created.ok);
 const code=created.allocations[0].barcode;
 assert.equal(code,'HIVXL1');
 assert.ok(dashboard.db.ppeUnits[0].legacyBarcodes.includes('OI007'));
 assert.equal(dashboard.issuePpeAllocation('OI007').ok,true);
 assert.equal(item.stock,'1');
 assert.equal(dashboard.issuePpeAllocation(code).ok,false);
 assert.equal(dashboard.db.ppeTransactions.length,1);
});

test('compact PPE roll label keeps a complete 28 mm QR in the 62 by 100 mm printable area',()=>{
 const {dashboard}=harness({locked:false});
 const page=dashboard.ppeRollLabelDocument([{itemName:'Hi-Vis Vest',size:'XL',barcode:'HIVXL1',productCode:'HIVXL',unit:true,employee:'Test Employee'}],'QR label');
 assert.match(page, /@page\{size:62mm 100mm;margin:0\}/);
 assert.match(page, /padding:4mm 5mm/);
 assert.match(page, /\.ppe-roll-qr svg\{[^}]*width:28mm!important;height:28mm!important/);
 assert.match(page, /QR code HIVXL1/);
 const brand=page.indexOf('ONBOARD CORRUGATED'),qr=page.indexOf('class="ppe-roll-qr"'),product=page.indexOf('class="ppe-roll-product"');
 assert.ok(brand<qr&&qr<product);
 assert.match(page,/SIZE: XL/);
 assert.match(page,/SCAN TO ISSUE PPE/);
 assert.doesNotMatch(page,/height:33mm!important/);
});

test('Add PPE form displays essential fields and hides unused legacy inputs without erasing stored fields',()=>{
 assert.match(html,/k==='ppeStock'\?\(\(\)=>\{/);
 assert.match(html,/const primary=\['item','category','size','stock','minStock'\]/);
 assert.match(html,/const extras=\['location','supplier','person','notes'\]/);
 assert.match(html,/if\(k==='ppeStock'&&!fd\.has\(f\)\)continue/);
 assert.match(html,/if\(k==='ppeStock'&&!record\)\{r\.colour='';r\.status=/);
 assert.match(html,/r\.barcode=nextPpeBarcode\(r\)/);
});
