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
function harness({locked=true,sections=['training','incidents','ppe']}={}){
 const elements=new Map();
 const elem=id=>{
  if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',hidden:false,onclick:null,querySelectorAll:()=>[],value:''});
  return elements.get(id);
 };
 const document={getElementById:elem,querySelectorAll:()=>[]};
 let writes=0;
 const window={
  onboardDesktop:{
   read:()=>({ok:true,data:null}),
   write:()=>{writes++;return {ok:true}},
   pinStatus:()=>({enabled:true,sections,unlocked:!locked}),
   pinConfigure:()=>Promise.resolve({ok:true}),
   pinLock:()=>Promise.resolve({enabled:true,sections,unlocked:false})
  },
  onboardAutoBackup:{renderSettings:()=>'<p>Backups</p>',bindControls:()=>{}}
 };
 const dashboard=new Function('window','document','alert','confirm',core+"\nreturn {go,db,config,pinRestricted,save,lockProtectedTabs,render,handleAction,sectionWorkflow,setRiskCategory:(name)=>{riskCategoryFilter=name;updateRows()}};")(window,document,()=>{},()=>true);
 return {dashboard,elem,getWrites:()=>writes};
}
test('all registers render their distinct workflow checks without crashing',()=>{
 const {dashboard,elem}=harness({locked:false});
 const names=Object.keys(dashboard.config);
 assert.equal(names.length,19);
 for(const k of names){
  dashboard.go(k);
  assert.ok(elem('content').innerHTML.includes(k==='risk'?'Assessment categories':'Live register checks'),k);
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

test('futuristic homepage renders all operational shortcuts and priority metrics',()=>{
 const {dashboard,elem}=harness({locked:false});
 dashboard.go('home');
 const page=elem('content').innerHTML;
 assert.ok(page.includes('Safety overview'));
 assert.equal((page.match(/class="home-quick-tile"/g)||[]).length,6);
 assert.equal((page.match(/class="home-metric /g)||[]).length,4);
 for(const section of ['risk','ssow','training','ppeStock','assets','incidents']){
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
 assert.ok(html.includes('class="fx-lorry"'));
 assert.ok(html.includes('fx-flame'));
 assert.ok(html.includes('fx-bolt'));
 assert.ok(html.includes('fx-gear'));
 assert.ok(html.includes('fx-bubble'));
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
 assert.ok(page.includes('fx-flame'));
 assert.ok(page.includes('Fire &amp; Emergency'));
 dashboard.setRiskCategory('Fire & Emergency');
 assert.ok(elem('tbody').innerHTML.includes('Scene test assessment'));
 dashboard.setRiskCategory('All');
 assert.ok(elem('tbody').innerHTML.includes('Scene test assessment'));
});

test('risk assessment categories offer real footage on hover while retaining offline fallback',()=>{
 const {dashboard,elem}=harness({locked:false});
 dashboard.go('risk');
 const page=elem('content').innerHTML;
 assert.equal((page.match(/class="risk-chip-video-layer"/g)||[]).length,11);
 for(const category of ['electrical','fire','transport','plant','chemical','handling','height','premises','all','other','uncategorised'])
  assert.ok(page.includes('data-risk-video="'+category+'"'),category);
 assert.ok(page.includes('https://www.pexels.com/download/video/'));
 assert.ok(page.includes('type="video/mp4"'));
 assert.ok(page.includes('preload="none"'));
 assert.ok(page.includes('muted loop playsinline'));
 assert.equal((page.match(/class="risk-chip-microfx"/g)||[]).length,12);
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
 assert.equal((page.match(/class="risk-chip-video-layer"/g)||[]).length,11);
 assert.equal((page.match(/class="risk-chip-microfx"/g)||[]).length,12);
 dashboard.setRiskCategory('Electrical Safety');
 assert.ok(elem('tbody').innerHTML.includes('Electrical assessment check'));
 dashboard.setRiskCategory('Fire & Emergency');
 assert.ok(!elem('tbody').innerHTML.includes('Electrical assessment check'));
});

test('electrical uses lightning footage while occupational health moves sideways',()=>{
 const {dashboard,elem}=harness({locked:false});
 dashboard.go('risk');
 const page=elem('content').innerHTML;
 assert.ok(page.includes('https://www.pexels.com/download/video/29874792/'));
 assert.ok(page.includes('class="risk-bolt-icon"'));
 assert.ok(!page.includes('data-risk-video="health"'));
 assert.ok(page.includes('class="ecg-trace"'));
 assert.ok(page.includes('class="ecg-grid"'));
 assert.ok(html.includes('ecgTravelAcross'));
 assert.ok(html.includes('risk-category-chip[data-category-theme="health"]'));
 assert.equal((page.match(/class="risk-chip-video-layer"/g)||[]).length,11);
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

test('category media remain lazy, offline-safe and accessible from keyboard focus',()=>{
 const {dashboard,elem}=harness({locked:false});
 dashboard.go('risk');
 const page=elem('content').innerHTML;
 assert.equal((page.match(/class="risk-chip-video-layer"/g)||[]).length,11);
 assert.ok(page.includes('preload="none"'));
 assert.ok(page.includes('muted loop playsinline'));
 assert.equal((page.match(/class="risk-chip-microfx"/g)||[]).length,12);
 assert.ok(page.includes('class="ecg-trace"'));
 assert.ok(!page.includes('data-risk-video="health"'));
 assert.ok(html.includes('focusin'));
 assert.ok(html.includes('focusout'));
 assert.ok(html.includes('html[data-theme="dark"] body .risk-category-chip.themed .risk-chip-video-tint'));
});

test('Onboard-branded green dark mode styles panels, forms and categories without changing light mode',()=>{
 const styles=html.slice(html.indexOf('<style>'),html.indexOf('</style>'));
 const green=styles.slice(styles.indexOf('/* Onboard Corrugated dark mode:'));
 assert.ok(green.includes('html[data-theme="dark"]'));
 assert.ok(green.includes('background:linear-gradient(155deg,#185e42,#124b36)'));
 assert.ok(green.includes('background:#0e3b2b'));
 assert.ok(green.includes('background:#1b6547'));
 assert.ok(green.includes('background:#1b6447'));
 assert.ok(green.includes('color:#eaf9f0'));
 assert.ok(html.includes("setAppearance(initialTheme,false)"));
 const {dashboard,elem}=harness({locked:false});
 dashboard.go('risk');
 assert.ok(elem('content').innerHTML.includes('Assessment categories'));
 dashboard.go('ssow');
 assert.ok(elem('content').innerHTML.includes('Live register checks'));
});
