const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/ljm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.FINSET_URL || 'http://127.0.0.1:4173/finset/';
let browser;
(async () => {
  fs.mkdirSync('.qa', {recursive:true});
  browser = await chromium.launch({channel:'msedge',headless:true});
  const page = await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'});
  const errors = [], failures = [], apiRequests = [], checks = [];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)failures.push([r.status(),r.url()])});
  page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))apiRequests.push(r.url())});
  const b = name=>page.getByRole('button',{name,exact:true});
  const ready = ()=>page.locator('.next-bank').getByText('코드K 자유적금',{exact:true}).waitFor();
  const saved = ()=>page.evaluate(()=>JSON.parse(localStorage.getItem('finset-demo-v1')));
  const reset = async()=>{await b('시연 초기화').click();await page.getByRole('dialog').getByRole('button',{name:'시연 초기화',exact:true}).click();await ready()};

  for (const screen of ['welcome','dashboard','plan','setup','products','conditions','recovery']) {
    await page.goto(`${base}?screen=${screen}`,{waitUntil:'networkidle'});
    for (const size of [{width:1280,height:800},{width:412,height:917},{width:360,height:800}]) {
      await page.setViewportSize(size);
      await page.evaluate(async()=>{await document.fonts.ready;scrollTo({top:0,behavior:'instant'});await new Promise(requestAnimationFrame)});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${screen}: ${size.width} overflow`);
      await page.screenshot({path:`.qa/pages-${screen}-${size.width}.png`});
    }
  }
  checks.push('7 screens, 1280×800 / 412×917 / 360×800, no horizontal overflow');
  await page.setViewportSize({width:1280,height:800});
  await page.goto(base,{waitUntil:'networkidle'});await ready();
  assert.equal(await page.locator('.hero-amount strong').innerText(),'1,200,000원');
  await b('납입 기록하기').click();await page.getByLabel('납입한 금액').fill('100000');await b('납입 기록 저장하기').click();
  assert.equal(await page.locator('.hero-amount strong').innerText(),'1,300,000원');
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.locator('.hero-amount strong').innerText(),'1,300,000원');
  await b('전체 보기').click();await page.getByRole('button',{name:'2027-01-11 납입 수정'}).click();await page.getByLabel('납입한 금액').fill('150000');await b('수정 확인하고 저장').click();
  assert.equal(await page.locator('.hero-amount strong').innerText(),'1,350,000원');
  await b('전체 보기').click();await page.getByRole('button',{name:'2027-01-11 납입 취소'}).click();await b('납입 취소 확인').click();await b('닫기').click();
  assert.equal(await page.locator('.hero-amount strong').innerText(),'1,200,000원');
  checks.push('Record, reload, edit and cancel preserve browser history and principal');

  await reset();await b('다시, 이어가기').click();await page.getByLabel('조정 후 납입할 금액').fill('200000');await b('조정한 계획 비교하기').click();
  await page.getByText('3,500,000원',{exact:true}).waitFor();assert.equal(await b('내 계획에 반영하기').isDisabled(),true);
  await page.getByRole('button',{name:/앞으로 모을 돈이 줄었어요/}).click();await b('조정한 계획 비교하기').click();await page.getByText('2,800,000원',{exact:true}).waitFor();
  await page.getByLabel('계약 변경 승인이 아닌 원금 계획 비교임을 확인했어요.').check();await b('내 계획에 반영하기').click();
  assert.equal((await saved()).payments.reduce((sum,p)=>sum+p.amount,0),1200000);
  assert.equal((await saved()).versions.length,1);
  await b('다시, 이어가기').click();await page.getByRole('button',{name:/모아둔 돈이 급히 필요해요/}).click();await page.getByLabel('긴급하게 필요한 금액').fill('500000');await page.getByLabel('목표 밖에서 별도로 사용할 수 있는 현금').fill('200000');await b('조정한 계획 비교하기').click();
  await page.locator('.recovery-result').getByText('300,000원',{exact:true}).waitFor();assert.equal(await b('내 계획에 반영하기').count(),0);
  checks.push('Temporary/persistent recovery, confirmation, version history, emergency shortage');

  await b('우대조건 확인').click();await b('답변으로 우대조건 확인하기').click();await page.locator('.comparison-line').getByText('확인 필요',{exact:true}).waitFor();
  await page.locator('.condition-question input').fill('6');await b('해당하지 않아요').click();await b('가능해요').click();await b('답변으로 우대조건 확인하기').click();await page.getByText('3.85%',{exact:true}).waitFor();
  await page.locator('.condition-question input').fill('5');await b('답변으로 우대조건 확인하기').click();await page.locator('.comparison-line').getByText('미충족',{exact:true}).waitFor();
  checks.push('Bonus unknown, exact month boundary, met/unmet answer transitions');

  await b('나의 저축 계획').click();await b('새 계획 만들기').click();await page.getByLabel('얼마를 모을까요?').selectOption('10000000');await page.getByLabel('언제까지 모을까요?').selectOption('60');await b('다음으로').click();await page.getByLabel('매달 저축할 금액').selectOption('500000');await b('다음으로').click();await page.getByRole('button',{name:/저축은행도 함께 볼게요/}).click();await b('맞는 계획 비교하기').click();await page.locator('.product-card').first().waitFor();
  const expected = JSON.parse(fs.readFileSync('public/demo/recommendations/500000-10000000.json','utf8'))['60|all|2027-01-11|base'];
  assert.ok((await page.locator('.product-card').first().innerText()).includes(expected.cards[0].products[0].name));
  assert.ok((await page.locator('.product-card').first().innerText()).includes(expected.cards[0].goal_total.toLocaleString('ko-KR')));
  await b('이 계획 선택하기').first().click();await b('이 계획 저장하기').click();assert.equal(await page.locator('.hero-amount strong').innerText(),'0원');
  const before=await saved();assert.equal(before.months,60);assert.equal(before.monthly,500000);assert.equal(before.goal,10000000);
  await b('다시, 이어가기').click();await page.getByRole('button',{name:/이번 달만 어려워요/}).click();await page.getByLabel('조정 후 납입할 금액').fill('200000');await b('조정한 계획 비교하기').click();await page.getByLabel('계약 변경 승인이 아닌 원금 계획 비교임을 확인했어요.').check();await b('내 계획에 반영하기').click();
  const after=await saved();assert.equal(after.product.maturity,before.product.maturity);assert.ok(after.schedule.filter(p=>p.date>=before.product.maturity).every(p=>p.amount===500000));
  checks.push('Changed inputs select matching Python snapshot; 60-month goal keeps original product maturity');

  await reset();await b('나의 저축 계획').click();await b('새 계획 만들기').click();await b('다음으로').click();await b('다음으로').click();await page.getByLabel('우대 실적을 아직 확인하지 않은 가상 사례로 비교하기').check();await b('맞는 계획 비교하기').click();await page.locator('.product-card').first().waitFor();
  await page.getByRole('button',{name:/확인할 질문/}).click();await page.getByRole('heading',{name:'조건이 확실하지 않으면 초안으로 남겨요'}).waitFor();await b('이 계획 초안 보기').first().click();await b('초안으로 저장하기').click();
  assert.equal((await saved()).payments.reduce((sum,p)=>sum+p.amount,0),1200000);await page.getByRole('heading',{name:'아직 확인 중인 초안'}).waitFor();
  await b('새 계획 만들기').click();await page.getByLabel('얼마를 모을까요?').selectOption('5000000');await b('맞춤 상품 찾기').click();await page.getByText('비교 조건이 바뀌었어요',{exact:true}).waitFor();assert.equal(await page.locator('.product-card').count(),0);
  checks.push('Unknown scenario saves a draft; stale results cannot be selected');

  await reset();await page.goto(`${base}preview.html`,{waitUntil:'networkidle'});
  const frame=page.frameLocator('iframe');assert.deepEqual(await frame.locator('body').evaluate(()=>[innerWidth,innerHeight]),[1280,800]);
  await b('앱 · 412 × 917').click();assert.deepEqual(await frame.locator('body').evaluate(()=>[innerWidth,innerHeight]),[412,917]);
  await page.getByLabel('목업 화면 선택').selectOption('conditions');await frame.getByRole('heading',{name:'우대조건, 하나씩 확인해요.'}).waitFor();
  assert.ok(page.frames()[1].url().startsWith(base));
  checks.push('Preview iframe remains under /finset/; exact web/app dimensions and screen picker');
  assert.deepEqual(apiRequests,[]);assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
  const result={passed:true,base,checkedAt:new Date().toISOString(),checks,apiRequests,errors,failures};
  fs.writeFileSync('.qa/pages-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exit(1)});
