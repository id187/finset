"""Generate golden cases from the retained Python evaluators, never from JS."""
import copy
import itertools
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import condition_db
import server

conditions = []
for product in condition_db.catalog()['products']:
    values = []
    for q in product['questions']:
        threshold = (product['term'] + 1) // 2
        values.append([None, 0, threshold - 1, threshold, product['term']] if q['type'] == 'number' else [None, False, True])
    for items in itertools.product(*values):
        answers = dict(zip([q['key'] for q in product['questions']], items))
        conditions.append({'option_id': product['option_id'], 'answers': answers, 'expected': condition_db.evaluate_answers(product['option_id'], answers)})

plan = {'id': 'demo-plan', 'revision': 2, 'as_of': '2027-01-11', 'goal_date': '2027-09-11', 'goal_amount': 3600000,
        'principal': 1200000, 'history_complete': True, 'contract': {'maturity': '2027-09-11'},
        'future_payments': [{'date': f'2027-{m:02}-11', 'amount': 300000} for m in range(1, 9)]}
recovery = []


def add(label, p=None, change=None):
    p = copy.deepcopy(plan if p is None else p)
    change = change or {'kind': 'temporary', 'amount': 100000}
    recovery.append({'label': label, 'plan': p, 'change': change, 'expected': server.project_recovery(p, change)})


for kind, amount in itertools.product(['temporary', 'persistent'], [0, 100000, 300000, 400000, -1, 1.5, True]):
    add(f'{kind} {amount}', change={'kind': kind, 'amount': amount})
for amount, cash in itertools.product([0, 100000, 500000], [0, 200000, 500000]):
    add(f'emergency {amount} cash {cash}', change={'kind': 'emergency', 'amount': amount, 'free_cash': cash})
for label, override in [
    ('incomplete history', {'history_complete': False}),
    ('empty schedule', {'future_payments': []}),
    ('past goal', {'goal_date': '2027-01-10'}),
    ('goal before maturity', {'goal_date': '2027-06-11'}),
    ('past maturity', {'contract': {'maturity': '2027-01-10'}}),
    ('duplicate schedule', {'future_payments': [plan['future_payments'][0]] * 2}),
    ('maturity-day payment', {'future_payments': [{'date': '2027-09-11', 'amount': 300000}]}),
    ('past payment', {'future_payments': [{'date': '2027-01-10', 'amount': 300000}]}),
    ('invalid principal', {'principal': -1}),
    ('zero goal', {'goal_amount': 0}),
]:
    add(label, {**plan, **override})
for label, contract in [
    ('flexible', {'payment_flexible': True}),
    ('partial allowed', {'partial_withdrawal': {'allowed': True, 'remaining_minimum': 100000, 'max_count': 2}, 'withdrawals_used': 0}),
    ('partial unknown', {'partial_withdrawal': {'allowed': True}}),
    ('partial exhausted', {'partial_withdrawal': {'allowed': True, 'remaining_minimum': 100000, 'max_count': 2}, 'withdrawals_used': 2}),
]:
    add(label, {**plan, 'contract': {**plan['contract'], **contract}}, {'kind': 'emergency', 'amount': 500000, 'free_cash': 0})

target = ROOT / 'tests/fixtures/pages-parity.json'
target.parent.mkdir(exist_ok=True)
target.write_text(json.dumps({'conditions': conditions, 'recovery': recovery}, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print(f'Exported Python parity cases: {len(conditions)} condition / {len(recovery)} recovery')
