import { blankAnswers, recommendGuided } from './guided.ts'
import type { GuidedAnswers, GuidedCatalog } from './guided.ts'

export type QuickInputs = { purpose: string; goal: string; monthly: string; months: string; transfer: '' | 'yes' | 'no' | 'unknown' }
export const quickBlank = (): QuickInputs => ({ purpose: '', goal: '', monthly: '', months: '12', transfer: '' })
export function quickFromAnswers(a: GuidedAnswers): QuickInputs {
  return { purpose: a.purpose, goal: a.goal, monthly: a.monthly, months: a.months,
    transfer: a.autoUnknown ? 'unknown' : Number(a.autoMonths) >= Number(a.months) ? 'yes' : Number(a.autoMonths) === 0 ? 'no' : 'unknown' }
}
// Explicit mock MyData profile. These are demo facts, never inferred user facts.
export const demoProfile = [
  '국내 거주 만 19세 내국인 · 금융기관 앱·웹 가입 가능',
  '생활비·비상금은 별도 확보 · 우선 검토할 대출 상환 없음',
  '비교하는 모든 금융기관의 기존 예·적금 잔액 0원 · 보유 적금 없음',
  '토스뱅크 입출금통장 보유 · 새 돈으로 적금 시작',
  '선택한 월 저축액을 만기까지 유지하는 상황',
]
export function quickValidate(q: QuickInputs): string {
  if (!q.purpose) return '저축 목표를 선택해 주세요. 아직 없으면 일단 모으기를 선택해도 좋아요.'
  if (!/^\d+$/.test(q.monthly) || Number(q.monthly) <= 0 || Number(q.monthly) > 1000000000) return '월 저축액을 1원~10억원 사이로 입력해 주세요.'
  if (!['6', '12', '24', '36', '60'].includes(q.months)) return '저축 기간을 선택해 주세요.'
  if (q.purpose !== '일단 모으기' && (!/^\d+$/.test(q.goal) || Number(q.goal) <= 0 || Number(q.goal) > 1000000000)) return '목표 금액을 1원~10억원 사이로 선택해 주세요.'
  return ''
}
export function bumpAmount(value: string, delta: number) {
  const amount = /^\d+$/.test(value) ? Number(value) : 0
  return String(Math.max(0, Math.min(1000000000, amount + delta)))
}
export function quickAnswers(q: QuickInputs): GuidedAnswers {
  return { ...blankAnswers(), purpose: q.purpose, monthly: q.monthly, months: q.months,
    goal: q.purpose === '일단 모으기' ? String(Math.min(1000000000, Number(q.monthly) * Number(q.months))) : q.goal,
    reserve: 'yes', debt: 'no', hold: 'yes', adult: 'yes', mobile: 'yes', holdings: 'no',
    kbankBalance: '0', kakaoBalance: '0', tossBalance: '0', kbankCount: '0', tossHeld: 'no', tossAccount: 'yes',
    renewed: 'no', autoMonths: q.transfer === 'yes' ? q.months : q.transfer === 'no' ? '0' : '',
    autoUnknown: q.transfer === 'unknown', tossSchedule: q.transfer, tossTransfers: q.transfer,
  }
}
export function quickAdjustments(q: QuickInputs, catalog: GuidedCatalog) {
  if (q.purpose === '일단 모으기') return []
  const current = recommendGuided(quickAnswers(q), catalog).cards[0]
  if (!current?.shortfall) return []
  const options: { label: string; input: QuickInputs }[] = []
  const monthly = catalog.monthly.find(n => n > Number(q.monthly) && recommendGuided(quickAnswers({ ...q, monthly: String(n) }), catalog).cards[0]?.shortfall === 0)
  const months = catalog.months.find(n => n > Number(q.months) && recommendGuided(quickAnswers({ ...q, months: String(n) }), catalog).cards[0]?.shortfall === 0)
  if (monthly) options.push({ label: `월 ${monthly / 10000}만원으로 비교`, input: { ...q, monthly: String(monthly) } })
  if (months) options.push({ label: `${months}개월로 늘려 비교`, input: { ...q, months: String(months) } })
  return options
}
