"""Refine 2026-09-15: rank confirmed benefits, keep unknown facts unknown.

This adapter passes a separate in-memory rule view to the unmodified engine.
Only confirmed, cost-checked bonus components enter that view. Original rules,
source pins, eligibility expressions, tax, projection and ordering stay intact.
"""
import copy

VERSION = 'refine-2026-09-15-v1'
BASIS = '확인한 조건 기준 추천'
AUTO = {'kakao.auto_transfer', 'toss.auto_transfer', 'hana.auto_transfer', 'kn.auto_transfer', 'jb.auto_transfer'}
CARDS = {'kbank.card', 'kn.card', 'hana_mwc.card'}
BENEFIT_NAMES = {
    'auto_transfer': '자동이체', 'transfer': '급여·통신비 이체', 'card': '카드 실적',
    'kn_no_saving_6m': '최근 6개월 적금 미보유', 'kn_auto_transfer': '자동이체',
    'kn_new_card_next_month_100k': '신규 카드 실적', 'kn_marketing_before_join': '가입 전 마케팅 동의',
    'amount_bonus': '월 납입금액', 'amount': '예치금액', 'star_grade': '기존 거래등급',
    'jb_own_account_auto_6_times': '본인 계좌 자동이체', 'jb_all_payments_own_auto': '본인 계좌 자동이체',
    'kj_vip_during_contract': '기존 우대고객 등급', 'kj_same_day_deposit_5m_12m_keep': '추가 예금 유지',
    'relationship_one': '주거래 1종', 'relationship_two': '주거래 2종', 'online': '온라인 가입',
}


def leaves(expr):
    if type(expr) is bool:
        return []
    op, arg = next(iter(expr.items()))
    if op in ('eq', 'gte', 'lte', 'in'):
        return [arg[0]]
    if op == 'not':
        return leaves(arg)
    return [key for child in (arg[1] if op == 'at_least' else arg) for key in leaves(child)]


def no_holdings(p):
    return p.get('holdings_complete') is True and p.get('held_product_ids') == [] and not p.get('bank_balances') and not p.get('product_balances')


def derive(rule, p, budget, intents):
    facts = dict(p.get('facts', {}))
    facts.update(p.get('option_facts', {}).get(str(rule['option_id']), {}))
    n = rule['term']
    amount = budget['deposit'] if rule['kind'] == 'deposit' else budget['monthly']
    derived = {}
    if no_holdings(p):
        for key in leaves(rule['eligibility']):
            if key.startswith('held_count.') and key not in facts:
                derived[key] = 0
            if key.startswith('combined_monthly.'):
                derived[key] = amount  # Existing part is zero; proposed payment is not.
            if key == 'hana_mwc.no_conflicting_account' and key not in facts:
                derived[key] = True
    for key in leaves(rule['eligibility']):
        if key.startswith('combined_monthly.'):
            existing = facts.get('existing_monthly.' + key.removeprefix('combined_monthly.'))
            if type(existing) is int:
                derived[key] = existing + amount
    if set(p.get('channels', [])) and set(p['channels']) <= {'mobile', 'web'}:
        derived['hana_mwc.online_or_redeposit'] = True
    if intents.get('auto_transfer') is True:
        # Calculate over this product's contract, never the whole goal horizon.
        derived['kakao.auto_months'] = n
        derived['hana.auto_months_before_maturity'] = max(0, n - 1)
        derived['kn_auto_transfer'] = True
        if facts.get('auto.setup_at_join') is not None:
            derived['toss.all_transfers'] = facts['auto.setup_at_join']
        if facts.get('jb.own_account') is not None:
            derived['jb_own_account_auto_6_times'] = facts['jb.own_account'] is True and n >= 6
            derived['jb_all_payments_own_auto'] = facts['jb.own_account']
    # Objective inputs, not occupation, decide the salary amount and sender tests.
    if type(facts.get('salary.monthly_amount')) is int:
        derived['kbank.salary_500k'] = facts['salary.monthly_amount'] >= 500000
    if facts.get('salary.sender') is not None:
        derived['kbank.not_own_transfer'] = facts['salary.sender'] != 'self'
    if facts.get('kbank.transfer_whole_term') is True:
        derived['kbank.transfer_months'] = n
    facts.update(derived)
    facts.update(amount=amount, term=n, **{'plan.hold_to_maturity': True})
    maximum = rule.get('bonus_validation', {}).get('qualifying_months_max')
    if maximum is not None:
        for key, value in list(facts.items()):
            if key.startswith('hana_mwc.') and key.endswith('_qualifying_months') and value is not None and value > maximum:
                facts[key] = None
                derived[key] = None
    return facts, derived


def effective_intents(p):
    choices = dict(p.get('bonus_intents', {}))
    if 'auto_transfer' in choices:
        for action in AUTO:
            choices[action] = choices['auto_transfer']
    if choices.get('extra_transactions') is False:
        import bonus_intent
        for action in set(bonus_intent.ACTIONS.values()) - AUTO - CARDS:
            # A declared existing transaction remains a separate fact; rejecting
            # a new transaction never deletes already confirmed passive benefits.
            if p.get('facts', {}).get('existing_transaction.' + action) is not True:
                choices[action] = False
    for action in CARDS:
        choices[action] = False
    return choices


def prepare(p, rules, engine):
    from conditions import evaluate
    import bonus_intent
    budget = engine.plan_budget(p)
    if budget['status'] != 'READY' or budget['horizon'] == 0:
        return None
    calc = copy.deepcopy(p)
    intents = effective_intents(p)
    calc['bonus_intents'] = intents
    selected_rules, states, candidates, pending = [], {}, [], []
    potential_auto = False
    calc.setdefault('option_facts', {})
    calc['bonus_costs'] = {pid: {key: value for key, value in costs.items() if type(value) is int}
                           for pid, costs in calc.get('bonus_costs', {}).items() if isinstance(costs, dict)}
    for original in rules:
        amount = budget['deposit'] if original['kind'] == 'deposit' else budget['monthly']
        if amount <= 0 or original['term'] > budget['horizon'] or original['sector'] not in p['sectors'] or not set(original['channels']) & set(p['channels']) & {'mobile', 'web'}:
            continue
        facts, derived = derive(original, p, budget, intents)
        calc['option_facts'][str(original['option_id'])] = {**p.get('option_facts', {}).get(str(original['option_id']), {}), **derived}
        gated, gated_facts = bonus_intent.apply(original, facts, intents)
        kept, records, costs = [], [], {}
        rule_auto = False
        for component, gate in zip(original.get('bonus', []), gated.get('bonus', [])):
            keys = leaves(component['when'])
            actions = set(bonus_intent.ACTIONS[k] for k in keys if k in bonus_intent.ACTIONS)
            actual, _ = evaluate(component['when'], facts)
            state, missing = evaluate(gate['when'], gated_facts)
            cost = p.get('bonus_costs', {}).get(original['product_id'], {}).get(component['id'])
            if cost is None and p.get('incremental_costs', {}).get(original['product_id']) == 0:
                cost = 0  # Explicitly confirmed no additional cost.
            requires_cost = original.get('requires_cost_confirmation') and bool(actions)
            if not requires_cost:
                cost = 0  # Amount/grade/online benefits require no new spending.
            reason = ''
            if actions and actions <= CARDS:
                status, reason = 'policy_excluded', '카드 사용 실적 우대는 이번 비교에서 제외했어요.'
            elif actions and all(intents.get(a) is False for a in actions):
                status, reason = 'declined', '선택하지 않은 행동의 우대예요.'
                missing = {'bonus_intent.' + action for action in actions - CARDS}
            elif state is False:
                status, reason = 'ineligible', '확인한 정보로는 이 우대 조건을 충족하지 않아요.'
            elif state is None:
                status, reason = 'unknown', '확인하지 않은 조건이 있어 예상 이자에 넣지 않았어요.'
            elif cost is None:
                status, reason = 'unknown', '추가로 드는 비용을 확인하지 않아 예상 이자에 넣지 않았어요.'
                missing = {'component_cost.' + original['product_id'] + '|' + component['id']}
            else:
                status = 'eligible'
                kept.append(component)
                costs[component['id']] = cost
            if actions & AUTO and actual is not False:
                rule_auto = True
            records.append(dict(id=component['id'], name=BENEFIT_NAMES.get(component['id'], '상품 우대'),
                                rate=component['rate'], status=status, reason=reason,
                                missing=sorted(missing), actions=sorted(actions), source=original['source_url']))
        policy_rule = dict(original, bonus=kept, requires_cost_confirmation=False)
        if kept:
            calc['bonus_costs'].setdefault(original['product_id'], {}).update(costs)
        candidate = engine.candidate(policy_rule, calc, budget)
        if not candidate:
            continue
        states[original['option_id']] = records
        if candidate['eligibility_confirmed']:
            potential_auto = potential_auto or rule_auto
            selected_rules.append(policy_rule)
            candidates.append(candidate)
        else:
            pending.append(candidate)
    return dict(profile=calc, rules=selected_rules, states=states, candidates=candidates,
                pending=pending, budget=budget, potential_auto=potential_auto)


def pending_products(candidates):
    out = {}
    for c in sorted(candidates, key=lambda x: (-x['net_interest'], x['option_id'])):
        out.setdefault(c['product_id'], dict(product_id=c['product_id'], name=c['name'], institution=c['institution'],
                       missing=c['questions'], state='unknown', source=c['source']))
    return list(out.values())


def recommend(p, rules, engine):
    # Keep the vendor's input/scope guards, including adult onboarding and debt.
    guarded = engine.recommend(p, [])
    if guarded['status'] not in ('NO_MATCH', 'NEEDS_ALLOCATION_OR_RULES'):
        return dict(guarded, policy_version=VERSION, basis_label=BASIS, eligibility_pending=[], bonus_not_applied=[], applied_bonus=[])
    prepared = prepare(p, rules, engine)
    if prepared is None:
        return guarded
    result = engine.recommend(prepared['profile'], prepared['rules'])
    pending = pending_products(prepared['pending'])
    result.update(policy_version=VERSION, basis_label=BASIS, eligibility_pending=pending[:8],
                  eligibility_pending_count=len(pending), bonus_not_applied=[], applied_bonus=[], benefit_options=[])
    # Unknown eligibility excludes that candidate, rather than all known options.
    if not result.get('cards') and not result.get('contribution_choice') and pending:
        needed = pending[0]['missing']
        result.update(status='NEEDS_ELIGIBILITY', questions=needed[:3], remaining_questions=needed[3:],
                      provisional=True, reason='추천할 상품의 가입 정보를 먼저 확인해 주세요. 모르는 조건을 충족한 것으로 보지 않아요.')
    for card in result.get('cards', []):
        card['basis_label'] = BASIS
        budget = prepared['budget']
        card['comparison_basis'] = dict(goal_amount=p['goal_amount'], goal_date=p['goal_date'],
                                        total_principal=budget['total_principal'], monthly=budget['monthly'], deposit=budget['deposit'])
        first = card['products'][0]
        if len(card['products']) > 1:
            reason = f"목돈 {budget['deposit']:,}원과 월 {budget['monthly']:,}원을 나눠 맡기는 계획이에요. 확인한 조건과 같은 예산으로 비교했어요."
        elif first['bonus_earned']:
            reason = f"{first['name']}의 확인된 우대 {first['rate'] - first['base_rate']:.2f}%p를 반영했어요. 선택한 조건을 이행할 때의 예상이에요."
        elif first['kind'] == 'deposit':
            reason = f"지금 맡길 {budget['deposit']:,}원을 {first['term']}개월 유지하는 예금이에요. 추가 우대 없이 기본금리로 비교했어요."
        else:
            reason = f"매달 {budget['monthly']:,}원으로 모을 수 있고, 추가 거래 없이 기본금리로 비교했어요."
        card['recommendation_reason'] = reason
        for c in card['products']:
            records = copy.deepcopy(prepared['states'].get(c['option_id'], []))
            for record in records:
                if record['id'] in c['bonus_earned']:
                    record['status'] = 'applied'
                elif record['status'] == 'eligible':
                    record.update(status='not_applied', reason='함께 받을 수 있는 우대와 추가비용을 비교해 적용하지 않았어요.')
                target = 'applied_bonus' if record['status'] == 'applied' else 'bonus_not_applied'
                result[target].append(dict(record, product_id=c['product_id'], option_id=c['option_id']))
            c['bonus_states'] = records
    # Offer reviewed optional facts only after the default result, never as a gate.
    seen = set()
    known_ids = {c['option_id'] for c in prepared['candidates']}
    for r in prepared['rules']:
        if r['option_id'] not in known_ids:
            continue
        for record in prepared['states'].get(r['option_id'], []):
            token = r['product_id'] + '|' + record['id']
            if token in seen or record['status'] not in ('unknown', 'declined'):
                continue
            seen.add(token)
            result['benefit_options'].append(dict(id=token, product_id=r['product_id'], institution=r['institution'],
                                                label=record['name'], missing=record['missing'], actions=record['actions']))
    extra = p.get('benefit_action') or ''
    optional = next((b for b in result['benefit_options'] if b['id'] == extra), None)
    if extra.startswith('eligibility|'):
        target = next((c for c in pending if c['product_id'] == extra.removeprefix('eligibility|')), None)
        if target:
            result['questions'] = target['missing']
            result['remaining_questions'] = []
            result['optional_eligibility'] = True
    elif optional:
        result['questions'] = optional['missing']
        result['remaining_questions'] = []
        result['optional_questions'] = True
    # One common action, once. Unknown is an answered choice with zero bonus.
    if prepared['budget']['monthly'] and prepared['potential_auto'] and 'auto_transfer' not in p.get('bonus_intents', {}) and result.get('status') != 'NEEDS_ELIGIBILITY':
        result['questions'] = ['bonus_intent.auto_transfer'] + result.get('questions', [])
        result.update(status='NEEDS_ACTION', provisional=False)
    return result
