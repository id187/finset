import test from 'node:test'
import assert from 'node:assert/strict'
import { initial, addMonths, remainingSchedule, fullSchedule, applyRemaining, totalPrincipal, TODAY } from '../src/model.ts'

test('month-end dates are anchored to original day, including leap year',()=>{
  assert.equal(addMonths('2024-01-31',1),'2024-02-29')
  assert.equal(addMonths('2024-01-31',2),'2024-03-31')
  assert.equal(addMonths('2025-01-31',1),'2025-02-28')
})
test('demo starts at 1.2 million principal and eight unpaid installments',()=>{
  assert.equal(totalPrincipal(initial),1200000)
  assert.equal(remainingSchedule(initial).length,8)
  assert.equal(remainingSchedule(initial).reduce((s,r)=>s+r.amount,0),2400000)
})
test('actual payment date and scheduled installment are independent',()=>{
  const p={...initial,payments:[...initial.payments,{id:'late',date:TODAY,scheduledDate:'2027-02-11',amount:100000}]}
  const rows=remainingSchedule(p)
  assert.equal(rows.find(r=>r.date===TODAY).amount,300000)
  assert.equal(rows.find(r=>r.date==='2027-02-11').amount,200000)
})
test('additional saving affects principal without fulfilling a scheduled installment',()=>{
  const p={...initial,payments:[...initial.payments,{id:'extra',date:TODAY,scheduledDate:null,amount:100000}]}
  assert.equal(totalPrincipal(p),1300000)
  assert.equal(remainingSchedule(p)[0].amount,300000)
})
test('recovery preserves previous principal and only reduces unpaid amount once',()=>{
  const p={...initial,payments:[...initial.payments,{id:'partial',date:TODAY,scheduledDate:TODAY,amount:100000}]}
  const reduced=remainingSchedule(p).map((r,i)=>i===0?{...r,amount:100000}:r)
  const result=applyRemaining(p,reduced,'temporary')
  assert.equal(totalPrincipal(result),1300000)
  assert.equal(remainingSchedule(result)[0].amount,100000)
  assert.equal(result.versions[0].before.find(r=>r.date===TODAY).amount,300000)
  assert.equal(result.versions[0].after.find(r=>r.date===TODAY).amount,200000)
})
test('fully paid installments and a zero installment remain in history',()=>{
  const p={...initial,payments:[...initial.payments,{id:'paid',date:TODAY,amount:300000}]}
  const first=applyRemaining(p,remainingSchedule(p).map((r,i)=>i===0?{...r,amount:0}:r),'pause')
  const second=applyRemaining(first,remainingSchedule(first).map(r=>({...r,amount:200000})),'reduce')
  assert.equal(fullSchedule(second).length,12)
  assert.equal(fullSchedule(second).find(r=>r.date===TODAY).amount,300000)
  assert.equal(fullSchedule(second).find(r=>r.date==='2027-02-11').amount,0)
  assert.equal(totalPrincipal(second),1500000)
})
test('new plan begins at zero and includes every scheduled month',()=>{
  const p={...initial,startDate:TODAY,payments:[]}
  assert.equal(totalPrincipal(p),0)
  assert.equal(remainingSchedule(p).length,12)
  assert.equal(remainingSchedule(p)[0].date,TODAY)
  assert.equal(remainingSchedule(p).at(-1).date,'2027-12-11')
})
