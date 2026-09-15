"""Generate full native-Python expectations for arbitrary browser inputs."""
import copy
import json
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import core_runtime as core

base = dict(start_date='2026-09-15', goal_date='2027-09-15', goal_amount=3600000,
            budget_basis='available_after_expenses', available_now=0,
            available_amounts_confirmed=True, monthly=300000, income_pattern='steady',
            fund_type='personal', sectors=['bank'], channels=['mobile','web'],
            withdrawal_need='none', high_interest_debt=False, holdings_complete=True,
            bank_balances_complete=True, held_product_ids=[], bank_balances={},
            facts={'age':25,'nationality':'KR','residency':'KR','kakao.renewed_principal':False})
cases = []
for name, patch, answers in [
    ('unlisted-monthly-370000', {'monthly':370000}, {}),
    ('cash-5270000-monthly-zero', {'available_now':5270000,'monthly':0}, {}),
    ('mixed-amount-1730000-410000', {'available_now':1730000,'monthly':410000}, {}),
    ('variable-60-month', {'goal_date':'2031-09-15','income_pattern':'variable','low_month_capacity':190000}, {}),
    ('18-month', {'goal_date':'2028-03-15'}, {}),
    ('short-liquid-term', {'goal_date':'2026-09-23','available_now':4000000}, {'age':None}),
    ('unknown-bonus', {}, {'bonus_intent.kakao.auto_transfer':None}),
    ('declined-bonus', {}, {'bonus_intent.kakao.auto_transfer':False}),
    ('compare-not-consent', {}, {'contribution_preference':'compare'}),
    ('no-budget', {'monthly':0}, {}),
]:
    p = copy.deepcopy(base); p.update(patch)
    request = {'profile':p, 'answers':answers}
    cases.append({'name':name,'request':request,'expected':core.execute(request)})
for name, request in [('mixed-budget',{'profile':dict(base,cash=100)}),
                      ('invalid-monthly',{'profile':dict(base,monthly=True)}),
                      ('invalid-case',{'case_id':'999'})]:
    try:
        core.execute(request)
        raise AssertionError('Expected validation failure')
    except ValueError as e:
        cases.append({'name':name,'request':request,'error':str(e)})
(ROOT/'tests/fixtures').mkdir(exist_ok=True)
(ROOT/'tests/fixtures/browser-core.json').write_text(json.dumps(cases,ensure_ascii=False),encoding='utf-8')
print(f'Generated {len(cases)} native Python expectations')
