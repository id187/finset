"""Presentation copy for conditional questions, separated from machine identifiers."""
COMMON={
 'contribution_preference':'상품의 저축 기간 동안 매달 정한 금액을 넣는 방식도 괜찮나요?',
 'deadline_flexibility':'돈이 필요한 날짜를 늦춰도 괜찮나요?',
 'latest_goal_date':'늦어도 언제까지는 필요한 돈인가요?',
 'goal_amount':'얼마를 모으고 싶나요?', 'goal_date':'언제까지 필요한 돈인가요?',
 'cash':'지금 가진 현금은 얼마인가요?', 'reserve':'생활비·비상금으로 얼마를 남겨둘까요?',
 'monthly':'생활비와 갚아야 할 돈을 빼고, 매달 얼마를 모을 수 있나요?',
 'income_pattern':'수입이 매달 비슷한가요, 달라지나요?',
 'low_month_capacity':'수입이 적은 달에도 얼마까지 모을 수 있나요?',
 'reserve_confirmed':'따로 남겨둔 돈으로 생활비와 갑작스러운 지출을 감당할 수 있나요?',
 'holdings_complete':'이미 가입한 상품과 보유계좌 정보를 확인했나요?',
 'withdrawal_need':'목표일 전에 이 돈을 꺼내 쓸 가능성이 있나요?',
 'early_access_strategy':'중간에 필요한 돈을 별도로 남겨둘 수 있나요?',
 'early_access_amount':'목표일 전에 따로 써야 할 돈은 얼마인가요?',
 'sectors':'은행만 비교할까요, 저축은행·신협도 함께 볼까요?',
 'channels':'앱과 웹 중 어떤 방법으로 가입할까요?',
 'existing_bank_ids':'이미 거래 중인 금융회사는 어디인가요?',
 'age':'이 상품의 나이 조건을 확인해도 될까요?',
 'nationality':'가입 절차 확인을 위해 국적 구분이 필요해요.',
 'residency':'현재 국내에 거주하고 있나요?',
 'hana_mwc.no_conflicting_account':'이미 급여하나·연금하나 월복리적금에 가입해 있지 않나요?',
 'hana_mwc.online_or_redeposit':'온라인으로 가입하거나 이 상품을 만기 재가입할 계획인가요?',
}
HELP={
 'cash':'지금 보유한 현금과 바로 꺼낼 수 있는 돈을 합쳐 주세요. 앞으로 받을 월급이나 아직 만기가 안 된 예·적금은 더하지 않아요. 다음 질문에서 남겨둘 돈을 따로 확인해요.',
 'reserve':'입력한 현재 현금 중 저축에 넣지 않고 남겨둘 생활비·비상금이에요. 예정 지출로 따로 적은 금액과 겹치지 않게 답해 주세요.',
 'monthly':'생활비, 대출 상환, 이미 유지할 저축 등 정해진 지출을 제외한 추가 저축 여력이에요. 더 넣기 위해 소비를 늘리거나 돈을 빌리는 금액은 포함하지 않아요.',
 'low_month_capacity':'평균이 아니라 수입이 적은 달의 추가 저축 여력을 답해 주세요. 그런 달에는 저축하기 어렵다면 0원으로 답할 수 있어요.',
 'early_access_amount':'꺼낼 수 있는 최대 금액이 아니라 실제로 따로 필요할 금액을 답해 주세요. 별도로 남길 현금에 포함된 금액으로 확인하며 같은 돈을 다시 차감하지 않아요.',
 'goal_amount':'이 목표를 위해 최종적으로 마련하고 싶은 금액이에요. 생활비·비상금으로 남겨둘 돈은 목표 자금에 포함하지 않아요.',
}
def render(keys):
 out=[]
 for key in keys:
  if key in COMMON:title=COMMON[key]
  elif key.startswith('bonus_intent.'):
   title='이 우대를 받기 위해 안내된 행동을 실제로 할 계획인가요?'
  elif key.startswith('bank_balance.'):title='이 금융회사에 이미 맡긴 원금과 이자는 얼마인가요?'
  elif key.startswith('branch_access.'):title='이 금융회사 영업점에 직접 방문할 수 있나요?'
  elif key.startswith('bonus_costs.'):title='각 우대조건을 맞추려고 추가로 써야 하는 돈은 얼마인가요? 비용이 큰 조건은 선택하지 않아도 돼요.'
  elif key.startswith('product_balance.'):title='이미 가입한 같은 상품에 얼마를 맡기고 있나요?'
  elif key.startswith('incremental_cost.'):title='이 우대를 받으려고 추가로 쓰게 될 돈이 있나요? 있다면 얼마인가요?'
  elif key.startswith('held_count.'):title='이미 같은 상품을 몇 개 가지고 있나요?'
  elif key.startswith('combined_monthly.'):title='이번 납입액과 같은 한도로 묶이는 기존 납입액의 합계를 확인해 주세요.'
  elif key.endswith('_qualifying_months'):title='이 상품에서 인정하는 거래 조건을 몇 개월 충족할 계획인가요?'
  else:title='이 상품의 추가 조건을 확인해 주세요.'
  item=dict(id=key,title=title,allow_unknown=True,show_condition_explanation=True)
  if key in HELP:item['help']=HELP[key]
  if key.startswith('bonus_intent.'):
   item.update(options=[dict(value=True,label='조건을 확인했고 할 계획이에요'),dict(value=False,label='이 조건은 선택하지 않을게요'),dict(value=None,label='아직 모르겠어요')],help='가능한지만이 아니라 실제로 선택할 행동을 답해 주세요. 상품별 인정 기간·금액·추가 비용을 함께 확인해요.')
  if key=='contribution_preference':
   item.update(options=[dict(value='fixed_ok',label='정한 금액을 계속 넣을 수 있어요'),dict(value='adjustable',label='넣는 금액을 조절할 수 있어야 해요'),dict(value='compare',label='차이를 보고 정할게요')],use_result_field='contribution_choice')
  out.append(item)
 return out
