const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/ljm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');
const base=process.env.FINSET_URL||'http://127.0.0.1:4173/finset/';let browser;
(async()=>{
  fs.mkdirSync('.qa',{recursive:true});const checks=[],errors=[],failures=[],requests=[];
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failures.push([r.status(),r.url()])});page.on('request',r=>requests.push(r.url()));
  const b=name=>page.getByRole('button',{name,exact:true});
  const answer=async(title,value)=>page.getByRole('group',{name:title,exact:true}).getByRole('button',{name:value,exact:true}).click();
  const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('finset-demo-v1')));
  const shot=async(name)=>{await page.evaluate(async()=>{await document.fonts.ready;scrollTo({top:0,behavior:'instant'});await new Promise(requestAnimationFrame)});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' overflow');await page.screenshot({path:`.qa/guided-${name}.png`})};
  const next=()=>b('다음 질문').click();
  const start=()=>b('처음부터 시연 시작').click();
  const goal=async(months='12',amount='3600000')=>{await b('목돈 마련').click();await page.getByLabel('목표로 모을 금액').fill(amount);await page.getByLabel('목표까지 남은 기간').selectOption(months);await next()};
  const budget=async(debt='아니요',monthly='300000')=>{await page.getByLabel('매달 모을 수 있는 금액').selectOption(monthly);await answer('생활비와 비상금은 따로 확보했나요?','예');await answer('저축보다 먼저 검토할 대출 상환이 있나요?',debt);await answer('저축할 돈을 만기까지 유지할 수 있나요?','예');await next()};
  const eligibility=async()=>{await answer('국내에 거주하는 만 19세 이상 대한민국 국민인가요?','예');await answer('은행 앱으로 가입 절차를 진행할 수 있나요?','예');await next()};
  const holdings=async(toss='아니요')=>{await answer('비교할 세 은행에 예·적금 잔액이나 가입 중인 적금이 있나요?','아니요');await answer('토스뱅크 입출금통장을 보유하고 있나요?',toss);await next()};
  const bonus=async(months='0',unknown=false,toss=false)=>{if(unknown)await page.getByLabel('자동이체 기간은 아직 모르겠어요').check();else await page.getByLabel('자동이체로 납입할 수 있는 개월 수').fill(months);await answer('카카오뱅크 적금의 자동연장 원리금에 해당하나요?','해당하지 않아요');if(toss){await answer('가입할 때 설정한 월 자동이체를 사용할 계획인가요?','예');await answer('계약 기간의 모든 자동이체를 성공시킬 수 있나요?','예')}await next()};
  const finish=async()=>{await b('내 답변으로 추천받기').click();await page.locator('.guided-flow .product-card').first().waitFor()};

  await page.goto(base,{waitUntil:'networkidle'});await page.getByRole('heading',{name:/내 상황에 맞는/}).waitFor();await shot('welcome-web');
  await page.setViewportSize({width:412,height:917});await shot('welcome-app');await page.setViewportSize({width:1280,height:800});
  await b('시연 시작').click();assert.equal(await page.getByLabel('목표로 모을 금액').inputValue(),'');assert.equal(await page.getByLabel('목표까지 남은 기간').inputValue(),'');await next();await page.getByRole('alert').waitFor();
  await goal();await shot('budget-web');await budget();await eligibility();await holdings();await shot('bonus-web');await bonus();await shot('review-web');await finish();
  assert.equal(await page.locator('.product-card h3').first().innerText(),'코드K 자유적금');await shot('results-no-bonus-web');
  checks.push('Homepage start opens unanswered questions; required answers are validated; full flow recommends Code K');
  await b('답변 수정하기').click();assert.equal(await page.getByLabel('목표로 모을 금액').inputValue(),'3600000');for(let i=0;i<4;i++)await next();
  await page.getByLabel('자동이체로 납입할 수 있는 개월 수').fill('6');await next();await finish();
  assert.equal(await page.locator('.product-card h3').first().innerText(),'카카오뱅크 자유적금');assert.ok((await page.locator('.product-card').first().innerText()).includes('3.85%'));await shot('results-bonus-web');
  await page.setViewportSize({width:412,height:917});await shot('results-bonus-app');await page.setViewportSize({width:1280,height:800});
  await b('이 상품으로 계획 시작하기').first().click();assert.equal(await b('새 저축 계획 저장하기').isDisabled(),true);await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
  await b('이 상품으로 계획 시작하기').first().click();await page.getByLabel('새 시연 계획으로 교체하고 시작할게요.').check();await b('새 저축 계획 저장하기').click();
  assert.equal(await page.locator('.hero-amount strong').innerText(),'0원');assert.equal((await stored()).product.name,'카카오뱅크 자유적금');assert.equal((await stored()).guidedAnswers.autoMonths,'6');
  await b('납입 기록하기').click();await page.getByLabel('납입한 금액').fill('300000');await b('납입 기록 저장하기').click();assert.equal(await page.locator('.hero-amount strong').innerText(),'300,000원');
  await b('계획 보기').click();await page.getByText('추천에 반영한 내 답변',{exact:true}).click();await page.locator('.saved-answers').getByText('6개월',{exact:true}).waitFor();
  await page.reload({waitUntil:'networkidle'});await b('저장한 계획 보기').click();assert.equal((await stored()).payments[0].amount,300000);
  await b('맞춤 상품 찾기').click();assert.equal(await page.locator('.product-card h3').first().innerText(),'카카오뱅크 자유적금');
  checks.push('Changing only the auto-transfer answer changes 3.70% Code K to 3.85% Kakao; save confirmation, answers, record and reload work');

  const active=await stored();await start();assert.equal(await page.getByLabel('목표로 모을 금액').inputValue(),'');assert.deepEqual(await stored(),active);
  await goal();await budget();await eligibility();await holdings();await bonus('0',true);await finish();
  await page.getByText('추천을 확정하기 전에 확인할 질문',{exact:true}).waitFor();assert.ok((await page.locator('.product-card').filter({hasText:'카카오뱅크 자유적금'}).innerText()).includes('3.65%'));
  await b('이 추천을 초안으로 남기기').first().click();await page.getByLabel('확인할 조건을 남긴 초안임을 확인했어요.').check();await b('답변과 초안 저장하기').click();assert.deepEqual(await stored(),active);
  await b('다시 비교').click();await page.getByText('추천을 확정하기 전에 확인할 질문',{exact:true}).waitFor();
  checks.push('Restart clears questionnaire but preserves saved records; unknown bonus stays excluded and saved draft restores its answers');

  await start();await goal();await budget('예');await page.getByRole('heading',{name:'먼저 확인할 내용이 있어요.'}).waitFor();assert.equal(await page.locator('.product-card').count(),0);await page.getByText(/대출 비용과 상환 계획을 확인/).waitFor();
  checks.push('Debt review stops before unnecessary eligibility/bonus questions and does not recommend a product');

  await page.setViewportSize({width:412,height:917});await start();await shot('goal-app');await goal('60','10000000');await budget('아니요','500000');await shot('eligibility-app');await eligibility();await shot('holdings-app');await holdings('예');await shot('bonus-app');await bonus('6',false,true);await shot('review-app');await finish();await shot('results-long-app');
  assert.ok(!(await page.locator('.product-card').allInnerTexts()).some(t=>t.includes('코드K 자유적금')));await page.getByText('이번 비교에서 제외한 상품과 이유',{exact:true}).click();await page.getByText(/월 납입 범위 10,000~300,000원/).waitFor();
  await b('이 상품으로 계획 시작하기').first().click();await page.getByLabel('새 시연 계획으로 교체하고 시작할게요.').check();await b('새 저축 계획 저장하기').click();
  const long=await stored();assert.equal(long.months,60);assert.ok(long.product.term<60);await page.setViewportSize({width:1280,height:800});
  await b('다시, 이어가기').click();await page.getByLabel('조정 후 납입할 금액').fill('200000');await b('조정한 계획 비교하기').click();await page.getByLabel('계약 변경 승인이 아닌 원금 계획 비교임을 확인했어요.').check();await b('내 계획에 반영하기').click();
  const recovered=await stored();assert.equal(recovered.product.maturity,long.product.maturity);assert.ok(recovered.schedule.filter(p=>p.date>=long.product.maturity).every(p=>p.amount===500000));
  checks.push('Mobile six-step flow, Toss questions, amount-based exclusion, 60-month plan and recovery preserve contract maturity');

  for(const screen of ['dashboard','plan','products','conditions','recovery']){
    await page.goto(`${base}?screen=${screen}`,{waitUntil:'networkidle'});
    for(const size of [{width:1280,height:800},{width:412,height:917},{width:360,height:800}]){await page.setViewportSize(size);await shot(`${screen}-${size.width}`)}
  }
  await page.setViewportSize({width:1280,height:800});await page.goto(`${base}preview.html`,{waitUntil:'networkidle'});const frame=page.frameLocator('iframe');assert.deepEqual(await frame.locator('body').evaluate(()=>[innerWidth,innerHeight]),[1280,800]);
  await b('시연 시작 →').click();await frame.getByLabel('목표로 모을 금액').waitFor();assert.equal(await frame.getByLabel('목표로 모을 금액').inputValue(),'');await b('앱 · 412 × 917').click();assert.deepEqual(await frame.locator('body').evaluate(()=>[innerWidth,innerHeight]),[412,917]);
  await frame.getByLabel('목표로 모을 금액').fill('5000000');await b('시연 시작 →').click();await frame.getByLabel('목표로 모을 금액').waitFor();assert.equal(await frame.getByLabel('목표로 모을 금액').inputValue(),'');
  checks.push('All main screens fit web/mobile widths; preview start restarts unanswered flow and exact 1280×800 / 412×917 viewports work');
  assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);if(base.includes('/finset/'))assert.equal(requests.some(u=>new URL(u).pathname.startsWith('/api/')),false);
  const result={passed:true,base,checkedAt:new Date().toISOString(),checks,errors,failures};fs.writeFileSync('.qa/guided-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exit(1)});
