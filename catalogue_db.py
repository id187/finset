"""Audit every source row and publish traceable, conservative comparison data.

The original SQLite database, v1 derived database and original rule files are
immutable inputs. A new content-addressed audit database stores this revision.
"""
import collections
import hashlib
import json
import math
import re
import sqlite3
from pathlib import Path

import condition_db as original

ROOT = Path(__file__).resolve().parent
VERSION = 'catalogue-2.0'


def normalized(text):
    return re.sub(r'\s+', ' ', text or '').strip()


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')


def parse_bonus(text, rule):
    """Full clauses only. A source change invalidates the executable mapping."""
    parsed = original.parse_source(text, rule['term'])
    if parsed:
        questions = parsed.pop('questions')
        return [parsed], questions, 'full_clause'
    text = normalized(text)
    if re.fullmatch(r'하나은행 통장에서 계약기간의 1/2이상 월부금 자동이체실적 충족 시 연 0\.50%', text):
        return [{'id': 'auto_transfer', 'rate': .5, 'when': {'all': [
            {'eq': ['hana.account', True]}, {'gte': ['hana.auto_months_before_maturity', math.ceil(rule['term'] / 2)]},
            {'eq': ['contract.hold_to_maturity', True]}]}}], [
            {'key': 'hana.account', 'title': '하나은행 입출금통장에서 자동이체할 수 있나요?', 'type': 'boolean'},
        ], 'full_clause'
    if re.fullmatch(r'추가우대금리 : 당행 계좌간 자동이체를 통해 6회이상 입금한 경우 연 0\.1% 금리우대', text):
        return [{'id': 'jb_own_account_auto_6_times', 'rate': .1, 'when': {'all': [
            {'eq': ['jb.own_account', True]}, {'gte': ['jb.auto_months', 6]},
            {'eq': ['contract.hold_to_maturity', True]}]}}], [
            {'key': 'jb.own_account', 'title': '전북은행 본인 계좌에서 자동이체할 수 있나요?', 'type': 'boolean'},
        ], 'full_clause'
    if not rule['bonus'] and rule['base_rate'] == rule['max_rate']:
        if text in ('없음', '-', '해당없음', '해당사항 없음', '우대조건 없음'):
            return [], [], 'no_bonus_clause'
        if text == '인터넷뱅킹 전용상품':
            return [], [], 'digital_channel_clause'
        if text == '*만기후 1개월 이내 : 만기시점 동일상품 동일계약기간의 신규약정금리 *만기후 1개월 초과 :보통예금이율':
            return [], [], 'post_maturity_clause'
    return None


def audit_connection(path):
    before = original.digest(path)
    with sqlite3.connect(path.resolve().as_uri() + '?mode=ro&immutable=1', uri=True) as c:
        c.execute('PRAGMA query_only=ON')
        integrity = [row[0] for row in c.execute('PRAGMA integrity_check')]
        foreign = list(c.execute('PRAGMA foreign_key_check'))
        tables = [row[0] for row in c.execute("SELECT name FROM sqlite_master WHERE type='table'")]
        counts = {t: c.execute('SELECT count(*) FROM "' + t.replace('"', '""') + '"').fetchone()[0] for t in tables}
    if before != original.digest(path):
        raise RuntimeError('Input database changed: ' + path.name)
    if integrity != ['ok'] or foreign:
        raise RuntimeError('Database integrity failure: ' + path.name)
    return {'name': path.name, 'sha256': before, 'integrity': 'ok', 'foreign_key_errors': len(foreign), 'tables': counts, 'preserved': True}


def build():
    # source.connect enforces the fixed original SHA256 and read-only connection.
    with original.source.connect() as c:
        products = {r['id']: dict(r) for r in c.execute('SELECT * FROM products')}
        options = {r['id']: dict(r) for r in c.execute('SELECT * FROM rate_options')}
        fragments = [dict(r) for r in c.execute('SELECT * FROM condition_fragments')]
        checks = [dict(r) for r in c.execute('SELECT * FROM collection_checks')]
    inputs = [original.source.DB, original.OUT]
    db_checks = [audit_connection(p) for p in inputs if p.exists()]
    rule_path = original.DATA / 'finset_recommendation/rules.json'
    liquid_path = original.DATA / 'finset_recommendation/liquid_rules.json'
    hashes = {p.name: original.digest(p) for p in [*inputs, rule_path, liquid_path] if p.exists()}
    rules = json.loads(rule_path.read_text(encoding='utf-8'))
    liquid = json.loads(liquid_path.read_text(encoding='utf-8'))
    if original.OUT.exists():
        with original.connect_derived() as c:
            copied = list(c.execute('SELECT * FROM source_products'))
            if len(copied) != len(products): raise RuntimeError('Derived product coverage differs')
            for row in copied:
                p = products[row['product_id']]
                if row['source_text'] != (p['bonus_conditions'] or '') or row['text_sha256'] != hashlib.sha256(row['source_text'].encode()).hexdigest():
                    raise RuntimeError('Derived source clause does not match original')
            for row in c.execute('SELECT * FROM text_fragments'):
                text = products[row['product_id']]['bonus_conditions'] or ''
                if text[row['start_offset']:row['end_offset']] != row['raw_text']: raise RuntimeError('Derived fragment offset mismatch')
            legacy = {r['option_id']: r for r in rules}
            for row in c.execute('SELECT option_id,legacy_rule_json FROM rule_options'):
                if json.loads(row['legacy_rule_json']) != legacy[row['option_id']]: raise RuntimeError('Derived legacy rule mismatch')
    by_product = collections.defaultdict(list)
    issues = collections.defaultdict(set)
    option_audit = []
    for pid, p in products.items():
        if p['detail_status'] != 'ok': issues[pid].add('collection_error')
        if not p['name'] or not p['institution'] or not p['source_url']: issues[pid].add('missing_identity_or_source')
        for field in ('metadata_json', 'raw_json'):
            try: json.loads(p[field])
            except (ValueError, TypeError): issues[pid].add('invalid_' + field)
    for oid, o in options.items():
        problems = []
        if o['product_id'] not in products: problems.append('orphan_product')
        try:
            parsed = json.loads(o['option_json'])
            if not isinstance(parsed, dict): raise ValueError()
        except (ValueError, TypeError): parsed = {}; problems.append('invalid_option_json')
        for field in ('base_rate', 'advertised_max_rate'):
            value = o[field]
            if value is None: problems.append('missing_' + field)
            elif not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0: problems.append('invalid_' + field)
        if isinstance(o['base_rate'], (int, float)) and isinstance(o['advertised_max_rate'], (int, float)) and o['base_rate'] > o['advertised_max_rate']:
            problems.append('rate_order')
        option_audit.append((oid, o['product_id'], problems))
        by_product[o['product_id']].append(o)
        o['_parsed'] = parsed; o['_issues'] = problems
    for row in fragments:
        if row['product_id'] not in products: raise RuntimeError('Orphan condition fragment')
    for row in checks: json.loads(row['value_json'])
    grouped = collections.defaultdict(list)
    rule_audit = []
    bonus_ready = set()
    reason_counts = collections.Counter()
    for rule in rules:
        pid, oid = rule['product_id'], rule['option_id']
        p, o = products.get(pid), options.get(oid)
        reasons = []
        if not p or not o or o['product_id'] != pid: reasons.append('source_link_error')
        elif o['_issues'] or issues[pid]: reasons.append('source_data_issue')
        else:
            if o['base_rate'] != rule['base_rate'] or o['advertised_max_rate'] != rule['max_rate']:
                reasons.append('source_rate_mismatch')
            if str(o['_parsed'].get('term_months')) != str(rule['term']): reasons.append('source_term_mismatch')
        if rule['kind'] != 'saving': reasons.append('not_monthly_saving')
        if not set(rule['channels']) & {'mobile', 'web'}: reasons.append('not_digital')
        if rule['model'] not in ('simple_monthly', 'simple_actual365'): reasons.append('model_review')
        if rule.get('additional_cost') or rule.get('requires_cost_confirmation'): reasons.append('cost_review')
        if rule.get('aggregate'): reasons.append('combined_limit_review')
        # Only standard adult eligibility or the explicitly reviewed Code K/Toss
        # account conditions may enter the mock profile's executable scope.
        basic = {'all': [{'gte': ['age', 19]}, {'eq': ['nationality', 'KR']}, {'eq': ['residency', 'KR']}]}
        eligibility_ok = rule['eligibility'] == basic or rule['name'] in ('코드K 자유적금', '토스뱅크 자유 적금')
        if not eligibility_ok: reasons.append('eligibility_review')
        parsed = parse_bonus(p['bonus_conditions'], rule) if p else None
        if rule['name'] == '코드K 자유적금' and rule['base_rate'] == rule['max_rate']:
            parsed = ([], [], 'base_only_code_not_assumed')
        if parsed is None: reasons.append('bonus_clause_review')
        elif abs(sum(b['rate'] for b in parsed[0]) - (rule['max_rate'] - rule['base_rate'])) > 1e-7:
            reasons.append('bonus_rate_mismatch')
        rule_audit.append((oid, pid, reasons))
        if reasons:
            reason_counts.update(set(reasons)); continue
        bonus, questions, basis = parsed
        if bonus: bonus_ready.add(pid)
        grouped[pid].append({**rule, 'bonus': bonus, 'questions': questions, 'bonus_basis': basis})
    reasons_by_product = collections.defaultdict(set)
    for _, pid, reasons in rule_audit: reasons_by_product[pid].update(reasons)
    inventory = []
    for pid, p in products.items():
        rates = by_product[pid]
        ready = grouped.get(pid, [])
        bad_options = sum(bool(o['_issues']) for o in rates)
        status = 'source_issue' if issues[pid] else 'comparison_ready' if ready else 'review_required' if p['product_type'] == 'saving' else 'browse_only'
        inventory.append({'id': pid, 'name': p['name'], 'institution': p['institution'], 'kind': p['product_type'],
                          'status': status, 'options': len(rates), 'ready_options': len(ready), 'option_issues': bad_options,
                          'issues': sorted(issues[pid]), 'bonus': p['bonus_conditions'] or '', 'eligibility': p['eligibility'] or '',
                          'notes': p['notes'] or '', 'source_url': p['source_url'], 'product_url': p['product_url'],
                          'collected_at': p['collected_at'], 'source_updated': p['source_updated'],
                          'base_min': min((o['base_rate'] for o in rates if isinstance(o['base_rate'], (int, float))), default=None),
                          'base_max': max((o['base_rate'] for o in rates if isinstance(o['base_rate'], (int, float))), default=None),
                          'reasons': sorted(reasons_by_product[pid]) if not ready else []})
    report = {'version': VERSION, 'snapshot': '2026년 8월', 'databases': db_checks, 'input_hashes': hashes,
              'source_products': len(products), 'rate_options': len(options), 'condition_fragments': len(fragments),
              'legacy_rule_options': len(rules), 'liquid_rules_checked': len(liquid),
              'comparison_products': len(grouped), 'comparison_options': sum(map(len, grouped.values())),
              'bonus_question_products': len(bonus_ready),
              'statuses': dict(collections.Counter(p['status'] for p in inventory)),
              'option_issue_counts': dict(collections.Counter(reason for _, _, reasons in option_audit for reason in reasons)),
              'rule_exclusion_counts': dict(reason_counts), 'source_preserved': True,
              'notice': '전체 행의 구조·참조·수집 상태·금리·규칙 연결을 검사했습니다. 수집 시점의 비교이며 현재 판매·가입 승인·모든 약관 해석 완료를 뜻하지 않습니다.'}
    for rule in liquid:
        if rule['product_id'] not in products: raise RuntimeError('Liquid rule source missing')
        if not math.isfinite(rule['rate']) or rule['rate'] < 0: raise RuntimeError('Invalid liquid rate')
        if rule.get('source_hash_basis') == 'raw_json' and hashlib.sha256(products[rule['product_id']]['raw_json'].encode()).hexdigest() != rule['source_hash']:
            raise RuntimeError('Liquid rule source hash mismatch')
    public = ROOT / 'public/demo'
    common = ['product_id', 'bank_id', 'institution', 'name', 'sector', 'kind', 'channels', 'eligibility', 'single', 'source_url']
    option_fields = ['option_id', 'term', 'minimum', 'maximum', 'base_rate', 'max_rate', 'bonus', 'bonus_cap', 'model', 'model_basis', 'flexible', 'questions', 'bonus_basis']
    groups = []
    for pid, rs in grouped.items():
        p = products[pid]
        groups.append({**{k: rs[0][k] for k in common}, 'source_text': p['bonus_conditions'], 'eligibility_text': p['eligibility'],
                       'notes': p['notes'], 'product_url': p['product_url'], 'options': [{k: r[k] for k in option_fields} for r in rs]})
    catalogue = {'version': 2, 'start': '2026-09-14', 'months': [6, 12, 24, 36, 60], 'monthly': [100000, 200000, 300000, 500000, 1000000],
                 'comparison_limit': 100000000, 'groups': groups, 'report': report}
    signature = hashlib.sha256((json.dumps(hashes, sort_keys=True) + Path(__file__).read_text(encoding='utf-8')).encode()).hexdigest()[:12]
    db_path = ROOT / 'app_data' / ('catalogue_audit_v2_' + signature + '.sqlite3')
    if not db_path.exists():
        with sqlite3.connect(db_path) as c:
            c.executescript('CREATE TABLE product_audit(product_id TEXT PRIMARY KEY,status TEXT,record_json TEXT); CREATE TABLE option_audit(option_id INTEGER PRIMARY KEY,product_id TEXT,issues_json TEXT); CREATE TABLE rule_audit(option_id INTEGER PRIMARY KEY,product_id TEXT,issues_json TEXT); CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT);')
            c.executemany('INSERT INTO product_audit VALUES(?,?,?)', [(p['id'], p['status'], original.encode(p)) for p in inventory])
            c.executemany('INSERT INTO option_audit VALUES(?,?,?)', [(oid, pid, original.encode(reasons)) for oid, pid, reasons in option_audit])
            c.executemany('INSERT INTO rule_audit VALUES(?,?,?)', [(oid, pid, original.encode(reasons)) for oid, pid, reasons in rule_audit])
            c.execute('INSERT INTO metadata VALUES(?,?)', ('report', original.encode(report)))
    report['audit_database'] = audit_connection(db_path)
    for p in [*inputs, rule_path, liquid_path]:
        if p.exists() and original.digest(p) != hashes[p.name]: raise RuntimeError('Input changed during audit')
    write_json(public / 'full-catalogue.json', catalogue)
    write_json(public / 'inventory.json', {'report': report, 'products': inventory})
    write_json(public / 'audit-report.json', report)
    return report


if __name__ == '__main__':
    print(json.dumps(build(), ensure_ascii=False, indent=2))
