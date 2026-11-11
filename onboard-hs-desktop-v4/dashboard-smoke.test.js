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
  if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',hidden:false,onclick:null,querySelectorAll:()=>[],setAttribute(){},value:''});
  return elements.get(id);
 };
 const document={getElementById:elem,querySelectorAll:()=>[],documentElement:{setAttribute(){},getAttribute(){return 'dark'}}};
 let writes=0;
 const window={
  localStorage:{getItem:()=>null,setItem:()=>{}},
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
 assert.ok(page.includes('Health &amp; Safety<br>Control Centre'));
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

test('dark mode covers remaining white dashboard metric, quick access and workspace surfaces',()=>{
 const styles=html.slice(html.indexOf('<style>'),html.indexOf('</style>'));
 const audit=styles.slice(styles.indexOf('/* Dark mode white-surface audit:'));
 for(const target of ['.home-redesign .home-metric','.home-redesign .home-quick-tile','.risk-review-card','.local-note','.workspace-state','.home-quick-symbol','.home-heading-row h2']){
  assert.ok(audit.includes(target),'Missing dark mode override: '+target);
 }
 assert.ok(audit.includes('background:linear-gradient(148deg,#1b6547 0%,#134f39 100%)'));
 const {dashboard,elem}=harness({locked:false});
 dashboard.go('home');
 const page=elem('content').innerHTML;
 assert.equal((page.match(/class="home-metric /g)||[]).length,4);
 assert.ok(page.includes('home-quick-tile'));
});

test('control centre homepage keeps live KPI cards, existing modules and safety actions',()=>{
 const {dashboard,elem}=harness({locked:false});
 dashboard.go('home');
 const page=elem('content').innerHTML;
 assert.ok(page.includes('Health &amp; Safety<br>Control Centre'));
 assert.ok(page.includes('What would you like to do?'));
 assert.equal((page.match(/class="control-module/g)||[]).length,0);
 assert.equal((page.match(/class="portal-module /g)||[]).length,8);
 assert.ok(page.includes('class="control-centre-main-action" data-nav="risk"'));
 assert.ok(page.includes('data-action="add" data-section="risk"'));
 assert.ok(page.includes('data-nav="incidents"'));
 assert.equal((page.match(/class="home-metric /g)||[]).length,4);
 assert.equal((page.match(/class="home-quick-tile"/g)||[]).length,6);
 assert.ok(page.includes('Review schedule'));
 assert.ok(page.includes('Record highlights'));
 assert.ok(page.includes('Export backup'));
 dashboard.go('risk');
 assert.ok(elem('content').innerHTML.includes('Assessment categories'));
});

test('workshop charcoal theme applies to entire dashboard without duplicate navigation',()=>{
 const styles=html.slice(html.indexOf('<style>'),html.indexOf('</style>'));
 const palette=styles.slice(styles.indexOf('/* ONBOARD WORKSHOP / charcoal'));
 assert.ok(palette.includes('--work-bg:#171d1f'));
 assert.ok(palette.includes('--work-lime:#c5f322'));
 for(const target of ['.side','.workspace-topbar','.home-redesign .home-metric','.home-redesign .home-quick-tile','.risk-category-chip.themed','.modal','.field',' th{',' td,','.control-centre-hero','.control-centre-command']){
  assert.ok(palette.includes(target),target);
 }
 assert.ok(html.includes("let initialTheme='dark'"));
 const {dashboard,elem}=harness({locked:false});
 for(const section of ['home','risk','ssow','incidents','training','ppeStock','assets']){
  dashboard.go(section);
  assert.ok(elem('content').innerHTML.length>300,section);
 }
 dashboard.go('home');
 const page=elem('content').innerHTML;
 assert.equal((page.match(/class="control-module/g)||[]).length,0);
 assert.equal((page.match(/class="portal-module /g)||[]).length,8);
 assert.ok(page.includes('class="control-centre-main-action"'));
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
