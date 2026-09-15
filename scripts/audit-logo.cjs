const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/ljm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {observe}=require('./browser-observer.cjs');
const base=process.env.FINSET_URL||'http://127.0.0.1:4173/finset/';
let browser;
(async()=>{
 fs.mkdirSync('.qa',{recursive:true});browser=await chromium.launch({channel:'msedge',headless:true});
 const checks=[],timings=[],errors=[];
 async function create(width,reducedMotion='no-preference'){
  const page=await browser.newPage({viewport:{width,height:width===1280?800:917},hasTouch:width<768,reducedMotion});
  page.on('pageerror',e=>errors.push(e.message));await observe(page);
  await page.addInitScript(()=>{
   window.__introEvents=[];let active=false;
   new MutationObserver(()=>{const shown=!!document.querySelector('.brand-intro[open]');if(shown!==active){active=shown;window.__introEvents.push({shown,time:performance.now()})}}).observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
  });return page;
 }
 async function noOverflow(page,label){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label)}
 async function autoEnd(page,label){
  await page.locator('.brand-intro').waitFor({state:'detached',timeout:6000});await page.locator('.welcome-page').waitFor();
  const events=await page.evaluate(()=>window.__introEvents),duration=events[1].time-events[0].time;
  assert.ok(duration>=2200&&duration<4000,`${label}: ${duration}ms`);timings.push({label,durationMs:Math.round(duration)});
 }
 for(const width of [412,1280]){
  const page=await create(width);await page.goto(base);
  await page.getByRole('dialog',{name:'내 조건에 맞게. 내 목표에 닿게.'}).waitFor();
  assert.equal(await page.locator('.brand-intro button').count(),0);
  assert.equal(await page.locator('.brand-intro').evaluate(e=>e.matches(':modal')),true);
  await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.brand-intro p')).opacity)>.9);
  await noOverflow(page,`${width} intro`);await page.screenshot({path:`.qa/logo-intro-${width}.png`});await autoEnd(page,`${width} first visit`);
  await page.getByRole('link',{name:'핀셋 홈',exact:true}).filter({visible:true}).click();
  assert.equal(await page.locator('.brand-intro').count(),0);
  await page.reload();await page.locator('.brand-intro[open]').waitFor();await autoEnd(page,`${width} reload`);
  checks.push(`${width}px 메인 첫 접속·새로고침 모션, 2.4초 자동 종료, 로고 재클릭 중복 없음`);
  await page.goto(base+'?screen=guided');await page.locator('#core-goal').waitFor();assert.equal(await page.locator('.brand-intro').count(),0);
  await page.getByRole('link',{name:'핀셋 홈',exact:true}).filter({visible:true}).click();await page.locator('.brand-intro[open]').waitFor();
  await page.keyboard.press('Escape');await page.locator('.brand-intro').waitFor({state:'detached'});await page.locator('.welcome-page').waitFor();
  await page.getByRole('link',{name:'핀셋 홈',exact:true}).filter({visible:true}).click();assert.equal(await page.locator('.brand-intro').count(),0);
  checks.push(`${width}px 직접 추천 진입은 모션 생략, 첫 로고 클릭만 재생, Escape 종료`);await page.close();
 }
 const reduced=await create(412,'reduce');await reduced.goto(base);await reduced.locator('.welcome-page').waitFor();assert.equal(await reduced.locator('.brand-intro').count(),0);
 await reduced.getByRole('link',{name:'핀셋 홈',exact:true}).filter({visible:true}).click();assert.equal(await reduced.locator('.brand-intro').count(),0);await reduced.close();
 const changeMotion=await create(412);await changeMotion.goto(base);await changeMotion.locator('.brand-intro[open]').waitFor();await changeMotion.emulateMedia({reducedMotion:'reduce'});await changeMotion.locator('.brand-intro').waitFor({state:'detached'});await changeMotion.close();checks.push('모션 감소 시 생략; 재생 중 모션 감소 설정 변경 시 즉시 종료');
 const page=await create(412,'reduce'),b=n=>page.getByRole('button',{name:n,exact:true});
 const click=async l=>{await l.scrollIntoViewIfNeeded();await l.click()},next=()=>click(b('다음')),radio=n=>click(page.getByRole('radio',{name:n,exact:true}));
 await page.goto(base+'?screen=guided');const stored=await page.evaluate(()=>localStorage.getItem('finset-demo-v1'));
 await page.locator('#core-goal').fill('500');await click(b('1년'));await next();await page.locator('#core-cash').fill('100');await page.locator('#core-monthly').fill('30');await radio('매달 비슷해요');await next();
 await radio('개인 생활·목표를 위한 돈');await radio('네 · 먼저 확인할게요');await click(b('상환 확인 안내 보기'));
 assert.equal(await page.locator('.debt-review').count(),0);assert.match(await page.getByRole('alert').innerText(),/아직 답하지 않은/);
 await radio('은행만 · 인터넷은행 포함');assert.equal(await b('상환 확인 안내 보기').isEnabled(),true);await click(b('상환 확인 안내 보기'));await page.locator('.debt-review').waitFor();
 assert.equal(await page.locator('#debt-review-title').evaluate(e=>e===document.activeElement),true);
 assert.equal(await page.locator('.refine-primary').count(),0);assert.equal(await page.evaluate(()=>window.__coreRequests.filter(r=>r.input&&r.input.action!=='metadata').length),0);
 for(const width of [360,412,768,1280]){await page.setViewportSize({width,height:width===1280?800:917});await noOverflow(page,`${width} debt`);if([412,1280].includes(width))await page.screenshot({path:`.qa/logo-debt-${width}.png`,fullPage:true})}
 await page.setViewportSize({width:412,height:917});await click(b('대출 답변 다시 보기'));assert.equal(await page.getByRole('radio',{name:'네 · 먼저 확인할게요'}).getAttribute('aria-checked'),'true');
 await click(b('상환 확인 안내 보기'));await click(b('저축할 금액 다시 보기'));assert.equal(await page.locator('#core-cash').inputValue(),'100');assert.equal(await page.locator('#core-monthly').inputValue(),'30');
 await page.locator('#core-monthly').fill('25');await next();assert.equal(await page.getByRole('radio',{name:'네 · 먼저 확인할게요'}).getAttribute('aria-checked'),'true');
 await click(b('상환 확인 안내 보기'));await click(b('대출 답변 다시 보기'));await radio('아니요 · 상환 계획을 고려한 여유자금이에요');await next();await page.getByRole('radiogroup',{name:'이미 가입한 예·적금이나 은행에 맡긴 다른 돈이 있나요?'}).waitFor();
 await click(b('이전'));await radio('사업 운영에 쓰는 돈');assert.equal(await b('다음').isDisabled(),true);
 await radio('네 · 먼저 확인할게요');assert.equal(await b('다음').isDisabled(),true);assert.equal(await b('상환 확인 안내 보기').count(),0);
 await radio('개인 생활·목표를 위한 돈');await click(b('상환 확인 안내 보기'));await click(b('홈으로'));await page.locator('.welcome-page').waitFor();assert.equal(await page.locator('.debt-review').count(),0);
 assert.equal(await page.evaluate(()=>localStorage.getItem('finset-demo-v1')),stored);assert.deepEqual(errors,[]);
 checks.push('필수 비교 범위 누락은 오류 표시; 상환 안내 진입 시 추천 요청 없음; 대출 답변·금액 복귀 유지; 사용자 답변 수정 후 다음 단계 진행; 사업자금 차단 유지; 실제 홈 이동');
 const report={base,checks,timings,errors,existingStoragePreserved:true};fs.writeFileSync('.qa/logo-ui-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exit(1)});
