"""Separate comparison for cash that must remain withdrawable; never a fixed maturity yield."""
import json,math
from pathlib import Path
from decimal import Decimal
from datetime import date
import source
R=Path(__file__).resolve().parent

def recommend(p):
 source.connect().close()
 p=dict(p)
 required=['liquid_amount','liquid_days','sectors','channels','holdings_complete']
 missing=[k for k in required if p.get(k) is None]
 if missing:return dict(status='NEEDS_INPUT',cards=[],questions=missing)
 if any(type(p[k]) is not int or p[k]<=0 for k in ('liquid_amount','liquid_days')):return dict(status='INVALID',cards=[],reason='금액과 보관일수는 양의 정수여야 합니다.')
 if p['holdings_complete'] is not True:return dict(status='NEEDS_INPUT',cards=[],questions=['holdings_complete'])
 if not isinstance(p['sectors'],list) or not isinstance(p['channels'],list) or not p['sectors'] or not p['channels']:return dict(status='INVALID',cards=[])
 if set(p['sectors'])-{'bank','savings_bank','credit_union'} or set(p['channels'])-{'branch','web','mobile','phone','other'}:return dict(status='INVALID',cards=[])
 p['channels']=[x for x in p['channels'] if x in ('web','mobile')]
 if not p['channels']:return dict(status='DIGITAL_CHANNEL_REQUIRED',cards=[],questions=['channels'],reason='앱·웹 가입 상품만 비교해요.')
 if p.get('bank_policy','allow') not in ('allow','existing_only'):return dict(status='INVALID',cards=[])
 facts=p.get('facts',{})
 if not isinstance(facts,dict):return dict(status='INVALID',cards=[])
 missing=[k for k in ('age','nationality','residency') if facts.get(k) is None]
 if missing:return dict(status='NEEDS_INPUT',cards=[],questions=missing)
 if type(facts['age']) is not int:return dict(status='INVALID',cards=[])
 if facts['age']<19 or facts['nationality']!='KR' or facts['residency']!='KR':return dict(status='NEEDS_ONBOARDING_REVIEW',cards=[])
 balances=p.get('bank_balances',{})
 if not isinstance(balances,dict) or any(type(x) is not int or x<0 for x in balances.values()):return dict(status='INVALID',cards=[])
 if type(p.get('protected_only',True)) is not bool or type(p.get('bank_balances_complete',False)) is not bool:return dict(status='INVALID',cards=[])
 if p.get('bank_policy')=='existing_only' and not isinstance(p.get('existing_bank_ids'),list):return dict(status='NEEDS_INPUT',cards=[],questions=['existing_bank_ids'])
 candidates=[];questions=set()
 for r in json.loads((R/'liquid_rules.json').read_text()):
  if r.get('maximum') and p['liquid_amount']>r['maximum']:continue
  if r['sector'] not in p['sectors'] or not set(r['channels'])&set(p['channels']):continue
  if p.get('bank_policy')=='existing_only' and r['bank_id'] not in p['existing_bank_ids']:continue
  if r['single'] and r['product_id'] in p.get('held_product_ids',[]):continue
  interest=Decimal(p['liquid_amount'])*Decimal(str(r['rate']))/100*p['liquid_days']/365
  b=balances.get(r['bank_id'],0 if p.get('bank_balances_complete') is True else None)
  if p.get('protected_only',True):
   if b is None:questions.add('bank_balance.'+r['bank_id']);continue
   if b+p['liquid_amount']+math.ceil(interest)>100000000:continue
  candidates.append(dict(product_id=r['product_id'],option_id=r['option_id'],institution=r['institution'],name=r['name'],rate=r['rate'],interest_estimate=int(interest-int(interest*Decimal('.154'))),source_url=r['source_url'],source_hash=r['source_hash']))
 candidates.sort(key=lambda x:(-x['interest_estimate'],x['product_id']))
 cards=candidates[:3]
 for i,x in enumerate(cards):
  x['role']='추천' if i==0 else f'대안 {i}'
  x['why']=['선택한 금융권과 가입방법에 맞아요.','납입일이나 만기를 기다리지 않고 꺼내 쓸 돈으로 비교했어요.','추가 우대조건 없이 공시된 금리로 같은 금액과 기간을 비교했어요.']
 return dict(status='NEEDS_ANSWERS' if questions else 'COMPARISON' if cards else 'NO_MATCH',cards=cards,questions=sorted(questions),full_catalog_optimum=False,notice='현재 공시금리와 같은 잔액이 유지된다는 단리 비교 추정. 입출금상품 금리는 변동되며 실제 지급주기·세금 절사에 따라 달라집니다.')
