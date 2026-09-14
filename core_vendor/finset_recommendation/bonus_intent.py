"""Reviewed action leaves for current connected digital bonus expressions.
Objective eligibility is never replaced by willingness. Source rules stay immutable.
"""
ACTIONS={
 'toss.all_transfers':'toss.auto_transfer',
 'kbank.transfer_months':'kbank.transfer',
 'kbank.card_months':'kbank.card',
 'kakao.auto_months':'kakao.auto_transfer',
 'hana.auto_months_before_maturity':'hana.auto_transfer',
 'kn_auto_transfer':'kn.auto_transfer',
 'kn_new_card_next_month_100k':'kn.card',
 'kn_marketing_before_join':'kn.marketing',
 'jb_own_account_auto_6_times':'jb.auto_transfer',
 'jb_all_payments_own_auto':'jb.auto_transfer',
 'kj_same_day_deposit_5m_12m_keep':'kj.additional_deposit',
}
for part in ('salary','pension','card','apartment','utilities','merchant','housing_subscription'):
 ACTIONS['hana_mwc.'+part+'_qualifying_months']='hana_mwc.'+part

def gate(expr):
 if type(expr) is bool:return expr
 op,arg=next(iter(expr.items()))
 if op in ('all','any'):return {op:[gate(x) for x in arg]}
 if op=='at_least':return {op:[arg[0],[gate(x) for x in arg[1]]]}
 if op=='not':return expr  # current reviewed actions are positive requirements
 intent=ACTIONS.get(arg[0])
 return {'all':[expr,{'eq':['bonus_intent.'+intent,True]}]} if intent else expr

def apply(rule,facts,choices):
 if not rule.get('bonus'):return rule,facts
 facts=dict(facts)
 # Raw product facts cannot impersonate the user's separate action choice.
 for k in list(facts):
  if k.startswith('bonus_intent.'):del facts[k]
 for key,value in choices.items():
  if value is not None and type(value) is not bool:raise ValueError('우대 행동 선택은 예·아니요·미정으로 확인해 주세요.')
  facts['bonus_intent.'+key]=value
 return dict(rule,bonus=[dict(c,when=gate(c['when'])) for c in rule['bonus']]),facts
