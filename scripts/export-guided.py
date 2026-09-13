"""Publish a small reviewed comparison scope and original-calculator outputs.

No fixture person or assumed personal responses are exported. The original DB
and rules stay unchanged. Parsed clauses come from the separate condition DB.
"""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import condition_db
import server
from calculator import project
from engine import POLICY

START = '2027-01-11'
MONTHLY = [50000, 100000, 200000, 300000, 500000]


def scoped_rules():
    rules = json.loads((server.DATA / 'finset_recommendation/rules.json').read_text(encoding='utf-8'))
    selected = [r for r in rules if r['name'] == '코드K 자유적금']
    with condition_db.connect_derived() as connection:
        selected += [json.loads(row[0]) for row in connection.execute("SELECT parsed_rule_json FROM rule_options WHERE review_status='question_ready' ORDER BY option_id")]
    assert len(selected) == 13 and len({r['product_id'] for r in selected}) == 3
    assert all(r['kind'] == 'saving' and r['sector'] == 'bank' and r['flexible'] and r['channels'] == ['mobile'] for r in selected)
    assert all(not r.get('requires_cost_confirmation') and not r.get('additional_cost') and not r.get('aggregate') for r in selected)
    assert all(len(r['bonus']) <= 1 and not any('exclusive_group' in b for b in r['bonus']) for r in selected)
    return selected


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8', newline='\n')


if __name__ == '__main__':
    before = condition_db.digest(server.source.DB)
    source_rules = scoped_rules()
    rules, projections = [], {}
    fields = ['product_id', 'option_id', 'bank_id', 'institution', 'name', 'term', 'minimum', 'maximum', 'single', 'base_rate', 'max_rate', 'eligibility', 'bonus', 'bonus_cap', 'model', 'model_basis', 'source_url', 'source_hash']
    for rule in source_rules:
        rules.append({k: rule[k] for k in fields})
        for monthly in MONTHLY:
            for rate in sorted({rule['base_rate'], rule['max_rate']}):
                projections[f"{rule['option_id']}|{monthly}|{rate:.2f}"] = project('saving', monthly, rule['term'], rate, rule['model'], POLICY['tax_rate'], START)
    write(ROOT / 'public/demo/guided.json', {
        'version': 1, 'start': START, 'monthly': MONTHLY, 'months': [6, 12, 24, 36, 60],
        'rules': rules, 'projections': projections, 'protection_limit': POLICY['protection_limit'],
        'provenance': {'source_sha256': before, 'scope': '3 previously connected mobile savings products / 13 term options',
                       'rules_sha256': hashlib.sha256(json.dumps(source_rules, sort_keys=True).encode()).hexdigest(),
                       'snapshot': '2026년 8월', 'notice': '수집 시점의 상품·계산 가정입니다. 현재 약관·금리 및 금융사 가입 승인은 별도 확인합니다.'}
    })
    assert before == condition_db.digest(server.source.DB)
    print(f'Exported {len(rules)} scoped rules and {len(projections)} original Python projections. Source unchanged.')
