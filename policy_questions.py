"""User facts and actions with reviewed, plain-language question copy."""
from recommendation_policy import AUTO

FACTS = {
    'auto.setup_at_join': ('가입할 때 월 자동이체를 설정하고 매달 유지할 수 있나요?', '토스뱅크 자동이체 우대를 확인하는 정보예요.'),
    'hana.account': ('본인 명의 하나은행 통장에서 자동이체할 수 있나요?', '다른 은행 계좌에서 보내는 경우에는 이 우대를 더하지 않아요.'),
    'jb.own_account': ('본인 명의 전북은행 통장에서 자동이체할 수 있나요?', '상품별 계약기간과 필요한 이체 횟수는 핀셋이 계산해요.'),
    'toss_account': ('본인 명의 토스뱅크 통장 또는 서브 통장이 있나요?', '이 상품을 새로 가입할 때 필요한 계좌예요.'),
    'kakao.renewed_principal': ('이번 돈이 기존 카카오뱅크 적금을 자동연장하는 원리금인가요?', '만기된 돈으로 새 상품에 가입하는 경우와는 달라요.'),
    'kn_no_saving_6m': ('최근 6개월 동안 경남은행 적금을 가지고 있었나요?', '지금 적금이 없다는 답만으로 과거 보유 여부를 정하지 않아요.'),
    'kn_marketing_before_join': ('가입 전에 경남은행의 마케팅 안내 수신에 동의할 수 있나요?', '원하지 않으면 이 우대만 제외해요.'),
    'kj_vip_during_contract': ('광주은행에서 VIP고객으로 선정됐다는 안내를 받은 적이 있나요?', '가입할 때 또는 이 계약기간 중의 안내가 있어야 해요.'),
    'kj_same_day_deposit_5m_12m_keep': ('같은 날 광주은행에 500만원 이상 예금을 가입해 1년 이상 유지할 계획인가요?', '추가로 묶어둘 수 있는 돈이 확인된 경우에만 선택해 주세요.'),
    'kbank.transfer_whole_term': ('저축하는 동안 매달 같은 통장으로 이 거래를 이어갈 수 있나요?', '인정 개월 수는 선택한 상품의 계약기간 안에서 계산해요.'),
    'kbank.payment': ('선택한 통신사의 요금을 케이뱅크 계좌에서 자동이체하나요?', '통신사와 실제 납부 계좌를 함께 확인해요.'),
}
EXTRA_ACTIONS = {
    'kbank.transfer': '월급 받기 또는 통신비 납부에 케이뱅크 통장을 사용할 계획인가요?',
    'kn.marketing': '경남은행의 혜택·이벤트 안내를 받는 데 동의할 계획인가요?',
    'kj.additional_deposit': '따로 남길 수 있는 500만원 이상을 추가 예금에 맡길 계획인가요?',
}


def optional_keys(keys, p):
    out = []
    for key in keys:
        if key.startswith('bonus_intent.') and key.removeprefix('bonus_intent.') in AUTO:
            key = 'bonus_intent.auto_transfer'
        elif key in ('kakao.auto_months', 'hana.auto_months_before_maturity', 'kn_auto_transfer'):
            key = 'bonus_intent.auto_transfer'
        elif key == 'toss.all_transfers':
            key = 'auto.setup_at_join'
        elif key in ('jb_own_account_auto_6_times', 'jb_all_payments_own_auto'):
            key = 'jb.own_account'
        elif key == 'kbank.transfer_months':
            key = 'kbank.transfer_whole_term'
        elif key == 'kbank.salary_500k':
            key = 'salary.monthly_amount'
        elif key == 'kbank.not_own_transfer':
            key = 'salary.sender'
        if key.startswith('bonus_intent.') and p.get('bonus_intents', {}).get(key.removeprefix('bonus_intent.')) is False:
            continue  # A refusal ends this branch; revising is an explicit UI action.
        if key in ('salary.monthly_amount', 'salary.sender') and p.get('facts', {}).get('kbank.route') != 'salary':
            continue
        if key in ('kbank.carrier', 'kbank.payment') and p.get('facts', {}).get('kbank.route') != 'telecom':
            continue
        supported = (key in FACTS or key in ('bonus_intent.auto_transfer', 'salary.monthly_amount', 'salary.sender', 'kb.star_grade', 'kbank.route', 'kbank.carrier')
                     or key.startswith('component_cost.') or key.removeprefix('bonus_intent.') in EXTRA_ACTIONS)
        # Undefined bank-recognition tests are not delegated to the user. They
        # remain unknown and excluded; they cannot manufacture earned interest.
        if supported and key not in out:
            out.append(key)
    return out


def decorate(card, p, result):
    key = card['id']
    purpose = 'bonus' if result.get('optional_questions') else 'eligibility'
    card.update(fact_id=key, purpose=purpose, action_id=p.get('benefit_action') or None,
                product_ids=[v['id'] for v in card.get('context', [])], derived_from=[],
                unknown_effect='omit_bonus' if purpose == 'bonus' else 'exclude_unconfirmed_candidate')
    # Clauses remain available with the result, rather than preceding the answer.
    card['context'] = [{**v, 'clause': ''} for v in card.get('context', [])]
    if key == 'bonus_intent.auto_transfer':
        card.update(title='매달 만기까지 자동이체로 저축할 수 있나요?', purpose='common', type='choice',
                    help='가능한 행동만 알려주세요. 은행별 인정 조건은 핀셋이 비교해요.',
                    options=[{'value':True,'label':'할 수 있어요'}, {'value':False,'label':'직접 넣을게요'}, {'value':None,'label':'아직 모르겠어요'}],
                    context=[], unknown_effect='omit_bonus')
    elif key == 'contribution_preference':
        card.update(purpose='common', unknown_effect='compare_without_consent')
    elif key in FACTS:
        card.update(title=FACTS[key][0], help=FACTS[key][1], type='boolean',
                    options=[{'value':True,'label':'예'}, {'value':False,'label':'아니요'}])
        if key == 'kn_no_saving_6m':
            card['options'] = [{'value':False,'label':'예, 가지고 있었어요'}, {'value':True,'label':'아니요, 없었어요'}]
    elif key.startswith('bonus_intent.') and key.removeprefix('bonus_intent.') in EXTRA_ACTIONS:
        card.update(title=EXTRA_ACTIONS[key.removeprefix('bonus_intent.')], type='choice', help='선택한 행동에 필요한 사실만 확인해요.',
                    options=[{'value':True,'label':'할 계획이에요'}, {'value':False,'label':'하지 않을게요'}, {'value':None,'label':'아직 모르겠어요'}])
    elif key == 'salary.monthly_amount':
        card.update(title='이 통장으로 한 달에 입금되는 월급은 얼마인가요?', type='number', minimum=0, maximum=1000000000, unit='원', options=[],
                    help='직업명 대신 실제 입금액으로 금액 조건을 확인해요. 입금 방식이 미확인이면 급여 우대는 더하지 않아요.')
    elif key == 'salary.sender':
        card.update(title='이 돈은 누가 보내나요?', type='choice', options=[{'value':'other','label':'회사나 다른 사람이 보내요'},{'value':'self','label':'내 다른 계좌에서 직접 보내요'}])
    elif key == 'kbank.route':
        card.update(title='이 통장으로 어떤 거래를 할 계획인가요?', options=[{'value':'salary','label':'월급 받기'},{'value':'telecom','label':'통신비 자동이체'},{'value':'none','label':'둘 다 하지 않을게요'}])
    elif key.startswith('component_cost.'):
        card.update(title='이 혜택을 받기 위해 추가로 드는 비용은 얼마인가요?', type='number', minimum=0, maximum=1000000000, unit='원', options=[],
                    help='추가 비용이 없다고 확인했다면 0원을 입력해 주세요. 모르면 이 우대는 금액에 더하지 않아요.')
    elif key.startswith('combined_monthly.'):
        card.update(title='이번 납입액을 포함해 이 한도로 묶이는 월 저축액은 얼마인가요?',
                    help='기존 납입액에 이번 월 저축액을 더한 금액이에요. 합산 범위를 모르면 이 상품의 가입 한도를 확정하지 않아요.')
    return card
