"""Export only public product results for every selectable Pages demo case.

Run locally with the original read-only package. CI builds from these snapshots;
neither the original DB nor the full derived DB is needed or published.
"""
import copy
import hashlib
import itertools
import json
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import server
import condition_db

OUT = ROOT / 'public/demo'
MONTHLY = [50000, 100000, 200000, 300000, 500000]
GOALS = [1000000, 3000000, 3600000, 5000000, 10000000]
TERMS = [6, 12, 24, 36, 60]
STARTS = ['2026-09-11', '2027-01-11']
RULES = None


def initialize():
    global RULES
    RULES = json.loads((server.DATA / 'finset_recommendation/rules.json').read_text(encoding='utf-8'))


def export_pair(pair):
    monthly, goal = pair
    cases = {}
    for months, sector, start, scenario in itertools.product(TERMS, ['bank', 'all'], STARTS, ['base', 'unknown']):
        profile = copy.deepcopy(server.BASE)
        profile.update(monthly=monthly, goal_amount=goal, start_date=start,
                       goal_date=server.month(date.fromisoformat(start), months).isoformat(),
                       sectors=['bank'] if sector == 'bank' else ['bank', 'savings_bank'])
        if scenario == 'unknown':
            profile['facts'] = {k: v for k, v in profile.get('facts', {}).items() if k in ('age', 'nationality', 'residency')}
        raw = server.recommend(profile, RULES)
        # Explicit output allowlist: no profile facts, account identifiers or DB rows.
        result = {k: raw[k] for k in ('status', 'cards', 'reason', 'provisional', 'questions', 'goal_projection_notice') if k in raw}
        result.update(question_cards=server.render(raw.get('questions', [])), demo=True,
                      profile_summary={key: profile[key] for key in ('start_date', 'goal_date', 'monthly', 'goal_amount', 'reserve', 'sectors')})
        cases['|'.join(map(str, [months, sector, start, scenario]))] = result
    return f'{monthly}-{goal}.json', cases


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8', newline='\n')


if __name__ == '__main__':
    condition_db.build()
    source_hash = condition_db.digest(server.source.DB)
    inventory = server.source.inventory()
    catalog = condition_db.catalog()
    with condition_db.connect_derived() as connection:
        for product in catalog['products']:
            row = connection.execute('SELECT parsed_rule_json FROM rule_options WHERE option_id=?', (product['option_id'],)).fetchone()
            rule = json.loads(row[0])
            product['rule'] = {k: rule[k] for k in ('base_rate', 'bonus', 'bonus_cap') if k in rule}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'recommendations').mkdir(exist_ok=True)
    bundles = {}
    with ProcessPoolExecutor(max_workers=4, initializer=initialize) as pool:
        jobs = [pool.submit(export_pair, pair) for pair in itertools.product(MONTHLY, GOALS)]
        for index, future in enumerate(as_completed(jobs), 1):
            name, cases = future.result()
            path = OUT / 'recommendations' / name
            write(path, cases)
            bundles[name] = hashlib.sha256(path.read_bytes()).hexdigest()
            print(f'Exported {index}/25 bundles ({len(cases)} cases each)', flush=True)
    assert source_hash == condition_db.digest(server.source.DB), 'Original DB changed'
    write(OUT / 'catalog.json', {
        'version': 1,
        'source': {'products': len(inventory), 'institutions': len({p['institution'] for p in inventory}),
                   'snapshot': '2026년 8월', 'verified': True, 'read_only': True, 'mode': 'published_snapshot'},
        'conditions': catalog,
        'inputs': {'monthly': MONTHLY, 'goals': GOALS, 'months': TERMS, 'starts': STARTS},
        'provenance': {'source_sha256': source_hash, 'cases': 1000, 'bundles_sha256': dict(sorted(bundles.items())),
                       'notice': '기존 Python 추천 엔진의 가상 사례 결과입니다. 원본 DB 및 전체 규칙은 공개 파일에 포함하지 않습니다.'}
    })
    print('Done: 1,000 original-engine results, 9 question rules; original DB hash preserved.', flush=True)
