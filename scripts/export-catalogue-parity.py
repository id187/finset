"""Independent Python Decimal references for every published rate/model/term."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import condition_db
from calculator import project

data = json.loads((ROOT / 'public/demo/full-catalogue.json').read_text(encoding='utf-8'))
before = condition_db.digest(condition_db.source.DB)
cases = {}
for group in data['groups']:
    for rule in group['options']:
        for amount in [1, 10000, 171237, 300000, 1000000]:
            for rate in {rule['base_rate'], rule['max_rate']}:
                key = f"{amount}|{rule['term']}|{rate:g}|{rule['model']}"
                if key not in cases:
                    p = project('saving', amount, rule['term'], rate, rule['model'], .154, data['start'])
                    cases[key] = {k: p[k] for k in ['principal', 'net_interest', 'gross_balance_ceiling']}
assert before == condition_db.digest(condition_db.source.DB)
(ROOT / 'tests/fixtures/catalogue-parity.json').write_text(json.dumps({'start': data['start'], 'cases': cases}, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print(f'{len(cases)} unique Python references cover all {data["report"]["comparison_options"]} published options')
