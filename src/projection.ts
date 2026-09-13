import { Decimal } from 'decimal.js'
import { addMonths } from './model.ts'

const D = Decimal.clone({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN })
// Same operation order, Decimal precision and tax rounding as calculator.py.
// Scope: the two simple-interest models of the 13 connected savings options.
export function projectSaving(amount: number, term: number, rate: number, model: string, start: string) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || term <= 0) throw new Error('금액·기간을 확인해 주세요.')
  if (!['simple_monthly', 'simple_actual365'].includes(model)) throw new Error('계산 방식 확인이 필요해요.')
  const a = new D(amount), r = new D(rate).div(100)
  let gross = new D(0)
  for (let i = 0; i < term; i++) {
    const days = (Date.parse(addMonths(start, term)) - Date.parse(addMonths(start, i))) / 86400000
    gross = gross.plus(model === 'simple_monthly' ? a.times(r).times(i + 1).div(12) : a.times(r).times(days).div(365))
  }
  const principal = amount * term
  return { principal, net_interest: gross.minus(gross.times('0.154').floor()).floor().toNumber(), gross_balance_ceiling: new D(principal).plus(gross).ceil().toNumber() }
}
