const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/ljm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {observe}=require('./browser-observer.cjs');
const base=process.env.FINSET_URL||'http://127.0.0.1:4173/finset/';
let browser;
(async()=>{
 fs.mkdirSync('.qa',{recursive:true});
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:412,height:917}});
 const errors=[],network=[],timings=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 page.on('request',r=>network.push({url:r.url(),method:r.method()}));
 await page.route('**/api/**',r=>r.abort());
 await observe(page);
 const begin=Date.now();
 await page.goto(base+'?screen=guided');
 await page.locator('#core-goal').waitFor();
 const formMs=Date.now()-begin;
 await page.waitForFunction(()=>window.__coreMessages.some(m=>m.ok&&m.data?.cases),null,{timeout:120000});
 const warmMs=Date.now()-begin;
 let id=100000;
 async function calculate(request){
   const key=++id,start=Date.now();
   await page.evaluate(({id,input,base})=>window.__coreWorker.postMessage({id,input,base}),{id:key,input:request,base});
   await page.waitForFunction(id=>window.__coreMessages.some(m=>m.id===id),key,{timeout:120000});
   const answer=await page.evaluate(id=>window.__coreMessages.find(m=>m.id===id),key);
   timings.push(Date.now()-start);return answer;
 }
 const replay=JSON.parse(fs.readFileSync('public/demo/mvp2.json','utf8'));
 let count=0;
 for(const [key,expected] of Object.entries(replay.snapshots)){
   const [case_id,preference,intent]=key.split('|'),answers={};
   if(preference!=='default')answers.contribution_preference=JSON.parse(preference);
   if(intent!=='default')answers['bonus_intent.kakao.auto_transfer']=JSON.parse(intent);
   const actual=await calculate({case_id,answers});
   assert.equal(actual.ok,true,key);assert.deepEqual(actual.data,expected,key);
   if(++count%40===0)console.log(`Full-response parity: ${count}/280`);
 }
 const baselines=JSON.parse(fs.readFileSync('tests/fixtures/browser-core.json','utf8'));
 // After initial load, even network failure must not change the calculation.
 await page.context().setOffline(true);
 for(const item of baselines){
   const actual=await calculate(item.request);
   if(item.error){assert.equal(actual.ok,false,item.name);assert.equal(actual.error,item.error,item.name)}
   else{assert.equal(actual.ok,true,item.name);assert.deepEqual(actual.data,item.expected,item.name)}
 }
 assert.ok(network.every(r=>r.method==='GET'&&!r.url.includes('/api/')&&new URL(r.url).origin===new URL(base).origin));
 assert.deepEqual(errors,[]);
 const report={base,formMs,warmMs,fixtureResponses:count,arbitraryInputs:baselines.length,offlineCalculation:true,sameOriginGetOnly:true,averageCalculationMs:Math.round(timings.reduce((a,b)=>a+b,0)/timings.length),maxCalculationMs:Math.max(...timings),errors};
 fs.writeFileSync('.qa/browser-core-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 await browser.close();
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exit(1)});
