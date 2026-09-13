"""Versioned derived DB. Never write to the original DB or recommendation rules.

Unrestricted text extraction produces review candidates, never executable rules.
Only tightly matched source templates become question-ready; legacy ASTs remain
separately labelled and retain AND/OR, caps, exclusivity and source evidence.
"""
import hashlib
import json
import math
import os
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('FINSET_DATA_DIR', str(ROOT.parent / 'mvp' / '핀셋_MVP_팀원전달')))
OUT = ROOT / 'app_data' / 'bonus_conditions_v1.sqlite3'
sys.path.insert(0, str(DATA / 'finset_recommendation'))
import source
from conditions import bonus, evaluate

VERSION = 'conservative-parser-1.0'
def encode(x): return json.dumps(x, ensure_ascii=False, sort_keys=True)
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_source(text, term):
    """Full-match supported clauses; unconsumed words cause manual review.

    Rates are percentage points. Terms are never inferred from a marketing name.
    No negation, exclusion, event, N-of-M, tiers or compound connector is discarded.
    """
    normalized = re.sub(r'\s+', ' ', text).strip()
    kakao = re.fullmatch(r'자동이체시 우대금리 제공\s*:\s*연\s*([0-9.]+)%p\s*-\s*제공조건\s*:\s*전체 계약월수의 1/2이상을 자동이체로 납입하고 만기 해지하는 경우\s*-\s*유의사항\s*:\s*만기 자동연장된 원리금은 우대금리를 제공하지 않음', normalized)
    if kakao:
        rate = float(kakao.group(1))
        return {'id': 'auto_transfer', 'rate': rate, 'when': {'all': [
            {'gte': ['kakao.auto_months', math.ceil(term / 2)]},
            {'eq': ['kakao.renewed_principal', False]},
            {'eq': ['contract.hold_to_maturity', True]}]}, 'questions': [
                {'key': 'kakao.auto_months', 'title': f'계약 {term}개월 중 자동이체로 납입할 개월 수는 얼마인가요? (최소 {math.ceil(term / 2)}개월)', 'type': 'number', 'unit': '개월', 'maximum': term},
                {'key': 'kakao.renewed_principal', 'title': '이번 비교 금액에 만기 자동연장된 원리금이 해당하나요?', 'type': 'boolean'},
                {'key': 'contract.hold_to_maturity', 'title': '중도해지 없이 만기에 해지할 계획인가요?', 'type': 'boolean'}]}
    toss = re.fullmatch(r'·\s*적금 가입 시 설정되는 월 단위 자동이체를 모두 성공하는 경우\s*:\s*연\s*([0-9.]+)%\s*제공', normalized)
    if toss:
        return {'id': 'auto_transfer', 'rate': float(toss.group(1)), 'when': {'all': [
            {'eq': ['toss.original_monthly_schedule', True]},
            {'eq': ['toss.all_transfers', True]}]}, 'questions': [
                {'key': 'toss.original_monthly_schedule', 'title': '가입할 때 설정되는 월 단위 자동이체를 이용할 계획인가요?', 'type': 'boolean'},
                {'key': 'toss.all_transfers', 'title': '설정된 월 단위 자동이체를 한 번도 빠짐없이 성공할 수 있나요?', 'type': 'boolean'}]}
    return None


def leaves(expr, path='root'):
    if isinstance(expr, bool): return []
    if not isinstance(expr, dict) or len(expr) != 1: return []
    op, value = next(iter(expr.items()))
    if op in ('eq', 'gte', 'lte', 'in'):
        return [{'path': path, 'operator': op, 'fact_key': value[0], 'target': value[1]}]
    if op == 'not': return leaves(value, path + '.not')
    if op == 'at_least': value = value[1]
    if op not in ('all', 'any', 'at_least'): return []
    return [leaf for i, child in enumerate(value) for leaf in leaves(child, f'{path}.{op}.{i}')]


def fragments(text):
    """Preserve offsets and entire original text. Segments are review aids only."""
    return [{'start': m.start(), 'end': m.end(), 'text': m.group(0), 'status': 'needs_review'}
            for m in re.finditer(r'[^\r\n]+', text) if m.group(0).strip()]


def build():
    original = digest(source.DB)
    lock = json.loads((DATA / 'finset_recommendation/source_lock.json').read_text(encoding='utf-8'))
    if original != lock['sha256']: raise RuntimeError('Original source hash mismatch')
    rules_path = DATA / 'finset_recommendation/rules.json'
    rules_hash = digest(rules_path)
    if OUT.exists():
        with sqlite3.connect(f'{OUT.as_uri()}?mode=ro', uri=True) as c:
            meta = dict(c.execute('SELECT key,value FROM metadata'))
            if meta.get('source_sha256') == original and meta.get('rules_sha256') == rules_hash and meta.get('parser_version') == VERSION:
                return json.loads(meta['report'])
        raise RuntimeError('Derived DB already exists with another version; use a new versioned output filename.')
    rules = json.loads(rules_path.read_text(encoding='utf-8'))
    with source.connect() as c:
        products = [dict(r) for r in c.execute('SELECT id,institution,name,bonus_conditions,source_url,product_url,collected_at FROM products')]
    by_id = {p['id']: p for p in products}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(OUT) as c:
        c.executescript('''
          PRAGMA foreign_keys=ON;
          CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
          CREATE TABLE source_products(product_id TEXT PRIMARY KEY,institution TEXT,name TEXT,source_text TEXT,source_url TEXT,product_url TEXT,collected_at TEXT,text_sha256 TEXT,review_status TEXT NOT NULL);
          CREATE TABLE text_fragments(id INTEGER PRIMARY KEY,product_id TEXT REFERENCES source_products(product_id),start_offset INTEGER,end_offset INTEGER,raw_text TEXT,review_status TEXT NOT NULL);
          CREATE TABLE rule_options(option_id INTEGER PRIMARY KEY,product_id TEXT REFERENCES source_products(product_id),term INTEGER,base_rate REAL,max_rate REAL,bonus_cap REAL,source_hash TEXT,supplemental_source TEXT,legacy_rule_json TEXT NOT NULL,parsed_rule_json TEXT,questions_json TEXT,review_status TEXT NOT NULL);
          CREATE TABLE bonus_components(option_id INTEGER REFERENCES rule_options(option_id),component_id TEXT,rate_pp REAL,exclusive_group TEXT,expression_json TEXT,origin TEXT,PRIMARY KEY(option_id,component_id,origin));
          CREATE TABLE atomic_conditions(id INTEGER PRIMARY KEY,option_id INTEGER,component_id TEXT,origin TEXT,logical_path TEXT,fact_key TEXT,operator TEXT,target_json TEXT,FOREIGN KEY(option_id,component_id,origin) REFERENCES bonus_components(option_id,component_id,origin));
          CREATE TABLE review_events(id INTEGER PRIMARY KEY,option_id INTEGER,previous_status TEXT,next_status TEXT,reviewer TEXT,evidence TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
          CREATE INDEX idx_review ON rule_options(review_status);
          CREATE INDEX idx_product ON rule_options(product_id);
        ''')
        for p in products:
            text = p['bonus_conditions'] or ''
            c.execute('INSERT INTO source_products VALUES(?,?,?,?,?,?,?,?,?)', (p['id'],p['institution'],p['name'],text,p['source_url'],p['product_url'],p['collected_at'],hashlib.sha256(text.encode()).hexdigest(),'needs_review' if text.strip() else 'no_source_text'))
            for f in fragments(text):
                c.execute('INSERT INTO text_fragments(product_id,start_offset,end_offset,raw_text,review_status) VALUES(?,?,?,?,?)',(p['id'],f['start'],f['end'],f['text'],'needs_review'))
        ready = 0
        for r in rules:
            p = by_id[r['product_id']]
            parsed = parse_source(p['bonus_conditions'] or '', r['term'])
            # A recognized clause must also reconcile with the retained legacy rate cap.
            if parsed and (len(r['bonus']) != 1 or abs(parsed['rate'] - r['bonus'][0]['rate']) > 1e-8 or abs(r['base_rate'] + parsed['rate'] - r['max_rate']) > 1e-8):
                parsed = None
            status = 'question_ready' if parsed else ('legacy_needs_source_review' if r['bonus'] else 'no_bonus_rule')
            question_schema = parsed.pop('questions') if parsed else []
            parsed_rule = {**r, 'bonus': [parsed]} if parsed else None
            ready += int(parsed is not None)
            c.execute('INSERT INTO rule_options VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', (r['option_id'],r['product_id'],r['term'],r['base_rate'],r['max_rate'],r.get('bonus_cap'),r['source_hash'],r.get('supplemental_rule_source'),encode(r),encode(parsed_rule) if parsed_rule else None,encode(question_schema),status))
            for origin, components in [('legacy',r['bonus']), ('parsed_source',[parsed] if parsed else [])]:
                for b in components:
                    c.execute('INSERT INTO bonus_components VALUES(?,?,?,?,?,?)',(r['option_id'],b['id'],b['rate'],b.get('exclusive_group'),encode(b['when']),origin))
                    for leaf in leaves(b['when']):
                        c.execute('INSERT INTO atomic_conditions(option_id,component_id,origin,logical_path,fact_key,operator,target_json) VALUES(?,?,?,?,?,?,?)',(r['option_id'],b['id'],origin,leaf['path'],leaf['fact_key'],leaf['operator'],encode(leaf['target'])))
        assert original == digest(source.DB), 'Source changed during derivation'
        assert rules_hash == digest(rules_path), 'Rules changed during derivation'
        report = {'parser_version': VERSION, 'source_sha256': original, 'source_preserved': True,
                  'source_products': len(products), 'source_products_with_text': sum(bool((p['bonus_conditions'] or '').strip()) for p in products),
                  'rule_options': len(rules), 'question_ready_options': ready,
                  'question_ready_products': c.execute("SELECT count(distinct product_id) FROM rule_options WHERE review_status='question_ready'").fetchone()[0],
                  'legacy_bonus_options_for_review': c.execute("SELECT count(*) FROM rule_options WHERE review_status='legacy_needs_source_review'").fetchone()[0],
                  'atomic_conditions': c.execute('SELECT count(*) FROM atomic_conditions').fetchone()[0],
                  'text_fragments_for_review': c.execute('SELECT count(*) FROM text_fragments').fetchone()[0],
                  'notice': 'question_ready는 수집된 우대 원문과 명시적 질문 규칙의 일치를 뜻합니다. 전체 약관·가입 자격·현재 금리·향후 실적 달성 검수 완료를 뜻하지 않습니다.'}
        for key, value in {'source_sha256':original,'rules_sha256':rules_hash,'parser_version':VERSION,'report':encode(report)}.items():
            c.execute('INSERT INTO metadata VALUES(?,?)',(key,value))
    (ROOT / 'conditions-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    return report


def connect_derived():
    c = sqlite3.connect(f'{OUT.as_uri()}?mode=ro', uri=True)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA query_only=ON')
    return c


def catalog():
    with connect_derived() as c:
        rows = c.execute("SELECT r.*,p.name,p.institution,p.source_text FROM rule_options r JOIN source_products p USING(product_id) WHERE r.review_status='question_ready' ORDER BY CASE WHEN r.term=12 THEN 0 ELSE 1 END,r.term,p.name").fetchall()
        return {'products':[{'product_id':r['product_id'],'option_id':r['option_id'],'name':r['name'],'institution':r['institution'],'term':r['term'],'base_rate':r['base_rate'],'max_rate':r['max_rate'],'questions':json.loads(r['questions_json']),'source_text':r['source_text'],'status':r['review_status']} for r in rows],
                'report':json.loads(c.execute("SELECT value FROM metadata WHERE key='report'").fetchone()[0])}


def evaluate_answers(option_id, answers):
    if type(option_id) is not int or not isinstance(answers, dict): raise ValueError('상품과 답변을 확인해 주세요.')
    with connect_derived() as c:
        row = c.execute("SELECT * FROM rule_options WHERE option_id=? AND review_status='question_ready'",(option_id,)).fetchone()
    if not row: raise ValueError('원문 검수가 필요한 조건은 자동 적용할 수 없어요.')
    schema = json.loads(row['questions_json'])
    allowed = {q['key'] for q in schema}
    if set(answers)-allowed: raise ValueError('이 상품에 해당하지 않는 답변이 포함돼 있어요.')
    for q in schema:
        value = answers.get(q['key'])
        if value is None: continue
        if q['type'] == 'boolean' and type(value) is not bool: raise ValueError('가능 여부를 선택해 주세요.')
        if q['type'] == 'number' and (type(value) is not int or value < 0 or value > q.get('maximum',1000000000)): raise ValueError('계약 기간 안의 정수 개월 수를 입력해 주세요.')
    rule = json.loads(row['parsed_rule_json'])
    low, high, missing, earned = bonus(rule, answers)
    components = []
    for b in rule['bonus']:
        state, _ = evaluate(b['when'], answers)
        components.append({'id':b['id'],'rate':b['rate'],'state': 'met' if state is True else 'unmet' if state is False else 'unknown'})
    return {'rate':round(rule['base_rate']+low,8),'bonus_rate':low,'possible_bonus_rate':high,'missing':sorted(missing),'earned':earned,'components':components,'scope':'collected_bonus_clause_only','actual_bank_approval':False}


if __name__ == '__main__':
    print(json.dumps(build(),ensure_ascii=False,indent=2))
