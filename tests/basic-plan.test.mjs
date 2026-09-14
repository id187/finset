import test from 'node:test'
import assert from 'node:assert/strict'
import { fromManwon, freshBasicPlan, validateBasic, basicProfile, basicStop } from '../src/basicPlan.ts'
test('만원 정수 입력, 원 API, 0과 빈칸을 구분한다', () => {
  assert.equal(fromManwon('30'), '300000'); assert.equal(fromManwon('500'), '5000000')
  assert.equal(fromManwon('0'), '0'); assert.equal(fromManwon(''), '')
  for (const v of ['-1', '1.5', 'NaN']) assert.equal(fromManwon(v), null)
})
test('목적 없이 18개월과 5년 목표를 입력한다', () => {
  for (const date of ['2028-03-14', '2031-09-14']) assert.equal(validateBasic(0, {...freshBasicPlan(), goal:'5000000',start:'2026-09-14',date}), '')
})
test('목돈만 비교할 때 수입 답변을 요구하지 않는다', () => {
  const f={...freshBasicPlan(), cash:'5000000',monthly:'0'}
  assert.equal(validateBasic(1,f),''); const p=basicProfile(f,{})
  assert.equal(p.available_now,5000000);assert.equal(p.income_pattern,'none');assert.equal(p.monthly,0);assert.equal(p.low_month_capacity,null)
  assert.ok(!('reserve' in p));assert.ok(!('cash' in p));assert.equal(p.budget_basis,'available_after_expenses')
})
test('변동 수입만 적은 달 여력을 확인하고 과대입력을 막는다', () => {
  const f={...freshBasicPlan(),cash:'0',monthly:'300000',income:'variable',low:''}
  assert.ok(validateBasic(1,f));assert.ok(validateBasic(1,{...f,low:'400000'}))
  assert.equal(validateBasic(1,{...f,low:'200000'}),'');assert.equal(basicProfile({...f,low:'200000'},{}).low_month_capacity,200000)
})
test('돈이 모두 없거나 사업용·상환 우선·중간 사용이면 조기 안내한다', () => {
  const f=freshBasicPlan();assert.ok(basicStop(1,{...f,cash:'0',monthly:'0'}));assert.equal(basicStop(1,f),'')
  assert.ok(basicStop(2,{...f,fund:'business'}));assert.ok(basicStop(2,{...f,debt:'yes'}));assert.ok(basicStop(3,{...f,withdraw:'certain'}))
})
