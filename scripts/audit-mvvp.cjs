const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/ljm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.FINSET_URL||'http://127.0.0.1:5173/';const replay=process.env.FINSET_REPLAY==='1';
const fixture=JSON.parse(fs.readFileSync('core_vendor/fixtures/cases.json','utf8')).cases[0].profile;
let browser;
(async()=>{
 fs.mkdirSync('.qa',{recursive:true}); const checks=[],errors=[];
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
 const b=name=>page.getByRole('button',{name,exact:true});
 async function click(locator){await locator.evaluate(el=>el.scrollIntoView({block:'center'}));await locator.click()}
 async function next(){await click(b('다음')); if(!replay) await page.locator('.loading-state').waitFor({state:'hidden'});}
 async function chooseCase(name){await click(b('처음부터'));const pending=replay?null:page.waitForResponse(r=>r.url().includes('/api/v2/recommend'));await click(page.locator('.core-cases button').filter({hasText:name}).first());if(pending)await pending;await page.locator('.loading-state').waitFor({state:'hidden'});await page.locator('.core-profile').waitFor()}
 async function layout(tag){const size=page.viewportSize();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow ${tag}`);if(await page.locator('.core-question').count())assert.ok(await page.locator('.core-question').evaluate(e=>e.getBoundingClientRect().width<=641));checks.push(`${tag}: ${size.width}x${size.height}`)}
 await page.goto(base+'?screen=guided&examples=1');await page.locator('.core-flow').waitFor();await page.locator('.loading-state').waitFor({state:'hidden'});
 if(replay){await page.locator('.core-cases').waitFor();await click(page.locator('.core-cases button').filter({hasText:'우대 행동 미정'}));}
 else{
  await page.locator('#core-goal').waitFor();await click(b('첫 목돈'));await click(b('300만원'));await click(b('12개월'));await next();
  await click(b('30만원'));await click(b('30만원'));assert.equal(await page.locator('#core-monthly').inputValue(),'300,000');
  await page.locator('#core-monthly').fill('371259');assert.equal(await page.locator('#core-monthly').inputValue(),'371,259');assert.equal(await page.locator('.core-amount-presets [aria-pressed=true]').count(),0);
  await page.locator('#core-cash').fill('3000000');await page.locator('#core-reserve').fill('0');assert.equal(await page.locator('#core-reserve').inputValue(),'0');await page.locator('#core-reserve').fill('3000000');
  await click(b('이전'));assert.equal(await page.locator('#core-goal').inputValue(),'3,000,000');await next();assert.equal(await page.locator('#core-monthly').inputValue(),'371,259');
  await page.setViewportSize({width:412,height:917});await layout('free amount');await page.locator('.core-input').screenshot({path:'.qa/ppt-goal-v4.png'});await page.setViewportSize({width:1280,height:800});
  const initial=page.waitForResponse(r=>r.url().includes('/api/v2/recommend'));await next();let last=await (await initial).json();assert.equal(last.profile.monthly,371259);checks.push('Amount presets replace; won formatting, zero and back navigation preserve inputs');
  for(let i=0;i<80;i++){
   const q=page.locator('[data-question]');if(!await q.count())break;const id=await q.getAttribute('data-question');const schema=last.questions.find(q=>q.id===id);assert.ok(schema,`core question ${id}`);
   assert.equal(await q.getByRole('radio',{checked:true}).count(),0,`no default selection ${id}`);
   let value=id in fixture?fixture[id]:id.startsWith('bonus_intent.')?fixture.bonus_intents[id.slice(13)]:id.startsWith('incremental_cost.')?0:fixture.facts[id];
   if(id==='holdings_complete')await click(q.getByRole('radio',{name:'기존 예·적금과 잔액이 없어요',exact:true}));
   else if(schema.type==='number')await q.locator('#core-answer').fill(String(value??0));
   else if(schema.options?.some(o=>JSON.stringify(o.value)===JSON.stringify(value))){const opt=schema.options.find(o=>JSON.stringify(o.value)===JSON.stringify(value));await click(q.getByRole('radio',{name:opt.label,exact:true}));}
   else await click(q.getByRole('radio').last());
   assert.equal(await q.getAttribute('data-question'),id,'selection does not advance');
   if(i===0){await layout('question desktop');await q.screenshot({path:'.qa/ppt-question-v4.png'});await page.setViewportSize({width:412,height:917});await layout('question mobile');await page.screenshot({path:'.qa/mvvp-question-mobile-v4.png',fullPage:true});await page.setViewportSize({width:1280,height:800});}
   const pending=page.waitForResponse(r=>r.url().includes('/api/v2/recommend'));await next();last=await (await pending).json();console.log('Answered',id,'->',last.result.status);if(last.result.status==='INVALID')throw Error(JSON.stringify(last.result));
  }
  assert.equal(await page.locator('[data-question]').count(),0,'free input reaches a result');assert.ok(await page.locator('.core-products article').count());assert.equal(last.profile.monthly,371259);
  checks.push(`Arbitrary 371259 won uses Python core: ${last.result.status}`);
  await click(page.locator('.core-plan-summary button').filter({hasText:'매달 더 모을 돈'}));assert.equal(await page.locator('#core-monthly').inputValue(),'371,259');await click(b('이전'));assert.equal(await page.locator('#core-goal').inputValue(),'3,000,000');
  await click(b('60개월'));const date=await page.locator('input[type=date]').first().inputValue();assert.equal(Number(date.slice(0,4)),new Date().getFullYear()+5);await next();await page.locator('#core-monthly').fill('300000');await next();assert.ok((await page.locator('.result-context').innerText()).includes(date));checks.push('Edit is prefilled; 60-month date survives submission');
  await chooseCase('우대 행동 미정');
 }
 await page.locator('[data-question]').waitFor();assert.equal(await page.locator('[data-question]').getAttribute('data-question'),'bonus_intent.kakao.auto_transfer');
 await page.setViewportSize({width:412,height:917});await layout('intent mobile');await page.locator('.core-question').screenshot({path:'.qa/ppt-intent-v4.png'});
 await click(page.getByRole('radio',{name:'이 조건은 선택하지 않을게요',exact:true}));assert.ok(await page.locator('[data-question]').count());await next();await page.locator('.core-products article').first().waitFor();assert.match(await page.locator('.core-products article').first().innerText(),/코드K 자유적금/);
 await click(b('우대 행동 선택 수정'));assert.equal(await page.getByRole('radio',{name:'이 조건은 선택하지 않을게요',exact:true}).getAttribute('aria-checked'),'true');await click(page.getByRole('radio',{name:'조건을 확인했고 할 계획이에요',exact:true}));await next();
 assert.match(await page.locator('.core-products article').first().innerText(),/카카오뱅크 자유적금/);assert.match(await page.locator('.core-products article').first().innerText(),/3,663,514/);assert.ok(await page.locator('.core-required-actions').first().isVisible());checks.push('Intent refusal changes primary; answer edit preserves selection and recalculates amount');
 await page.setViewportSize({width:1280,height:800});await layout('result desktop');await page.locator('.core-products article').first().screenshot({path:'.qa/ppt-result-card-v4.png'});await page.screenshot({path:'.qa/mvvp-result-web.png',fullPage:true});
 await page.setViewportSize({width:360,height:800});await layout('result small mobile');await page.screenshot({path:'.qa/mvvp-result-small.png',fullPage:true});
 await chooseCase('목표금액 부족');assert.ok(await page.locator('.core-goal-gate').count());assert.equal(await page.locator('.core-products article').count(),0);await click(page.locator('.core-goal-gate .primary'));assert.ok(await page.locator('.core-products article').count());assert.match(await page.locator('.core-goal-gate').innerText(),/96,336,486/);checks.push('Goal gap precedes product cards');
 await chooseCase('기간36개월 · 방식 미선택');await page.locator('[data-question]').waitFor();await click(page.getByRole('radio',{name:'차이를 보고 정할게요',exact:true}));await next();assert.equal(await page.locator('.core-products article').count(),0);assert.ok(await page.locator('.core-way-comparison').count());await layout('contribution compare');await page.locator('.core-question').screenshot({path:'.qa/mvvp-contribution.png'});await click(page.getByRole('radio',{name:'넣는 금액을 조절할 수 있어야 해요',exact:true}));await next();assert.ok(await page.locator('.core-products article').count());checks.push('Compare has no final cards; explicit contribution choice completes');
 await chooseCase('우대 행동 미정');await click(page.getByRole('radio',{name:'아직 모르겠어요',exact:true}));await next();assert.match(await page.locator('.core-products').innerText(),/잠정 비교/);checks.push('Unknown keeps provisional card and explanation');
 await chooseCase('선택한 은행 범위에 후보 없음');assert.match(await page.locator('.empty-state').innerText(),/맞는 후보를 찾지/);assert.equal(await page.locator('.core-products article').count(),0);checks.push('No-match stays empty');
 await page.goto(base+'?screen=inventory');await page.locator('#inventory-search').waitFor();await page.setViewportSize({width:412,height:917});await page.screenshot({path:'.qa/ppt-inventory-v4.png'});assert.match(await page.locator('.inventory-stats').innerText(),/12,542/);await layout('inventory');
 for(const route of ['dashboard','recovery','plan']){await page.goto(base+'?screen='+route);await page.waitForLoadState('networkidle');await layout('legacy '+route)}
 assert.deepEqual(errors,[]);fs.writeFileSync(`.qa/mvvp-${replay?'pages':'local'}-audit.json`,JSON.stringify({base,checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));await browser.close();
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exit(1)});
