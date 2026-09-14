import type { AnswerValue, CoreRequest } from './coreApi'

const relatedIntent: Record<string, string> = {
  'kakao.auto_months': 'kakao.auto_transfer', 'kakao.renewed_principal': 'kakao.auto_transfer',
  'toss.all_transfers': 'toss.auto_transfer', 'toss_account': 'toss.auto_transfer',
  'hana.account': 'hana.auto_transfer', 'hana.auto_months_before_maturity': 'hana.auto_transfer',
  'kbank.transfer_months': 'kbank.transfer', 'kbank.route': 'kbank.transfer', 'kbank.salary_500k': 'kbank.transfer',
  'kbank.qualified_label': 'kbank.transfer', 'kbank.not_own_transfer': 'kbank.transfer', 'kbank.carrier': 'kbank.transfer', 'kbank.payment': 'kbank.transfer',
  'kbank.card_months': 'kbank.card', 'kbank.card_200k': 'kbank.card',
  'kn_auto_transfer': 'kn.auto_transfer', 'kn_new_card_next_month_100k': 'kn.card', 'kn_marketing_before_join': 'kn.marketing',
  'jb_own_account_auto_6_times': 'jb.auto_transfer', 'jb_all_payments_own_auto': 'jb.auto_transfer',
  'kj_same_day_deposit_5m_12m_keep': 'kj.additional_deposit',
}
export const sameAnswer = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export function changeCoreAnswer(request: CoreRequest, key: string, value: AnswerValue) {
  const answers = { ...request.answers }, invalidated: string[] = []
  if (!sameAnswer(answers[key], value)) {
    const action = relatedIntent[key] || (key.startsWith('hana_mwc.') && key.endsWith('_qualifying_months') ? key.replace('_qualifying_months', '') : '')
    if (action && key in answers && answers[key] !== null) { const target = `bonus_intent.${action}`; answers[target] = null; invalidated.push(target) }
    if (key === 'withdrawal_need' && value === 'none') { delete answers.early_access_strategy; delete answers.early_access_amount; invalidated.push('early_access_strategy', 'early_access_amount') }
  }
  answers[key] = value
  return { request: { ...request, answers }, invalidated }
}
export function changeCorePlan(request: CoreRequest, patch: Record<string, unknown>, current: Record<string, unknown>) {
  const answers = { ...request.answers }, invalidated: string[] = []
  const changedDate = ['start_date', 'goal_date'].some(k => k in patch && !sameAnswer(patch[k], current[k]))
  const changedPlan = changedDate || ['monthly', 'cash', 'reserve', 'available_now', 'low_month_capacity'].some(k => k in patch && !sameAnswer(patch[k], current[k]))
  if (changedPlan) {
    for (const action of new Set(Object.values(relatedIntent))) { answers[`bonus_intent.${action}`] = null; invalidated.push(`bonus_intent.${action}`) }
    for (const key of Object.keys(answers)) if (key.startsWith('bonus_intent.')) { answers[key] = null; invalidated.push(key) }
    answers.contribution_preference = null; invalidated.push('contribution_preference')
    if (changedDate) for (const key of Object.keys(relatedIntent)) if (key.includes('months')) { answers[key] = null; invalidated.push(key) }
  }
  for (const key of Object.keys(patch)) { if (key in answers) { delete answers[key]; invalidated.push(key) } }
  if (patch.facts) for (const key of Object.keys(patch.facts as Record<string, unknown>)) {
    if (key in answers) { delete answers[key]; invalidated.push(key) }
  }
  if (['held_product_ids', 'bank_balances', 'product_balances'].some(k => k in patch && !sameAnswer(patch[k], request.profile?.[k]))) {
    for (const key of Object.keys(answers)) if (/^(bank_balance\.|product_balance\.|held_count\.|combined_monthly\.)/.test(key)) { delete answers[key]; invalidated.push(key) }
  }
  if (changedDate) for (const key of Object.keys(answers)) if (key.endsWith('_qualifying_months')) { answers[key] = null; invalidated.push(key) }
  return { request: { ...request, profile: { ...request.profile, ...patch }, answers }, invalidated }
}
