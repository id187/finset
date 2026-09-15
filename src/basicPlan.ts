import { addMonths } from './model.ts'
import type { CoreProfile } from './coreApi'

export type BasicPlan = { purpose: string; customPurpose?: string; goal: string; start: string; date: string; cash: string; monthly: string; income: string; low: string; sector: string; fund: string; debt: string; holdings: string; withdraw: string; age: string; citizen: string; resident: string }
export const basicStages = ['목표와 기간', '저축할 금액', '비교할 범위', '보유 상품과 유지 확인', '가입 조건']
export const freshBasicPlan = (): BasicPlan => ({ purpose: '', goal: '', start: new Date().toLocaleDateString('sv-SE'), date: '', cash: '', monthly: '', income: '', low: '', sector: '', fund: '', debt: '', holdings: '', withdraw: '', age: '', citizen: '', resident: '' })
export const validWon = (v: string) => /^\d+$/.test(v) && Number.isSafeInteger(Number(v)) && Number(v) <= 1000000000
export function fromManwon(v: string) { return /^\d*$/.test(v) ? v === '' ? '' : String(Number(v) * 10000) : null }
export function basicStop(step: number, f: BasicPlan) {
  if (step === 1 && f.cash === '0' && f.monthly === '0') return '지금 맡길 돈과 매달 모을 돈이 모두 0원이에요. 저축할 수 있는 금액이 생기면 다시 비교해 주세요.'
  if (step === 2 && f.fund === 'business') return '사업 운영자금은 현재 추천 범위에 포함되지 않아요. 개인 목표를 위해 모을 돈은 비교할 수 있어요.'
  if (step === 2 && f.debt === 'yes') return '먼저 갚을지 살펴볼 대출이 있어요. 이자와 상환 계획을 확인하기 전에는 저축 추천을 확정하지 않을게요.'
  if (step === 3 && ['possible', 'certain'].includes(f.withdraw)) return '중간에 쓸 돈을 먼저 남겨 주세요. 정한 기간 동안 맡길 수 있는 금액으로 수정한 뒤 다시 비교할 수 있어요.'
  return ''
}
export function validateBasic(step: number, f: BasicPlan) {
  if (step === 0 && (!validWon(f.goal) || Number(f.goal) === 0)) return '목표 금액을 만원 단위의 정수로 입력해 주세요.'
  if (step === 0 && (!f.start || !f.date || f.date <= f.start || f.date > addMonths(f.start, 120))) return '모을 기간을 선택해 주세요. 시작일 이후부터 10년 이내로 비교할 수 있어요.'
  if (step === 1 && ![f.cash, f.monthly].every(validWon)) return '두 금액을 모두 입력해 주세요. 없는 금액은 0원을 선택할 수 있어요.'
  if (step === 1 && Number(f.monthly) > 0 && !f.income) return '수입이 일정한지 골라 주세요.'
  if (step === 1 && Number(f.monthly) > 0 && f.income === 'variable' && (!validWon(f.low) || Number(f.low) > Number(f.monthly))) return '적은 달의 저축액은 평소 월 저축액 이내로 알려주세요.'
  const keys = step === 2 ? ['sector', 'fund', 'debt'] : step === 3 ? ['holdings', 'withdraw'] : step === 4 ? ['citizen', 'resident'] : []
  if (keys.some(k => !f[k as keyof BasicPlan])) return '아직 답하지 않은 항목을 골라 주세요.'
  if (step === 4 && (!/^\d+$/.test(f.age) || Number(f.age) > 120)) return '만 나이를 0~120세 사이의 정수로 알려주세요.'
  return basicStop(step, f)
}
export function basicProfile(f: BasicPlan, holdings: CoreProfile): CoreProfile {
  return { goal_name: f.purpose === '직접 정하기' ? f.customPurpose?.trim() || '내 목표' : f.purpose && f.purpose !== '아직 정하지 않았어요' ? f.purpose : '내 목표', start_date: f.start, goal_date: f.date, goal_amount: Number(f.goal), budget_basis: 'available_after_expenses', available_now: Number(f.cash), available_amounts_confirmed: true,
    monthly: Number(f.monthly), income_pattern: Number(f.monthly) === 0 ? 'none' : f.income, low_month_capacity: Number(f.monthly) > 0 && f.income === 'variable' ? Number(f.low) : null,
    sectors: f.sector === 'bank' ? ['bank'] : ['bank', 'savings_bank', 'credit_union'], fund_type: f.fund, high_interest_debt: f.debt === 'yes', withdrawal_need: f.withdraw,
    deadline_flexibility: 'fixed', latest_goal_date: null, ...holdings,
    facts: { ...(holdings.facts as Record<string, unknown> || {}), age: Number(f.age), nationality: f.citizen === 'yes' ? 'KR' : 'other', residency: f.resident === 'yes' ? 'KR' : 'other', 'kakao.renewed_principal': false } }
}
