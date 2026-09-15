const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/ljm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {observe,resultAfter}=require('./browser-observer.cjs');
const base=process.env.FINSET_URL||'http://127.0.0.1:4173/finset/';
let browser;
(async()=>{
 fs.mkdirSync('.qa',{recursive:true});
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:412,height:917},hasTouch:true,reducedMotion:'reduce'});
 const errors=[],checks=[],runs=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
 await observe(page);await page.route('**/api/**',r=>r.abort());
 const b=n=>page.getByRole('button',{name:n,exact:true});
 const click=async l=>{await l.scrollIntoViewIfNeeded();await l.click()};
 const next=()=>click(b('다음')),radio=n=>click(page.getByRole('radio',{name:n,exact:true}));
 async function layout(label){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label);checks.push(label)}
 await page.goto(base+'?screen=guided');const stored=await page.evaluate(()=>localStorage.getItem('finset-demo-v1'));
 async function basics({goal='360',term='1년',cash='0',monthly='30',variable=false,purpose=false}={}){
  await page.goto(base+'?screen=guided');
  if(purpose){await radio('직접 정하기');await page.getByPlaceholder('예: 내년 여행 준비').fill('내년 여행 준비')}
  await page.locator('#core-goal').fill(goal);await click(b(term));
  assert.equal(await page.locator('.basic-progress progress').getAttribute('value'),'0');
  await next();await page.locator('#core-cash').fill(cash);
  const input=page.locator('#core-monthly');await input.fill('');await input.pressSequentially(monthly,{delay:35});
  assert.equal(await input.inputValue(),monthly);assert.equal(await input.evaluate(e=>e===document.activeElement),true);
  if(monthly!=='0'){await radio(variable?'달마다 달라요':'매달 비슷해요');if(variable)await page.locator('#core-low').fill('20')}
  await next();await radio('은행만 · 인터넷은행 포함');await radio('개인 생활·목표를 위한 돈');await radio('아니요 · 상환 계획을 고려한 여유자금이에요');await next();
  await radio('없어요');await radio('네 · 쓸 돈은 빼고 입력했어요');await next();await page.locator('#core-age').fill('25');
  await page.getByRole('radiogroup',{name:'대한민국 국적인가요?'}).getByRole('radio',{name:'네',exact:true}).click();
  await page.getByRole('radiogroup',{name:'현재 한국에 살고 있나요?'}).getByRole('radio',{name:'네',exact:true}).click();
  assert.equal(await page.locator('.basic-progress progress').getAttribute('value'),'4');
  return resultAfter(page,()=>click(b('내 조건으로 비교하기')));
 }
 async function finish(last,auto,label){
  const questions=[];
  for(let i=0;i<8;i++){
   await page.locator('.loading-state').waitFor({state:'hidden'});
   const q=page.locator('[data-question]');if(!await q.count())break;
   const id=await q.getAttribute('data-question');questions.push(id);
   assert.ok(['bonus_intent.auto_transfer','contribution_preference'].includes(id),`Unexpected default question ${id}`);
   const schema=last.questions.find(q=>q.id===id),value=id==='contribution_preference'?'fixed_ok':auto;
   const choice=schema.options.find(o=>o.value===value);assert.ok(choice,id);
   await click(q.getByRole('radio',{name:choice.label,exact:true}));
   if(id==='bonus_intent.auto_transfer')await q.screenshot({path:'.qa/refine-question.png'});
   last=await resultAfter(page,next);
  }
  await page.locator('.loading-state').waitFor({state:'hidden'});
  assert.equal(await page.locator('[data-question]').count(),0);
  assert.ok(last.result.cards.length>0);assert.ok(!last.result.provisional);
  runs.push({label,questions,status:last.result.status,top:last.result.cards[0].products.map(p=>p.name),total:last.result.cards[0].goal_total});
  return last;
 }
 let last=await finish(await basics({purpose:true}),false,'manual');
 assert.equal(last.result.cards[0].goal_total,3661181);assert.equal(last.profile.goal_name,'내년 여행 준비');
 await page.locator('.refine-primary').waitFor();
 assert.equal(await page.locator('.refine-primary').count(),1);assert.equal(await page.locator('.refine-alternative').count(),2);
 assert.equal(await page.locator('.refine-alternative[open]').count(),0);assert.equal(await page.locator('.interview-history[open]').count(),0);
 assert.match(await page.locator('.refine-alternative').first().innerText(),/966원 적어요/);
 await click(page.locator('.refine-alternative > summary').first());await page.locator('.refine-alternative[open] .refine-product').waitFor();
 await click(page.locator('.refine-alternative > summary').first());
 for(const width of [360,390,412,430,768,1280]){
  await page.setViewportSize({width,height:width===1280?800:917});await layout(`${width}px 결과 가로 넘침 없음`);
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`.qa/refine-result-${width}.png`,fullPage:true});
  const small=await page.locator('.refine-results button,.refine-results summary').evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().height>0&&e.getBoundingClientRect().height<43).map(e=>({text:e.textContent,h:e.getBoundingClientRect().height})));
  assert.deepEqual(small,[],`${width}px touch targets`);
 }
 await page.setViewportSize({width:412,height:917});
 const title=page.locator('.refine-primary h3').first(),originalTitle=await title.innerText();
 await title.evaluate(e=>e.textContent='긴 이름을 가진 자유적립식 비대면 저축 상품의 여러 조건을 확인하는 화면');
 await page.setViewportSize({width:360,height:800});await layout('긴 상품명 합성 텍스트 360px 줄바꿈');await title.evaluate((e,text)=>e.textContent=text,originalTitle);await page.setViewportSize({width:412,height:917});
 await click(page.locator('.refine-primary .refine-detail > summary'));assert.ok(await page.locator('.refine-primary .core-source-link').isVisible());await click(page.locator('.refine-primary .refine-detail > summary'));
 checks.push('대표 1개·대안 2개 접힘, 정확한 차액, 원문 접근, 모든 너비 터치 영역 44px');
 await click(b('자동이체 답변 수정'));await radio('할 수 있어요');last=await finish(await resultAfter(page,next),true,'auto-yes');
 assert.equal(last.result.cards[0].goal_total,3663514);assert.deepEqual(last.result.cards[0].products[0].bonus_earned,['auto_transfer']);
 await page.locator('.refine-primary').waitFor();await page.locator('.refine-primary').screenshot({path:'.qa/refine-auto-yes.png'});
 // Broken logos fall back to ordinary text, without losing the institution name.
 await page.locator('.refine-primary .bank-logo img').evaluate(img=>img.dispatchEvent(new Event('error')));
 assert.equal(await page.locator('.refine-primary .bank-logo img').count(),0);assert.match(await page.locator('.refine-primary').innerText(),/카카오/);
 await click(b('자동이체 답변 수정'));await radio('아직 모르겠어요');last=await finish(await resultAfter(page,next),null,'auto-unknown');assert.equal(last.result.cards[0].goal_total,3661181);
 checks.push('자동이체 예/아니요/모름 실제 재계산; 미확인 우대 0, 로고 오류 대체');
 await click(page.locator('.refine-benefit-toggle'));const option=page.locator('.refine-benefit-options button').filter({hasText:'급여·통신비 이체'}).first();await option.waitFor();
 last=await resultAfter(page,()=>click(option));await page.locator('[data-question="bonus_intent.kbank.transfer"]').waitFor();
 await radio('하지 않을게요');last=await resultAfter(page,next);await page.locator('.refine-primary').waitFor();assert.equal(await page.locator('[data-question]').count(),0);
 assert.ok(!last.questions.some(q=>q.id.startsWith('salary.')||q.id.startsWith('kbank.')));
 checks.push('추가 혜택 명시 선택 후에만 질문, 거절 즉시 결과 복귀');
 await click(b('저축할 금액 수정'));assert.equal(await page.locator('#core-monthly').inputValue(),'30');await page.locator('#core-monthly').fill('37');await next();await next();await next();
 last=await resultAfter(page,()=>click(b('내 조건으로 비교하기')));assert.ok(!last.questions.some(q=>q.id==='bonus_intent.auto_transfer'));last=await finish(last,null,'amount-edit');await page.locator('.refine-results').waitFor();assert.equal(last.profile.monthly,370000);
 assert.equal(last.profile.goal_name,'내년 여행 준비');checks.push('금액 수정 시 직접 입력·목표·공통 답변 유지');
 last=await finish(await basics({goal:'10000',term:'5년'}),false,'five-year-goal-gap');
 await page.locator('.core-goal-gate').waitFor();assert.equal(last.profile.goal_amount,100000000);assert.equal(last.result.goal_guidance.principal,18000000);assert.equal(last.result.goal_guidance.required_monthly_principal_only,1666667);
 await page.screenshot({path:'.qa/refine-goal-gap.png',fullPage:true});await click(b('지금 여력으로 상품 보기'));await page.locator('.refine-primary').waitFor();assert.ok(await page.locator('.refine-timeline').isVisible());
 await page.locator('.core-profile > summary').click();assert.match(await page.locator('.core-profile').innerText(),/100,000,000원/);checks.push('1억원·5년 목표 원형 유지, 원금 1,800만원·필요 월 1,666,667원, 첫 만기와 목표일 분리');
 last=await finish(await basics({cash:'500',monthly:'0',goal:'500'}),false,'deposit-only');assert.ok(last.result.cards.every(c=>c.products.every(p=>p.kind==='deposit')));await page.locator('.refine-primary').waitFor();await layout('목돈만 추천');
 last=await finish(await basics({term:'1년 6개월',variable:true}),false,'variable-18-month');assert.equal(last.result.budget.monthly,200000);assert.equal(last.result.budget.horizon,18);
 // Browser viewport resizing cannot summon a physical mobile keyboard. Verify
 // the visualViewport resize contract and navigation response explicitly.
 await click(b('저축할 금액 수정'));await page.locator('#core-monthly').focus();
 await page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:innerHeight-300});visualViewport.dispatchEvent(new Event('resize'))});
 assert.equal(await page.locator('.mobile-nav').isVisible(),false);
 await page.evaluate(()=>{delete visualViewport.height;visualViewport.dispatchEvent(new Event('resize'))});assert.equal(await page.locator('.mobile-nav').isVisible(),true);
 checks.push('금액 연속 입력 포커스 유지; 가상 키보드 viewport 이벤트에서 하단 메뉴 숨김');
 assert.equal(await page.evaluate(()=>localStorage.getItem('finset-demo-v1')),stored);
 assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.method==='GET'&&!r.url.includes('/api/')));
 const report={base,checks,runs,errors,noAPI:true,existingLocalStoragePreserved:true,keyboardTest:'Simulated visualViewport resize; physical device not tested'};
 fs.writeFileSync('.qa/refine-ui-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exit(1)});
