"""Native response digests and independent exhaustive ranking for refine policy.

The candidate calculation is deliberately the original engine. Combination
enumeration and top-three ordering are independent of its plan search.
"""
import copy
import hashlib
import itertools
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import core_runtime as core
import recommendation_policy as policy


def normalized(value):
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, dict):
        return {k: normalized(v) for k, v in value.items()}
    if isinstance(value, list):
        return [normalized(v) for v in value]
    return value


def digest(value):
    return hashlib.sha256(json.dumps(normalized(value), sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


engine, source, _, _, rules, _, _ = core.runtime()
from calculator import month
before = source.sha()
replay = json.loads((ROOT / 'public/demo/mvp2.json').read_text(encoding='utf-8'))
responses = {}
for key in replay['snapshots']:
    case, preference, intent = key.split('|')
    answers = {}
    if preference != 'default': answers['contribution_preference'] = json.loads(preference)
    if intent != 'default': answers['bonus_intent.kakao.auto_transfer'] = json.loads(intent)
    responses[key] = digest(core.execute({'case_id': case, 'answers': answers}))
(ROOT / 'tests/fixtures/refine-responses.json').write_text(json.dumps({'policy_version': policy.VERSION, 'sha256': responses}, indent=2) + '\n', encoding='utf-8')

rows = []
for months, (cash, monthly), preference, auto in itertools.product([6,12,18,60], [(0,300000),(5000000,0),(3000000,300000)], ['fixed_ok','adjustable'], [False,True]):
    p = dict(start_date='2026-09-15', goal_date=month(date(2026,9,15),months).isoformat(), goal_amount=10000000,
             cash=cash,reserve=0,monthly=monthly,income_pattern='steady',fund_type='personal',sectors=['bank'],
             channels=['mobile','web'],withdrawal_need='none',high_interest_debt=False,holdings_complete=True,
             bank_balances_complete=True,reserve_confirmed=True,held_product_ids=[],bank_balances={},
             facts={'age':25,'nationality':'KR','residency':'KR','kakao.renewed_principal':False},
             contribution_preference=preference,bonus_intents={'auto_transfer':auto,'extra_transactions':False})
    prepared = policy.prepare(p, rules, engine)
    calc = copy.deepcopy(prepared['profile'])
    if preference == 'adjustable': calc['flexible_only'] = True
    budget = prepared['budget']
    bucket = {'saving': [], 'deposit': []}
    for rule in prepared['rules']:
        candidate = engine.candidate(rule, calc, budget)
        if candidate and candidate['eligibility_confirmed']: bucket[candidate['kind']].append(candidate)
    combos = itertools.product(bucket['deposit'],bucket['saving']) if cash and monthly else ((x,) for x in bucket['deposit']+bucket['saving'])
    best, count = {}, 0
    for combo in combos:
        totals = dict(p['bank_balances'])
        for x in combo: totals[x['bank_id']] = totals.get(x['bank_id'],0) + x['gross_balance_ceiling']
        if any(x > engine.POLICY['protection_limit'] for x in totals.values()): continue
        count += 1
        total = budget['total_principal'] + sum(x['net_interest'] for x in combo)
        shortfall = max(0,p['goal_amount']-total)
        key = (shortfall>0,sum(x['risk'] for x in combo),shortfall,-total,tuple(x['option_id'] for x in combo))
        identity = tuple(x['product_id'] for x in combo)
        if identity not in best or key < best[identity]: best[identity] = key
    expected = [x[-1] for x in sorted(best.values())[:3]]
    result = policy.recommend(p,rules,engine)
    actual = [tuple(x['option_id'] for x in card['products']) for card in result.get('cards',[])]
    rows.append(dict(months=months,cash=cash,monthly=monthly,preference=preference,auto=auto,enumerated=count,
                     expected=expected,actual=actual,match=expected==actual,status=result['status']))
report = dict(policy_version=policy.VERSION, scope='Original candidate formulas; independent exhaustive combinations and ordering. Bank scope, adult Korean resident, 48 input combinations; not a claim about every real-world product.',
              cases=len(rows),failures=[r for r in rows if not r['match']],source_sha256=before,rows=rows)
(ROOT / 'tests/fixtures/refine-ranking.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
assert source.sha() == before
assert not report['failures'], report['failures']
print(f'{len(responses)} native digests; {len(rows)} exhaustive rankings matched; source unchanged')
