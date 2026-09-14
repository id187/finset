"""Recovery guidance and principal-only planning; never bank transaction execution."""
from copy import deepcopy
from datetime import date


def _amount(x):
    return type(x) is int and x >= 0


def options(contract, shortage, free_cash):
    if not isinstance(contract, dict) or not _amount(shortage) or shortage == 0 or not _amount(free_cash):
        raise ValueError('부족액·사용 가능 현금 확인 필요')
    out, questions = [], []
    if free_cash >= shortage:
        out.append(dict(action='separate_cash', title='목표에 배정하지 않은 현금으로 채우기', amount=shortage,
                        bank_permission_required=False, requires_confirmation=True,
                        notice='생활비·비상금·예정 지출을 제외한 현금인지 확인하세요.'))
    if contract.get('payment_flexible') is True:
        out.append(dict(action='reduce_payment', title='납입액 조정 조건 확인', status='TERMS_CHECK_REQUIRED',
                        bonus_recheck=True, goal_recalculation=True,
                        notice='자유적립 여부와 별도로 우대 실적·납입 최소액을 다시 확인합니다.'))
    terms = contract.get('partial_withdrawal')
    if isinstance(terms, dict) and terms.get('allowed') is True:
        needed = {'principal': contract.get('principal'), 'withdrawals_used': contract.get('withdrawals_used'),
                  'remaining_minimum': terms.get('remaining_minimum'), 'max_count': terms.get('max_count')}
        questions.extend(k for k, v in needed.items() if not _amount(v))
        if not questions and (needed['principal'] - shortage >= needed['remaining_minimum']
                              and needed['withdrawals_used'] < needed['max_count']):
            out.append(dict(action='partial_withdrawal', title='일부 금액 인출 조건과 영향 확인',
                            status='CALCULATION_REQUIRED', loss=None,
                            reason='횟수·잔액 조건만 확인했습니다. 실행 경로·가입 당시 약관·이자와 우대 영향을 확인해야 합니다.'))
    elif terms is not None and not isinstance(terms, dict):
        questions.append('partial_withdrawal')
    out.append(dict(action='early_termination', title='중도해지 영향 확인', status='CALCULATION_REQUIRED', loss=None,
                    required=['가입일', '실제 납입내역', '가입 당시 중도해지 약관', '해지일', '우대 소멸 조건', '디지털 실행 경로']))
    return dict(options=out, questions=questions, automatic_execution=False, completion_improvement_proven=False)


def project_recovery(plan, change):
    """Explicit remaining schedule, actual principal, no invented interest or bank permission.

    plan: id, revision, as_of, goal_date, goal_amount, principal, history_complete,
          future_payments [{date,amount}], contract {maturity, payment_flexible}.
    change: kind temporary/persistent/emergency; amount is new payment or cash need;
            emergency additionally requires free_cash (already unallocated).
    Current-day unpaid payments belong in future_payments. Paid amounts only in principal.
    """
    try:
        if not isinstance(plan, dict) or not isinstance(change, dict): raise ValueError('계획·변경 형식')
        if not isinstance(plan.get('id'), str) or not plan['id']: raise ValueError('계획 ID')
        if not _amount(plan.get('revision')): raise ValueError('계획 버전')
        today, goal = date.fromisoformat(plan['as_of']), date.fromisoformat(plan['goal_date'])
        if goal < today: raise ValueError('이미 지난 목표일')
        if not _amount(plan.get('principal')) or not _amount(plan.get('goal_amount')) or plan['goal_amount']==0: raise ValueError('원금·목표금액')
        if plan.get('history_complete') is not True:
            return dict(status='NEEDS_INPUT', questions=['이미 납입한 원금과 미납 내역 확인'], proposal=None)
        contract=plan.get('contract')
        if not isinstance(contract,dict): raise ValueError('계약 정보')
        maturity=date.fromisoformat(contract['maturity'])
        if maturity < today: return dict(status='NEEDS_MATURITY_REVIEW', proposal=None)
        schedule=deepcopy(plan['future_payments'])
        if not isinstance(schedule,list): raise ValueError('납입 일정')
        dates=[]
        for row in schedule:
            d=date.fromisoformat(row['date'])
            if not _amount(row['amount']) or not today <= d < maturity: raise ValueError('남은 납입일·금액')
            dates.append(d)
        if dates != sorted(set(dates)): raise ValueError('납입일 중복·정렬')
        if goal < maturity:
            return dict(status='NEEDS_LIQUIDITY_REVIEW', proposal=None, reason='목표일 전에 만기가 오지 않아 사용 가능 금액을 확정할 수 없습니다.')
        kind,amount=change['kind'],change['amount']
        if not _amount(amount): raise ValueError('변경 금액')
        if kind not in ('temporary','persistent','emergency'): raise ValueError('상황 종류')
        original=plan['principal']+sum(x['amount'] for x in schedule)
        if kind=='emergency':
            if amount==0 or not _amount(change.get('free_cash')): raise ValueError('긴급 지출·별도 현금')
            uncovered=max(0,amount-change['free_cash'])
            guidance=options({**contract,'principal':plan['principal']},amount,change['free_cash'])
            return dict(status='CASH_CONFIRMATION_REQUIRED' if uncovered==0 else 'CONTRACT_REVIEW_REQUIRED',
                        uncovered=uncovered, loss=None, proposal=None, guidance=guidance,
                        notice='현금 활용은 사용자 확인이 필요합니다. 인출·해지를 자동 계산하거나 실행하지 않습니다.')
        if not schedule: return dict(status='NO_REMAINING_PAYMENTS',proposal=None)
        targets=schedule[:1] if kind=='temporary' else schedule
        if any(amount>x['amount'] for x in targets): raise ValueError('감액 시나리오에서 납입액 증가')
        for row in targets: row['amount']=amount
        projected=plan['principal']+sum(x['amount'] for x in schedule)
        return dict(status='PLANNING_ONLY', original_principal=original, projected_principal=projected,
                    principal_reduction=original-projected, shortfall_without_interest=max(0,plan['goal_amount']-projected),
                    interest=None, bonus_impact=None, maturity=contract['maturity'],
                    bank_change_confirmed=False, requires_confirmation=True,
                    required=['가입 당시 감액·미납 허용 조건','최소 납입액 및 우대 영향'],
                    proposal=dict(plan_id=plan['id'],base_revision=plan['revision'],kind=kind,
                                  future_payments=schedule,goal_date=plan['goal_date']),
                    notice='이미 납입한 원금은 유지한 계획 비교입니다. 실제 만기 수령액과 계약 변경 승인은 아닙니다.')
    except (ValueError, KeyError, TypeError, OverflowError) as ex:
        return dict(status='INVALID',reason=str(ex),proposal=None)
