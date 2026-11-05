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
