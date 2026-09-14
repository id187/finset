"""MVP2 transport adapter. Ranking, bonus decisions and projections stay in Python core.

The HTTP server calls this in an isolated process so legacy recovery/condition
modules keep their existing imports. Neither requests nor source data are saved.
"""
import copy
import hashlib
import json
import os
import subprocess
import sys
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VENDOR = ROOT / 'core_vendor'
DATA = Path(os.environ.get('FINSET_DATA_DIR', str(ROOT.parent / 'mvp' / '핀셋_MVP_팀원전달')))
DB = DATA / 'service_data_collection' / 'service_products.sqlite3'
VERSION = '2026-09-13-consistency-1'
TOP = {'start_date', 'goal_date', 'goal_amount', 'cash', 'reserve', 'monthly', 'income_pattern', 'low_month_capacity',
       'fund_type', 'withdrawal_need', 'early_access_strategy', 'early_access_amount', 'reserve_confirmed',
       'holdings_complete', 'bank_balances_complete', 'sectors', 'channels', 'high_interest_debt',
       'deadline_flexibility', 'latest_goal_date', 'contribution_preference', 'bank_policy', 'existing_bank_ids'}
STRUCTURED = {'planned_spending', 'bank_balances', 'held_product_ids', 'product_balances', 'facts'}
CHOICES = {
    'income_pattern': [('steady', '예, 매달 비슷해요'), ('variable', '아니오, 달마다 달라요'), ('none', '정기 수입은 없어요')],
    'fund_type': [('personal', '예, 개인 저축이에요'), ('business', '사업에 쓸 돈이에요')],
    'withdrawal_need': [('none', '아니오, 만기까지 유지할게요'), ('possible', '예, 중간에 쓸 수 있어요'), ('certain', '예, 예정된 사용이 있어요')],
    'early_access_strategy': [('separate_cash', '예, 따로 남길 수 있어요'), ('product_withdrawal', '아니오, 상품에서 꺼내야 해요')],
    'sectors': [(['bank'], '은행만 비교할게요'), (['bank', 'savings_bank', 'credit_union'], '저축은행·신협도 비교할게요')],
    'deadline_flexibility': [('fixed', '날짜를 유지할게요'), ('flexible', '날짜를 늦춰도 괜찮아요')],
    'nationality': [('KR', '대한민국'), ('other', '그 외 국적')],
    'residency': [('KR', '국내 거주'), ('other', '해외 거주')],
    'kbank.route': [('salary', '급여이체'), ('telecom', '통신비 자동이체'), ('none', '둘 다 해당 없어요')],
    'kbank.carrier': [('KT', 'KT'), ('SKT', 'SKT'), ('LGU+', 'LG U+'), ('none', '해당 없어요')],
    'kb.star_grade': [('베스트', '베스트'), ('그랜드', '그랜드'), ('VIP', 'VIP'), ('VVIP', 'VVIP'), ('none', '해당 없어요')],
}
LABELS = {
    'fund_type': '이번에 모을 돈은 개인 저축에 쓰나요?', 'high_interest_debt': '저축 전에 상환을 검토할 고금리 대출이 있나요?',
    'age': '현재 만 나이가 어떻게 되나요?', 'toss_account': '토스뱅크 통장 또는 서브 통장이 있나요?',
    'toss.all_transfers': '가입할 때 설정한 월 자동이체를 모든 회차 성공할 수 있나요?',
    'kakao.auto_months': '카카오뱅크 자동이체 인정 조건을 충족할 개월 수는 얼마인가요?',
    'kakao.renewed_principal': '이번 비교 금액에 카카오뱅크 자동연장 원리금이 포함되나요?',
    'hana.account': '하나은행 입출금통장에서 이체할 수 있나요?',
    'hana.auto_months_before_maturity': '하나은행 계좌에서 만기 전까지 자동이체할 개월 수는 얼마인가요?',
    'kbank.transfer_months': '케이뱅크에서 인정하는 이체 실적을 채울 개월 수는 얼마인가요?',
    'kbank.card_months': '케이뱅크 카드 실적을 채울 개월 수는 얼마인가요?',
    'kbank.route': '케이뱅크의 어떤 거래 실적에 해당하나요?', 'kbank.carrier': '통신비 우대에 해당하는 통신사는 어디인가요?',
    'kbank.salary_500k': '월 50만원 이상 급여이체 인정 조건을 충족하나요?',
    'kbank.qualified_label': '급여이체의 인정 표시 조건을 충족하나요?',
    'kbank.not_own_transfer': '본인 계좌 간 이체가 아닌 인정 거래인가요?',
    'kbank.payment': '상품에서 인정하는 통신비 자동이체가 가능한가요?',
    'kbank.card_200k': '상품에서 인정하는 체크카드 월 20만원 이용 실적 조건에 해당하나요?',
    'basic_pension_recipient': '기초연금을 받고 있나요?', 'parent_basic_pension_recipient': '부모님이 기초연금 수급자에 해당하나요?',
    'single_household': '상품에서 정한 1인 가구 조건에 해당하나요?', 'annual_income': '조건에서 확인할 연 소득은 얼마인가요?',
    'minor_children_count': '상품에서 인정하는 미성년 자녀 수는 몇 명인가요?',
    'credit_union_debit_card': '신협 체크카드 보유 조건에 해당하나요?', 'kb.star_grade': 'KB 거래등급은 어떻게 되나요?',
    'kn_no_saving_6m': '경남은행의 최근 6개월 적금 미보유 조건에 해당하나요?',
    'kn_auto_transfer': '경남은행의 자동이체 인정 조건을 채울 수 있나요?',
    'kn_new_card_next_month_100k': '신규 카드 발급과 다음 달 10만원 실적 조건을 채울 수 있나요?',
    'kn_marketing_before_join': '가입 전 마케팅 동의 조건에 해당하나요?',
    'jb_own_account_auto_6_times': '전북은행 본인 계좌에서 자동이체 6회 조건을 채울 수 있나요?',
    'jb_all_payments_own_auto': '전북은행 본인 계좌에서 모든 회차 자동이체할 수 있나요?',
    'kj_vip_during_contract': '가입기간 중 광주은행 우대고객 등급 조건에 해당하나요?',
    'kj_same_day_deposit_5m_12m_keep': '가입 당일 500만원 예금을 함께 가입해 12개월 유지할 수 있나요?',
}
ACTION_LABELS = {'kakao.auto_transfer': '카카오뱅크 자동이체', 'toss.auto_transfer': '토스뱅크 자동이체',
                 'hana.auto_transfer': '하나은행 자동이체', 'kbank.transfer': '케이뱅크 인정 이체', 'kbank.card': '케이뱅크 카드 실적',
                 'kn.auto_transfer': '경남은행 자동이체', 'kn.card': '경남은행 카드 실적', 'kn.marketing': '경남은행 마케팅 동의',
                 'jb.auto_transfer': '전북은행 자동이체', 'kj.additional_deposit': '광주은행 추가 예금 유지'}
for suffix, label in [('salary', '급여'), ('pension', '연금'), ('card', '카드'), ('apartment', '아파트 관리비'),
                       ('utilities', '공과금'), ('merchant', '가맹점 대금'), ('housing_subscription', '청약 납입')]:
    ACTION_LABELS['hana_mwc.' + suffix] = '하나 월복리적금 ' + label + ' 실적'
    LABELS['hana_mwc.' + suffix + '_qualifying_months'] = '하나 월복리적금의 ' + label + ' 실적을 인정받을 개월 수는 얼마인가요?'


@lru_cache(maxsize=1)
def runtime():
    manifest = json.loads((VENDOR / 'manifest.json').read_text(encoding='utf-8'))
    if manifest['version'] != VERSION:
        raise ValueError('전달된 코어 버전이 다릅니다.')
    for name, sha in manifest['files'].items():
        p = VENDOR / name
        if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest() != sha:
            raise ValueError('전달 코어 파일을 확인해 주세요: ' + name)
    sys.path.insert(0, str(VENDOR / 'finset_recommendation'))
    import engine, source, questions, bonus_intent
    if Path(engine.__file__).resolve().parent != (VENDOR / 'finset_recommendation').resolve():
        raise RuntimeError('코어 모듈이 섞였습니다. 별도 프로세스에서 실행해 주세요.')
    source.DB = DB.resolve()
    source.connect().close()
    rules = json.loads((VENDOR / 'finset_recommendation/rules.json').read_text(encoding='utf-8'))
    cases = json.loads((VENDOR / 'fixtures/cases.json').read_text(encoding='utf-8'))['cases']
    inventory = {x['id']: x for x in json.loads((ROOT / 'public/demo/inventory.json').read_text(encoding='utf-8'))['products']}
    return engine, source, questions, bonus_intent, rules, cases, inventory


def leaves(expr):
    if type(expr) is bool:
        return []
    op, arg = next(iter(expr.items()))
    if op in ('eq', 'gte', 'lte', 'in'):
        return [(arg[0], op, arg[1])]
    if op == 'not':
        return leaves(arg)
    return [v for child in (arg[1] if op == 'at_least' else arg) for v in leaves(child)]


@lru_cache(maxsize=1)
def condition_index():
    _, _, _, intent, rules, _, _ = runtime()
    index = {}
    for r in rules:
        if not set(r['channels']) & {'web', 'mobile'}:
            continue
        grouped = {}
        for test in leaves(r['eligibility']) + [x for b in r['bonus'] for x in leaves(b['when'])]:
            grouped.setdefault(test[0], []).append(test)
            action = intent.ACTIONS.get(test[0])
            if action: grouped.setdefault('bonus_intent.' + action, []).append(test)
        for key, tests in grouped.items():
            index.setdefault(key, []).append((r, tests))
    return index


def question_card(key, profile):
    _, _, questions, intent, rules, _, inventory = runtime()
    card = questions.render([key])[0]
    card['title'] = LABELS.get(key, card['title'])
    numeric = {'goal_amount', 'cash', 'reserve', 'monthly', 'low_month_capacity', 'early_access_amount', 'age', 'annual_income', 'minor_children_count'}
    relevant = []
    tests = []
    for r, match in condition_index().get(key, []):
        if r['sector'] not in (profile.get('sectors') or ['bank', 'savings_bank', 'credit_union']):
            continue
        tests.extend(match)
        if len(relevant) < 3 and r['product_id'] not in {p['id'] for p in relevant}:
            inv = inventory.get(r['product_id'], {})
            relevant.append({'id': r['product_id'], 'name': r['name'], 'institution': r['institution'],
                             'clause': inv.get('bonus') or inv.get('eligibility', ''), 'source': r['source_url']})
    if key.startswith('bonus_intent.'):
        label = ACTION_LABELS.get(key.removeprefix('bonus_intent.'), '안내된 우대 행동')
        card['title'] = label + ' 조건을 확인했고, 실제로 할 계획인가요?'
    card['context'] = relevant
    if key in CHOICES:
        card['options'] = [{'value': v, 'label': label} for v, label in CHOICES[key]]
    if key == 'holdings_complete':
        card.update(type='holdings', help='현재 비교할 금융기관의 기존 예·적금과 원리금 합계를 확인해 주세요. 없는 경우에만 없다고 답해 주세요.')
    elif key.startswith('bonus_costs.'):
        pid = key.split('.', 1)[1]
        r = next((r for r in rules if r['product_id'] == pid), None)
        card.update(type='costs', components=[{'id': b['id'], 'label': f'우대 조건 {i+1} · {b["rate"]:.2f}%p'} for i, b in enumerate(r['bonus'])] if r else [])
    elif key in numeric or key.startswith(('bank_balance.', 'product_balance.', 'incremental_cost.', 'held_count.', 'combined_monthly.')):
        card.update(type='number', minimum=0, maximum=120 if key == 'age' else 1000000000, unit='세' if key == 'age' else '개' if key.startswith('held_count.') else '원')
    elif key.endswith('_months') or key.endswith('_qualifying_months') or key == 'hana.auto_months_before_maturity':
        from datetime import date
        from calculator import month
        start = date.fromisoformat(profile['start_date']); goal = date.fromisoformat(profile['goal_date'])
        maximum = max((n for n in range(121) if month(start, n) <= goal), default=0)
        card.update(type='number', minimum=0, maximum=maximum, unit='개월')
    elif key in ('goal_date', 'start_date', 'latest_goal_date'):
        card['type'] = 'date'
    elif card.get('options'):
        card['type'] = 'choice'
    elif key in {'reserve_confirmed', 'holdings_complete', 'high_interest_debt'} or tests and all(type(x[2]) is bool for x in tests):
        card['type'] = 'boolean'
    elif tests and all(type(x[2]) in (int, float) for x in tests):
        card.update(type='number', minimum=0, maximum=1000000000, unit='원')
    elif tests:
        vals = list(dict.fromkeys(v for x in tests for v in (x[2] if isinstance(x[2], list) else [x[2]])))
        card.update(type='choice', options=[{'value': v, 'label': str(v)} for v in vals])
    else:
        card['type'] = 'confirmation'
    if key.startswith('bank_balance.'):
        bank = next((r['institution'] for r in rules if r['bank_id'] == key.split('.', 1)[1]), '해당 금융기관')
        card['title'] = bank + '에 이미 맡긴 원금과 이자의 합계는 얼마인가요?'
    if key.startswith(('held_count.', 'product_balance.', 'incremental_cost.')):
        product = inventory.get(key.split('.', 1)[1], {})
        if product:
            card['context'] = [{'id': product['id'], 'name': product['name'], 'institution': product['institution'], 'clause': product['bonus'], 'source': product['source_url']}]
    if card['type'] == 'boolean' and not card.get('options'):
        card['options'] = [{'value': True, 'label': '예'}, {'value': False, 'label': '아니오'}]
    return card


def explain_condition(expr):
    if type(expr) is bool:
        return '별도 실적 조건 없음' if expr else '이 우대는 적용하지 않음'
    op, arg = next(iter(expr.items()))
    if op in ('all', 'any'):
        return ('모두 충족: ' if op == 'all' else '이 중 한 가지: ') + ' / '.join(explain_condition(x) for x in arg)
    if op == 'not': return '제외 조건: ' + explain_condition(arg)
    if op == 'at_least': return f'{arg[0]}개 이상 충족: ' + ' / '.join(explain_condition(x) for x in arg[1])
    key, value = arg
    short = {'kakao.auto_months': '계약기간 중 자동이체 인정 기간', 'kakao.renewed_principal': '자동연장 원리금 포함 여부'}
    label = short.get(key, LABELS.get(key, '상품 공시의 해당 인정 조건')).rstrip('?')
    unit = '개월' if 'months' in key else '원' if 'amount' in key else ''
    if type(value) is bool: requirement = '해당' if value else '해당 없음'
    elif isinstance(value, list): requirement = ' 또는 '.join(map(str, value))
    else: requirement = f'{value:,}{unit}' if type(value) in (int, float) else str(value)
    suffix = {'gte': ' 이상', 'lte': ' 이하', 'eq': '', 'in': ' 중 하나'}.get(op, '')
    return f'{label}: {requirement}{suffix}'


def apply_answer(profile, key, value):
    if key in TOP:
        if value is None and key in {'reserve_confirmed', 'holdings_complete', 'bank_balances_complete', 'high_interest_debt'}:
            profile.pop(key, None)
        else:
            profile[key] = value
        return
    for prefix, target in [('bonus_intent.', 'bonus_intents'), ('bank_balance.', 'bank_balances'),
                           ('product_balance.', 'product_balances'), ('incremental_cost.', 'incremental_costs'), ('bonus_costs.', 'bonus_costs')]:
        if key.startswith(prefix):
            profile.setdefault(target, {})[key[len(prefix):]] = value
            return
    profile.setdefault('facts', {})[key] = value


def profile_summary(p):
    return {k: copy.deepcopy(v) for k, v in p.items() if k in TOP | {'planned_spending'} and k not in ('existing_bank_ids',)}


def execute(request):
    if not isinstance(request, dict):
        raise ValueError('요청 형식을 확인해 주세요.')
    engine, source, questions, _, rules, cases, inventory = runtime()
    if request.get('action') == 'metadata':
        eligible = [r for r in rules if set(r['channels']) & {'web', 'mobile'}]
        return {'version': VERSION, 'snapshot': '2026년 8월', 'source_sha256': source.sha(),
                'connected_products': len({r['product_id'] for r in eligible}),
                'help': questions.HELP,
                'banks': list({r['bank_id']: {'id': r['bank_id'], 'name': r['institution']} for r in rules}.values()),
                'holdings_products': list({r['product_id']: {'id': r['product_id'], 'bank': r['bank_id'], 'name': r['name'], 'kind': r['kind']} for r in rules}.values()),
                'cases': [{'id': str(i), 'name': c['name'], 'profile': profile_summary(c['profile']),
                   'input_sha256': hashlib.sha256(json.dumps(c['profile'], ensure_ascii=False, sort_keys=True).encode()).hexdigest()} for i, c in enumerate(cases)]}
    if request.get('case_id') is not None:
        case_id = request['case_id']
        if not isinstance(case_id, str) or not case_id.isdigit() or int(case_id) >= len(cases):
            raise ValueError('선택한 시연 사례를 확인해 주세요.')
        profile = copy.deepcopy(cases[int(case_id)]['profile'])
    else:
        profile = {'channels': ['mobile', 'web'], 'protected_only': True}
    patch = request.get('profile', {})
    if not isinstance(patch, dict) or set(patch) - TOP - STRUCTURED:
        raise ValueError('입력 항목을 확인해 주세요.')
    if any(k in patch and patch[k] != profile.get(k) for k in ('monthly', 'goal_date', 'start_date', 'cash', 'reserve', 'low_month_capacity', 'facts')):
        profile['bonus_intents'] = {}
        profile.pop('contribution_preference', None)
    profile.update(copy.deepcopy(patch))
    answers = request.get('answers', {})
    if not isinstance(answers, dict) or len(answers) > 200:
        raise ValueError('질문 답변의 형식을 확인해 주세요.')
    for key, value in answers.items():
        if not isinstance(key, str) or len(key) > 250:
            raise ValueError('질문 항목을 확인해 주세요.')
        if key.startswith('bonus_costs.') and isinstance(value, dict):
            if any(not isinstance(k, str) or type(v) is not int or not 0 <= v <= 1000000000 for k, v in value.items()):
                raise ValueError('우대별 추가비용을 확인해 주세요.')
            apply_answer(profile, key, value)
            continue
        if value is not None and (isinstance(value, (dict, list)) and key != 'sectors' or type(value) not in (bool, str, int, list)):
            raise ValueError('답변 값을 확인해 주세요.')
        if type(value) is int and not 0 <= value <= 1000000000:
            raise ValueError('금액과 횟수는 0 이상으로 입력해 주세요.')
        if isinstance(value, str) and len(value) > 100:
            raise ValueError('답변 길이를 확인해 주세요.')
        apply_answer(profile, key, value)
    for key in ('monthly', 'goal_amount', 'cash', 'reserve', 'low_month_capacity', 'early_access_amount'):
        if profile.get(key) is not None and (type(profile[key]) is not int or not 0 <= profile[key] <= 1000000000):
            raise ValueError('금액은 0~10억원의 원 단위 정수로 입력해 주세요.')
    facts = profile.get('facts', {})
    if not isinstance(facts, dict):
        raise ValueError('객관적 조건의 형식을 확인해 주세요.')
    index = condition_index()
    for key, value in facts.items():
        if value is None: continue
        tests = [t for _, group in index.get(key, []) for t in group]
        if tests and all(type(t[2]) is bool for t in tests) and type(value) is not bool:
            raise ValueError('해당 조건은 예·아니오·미확인으로 답해 주세요.')
        if tests and all(type(t[2]) in (int, float) for t in tests) and type(value) is not int:
            raise ValueError('횟수·개월 수·금액은 정수로 답해 주세요.')
    for action, value in profile.get('bonus_intents', {}).items():
        if value is not None and type(value) is not bool:
            raise ValueError('우대 행동은 예·아니오·미확인으로 답해 주세요.')
    if profile.get('contribution_preference') not in (None, 'fixed_ok', 'adjustable', 'compare'):
        raise ValueError('납입 방식 답변을 확인해 주세요.')
    for key in ('reserve_confirmed', 'holdings_complete', 'bank_balances_complete', 'high_interest_debt'):
        if profile.get(key) is not None and type(profile[key]) is not bool:
            raise ValueError('확인 답변의 형식을 확인해 주세요.')
    result = engine.recommend(profile, rules)
    keys = list(dict.fromkeys(result.get('questions', []) + result.get('remaining_questions', []) + result.get('planning_questions', []) + result.get('liquid_comparison', {}).get('questions', [])))
    cards = [question_card(key, profile) for key in keys[:100]]
    review = []
    if request.get('case_id') is not None:
        if 'kakao.auto_transfer' in profile.get('bonus_intents', {}):
            review.append(question_card('bonus_intent.kakao.auto_transfer', profile))
        if 'contribution_preference' in keys or str(request['case_id']) in ('11', '12', '13'):
            review.append(question_card('contribution_preference', profile))
    answer_values = {}
    for key in list(dict.fromkeys(keys + [q['id'] for q in review])):
        if key in TOP:
            value = profile.get(key)
        elif key.startswith('bonus_intent.'):
            value = profile.get('bonus_intents', {}).get(key.removeprefix('bonus_intent.'))
        else:
            value = profile.get('facts', {}).get(key)
        if value is not None:
            answer_values[key] = value
    details = {}
    by_option = {r['option_id']: r for r in rules}
    for card in result.get('cards', []):
        for product in card['products']:
            inv = inventory.get(product['product_id'], {})
            r = by_option[product['option_id']]
            details[str(product['option_id'])] = {'source_text': inv.get('bonus', ''), 'eligibility_text': inv.get('eligibility', ''),
                'notes': inv.get('notes', ''), 'minimum': r['minimum'], 'maximum': r.get('maximum'), 'flexible': r['flexible'],
                'required_actions': [{'title': f'선택한 우대 조건 {i+1} · {b["rate"]:.2f}%p', 'description': explain_condition(b['when'])} for i, b in enumerate(r['bonus']) if b['id'] in product.get('bonus_earned', [])],
                'bonus_terms': [{'name': b['id'], 'rate': b['rate']} for b in r['bonus']]}
    return {'version': VERSION, 'result': result, 'questions': cards, 'details': details, 'review_questions': review, 'answer_values': answer_values,
            'profile': profile_summary(profile), 'demo': request.get('case_id') is not None,
            'input_sha256': hashlib.sha256(json.dumps(profile, ensure_ascii=False, sort_keys=True).encode()).hexdigest()}


def call(request):
    """Keep old server imports intact and bound each independent calculation."""
    completed = subprocess.run([sys.executable, '-X', 'utf8', str(Path(__file__).resolve()), '--worker'],
                               input=json.dumps(request, ensure_ascii=False), text=True, encoding='utf-8',
                               capture_output=True, timeout=45, cwd=ROOT)
    if completed.returncode:
        raise RuntimeError('최신 추천 코어 실행을 확인해 주세요.')
    response = json.loads(completed.stdout)
    if response.get('error'):
        raise ValueError(response['error'])
    return response


if __name__ == '__main__':
    try:
        print(json.dumps(execute(json.loads(sys.stdin.read())), ensure_ascii=False))
    except (ValueError, KeyError, TypeError) as error:
        print(json.dumps({'error': str(error)}, ensure_ascii=False))
