import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { blankAnswers, recommendGuided, validateStep } from '../src/guided.ts'
import { projectSaving } from '../src/projection.ts'
import { bumpAmount, quickBlank, quickAnswers, quickValidate, quickAdjustments } from '../src/quick.ts'
const read = file => JSON.parse(readFileSync(new URL(file,import.meta.url),'utf8'))
const catalog = read('../public/demo/guided.json')
const fixtures = read('./fixtures/guided-parity.json')
const base = fixtures.find(f=>f.answers.monthly==='300000'&&f.answers.months==='12'&&f.answers.autoMonths==='0'&&!f.answers.autoUnknown).answers

test('A fresh demo has no assumed answers and cannot generate a recommendation',()=>{
  const a=blankAnswers();assert.equal(a.goal,'');assert.equal(a.monthly,'');assert.equal(a.adult,'');assert.equal(a.reserve,'');
  for(let step=0;step<5;step++) assert.ok(validateStep(a,step))
  assert.equal(recommendGuided(a,catalog).cards.length,0)
})
test(`${fixtures.length} guided comparisons match the original Python engine for this scope`,()=>{
  for(const sample of fixtures){
    const r=recommendGuided(sample.answers,catalog)
    assert.deepEqual({status:r.status,provisional:r.provisional,cards:r.cards.map(c=>({option_id:c.products[0].option_id,rate:c.products[0].rate,net_interest:c.products[0].net_interest,goal_total:c.goal_total,shortfall:c.shortfall}))},sample.expected,JSON.stringify(sample.answers))
  }
})
test('Actual answers change bonus rates, ranking, exclusions and unknown status',()=>{
  const noBonus=recommendGuided(base,catalog),bonus=recommendGuided({...base,autoMonths:'6'},catalog)
  assert.equal(noBonus.cards[0].products[0].name,'코드K 자유적금')
  assert.equal(bonus.cards[0].products[0].name,'카카오뱅크 자유적금')
  assert.equal(bonus.cards[0].products[0].rate,3.85)
  assert.equal(recommendGuided({...base,autoMonths:'6',renewed:'yes'},catalog).cards[0].products[0].name,'코드K 자유적금')
  const unknown=recommendGuided({...base,autoUnknown:true},catalog)
  assert.equal(unknown.provisional,true);assert.ok(unknown.missing.includes('카카오뱅크 자동이체 개월 수'))
  assert.equal(unknown.cards.find(c=>c.products[0].name==='카카오뱅크 자유적금').products[0].rate,3.65)
  const capped=recommendGuided({...base,monthly:'500000'},catalog)
  assert.ok(capped.cards.every(c=>c.products[0].name!=='코드K 자유적금'));assert.ok(capped.excluded.find(e=>e.name==='코드K 자유적금'))
})
test('Unconfirmed eligibility, cash and maturity plans stop a confirmed recommendation',()=>{
  for(const key of ['reserve','adult','mobile','hold'])for(const answer of ['no','unknown'])assert.equal(recommendGuided({...base,[key]:answer},catalog).cards.length,0)
  for(const debt of ['yes','unknown'])assert.equal(recommendGuided({...base,debt},catalog).cards.length,0)
  assert.equal(recommendGuided({...base,holdings:'unknown'},catalog).cards.length,0)
  const before=structuredClone(base);recommendGuided(base,catalog);assert.deepEqual(base,before)
})
test('The guided scope cannot expand silently and every projection is present',()=>{
  assert.equal(new Set(catalog.rules.map(r=>r.product_id)).size,3);assert.equal(catalog.rules.length,13)
  for(const r of catalog.rules)for(const monthly of catalog.monthly)for(const rate of [r.base_rate,r.max_rate])assert.ok(catalog.projections[`${r.option_id}|${monthly}|${rate.toFixed(2)}`])
})

test('Direct calculation preserves all 110 original Decimal projections, including tax rounding',()=>{
  for(const [key, original] of Object.entries(catalog.projections)) {
    const [id, amount, rate] = key.split('|').map(Number)
    const rule = catalog.rules.find(r=>r.option_id===id)
    assert.deepEqual(projectSaving(amount,rule.term,rate,rule.model,catalog.start),{
      principal:original.principal,net_interest:original.net_interest,gross_balance_ceiling:original.gross_balance_ceiling,
    },key)
  }
})

test('Quick demo accepts arbitrary whole-won input and repeated increments, preserving explicit unknowns',()=>{
  const blank = quickBlank();assert.equal(blank.monthly,'');assert.ok(quickValidate(blank))
  assert.equal(bumpAmount(bumpAmount('170000',30000),30000),'230000')
  assert.equal(bumpAmount('',10000),'10000');assert.equal(bumpAmount('0',-10000),'0')
  assert.equal(bumpAmount('999999999',50000),'1000000000')
  const input = { ...blank,purpose:'일단 모으기',monthly:'171237',transfer:'unknown' }
  assert.equal(quickValidate(input),'');assert.equal(quickAnswers(input).goal,String(171237*12))
  for(const monthly of ['0','-1','0.1','1e5','NaN','1000000001'])assert.ok(quickValidate({...input,monthly}))
  const unknown = recommendGuided(quickAnswers(input),catalog)
  assert.ok(unknown.cards.length);assert.equal(unknown.provisional,true)
  assert.ok(unknown.cards.every(c=>c.products[0].rate===c.products[0].base_rate))
  const yes = recommendGuided(quickAnswers({...input,transfer:'yes'}),catalog)
  assert.equal(yes.cards[0].products[0].name,'카카오뱅크 자유적금')
  const goal = {...input,purpose:'여행 자금',goal:'3000000',transfer:'yes'}
  const options = quickAdjustments(goal,catalog);assert.ok(options.length)
  for(const option of options)assert.equal(recommendGuided(quickAnswers(option.input),catalog).cards[0].shortfall,0)
  assert.equal(recommendGuided(quickAnswers({...input,monthly:'3000001'}),catalog).cards.length,0)
})
