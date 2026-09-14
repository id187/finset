const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/ljm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.FINSET_URL||'http://127.0.0.1:4175/finset/'; let browser;
(async()=>{
  fs.mkdirSync('.qa',{recursive:true}); const errors=[],failures=[],checks=[];
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failures.push([r.status(),r.url()])});
  const b=name=>page.getByRole('button',{name,exact:true});
  const amount=()=>page.getByLabel('매달 얼마까지 저축할 수 있나요?');
  const first=()=>page.locator('.quick-products .product-card').first();
  const shot=async name=>{await page.evaluate(async()=>{await document.fonts.ready;await new Promise(requestAnimationFrame)});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' overflow');await page.screenshot({path:`.qa/catalogue-${name}.png`,fullPage:false})};
  const stored=()=>page.evaluate(()=>({...localStorage}));
  const choose=async value=>{
    const q=page.locator('.interview-question'),id=await q.getAttribute('data-question');
    assert.equal(await page.locator('.quick-products').count(),0,'No premature recommendation');
    await q.getByRole('button',{name:value,exact:true}).click();
    await page.waitForFunction(old=>document.querySelector('.interview-question')?.getAttribute('data-question')!==old,id);
  };
  const finish=async (overrides={})=>{
    for(let n=0;n<12;n++){
      const q=page.locator('.interview-question');if(!await q.count())return;
      const id=await q.getAttribute('data-question');await choose(overrides[id]||(id==='liquidity'||id==='renewed'||id==='flexible'?'아니오':'예'));
    }
    throw Error('Interview did not end');
  };
  const start=async (value='171237',goal='일단 모으기')=>{
    await page.getByRole('group',{name:'무엇을 위해 모으나요?'}).getByRole('button',{name:new RegExp(goal)}).click();
    await amount().fill(value);await b('질문 시작').click();await page.locator('.interview-question').waitFor();
  };
  await page.goto(base,{waitUntil:'networkidle'});await b('시연 시작').waitFor();
  await page.evaluate(()=>{localStorage.setItem('finset-demo-v1','{"preserve":"original records"}');localStorage.setItem('finset-drafts-v1','[]')}); const preserved=await stored();
  await b('시연 시작').click();await amount().waitFor();assert.equal(await amount().inputValue(),'');
  await amount().fill('170000');await b('+3만').click();await b('+3만').click();assert.equal(await amount().inputValue(),'230000');
  await start();await shot('question-web');await finish();await first().waitFor();await shot('all-web');
  assert.ok((await page.locator('.interview-conclusion').innerText()).includes('2,349개'));
  await b('저축은행 포함 답변 수정').click();await choose('아니오');await choose('아니오');await finish();
  assert.equal(await first().locator('h3').innerText(),'카카오뱅크 자유적금');
  await b('자동이체 유지 계획 답변 수정').click();await choose('아니오');await first().waitFor();assert.equal(await first().locator('h3').innerText(),'코드K 자유적금');
  await b('자동이체 유지 계획 답변 수정').click();await choose('모르겠어요');await finish({renewed:'모르겠어요'});await first().waitFor();assert.equal(await first().locator('h3').innerText(),'코드K 자유적금');
  assert.ok(!(await page.locator('.quick-products').innerText()).includes('자동이체 우대 '));
  checks.push('Adaptive yes/no/unknown flow; no result before completion; answers change scope, bank ranking and bonus; earlier edits invalidate later answers; arbitrary amount and repeated increments');
  await b('금액·목표 수정').click();await start('3000001');await finish({flexible:'예',savingsBank:'아니오',creditUnion:'아니오',hanaAccount:'예'});await first().waitFor();
  assert.equal(await first().locator('h3').innerText(),'내맘적금');assert.ok((await first().innerText()).includes('2.30'));
  await b('하나은행 계좌 자동이체 답변 수정').click();await choose('아니오');await first().waitFor();assert.ok((await first().innerText()).includes('1.80'));await shot('refinement-web');
  await b('만기 전 사용 가능성 답변 수정').click();await choose('예');await choose('모르겠어요');await page.getByRole('heading',{name:'중간에 쓸 돈부터 나눠주세요'}).waitFor();assert.equal(await page.locator('.product-card').count(),0);
  await b('저축 가능 금액 다시 정하기').click();await start();await choose('아니오');await b('이전 질문').click();assert.equal(await page.locator('.interview-question').getAttribute('data-question'),'liquidity');
  assert.deepEqual(await stored(),preserved);checks.push('Candidate-dependent Hana question changes bonus; possible withdrawals block unsuitable maturity recommendations; back button restores the prior question');
  await b('전체 상품·DB 검증 보기').click();await page.getByRole('heading',{name:'상품 데이터 한눈에.'}).waitFor();
  assert.equal(await page.locator('.inventory-item').count(),20);await shot('inventory-web');
  await page.getByLabel('검증 상태',{exact:true}).selectOption('source_issue');await page.getByRole('status').filter({hasText:'검색 결과 5개'}).waitFor();assert.equal(await page.locator('.inventory-item').count(),5);
  await page.getByLabel('검증 상태',{exact:true}).selectOption('all');await page.getByLabel('상품명·금융기관 검색').fill('카카오');await page.getByRole('status').filter({hasText:/검색 결과 [2-9]개/}).waitFor();
  await page.locator('.inventory-item').filter({hasText:'카카오뱅크 자유적금'}).getByText('가입조건·우대 원문 보기',{exact:true}).click();assert.ok((await page.locator('.inventory-list').innerText()).includes('만기 자동연장된 원리금'));
  await page.getByLabel('상품명·금융기관 검색').fill('없는상품-xyz');await page.getByRole('heading',{name:'검색 결과가 없어요'}).waitFor();await b('검색 초기화').click();await page.locator('.inventory-item').first().waitFor();assert.equal(await page.locator('.inventory-item').count(),20);await b('다음').click();assert.ok((await page.locator('.inventory-pagination').innerText()).includes('2 /'));
  assert.deepEqual(await stored(),preserved);checks.push('All 12,542 products searchable; five collection errors isolated; original clauses visible; empty-search reset and pagination work without writing saved data');
  for(const size of [{width:412,height:917},{width:360,height:800}]){
    await page.setViewportSize(size);await shot(`inventory-${size.width}`);
    await b('처음부터 시연 시작').click();await amount().waitFor();assert.equal(await amount().inputValue(),'');await shot(`goal-${size.width}`);
    await start('171237','여행 자금');await shot(`question-${size.width}`);await finish();await page.locator('.quick-gap').waitFor();await shot(`results-${size.width}`);
    await b('월 30만원으로 비교').click();assert.equal(await page.locator('.quick-gap').count(),0);
    await first().getByText('추천 근거·금리 자세히 보기',{exact:true}).click();await first().scrollIntoViewIfNeeded();await shot(`detail-${size.width}`);
    await b('금액·목표 수정').click();await amount().fill('1000000000');await b('질문 시작').click();await finish();await page.getByRole('heading',{name:'이 답변에 맞는 상품이 없어요'}).waitFor();await b('월 저축액 조정하기').click();await amount().fill('0');await b('질문 시작').click();await page.getByRole('alert').waitFor();await b('전체 상품·DB 검증 보기').click();await page.locator('.inventory-item').first().waitFor();
  }
  checks.push('412×917 and 360px: complete questions/results/details/search; goal alternatives; invalid and no-match states; no horizontal overflow');
  assert.deepEqual(await stored(),preserved);
  // A failed network request must expose a retry, never silently fall back to
  // the former three-product scope. Separate page avoids the in-memory cache.
  const recovery=await browser.newPage();let blocked=true;
  await recovery.route('**/demo/full-catalogue.json',route=>blocked?route.abort():route.continue());
  await recovery.goto(`${base}?screen=guided`);await recovery.getByRole('alert').waitFor();blocked=false;await recovery.getByRole('button',{name:'다시 시도',exact:true}).click();await recovery.getByLabel('매달 얼마까지 저축할 수 있나요?').waitFor();await recovery.close();
  checks.push('Catalogue network failure shows retry and recovers without partial fallback');
  assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
  const result={passed:true,base,checkedAt:new Date().toISOString(),checks,errors,failures};fs.writeFileSync('.qa/catalogue-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exit(1)});
