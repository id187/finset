import type { CoreCard } from './coreApi'

export function amountLabel(value: number, approximate = false) {
  if (!Number.isFinite(value) || value < 0) return '확인 필요'
  if (value === 0) return '0원'
  if (value >= 100000000 && value % 100000000 === 0) return `${value / 100000000}억원`
  if (value < 10000) return `${value.toLocaleString('ko-KR')}원`
  const text = (value / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })
  return `${approximate && value % 1000 !== 0 ? '약 ' : ''}${text}만원`
}
export function goalProjection(goal: number, expected: number) {
  if (!Number.isFinite(goal) || goal <= 0 || !Number.isFinite(expected) || expected < 0) return null
  return { percent: Math.min(100, Math.max(0, expected / goal * 100)), shortfall: Math.max(0, goal - expected), surplus: Math.max(0, expected - goal) }
}
export function alternativeDifference(primary: CoreCard, other: CoreCard) {
  if (!primary.comparison_basis || !other.comparison_basis) return null
  const keys = ['goal_amount', 'goal_date', 'total_principal', 'monthly', 'deposit'] as const
  if (keys.some(k => primary.comparison_basis![k] !== other.comparison_basis![k])) return null
  return other.goal_total - primary.goal_total
}
export function periodLabel(months: number) {
  if (!months) return '직접 정한 날짜'
  const years = Math.floor(months / 12), rest = months % 12
  return `${years ? `${years}년` : ''}${years && rest ? ' ' : ''}${rest ? `${rest}개월` : ''}`
}
