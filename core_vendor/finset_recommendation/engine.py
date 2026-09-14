"""Fin-Set: qualify first, protect cash, compare plans using achievable returns."""
import copy,itertools,json,math,heapq
from datetime import date
from pathlib import Path
from conditions import evaluate,bonus
from calculator import month,project
import source
import bonus_intent
from explanations import explain_cards
R=Path(__file__).resolve().parent
POLICY={'tax_rate':'0.154','protection_limit':100000000,'unknown_future_interest':0}

def plan_budget(p):
 required=['start_date','goal_date','goal_amount','cash','reserve','monthly','income_pattern','fund_type','sectors','channels','withdrawal_need']
 missing=[k for k in required if p.get(k) is None]
 if missing:return {'status':'NEEDS_INPUT','questions':missing}
 for k in ['goal_amount','cash','reserve','monthly']:
  if type(p[k]) is not int or p[k]<0:raise ValueError('금액은 0 이상의 원 단위 정수: '+k)
 if p['goal_amount']==0:raise ValueError('목표금액 필요')
 if p['income_pattern'] not in ('steady','variable','none'):raise ValueError('소득 형태 오류')
 if not isinstance(p['sectors'],list) or not p['sectors'] or set(p['sectors'])-{'bank','savings_bank','credit_union'}:raise ValueError('비교 금융권 확인 필요')
 if not isinstance(p['channels'],list) or not p['channels'] or set(p['channels'])-{'branch','web','mobile','phone','other'}:raise ValueError('가입방법 확인 필요')
 if p['fund_type'] not in ('personal','business'):raise ValueError('자금 용도 확인 필요')
 if p['withdrawal_need'] not in ('none','possible','certain'):raise ValueError('중간 사용 가능성 오류')
 if p['withdrawal_need']!='none':
  if p.get('early_access_strategy')!='separate_cash':return {'status':'NEEDS_WITHDRAWAL_TERMS','questions':['early_access_strategy'],'reason':'상품에서 중간에 꺼내야 한다면 해당 상품의 일부해지 조건과 손실 산식이 먼저 필요합니다.'}
  if p.get('early_access_amount') is None:return {'status':'NEEDS_INPUT','questions':['early_access_amount']}
  if type(p['early_access_amount']) is not int or p['early_access_amount']<0:raise ValueError('중간 사용액 오류')
  if p['reserve']<p['early_access_amount']:return {'status':'ADJUST_CASH','reason':'중간에 꺼낼 돈을 별도 현금에 더 확보해야 해요.'}
 if p['fund_type']=='business':return {'status':'NEEDS_BUSINESS_RULES','questions':['사업 운영에 남겨야 하는 돈과 가입명의를 확인해 주세요.']}
 a,b=date.fromisoformat(p['start_date']),date.fromisoformat(p['goal_date'])
 if b<=a:raise ValueError('목표일은 시작일보다 늦어야 합니다.')
 horizon=0
 while month(a,horizon+1)<=b and horizon<120:horizon+=1
 if horizon>=120 and b>month(a,120):raise ValueError('10년 이내 목표를 구간별로 나눠 주세요.')
 m=p['monthly']
 if p['income_pattern']=='variable':
  if p.get('low_month_capacity') is None:return {'status':'NEEDS_INPUT','questions':['low_month_capacity']}
  if type(p['low_month_capacity']) is not int or p['low_month_capacity']<0:raise ValueError('적은 달 여력 오류')
  m=min(m,p['low_month_capacity'])
 # User supplies capacity after living costs; do not infer it from occupation.
 costs=p.get('planned_spending',[])
 if not isinstance(costs,list):raise ValueError('예정 지출 형식 오류')
 locked=0
 for spending in costs:
  if type(spending.get('amount')) is not int or spending['amount']<0:raise ValueError('예정 지출 금액 오류')
  d=date.fromisoformat(spending['date'])
  if d<a:raise ValueError('이미 지난 지출은 현재 잔액에 반영해 주세요.')
  if d<=b:locked+=spending['amount']
 if p['reserve']+locked>p['cash']:return {'status':'ADJUST_CASH','reason':'비상금과 예정 지출을 남기면 맡길 현금이 부족해요.','required_cash':p['reserve']+locked}
 if p.get('high_interest_debt') is True:return {'status':'REVIEW_DEBT','reason':'저축 계획 전에 대출 비용과 상환 계획을 함께 확인해 주세요.'}
 # Explicit user confirmation; reserve=0 is never silently treated as adequate.
 if p.get('bank_policy')=='existing_only' and p.get('existing_bank_ids') is None:return {'status':'NEEDS_INPUT','questions':['existing_bank_ids']}
 if p.get('holdings_complete') is not True:return {'status':'NEEDS_INPUT','questions':['holdings_complete']}
 if p.get('reserve_confirmed') is not True:return {'status':'NEEDS_INPUT','questions':['reserve_confirmed']}
 return dict(status='READY',start=a,goal=b,horizon=horizon,deposit=p['cash']-p['reserve']-locked,monthly=m,reserved=p['reserve'],planned_spending=locked,monthly_reduced=m<p['monthly'],total_principal=p['cash']-p['reserve']-locked+m*horizon)

def candidate(rule,p,budget):
 kind=rule['kind'];amount=budget['deposit'] if kind=='deposit' else budget['monthly'];n=rule['term']
 if amount<=0 or n>budget['horizon'] or month(budget['start'],n)>budget['goal']:return None
 if rule['sector'] not in p['sectors'] or not set(rule['channels'])&set(p['channels'])&{'web','mobile'}:return None
 if not rule['minimum']<=amount or rule.get('maximum') is not None and amount>rule['maximum']:return None
 if p.get('bank_policy','allow')=='existing_only' and rule['bank_id'] not in p.get('existing_bank_ids',[]):return None
 if p.get('bank_policy','allow') not in ('allow','existing_only'):raise ValueError('은행 선택 오류')
 if rule.get('single') and rule['product_id'] in p.get('held_product_ids',[]):return None
 aggregate_missing=set()
 if rule.get('aggregate'):
  balance=p.get('product_balances',{}).get(rule['product_id'])
  if balance is None and rule['product_id'] in p.get('held_product_ids',[]):aggregate_missing.add('product_balance.'+rule['product_id'])
  elif amount+(balance or 0)>rule['maximum']:return None
 facts=dict(p.get('facts',{}));facts.update(p.get('option_facts',{}).get(str(rule['option_id']),{}));facts.update({'amount':amount,'term':n,'plan.hold_to_maturity':True})
 # Combined totals must include the proposed payment, even if an old caller
 # supplies an inconsistent lower total. Missing totals remain unanswered.
 for key,value in list(facts.items()):
  if key.startswith('combined_monthly.') and value is not None:
   if type(value) is not int or value<0:raise ValueError('합산 월 납입액 오류')
   facts[key]=max(value,amount)
 state,missing=evaluate(rule['eligibility'],facts)
 missing.update(aggregate_missing)
 if state is False:return None
 if rule.get('bonus_validation'):
  for key,v in list(facts.items()):
   if key.startswith('hana_mwc.') and key.endswith('_qualifying_months') and v is not None:
    if type(v) is not int or v<0:raise ValueError('우대 실적 개월 수 오류')
    if v>rule['bonus_validation']['qualifying_months_max']:facts[key]=None
 rule,facts=bonus_intent.apply(rule,facts,p.get('bonus_intents',{}))
 low,high,bonus_q,earned=bonus(rule,facts)
 if rule['base_rate']+high>rule['max_rate']+1e-7:raise ValueError('우대 합계와 공시 최고금리 충돌: '+rule['product_id'])
 if rule.get('model') not in ('simple_monthly','compound_monthly','simple_actual365'):return None
 z=project(kind,amount,n,rule['base_rate']+low,rule['model'],POLICY['tax_rate'],p['start_date'])
 ceiling=project(kind,amount,n,rule['base_rate']+high,rule['model'],POLICY['tax_rate'],p['start_date'])
 costs=rule.get('additional_cost',0)
 cost_map=p.get('bonus_costs',{}).get(rule['product_id'])
 if cost_map is not None:
  if not isinstance(cost_map,dict) or any(type(v) is not int or v<0 for v in cost_map.values()):raise ValueError('우대별 추가비용 형식 오류')
  components=rule.get('bonus',[])
  if any(c['id'] not in cost_map for c in components):missing.add('bonus_costs.'+rule['product_id'])
  else:
   variants=[]
   for mask in range(1<<len(components)):
    chosen=copy.deepcopy(rule)
    chosen['bonus']=[dict(c,when=False) if mask&(1<<i) else c for i,c in enumerate(components)]
    vl,vh,vq,ve=bonus(chosen,facts)
    cost=sum(cost_map[k] for k in ve)
    estimate=project(kind,amount,n,rule['base_rate']+vl,rule['model'],POLICY['tax_rate'],p['start_date'])
    upper=project(kind,amount,n,rule['base_rate']+vh,rule['model'],POLICY['tax_rate'],p['start_date'])
    variants.append((estimate['net_interest']-cost,-cost,vl,vh,vq,ve,estimate,upper,cost))
   selected=max(variants,key=lambda x:x[:2]);_,_,low,high,_,earned,z,ceiling,costs=selected
   # Any unresolved competitive benefit is still a question, not an earned return.
   bonus_q=set().union(*(v[4] for v in variants))
   if bonus_q:ceiling=dict(ceiling,net_interest=max(v[7]['net_interest'] for v in variants),gross_balance_ceiling=max(v[7]['gross_balance_ceiling'] for v in variants))
 elif rule.get('requires_cost_confirmation') and high>0:
  value=p.get('incremental_costs',{}).get(rule['product_id'])
  if value is None:missing.add('incremental_cost.'+rule['product_id'])
  else:
   costs=value
   if value>0:missing.add('bonus_costs.'+rule['product_id'])
 if type(costs) is not int or costs<0:raise ValueError('조건 이행 추가 비용 미확인')
 balance=p.get('bank_balances',{}).get(rule['bank_id'],0 if p.get('bank_balances_complete') is True else None)
 if p.get('protected_only',True):
  if balance is None:missing.add('bank_balance.'+rule['bank_id'])
  elif ceiling['gross_balance_ceiling']+balance>POLICY['protection_limit']:return None
 if p.get('flexible_only') and kind=='saving' and not rule['flexible']:return None
 # Equal commitments are assumed; a flexibility preference is not a probability.
 risk=0  # Income variability controls budget, not inferred repayment preference.
 known=not missing
 return dict(product_id=rule['product_id'],option_id=rule['option_id'],bank_id=rule['bank_id'],institution=rule['institution'],name=rule['name'],kind=kind,term=n,model=rule['model'],principal=z['principal'],net_interest=z['net_interest']-costs,upper_interest=ceiling['net_interest']-costs,gross_balance_ceiling=ceiling['gross_balance_ceiling'],rate=rule['base_rate']+low,rate_ceiling=rule['base_rate']+high,base_rate=rule['base_rate'],bonus_earned=earned,additional_cost=costs,risk=risk,eligibility_confirmed=known,questions=sorted(missing|bonus_q),maturity=month(budget['start'],n).isoformat(),source=rule['source_url'],source_hash=rule['source_hash'],calculation_assumption=rule['model_basis'])

def _key(plan):
 # Apply explicit preference filters first; rank remaining plans by shortfall and amount.
 return (plan['shortfall']>0,plan['risk'],plan['shortfall'],-plan['goal_total'],tuple(c['option_id'] for c in plan['products']))

def pairs_best_first(left,right,budget,goal):
 # Split by fixed risk so each interest-sorted grid is monotone under _key.
 # Seed every risk pair: a goal-reaching rigid plan may beat a flexible shortfall.
 groups=[]
 for lr in sorted({c['risk'] for c in left}):
  for rr in sorted({c['risk'] for c in right}):
   groups.append((sorted((c for c in left if c['risk']==lr),key=lambda c:(-c['net_interest'],c['option_id'])),
                  sorted((c for c in right if c['risk']==rr),key=lambda c:(-c['net_interest'],c['option_id']))))
 heap=[];visited=set()
 def push(g,i,j):
  left,right=groups[g]
  if i>=len(left) or j>=len(right) or (g,i,j) in visited:return
  visited.add((g,i,j));a,b=left[i],right[j]
  total=budget['total_principal']+a['net_interest']+b['net_interest']
  plan=dict(products=[a,b],risk=a['risk']+b['risk'],shortfall=max(0,goal-total),goal_total=total)
  heapq.heappush(heap,(_key(plan),g,i,j))
 for g in range(len(groups)):push(g,0,0)
 while heap:
  _,g,i,j=heapq.heappop(heap);left,right=groups[g];yield left[i],right[j]
  push(g,i+1,j);push(g,i,j+1)

def _recommend(profile,rules=None):
 source.connect().close()
 if rules is None:rules=json.loads((R/'rules.json').read_text())
 p=copy.deepcopy(profile)
 try:
  if not isinstance(p,dict):raise ValueError('사용자 정보 형식 오류')
  if p.get('bank_policy','allow') not in ('allow','existing_only'):raise ValueError('은행 선택 오류')
  for f in ('facts','bank_balances','product_balances','incremental_costs','option_facts','bonus_costs','bonus_intents'):
   if not isinstance(p.get(f,{}),dict):raise ValueError(f+' 형식 오류')
  for f in ('protected_only','reserve_confirmed','holdings_complete','flexible_only','bank_balances_complete','high_interest_debt'):
   if f in p and type(p[f]) is not bool:raise ValueError(f+' 선택 오류')
  if 'accessible_branch_bank_ids' in p and not isinstance(p['accessible_branch_bank_ids'],list):raise ValueError('방문 가능 금융회사 목록 오류')
  if not isinstance(p.get('held_product_ids',[]),list):raise ValueError('보유 상품 목록 오류')
  for f in ('bank_balances','product_balances'):
   if any(type(v) is not int or v<0 for v in p.get(f,{}).values()):raise ValueError(f+' 금액 오류')
  if any(not isinstance(v,dict) for v in p.get('option_facts',{}).values()):raise ValueError('상품별 응답 형식 오류')
  for key in ('age','nationality','residency'):
   v=p.get('facts',{}).get(key)
   if key=='age' and v is not None and (type(v) is not int or v<0):raise ValueError('나이 오류')
   if v is not None and ((key=='age' and v<19) or (key in ('nationality','residency') and v!='KR')):
    return dict(status='NEEDS_ONBOARDING_REVIEW',cards=[],reason='현재 검증한 가입 절차는 국내 거주 성인 내국인 기준입니다. 이 사용자가 가입할 상품이 없다는 뜻은 아닙니다.')
  if isinstance(p.get('channels'),list) and not set(p['channels'])-{'branch','web','mobile','phone','other'}:
   p['channels']=[x for x in p['channels'] if x in ('web','mobile')]
   if not p['channels']:return dict(status='DIGITAL_CHANNEL_REQUIRED',cards=[],questions=['channels'],reason='핀셋은 앱·웹으로 가입할 수 있는 상품만 비교해요. 방문·전화 가입 상품은 추천하지 않아요.')
  budget=plan_budget(p)
  if budget['status']!='READY':return dict(budget,cards=[])
  if budget['horizon']==0:
   import liquid
   lp=dict(p,liquid_amount=budget['deposit'],liquid_days=(budget['goal']-budget['start']).days)
   return dict(status='LIQUID_ONLY',cards=[],liquid_comparison=liquid.recommend(lp),reason='첫 월 만기 전에 필요한 돈이라 입출금상품을 비교했어요.')
  if budget['deposit']==0 and budget['monthly']==0:return dict(status='ADJUST_CASH',cards=[],reason='비상금과 지출을 남긴 뒤 지금 맡길 돈과 유지할 수 있는 월 저축액이 없어요. 저축 여력부터 다시 정해요.')
  bucket={'deposit':[],'saving':[]};unknown=[];known=[]
  for r in rules:
   c=candidate(r,p,budget)
   if not c:continue
   if not c['eligibility_confirmed']:unknown.append(c)
   else:bucket[c['kind']].append(c);known.append(c)
  # Dominance pruning within a bank and risk level retains enough options for top 3.
  # For mixed plans, all options remain: balance-cap interactions can invalidate apparent dominance.
  mixed=budget['deposit']>0 and budget['monthly']>0
  combinations=[]
  if mixed:
   if not bucket['deposit'] or not bucket['saving']:
    return dict(status='NEEDS_ALLOCATION_OR_RULES',cards=[],questions=sorted({q for c in unknown for q in c['questions']})[:3],reason='두 자금을 모두 다룰 후보가 부족합니다. 한쪽을 누락한 혼합 추천을 만들지 않습니다.')
   combinations=pairs_best_first(bucket['deposit'],bucket['saving'],budget,p['goal_amount'])
  else:combinations=((c,) for c in known)
  best=[];seen={}
  for combo in combinations:
   totals={}
   for c in combo:totals[c['bank_id']]=totals.get(c['bank_id'],0)+c['gross_balance_ceiling']
   if p.get('protected_only',True) and any(p.get('bank_balances',{}).get(bank,0)+v>POLICY['protection_limit'] for bank,v in totals.items()):continue
   total=budget['total_principal']+sum(c['net_interest'] for c in combo)
   plan=dict(products=list(combo),risk=sum(c['risk'] for c in combo),goal_total=total,shortfall=max(0,p['goal_amount']-total),questions=sorted({q for c in combo for q in c['questions']}),future_reinvestment_interest=0,source_scope='connected_rules_only')
   identity=tuple(c['product_id'] for c in combo)
   if identity not in seen or _key(plan)<_key(seen[identity]):seen[identity]=plan
   if mixed and len(seen)==3:break
  best=sorted(seen.values(),key=_key)[:3]
  # A potentially competitive unknown answer prevents the 'final best' claim.
  questions=set(q for plan in best for q in plan['questions'])
  if mixed:
   # Search the optimistic combination grid as well. A bonus-unconfirmed
   # candidate outside the displayed lower-bound top three can still overtake it.
   optimistic={k:[dict(c,net_interest=c['upper_interest']) for c in v+ [u for u in unknown if u['kind']==k]] for k,v in bucket.items()}
   for combo in pairs_best_first(optimistic['deposit'],optimistic['saving'],budget,p['goal_amount']):
    totals={}
    for c in combo:totals[c['bank_id']]=totals.get(c['bank_id'],0)+c['gross_balance_ceiling']
    if p.get('protected_only',True) and any(p.get('bank_balances',{}).get(bank,0)+v>POLICY['protection_limit'] for bank,v in totals.items()):continue
    total=budget['total_principal']+sum(c['net_interest'] for c in combo)
    upper=dict(products=list(combo),risk=sum(c['risk'] for c in combo),goal_total=total,shortfall=max(0,p['goal_amount']-total))
    if len(best)==3 and _key(upper)>_key(best[-1]):break
    questions.update(q for c in combo for q in c['questions'])
  else:
   for c in known+unknown:
    if not c['questions']:continue
    upper=dict(products=[c],risk=c['risk'],goal_total=budget['total_principal']+c['upper_interest'],shortfall=max(0,p['goal_amount']-budget['total_principal']-c['upper_interest']))
    if len(best)<3 or _key(upper)<=_key(best[-1]):questions.update(c['questions'])
  ordered_questions=[]
  for c in sorted(known+unknown,key=lambda c:(c['risk'],-c['upper_interest'],c['option_id'])):
   for q in c['questions']:
    if q in questions and q not in ordered_questions:ordered_questions.append(q)
  for i,plan in enumerate(best):
   plan.update(role=('현재 저축액에 맞는 상품' if i==0 else f'다른 선택 {i}') if plan['shortfall'] else ('추천' if i==0 else f'대안 {i}'), goal_fit='shortfall' if plan['shortfall'] else 'projected_reachable', goal_notice=f"목표금액까지 {plan['shortfall']:,}원 부족해요." if plan['shortfall'] else '입력한 계획과 계산 가정대로 모으면 목표금액에 도달해요.',difference_from_primary=plan['goal_total']-best[0]['goal_total'],why=[f"비상금 {budget['reserved']:,}원과 예정 지출 {budget['planned_spending']:,}원을 남겼어요.",f"매달 {budget['monthly']:,}원 이내로 비교했어요.", '매달 넣는 금액을 조절할 수 있는 상품만 비교했어요.' if p.get('flexible_only') else '가입조건과 같은 예산 안에서 목표 부족액과 예상금액을 비교했어요.',f"목표일까지 계획한 원금과 첫 상품의 예상이자는 {plan['goal_total']:,}원이에요.",'우대조건에 추가비용이 있으면 일부 조건을 선택하지 않는 안도 비교했어요.' if p.get('bonus_costs') else '답변과 선택한 우대조건을 바탕으로 계산했어요. 실제 이자는 조건 이행에 따라 달라져요.'],completion_probability=None)
  result=dict(status='NEEDS_ANSWERS' if questions else 'NO_MATCH' if not best else 'ADJUST_GOAL' if best[0]['shortfall'] else 'COMPARISON',cards=best,questions=ordered_questions[:3],remaining_questions=ordered_questions[3:],provisional=bool(questions),budget={k:v.isoformat() if isinstance(v,date) else v for k,v in budget.items()},full_catalog_optimum=False,goal_projection_notice='목표일까지 같은 월 금액을 모으고 첫 상품 만기 후 원금을 보관하는 계획. 재가입 이자는 0원으로 두며 장기 최적화를 주장하지 않습니다.')
  explain_cards(result)
  if best and best[0]['shortfall']:
   result['goal_guidance']=dict(
    title='현재 계획으로는 목표금액이 부족해요.' if not questions else '추가 답변 전에 계산한 금액은 목표보다 적어요.',
    provisional=bool(questions),goal_amount=p['goal_amount'],principal=budget['total_principal'],
    projected_amount=best[0]['goal_total'],shortfall=best[0]['shortfall'],
    required_monthly_principal_only=(max(0,p['goal_amount']-budget['deposit'])+budget['horizon']-1)//budget['horizon'],
    calculation_notice='필요한 월 금액은 이자를 제외한 참고 계산이에요. 무리해서 저축하라는 뜻은 아니에요. 미래 재가입 이자는 예상금액에 포함하지 않았어요.',
    show_before_cards=True,requires_confirmation=True,
    actions=[dict(id='review_goal',label='목표금액 다시 살펴보기'),
             dict(id='review_budget',label='보탤 목돈과 월 저축액 확인하기'),
             dict(id='compare_with_current_budget',label='현재 저축액에 맞는 상품 살펴보기')])
   if p.get('deadline_flexibility','fixed')=='flexible':
    result['goal_guidance']['actions'].insert(1,dict(id='review_date',label='목표 날짜 다시 살펴보기'))
  return result
 except (ValueError,TypeError,KeyError,OverflowError) as err:return dict(status='INVALID',cards=[],reason=str(err))


def _recommend_with_schedule(profile,rules=None):
 """Date flexibility produces a separate proposal, never silent deadline changes."""
 if not isinstance(profile,dict):return _recommend(profile,rules)
 flexibility=profile.get('deadline_flexibility','fixed')
 if flexibility not in ('fixed','flexible'):return dict(status='INVALID',cards=[],reason='목표일 변경 가능 여부를 확인해 주세요.')
 original=_recommend(profile,rules)
 if flexibility=='fixed' or original['status'] not in ('ADJUST_GOAL','NO_MATCH','NEEDS_ALLOCATION_OR_RULES'):return original
 latest=profile.get('latest_goal_date')
 if latest is None:
  original['planning_questions']=['latest_goal_date']
  original['questions']=list(dict.fromkeys(original.get('questions',[])+['latest_goal_date']))[:3]
  return original
 try:
  goal=date.fromisoformat(profile['goal_date']);end=date.fromisoformat(latest)
  if end<=goal or end>month(date.fromisoformat(profile['start_date']),120):raise ValueError()
 except (ValueError,TypeError,KeyError):return dict(status='INVALID',cards=[],reason='늦춰도 되는 날짜는 원래 목표일 이후, 시작일부터 10년 이내로 선택해 주세요.')
 if rules is None:rules=json.loads((R/'rules.json').read_text())
 # At monthly boundaries, then the exact latest date. Earliest feasible proposal wins.
 dates=[];i=1;start=date.fromisoformat(profile['start_date'])
 while month(start,i)<=goal:i+=1
 while month(start,i)<end:dates.append(month(start,i));i+=1
 dates.append(end)
 for d in dates:
  p=dict(profile,goal_date=d.isoformat());alt=_recommend(p,rules)
  if alt['status']=='COMPARISON':
   original['schedule_alternative']=dict(goal_date=d.isoformat(),requires_confirmation=True,result=alt,notice='매달 같은 금액을 더 오래 모으는 별도 안이에요. 동의하기 전에는 원래 날짜를 바꾸지 않아요.')
   break
 else:original['schedule_alternative']=dict(goal_date=end.isoformat(),requires_confirmation=True,result=alt,notice='늦춰도 된다고 답한 날짜까지도 조건이 충족되는지 확인해 주세요. 목표 달성을 보장하지 않아요.')
 return original


def recommend(profile,rules=None):
 """Ask commitment preference only when it changes a relevant comparison."""
 if not isinstance(profile,dict):return _recommend_with_schedule(profile,rules)
 preference=profile.get('contribution_preference')
 if preference not in (None,'fixed_ok','adjustable','compare'):
  return dict(status='INVALID',cards=[],reason='납입 방식 선택을 확인해 주세요.')
 p=copy.deepcopy(profile)
 if p.get('flexible_only') or preference=='adjustable':
  p['flexible_only']=True
  return _recommend_with_schedule(p,rules)
 if rules is None:rules=json.loads((R/'rules.json').read_text())
 both=_recommend_with_schedule(p,rules)
 if preference=='fixed_ok':return both
 if both['status'] not in ('COMPARISON','ADJUST_GOAL') or not both.get('budget',{}).get('monthly'):return both
 flexible=_recommend_with_schedule(dict(p,flexible_only=True),rules)
 # Resolve potentially relevant factual questions before asking a preference.
 if flexible['status']=='NEEDS_ANSWERS':
  both.update(status='NEEDS_ANSWERS',provisional=True)
  qs=list(dict.fromkeys(both.get('questions',[])+flexible.get('questions',[])+flexible.get('remaining_questions',[])))
  both['questions']=qs[:3];both['remaining_questions']=qs[3:]
  if both.get('goal_guidance'):
   both['goal_guidance'].update(provisional=True,title='추가 답변 전에 계산한 금액은 목표보다 적어요.')
  explain_cards(both)
  return both
 def signature(z):
  return [tuple(c['option_id'] for c in plan['products']) for plan in z.get('cards',[])]
 if signature(both)==signature(flexible):return both
 rule_by_id={r['option_id']:r for r in rules}
 def preview(z,require_fixed=False):
  if not z.get('cards'):return dict(status=z['status'],available=False,notice='현재 범위에서 이 방식에 맞는 비교 결과를 찾지 못했어요.')
  top=next((plan for plan in z['cards'] if any(c['kind']=='saving' and not rule_by_id[c['option_id']]['flexible'] for c in plan['products'])),z['cards'][0]) if require_fixed else z['cards'][0]
  return dict(status=z['status'],available=True,projected_amount=top['goal_total'],shortfall=top['shortfall'],
   products=[dict(name=c['name'],option_id=c['option_id'],kind=c['kind'],term=c['term'],rate=c['rate'],net_interest=c['net_interest']) for c in top['products']])
 return dict(status='NEEDS_ANSWERS',cards=[],provisional=True,questions=['contribution_preference'],remaining_questions=[],
  budget=both['budget'],full_catalog_optimum=False,
  contribution_choice=dict(title=f"상품의 저축 기간 동안 매달 {both['budget']['monthly']:,}원씩 넣는 방식도 괜찮나요?",
   options=[dict(value='fixed_ok',label='정한 금액을 계속 넣을 수 있어요'),dict(value='adjustable',label='넣는 금액을 조절할 수 있어야 해요'),dict(value='compare',label='차이를 보고 정할게요')],
   show_comparison=preference=='compare',fixed_allowed=preview(both,True),adjustable_only=preview(flexible),
   notice='상품별 저축 기간을 확인해 주세요. 두 예상금액은 같은 월 금액을 계획대로 넣는 가정이에요. 자유적립은 중간 출금이 자유롭다는 뜻은 아니에요.'),
  reason='납입 방식에 따라 후보가 달라져요. 차이를 확인하고 선택해 주세요.')
