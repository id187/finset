// Browser-only demo calculations. Recommendations themselves are frozen Python outputs.
export type Expression = boolean | Record<string, unknown>
type Answers = Record<string, unknown>
type BonusComponent = { id: string; rate: number; when: Expression; exclusive_group?: string }
export type ConditionOption = {
  option_id: number
  questions: { key: string; type: string; maximum?: number }[]
  rule: { base_rate: number; bonus: BonusComponent[]; bonus_cap?: number | null }
}
type Evaluation = { state: boolean | null; missing: string[] }

export function evaluate(expression: Expression, facts: Answers): Evaluation {
  if (typeof expression === 'boolean') return { state: expression, missing: [] }
  const entries = Object.entries(expression)
  if (entries.length !== 1) throw new Error('조건 규칙 형식을 확인해 주세요.')
  const [op, arg] = entries[0]
  if (op === 'not') {
    const result = evaluate(arg as Expression, facts)
    return { ...result, state: result.state === null ? null : !result.state }
  }
  if (op === 'all' || op === 'any' || op === 'at_least') {
    const [threshold, children] = op === 'at_least' ? arg as [number, Expression[]] : [op === 'all' ? (arg as Expression[]).length : 1, arg as Expression[]]
    const results = children.map(child => evaluate(child, facts))
    const yes = results.filter(r => r.state === true).length
    const maybe = results.filter(r => r.state === null).length
    if (yes >= threshold) return { state: true, missing: [] }
    if (yes + maybe < threshold) return { state: false, missing: [] }
    return { state: null, missing: [...new Set(results.flatMap(r => r.state === null ? r.missing : []))] }
  }
  if (!['eq', 'gte', 'lte', 'in'].includes(op)) throw new Error('지원하지 않는 조건 규칙이에요.')
  const [key, target] = arg as [string, unknown]
  const value = facts[key]
  if (value === undefined || value === null) return { state: null, missing: [key] }
  if (op === 'eq') return { state: value === target, missing: [] }
  if (op === 'in') return { state: (target as unknown[]).includes(value), missing: [] }
  if (typeof value !== 'number' || !Number.isFinite(value) || typeof target !== 'number') throw new Error('숫자 응답을 확인해 주세요.')
  return { state: op === 'gte' ? value >= target : value <= target, missing: [] }
}

export function evaluateAnswers(option: ConditionOption | undefined, answers: Answers) {
  if (!option) throw new Error('원문 검수가 필요한 조건은 자동 적용할 수 없어요.')
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new Error('상품과 답변을 확인해 주세요.')
  const allowed = new Set(option.questions.map(q => q.key))
  if (Object.keys(answers).some(k => !allowed.has(k))) throw new Error('이 상품에 해당하지 않는 답변이 포함돼 있어요.')
  for (const q of option.questions) {
    const value = answers[q.key]
    if (value === undefined || value === null) continue
    if (q.type === 'boolean' && typeof value !== 'boolean') throw new Error('가능 여부를 선택해 주세요.')
    if (q.type === 'number' && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > (q.maximum ?? 1000000000))) throw new Error('계약 기간 안의 정수 개월 수를 입력해 주세요.')
  }
  return evaluateBonus(option.rule, answers)
}

export function evaluateBonus(rule: ConditionOption['rule'], answers: Answers) {
  const components = rule.bonus.map(b => ({ ...b, ...evaluate(b.when, answers) }))
  const groups = new Map<string, typeof components>()
  for (const b of components) { const key = b.exclusive_group ?? b.id; groups.set(key, [...(groups.get(key) || []), b]) }
  let low = 0, high = 0
  let missing: string[] = []
  const earned: string[] = []
  for (const group of groups.values()) {
    const confirmed = group.filter(b => b.state === true).sort((a, b) => a.rate - b.rate || a.id.localeCompare(b.id))
    const winner = confirmed.at(-1)
    const floor = winner?.rate ?? 0
    low += floor
    high += Math.max(floor, ...group.filter(b => b.state === null).map(b => b.rate))
    if (winner && floor > 0) earned.push(winner.id)
    missing.push(...group.filter(b => b.state === null && b.rate > floor).flatMap(b => b.missing))
  }
  const cap = rule.bonus_cap
  if (cap !== undefined && cap !== null) { low = Math.min(low, cap); high = Math.min(high, cap); if (low >= cap) missing = [] }
  return {
    rate: Math.round((rule.base_rate + low) * 1e8) / 1e8,
    bonus_rate: low, possible_bonus_rate: high, missing: [...new Set(missing)].sort(), earned,
    components: components.map(b => ({ id: b.id, rate: b.rate, state: b.state === true ? 'met' : b.state === false ? 'unmet' : 'unknown' })),
    scope: 'collected_bonus_clause_only', actual_bank_approval: false,
  }
}

type Contract = { maturity: string; payment_flexible?: boolean; partial_withdrawal?: { allowed?: boolean; remaining_minimum?: number; max_count?: number } | null; withdrawals_used?: number }
export type RecoveryPlan = { id: string; revision: number; as_of: string; goal_date: string; goal_amount: number; principal: number; history_complete: boolean; contract: Contract; future_payments: { date: string; amount: number }[] }
export type Change = { kind: string; amount: number; free_cash?: number }
const amount = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0
function validDate(value: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error('날짜 형식')
  return value
}
function guidance(contract: Contract, principal: number, shortage: number, freeCash: number) {
  const options: Record<string, unknown>[] = [], questions: string[] = []
  if (freeCash >= shortage) options.push({ action: 'separate_cash', title: '목표에 배정하지 않은 현금으로 채우기', amount: shortage, bank_permission_required: false, requires_confirmation: true, notice: '생활비·비상금·예정 지출을 제외한 현금인지 확인하세요.' })
  if (contract.payment_flexible === true) options.push({ action: 'reduce_payment', title: '납입액 조정 조건 확인', status: 'TERMS_CHECK_REQUIRED', bonus_recheck: true, goal_recalculation: true, notice: '자유적립 여부와 별도로 우대 실적·납입 최소액을 다시 확인합니다.' })
  const terms = contract.partial_withdrawal
  if (terms && typeof terms === 'object' && terms.allowed === true) {
    const needed = { principal, withdrawals_used: contract.withdrawals_used, remaining_minimum: terms.remaining_minimum, max_count: terms.max_count }
    questions.push(...Object.entries(needed).filter(([, value]) => !amount(value)).map(([key]) => key))
    if (!questions.length && principal - shortage >= terms.remaining_minimum! && contract.withdrawals_used! < terms.max_count!) options.push({ action: 'partial_withdrawal', title: '일부 금액 인출 조건과 영향 확인', status: 'CALCULATION_REQUIRED', loss: null, reason: '횟수·잔액 조건만 확인했습니다. 실행 경로·가입 당시 약관·이자와 우대 영향을 확인해야 합니다.' })
  } else if (terms !== undefined && terms !== null && typeof terms !== 'object') questions.push('partial_withdrawal')
  options.push({ action: 'early_termination', title: '중도해지 영향 확인', status: 'CALCULATION_REQUIRED', loss: null, required: ['가입일', '실제 납입내역', '가입 당시 중도해지 약관', '해지일', '우대 소멸 조건', '디지털 실행 경로'] })
  return { options, questions, automatic_execution: false, completion_improvement_proven: false }
}

// Mirrors project_recovery's principal-only semantics; parity checked against Python.
export function projectRecovery(plan: RecoveryPlan, change: Change) {
  try {
    if (!plan || !change || typeof plan !== 'object' || typeof change !== 'object') throw new Error('계획·변경 형식')
    if (typeof plan.id !== 'string' || !plan.id) throw new Error('계획 ID')
    if (!amount(plan.revision)) throw new Error('계획 버전')
    const today = validDate(plan.as_of), goal = validDate(plan.goal_date)
    if (goal < today) throw new Error('이미 지난 목표일')
    if (!amount(plan.principal) || !amount(plan.goal_amount) || plan.goal_amount === 0) throw new Error('원금·목표금액')
    if (plan.history_complete !== true) return { status: 'NEEDS_INPUT', questions: ['이미 납입한 원금과 미납 내역 확인'], proposal: null }
    const contract = plan.contract
    if (!contract || typeof contract !== 'object') throw new Error('계약 정보')
    const maturity = validDate(contract.maturity)
    if (maturity < today) return { status: 'NEEDS_MATURITY_REVIEW', proposal: null }
    if (!Array.isArray(plan.future_payments)) throw new Error('납입 일정')
    const schedule = plan.future_payments.map(row => ({ ...row }))
    let previous = ''
    for (const row of schedule) {
      const day = validDate(row.date)
      if (!amount(row.amount) || day < today || day >= maturity) throw new Error('남은 납입일·금액')
      if (day <= previous) throw new Error('납입일 중복·정렬')
      previous = day
    }
    if (goal < maturity) return { status: 'NEEDS_LIQUIDITY_REVIEW', proposal: null, reason: '목표일 전에 만기가 오지 않아 사용 가능 금액을 확정할 수 없습니다.' }
    if (!amount(change.amount)) throw new Error('변경 금액')
    if (!['temporary', 'persistent', 'emergency'].includes(change.kind)) throw new Error('상황 종류')
    const original = plan.principal + schedule.reduce((sum, p) => sum + p.amount, 0)
    if (change.kind === 'emergency') {
      if (!change.amount || !amount(change.free_cash)) throw new Error('긴급 지출·별도 현금')
      const uncovered = Math.max(0, change.amount - change.free_cash)
      return { status: uncovered === 0 ? 'CASH_CONFIRMATION_REQUIRED' : 'CONTRACT_REVIEW_REQUIRED', uncovered, loss: null, proposal: null, guidance: guidance(contract, plan.principal, change.amount, change.free_cash), notice: '현금 활용은 사용자 확인이 필요합니다. 인출·해지를 자동 계산하거나 실행하지 않습니다.' }
    }
    if (!schedule.length) return { status: 'NO_REMAINING_PAYMENTS', proposal: null }
    const targets = change.kind === 'temporary' ? schedule.slice(0, 1) : schedule
    if (targets.some(row => change.amount > row.amount)) throw new Error('감액 시나리오에서 납입액 증가')
    targets.forEach(row => { row.amount = change.amount })
    const projected = plan.principal + schedule.reduce((sum, p) => sum + p.amount, 0)
    return {
      status: 'PLANNING_ONLY', original_principal: original, projected_principal: projected,
      principal_reduction: original - projected, shortfall_without_interest: Math.max(0, plan.goal_amount - projected),
      interest: null, bonus_impact: null, maturity, bank_change_confirmed: false, requires_confirmation: true,
      required: ['가입 당시 감액·미납 허용 조건', '최소 납입액 및 우대 영향'],
      proposal: { plan_id: plan.id, base_revision: plan.revision, kind: change.kind, future_payments: schedule, goal_date: goal },
      notice: '이미 납입한 원금은 유지한 계획 비교입니다. 실제 만기 수령액과 계약 변경 승인은 아닙니다.',
    }
  } catch (error) { return { status: 'INVALID', reason: error instanceof Error ? error.message : '입력값을 확인해 주세요.', proposal: null } }
}
