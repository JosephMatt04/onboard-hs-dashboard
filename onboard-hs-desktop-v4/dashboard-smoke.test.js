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
function harness({locked=true,sections=['training','incidents','ppe'],writeFails=false}={}){
 const elements=new Map();
 const elem=id=>{
  if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',hidden:false,onclick:null,listeners:{},focused:false,focus(){this.focused=true},querySelectorAll:()=>[],setAttribute(){},addEventListener(type,handler){this.listeners[type]=handler},classList:{add(){},remove(){},toggle(){},contains(){return false}},value:''});
  return elements.get(id);
 };
 const document={getElementById:elem,querySelectorAll:()=>[],querySelector:()=>null,documentElement:{setAttribute(){},getAttribute(){return 'dark'}}};
 let writes=0;
 const window={
  localStorage:{getItem:()=>null,setItem:()=>{}},
  onboardDesktop:{
   read:()=>({ok:true,data:null}),
   write:()=>{writes++;return writeFails?{ok:false,error:'Simulated storage failure'}:{ok:true}},
   pinStatus:()=>({enabled:true,sections,unlocked:!locked}),
   pinConfigure:()=>Promise.resolve({ok:true}),
   pinLock:()=>Promise.resolve({enabled:true,sections,unlocked:false})
  },
  onboardAutoBackup:{renderSettings:()=>'<p>Backups</p>',bindControls:()=>{}}
 };
 const errors=[];
 const dashboard=new Function('window','document','alert','confirm','setTimeout','clearTimeout',core+"\nreturn {go,db,config,pinRestricted,save,lockProtectedTabs,render,handleAction,sectionWorkflow,ppeBarcodeSvg,nextPpeBarcode,nextPpeUnitBarcode,ppeTabForItem,ppeVisibleStockItems,ppeStockRegisterHTML,ensurePpeBarcodes,bindPpeScanner,setRiskCategory:(name)=>{riskCategoryFilter=name;updateRows()}};")(window,document,msg=>errors.push(String(msg)),()=>true,()=>0,()=>{});
 return {dashboard,elem,errors,getWrites:()=>writes};
}
test('all registers render their current workflows without crashing',()=>{
 const {dashboard,elem}=harness({locked:false});
 const names=Object.keys(dashboard.config);
 assert.equal(names.length,19);
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
 assert.throws(()=>dashboard.ppeBarcodeSvg('OI 001'),/Invalid barcode format/);
 assert.throws(()=>dashboard.ppeBarcodeSvg('<script>'),/Invalid barcode format/);
});
test('PPE scanning maintains distinct product and individual code sequences',()=>{
 const {dashboard}=harness({locked:false});
 dashboard.db.ppeStock.push({id:'test-item',item:'Hi-Vis Vest',barcode:'OC001',stock:'1',size:'XL',colour:'Orange'});
 dashboard.db.ppeUnits.push({id:'test-unit',itemId:'test-item',barcode:'OI001',status:'In Stock'});
 assert.equal(dashboard.nextPpeBarcode(),'OC002');
 assert.equal(dashboard.nextPpeUnitBarcode(),'OI002');
 assert.equal(dashboard.ppeTabForItem(dashboard.db.ppeStock.at(-1)),'Hi-Vis');
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
test('product code assignment repairs duplicates but protects historical codes and keeps unique OC codes',()=>{
 const {dashboard}=harness({locked:false});
 dashboard.db.ppeStock.push(
  {id:'itemA',item:'Vest',barcode:'OC009',stock:'2'},
  {id:'itemB',item:'Jacket',barcode:'OC009',stock:'3'},
  {id:'itemC',item:'Gloves',barcode:'OC010',stock:'4'}
 );
 dashboard.db.ppeTransactions.push({itemId:'itemB',barcode:'OC009'});
 assert.equal(dashboard.ensurePpeBarcodes(),true);
 const codes=dashboard.db.ppeStock.map(x=>x.barcode);
 assert.equal(new Set(codes).size,codes.length);
 assert.equal(dashboard.db.ppeStock.find(x=>x.id==='itemB').barcode,'OC009');
 assert.ok(!['OC009','OC010'].includes(dashboard.db.ppeStock.find(x=>x.id==='itemA').barcode));
});
