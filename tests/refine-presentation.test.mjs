import test from 'node:test';
import assert from 'node:assert/strict';
import {goalProjection,alternativeDifference,amountLabel,periodLabel} from '../src/refinePresentation.ts';
import {basicProfile,freshBasicPlan} from '../src/basicPlan.ts';
import {changeCorePlan} from '../src/coreState.ts';

test('Projected bars clamp to 100 and never invent a bar for missing/zero goals',()=>{
  assert.equal(goalProjection(0,100),null);assert.equal(goalProjection(NaN,100),null);
  assert.deepEqual(goalProjection(100,120),{percent:100,shortfall:0,surplus:20});
  assert.deepEqual(goalProjection(100,0),{percent:0,shortfall:100,surplus:0});
});
test('Only the same goal and contribution basis produces a signed alternative difference',()=>{
  const comparison_basis={goal_amount:3600000,goal_date:'2027-09-15',total_principal:3600000,monthly:300000,deposit:0};
  const p={comparison_basis,goal_total:3661181};
  assert.equal(alternativeDifference(p,{comparison_basis,goal_total:3660215}),-966);
  assert.equal(alternativeDifference(p,{comparison_basis,goal_total:3661181}),0);
  assert.equal(alternativeDifference(p,{comparison_basis:{...comparison_basis,total_principal:3500000},goal_total:3661181}),null);
});
test('Summary amounts, exact differences, long terms and custom purpose remain distinct',()=>{
  assert.equal(amountLabel(3661181,true),'약 366.1만원');assert.equal(amountLabel(100000000),'1억원');
  assert.equal(amountLabel(966),'966원');assert.equal(periodLabel(18),'1년 6개월');assert.equal(periodLabel(60),'5년');
  assert.equal(basicProfile({...freshBasicPlan(),purpose:'직접 정하기',customPurpose:'부모님 여행'},{}).goal_name,'부모님 여행');
});
test('Amount edits preserve common willingness and unrelated facts while recalculating product conditions',()=>{
  const r={profile:{monthly:300000,benefit_action:'selected-extra'},answers:{'bonus_intent.auto_transfer':true,'bonus_intent.extra_transactions':false,'kn_no_saving_6m':true}};
  const changed=changeCorePlan(r,{monthly:370000},r.profile);
  assert.equal(changed.request.answers['bonus_intent.auto_transfer'],true);
  assert.equal(changed.request.answers['bonus_intent.extra_transactions'],false);
  assert.equal(changed.request.answers.kn_no_saving_6m,true);
  assert.equal(changed.request.profile.benefit_action,'');
});
