const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/ljm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');let browser;
(async()=>{
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const b=name=>page.getByRole('button',{name,exact:true});
  for(const screen of ['welcome','dashboard','plan','setup','products','conditions','recovery']){
    await page.goto(`http://127.0.0.1:5173/?screen=${screen}`,{waitUntil:'networkidle'});
    for(const size of [{width:1280,height:800},{width:412,height:917},{width:360,height:800}]){
      await page.setViewportSize(size);await page.evaluate(async()=>{document.activeElement?.blur();await document.fonts.ready;scrollTo({top:0,behavior:'instant'});await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame)});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${screen} ${size.width} overflow`);
      await page.screenshot({path:`.qa/final-${screen}-${size.width}x${size.height}.png`,style:'.toast{visibility:hidden}'});
    }
  }
  await page.setViewportSize({width:1280,height:800});await page.goto('http://127.0.0.1:5173/',{waitUntil:'networkidle'});
  await b('납입 기록하기').click();await page.getByRole('dialog',{name:'오늘의 저축을 기록해요'}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await b('납입 기록하기').evaluate(e=>e===document.activeElement),true);
  await b('다시, 이어가기').click();let release;const pending=new Promise(r=>release=r);await page.route('**/api/recovery',async r=>{await pending;await r.continue()});await b('조정한 계획 비교하기').click();await page.getByRole('button',{name:/앞으로 모을 돈이 줄었어요/}).click();release();await page.waitForResponse(r=>r.url().endsWith('/api/recovery'));assert.equal(await page.locator('.compare-amount').count(),0);await page.unroute('**/api/recovery');
  await b('나의 저축 계획').click();await b('새 계획 만들기').click();await page.getByLabel('얼마를 모을까요?').fill('18000000');await page.getByLabel('언제까지 모을까요?').selectOption('60');await b('다음으로').click();await b('다음으로').click();await b('맞는 계획 비교하기').click();await page.locator('.product-card').first().waitFor({timeout:60000});await b('이 계획 선택하기').first().click();await b('이 계획 저장하기').click();
  await b('계획 보기').click();const info=await page.locator('.contract-summary').innerText();assert.ok(info.includes('상품 기간 · 만기'));const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('finset-demo-v1')));assert.equal(before.months,60);assert.ok(before.product.term<60);
  await b('다시, 이어가기').click();await page.getByText(/상품 만기 이후의/).waitFor();await page.getByLabel('조정 후 납입할 금액').fill('200000');await b('조정한 계획 비교하기').click();await page.getByText('조정 후 예상 원금',{exact:true}).waitFor();await page.getByLabel('계약 변경 승인이 아닌 원금 계획 비교임을 확인했어요.').check();await b('내 계획에 반영하기').click();const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('finset-demo-v1')));assert.equal(after.product.maturity,before.product.maturity);assert.ok(after.schedule.filter(s=>s.date>=before.product.maturity).every(s=>s.amount===300000));assert.equal(after.payments.length,0);
  await b('시연 초기화').click();await page.getByRole('dialog').getByRole('button',{name:'시연 초기화',exact:true}).click();await page.locator('.next-bank').getByText('코드K 자유적금').waitFor();
  assert.deepEqual(errors,[]);const result={passed:true,viewports:[{width:1280,height:800},{width:412,height:917},{width:360,height:800}],screens:7,additional:['dialog name / Escape / focus return','stale recovery response ignored','60-month goal separated from product maturity','post-maturity savings preserved','default demo restored']};fs.writeFileSync('.qa/final-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exit(1)});
