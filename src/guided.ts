import { evaluate } from './offline.ts'
import type { Expression } from './offline.ts'
import { addMonths } from './model.ts'
import type { Card, Product } from './model.ts'

export type Choice = '' | 'yes' | 'no' | 'unknown'
export type GuidedAnswers = {
  purpose: string; goal: string; months: string; monthly: string
  reserve: Choice; debt: Choice; hold: Choice; adult: Choice; mobile: Choice
  holdings: Choice; kbankBalance: string; kakaoBalance: string; tossBalance: string
  kbankCount: string; tossHeld: Choice; tossAccount: Choice
  autoMonths: string; autoUnknown: boolean; renewed: Choice; tossSchedule: Choice; tossTransfers: Choice
}
export const blankAnswers = (): GuidedAnswers => ({
  purpose: '', goal: '', months: '', monthly: '', reserve: '', debt: '', hold: '', adult: '', mobile: '',
  holdings: '', kbankBalance: '', kakaoBalance: '', tossBalance: '', kbankCount: '', tossHeld: '', tossAccount: '',
  autoMonths: '', autoUnknown: false, renewed: '', tossSchedule: '', tossTransfers: '',
})
export type GuidedRule = { product_id: string; option_id: number; bank_id: string; institution: string; name: string; term: number; minimum: number; maximum: number; single: boolean; base_rate: number; max_rate: number; eligibility: Expression; bonus: { id: string; rate: number; when: Expression }[]; bonus_cap: number; model: string; model_basis: string; source_url: string }
export type GuidedCatalog = { start: string; monthly: number[]; months: number[]; rules: GuidedRule[]; projections: Record<string, { principal: number; net_interest: number; gross_balance_ceiling: number }>; protection_limit: number }
export type GuidedResult = { status: string; reason: string; cards: Card[]; missing: string[]; excluded: { name: string; reason: string }[]; provisional: boolean }
export const yesNo = (value: Choice) => value === 'yes' ? true : value === 'no' ? false : null
const won = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= 1000000000
export function validateStep(a: GuidedAnswers, step: number): string {
  if (step === 0 && (!a.purpose || !won(a.goal) || Number(a.goal) <= 0 || !['6', '12', '24', '36', '60'].includes(a.months))) return '저축 목적, 1원 이상의 목표 금액과 기간을 모두 선택해 주세요.'
  if (step === 1 && (!['50000', '100000', '200000', '300000', '500000'].includes(a.monthly) || !a.reserve || !a.debt || !a.hold)) return '매달 가능한 금액과 세 가지 상황에 답해 주세요. 모르면 모르겠어요를 선택할 수 있어요.'
  if (step === 2 && (!a.adult || !a.mobile)) return '가입 기준과 앱 이용 가능 여부에 답해 주세요.'
  if (step === 3) {
    if (!a.holdings || !a.tossAccount) return '기존 예·적금과 토스뱅크 입출금통장 보유 여부에 답해 주세요.'
    if (a.holdings === 'yes' && (![a.kbankBalance, a.kakaoBalance, a.tossBalance].every(won) || !/^\d+$/.test(a.kbankCount) || Number(a.kbankCount) > 100 || !a.tossHeld)) return '은행별 잔액, 코드K 자유적금 개수와 토스 자유 적금 보유 여부를 확인해 주세요. 잔액이 없으면 0을 입력해 주세요.'
  }
  if (step === 4) {
    if ((!a.autoUnknown && (!/^\d+$/.test(a.autoMonths) || Number(a.autoMonths) > Number(a.months))) || !a.renewed) return '자동이체 개월 수와 카카오뱅크 자동연장 여부에 답해 주세요. 개월 수는 목표 기간 안의 정수로 입력해 주세요.'
    if (a.tossAccount !== 'no' && (!a.tossSchedule || !a.tossTransfers)) return '토스뱅크의 두 자동이체 조건에 각각 답해 주세요.'
  }
  return ''
}
export function answerSummary(a: GuidedAnswers) {
  const label = (v: Choice) => v === 'yes' ? '예' : v === 'no' ? '아니요' : v === 'unknown' ? '모르겠어요' : '아직 답하지 않음'
  const rows = [
    { title: '저축 목적', value: a.purpose || '아직 선택하지 않음' },
    { title: '목표 금액 · 기간', value: `${Number(a.goal || 0).toLocaleString('ko-KR')}원 · ${a.months || '—'}개월` },
    { title: '월 저축 여력', value: `${Number(a.monthly || 0).toLocaleString('ko-KR')}원` },
    { title: '생활비·비상금 별도 확보', value: label(a.reserve) },
    { title: '저축보다 먼저 검토할 대출 상환', value: label(a.debt) },
    { title: '만기까지 유지할 계획', value: label(a.hold) },
    { title: '국내 거주 성인 내국인', value: label(a.adult) },
    { title: '은행 앱 가입 가능', value: label(a.mobile) },
    { title: '비교 은행의 기존 잔액·적금 보유', value: label(a.holdings) },
    { title: '토스뱅크 입출금통장 보유', value: label(a.tossAccount) },
    { title: '계획한 자동이체 기간', value: a.autoUnknown ? '모르겠어요' : `${a.autoMonths || '0'}개월` },
    { title: '카카오 자동연장 원리금 해당', value: label(a.renewed) },
  ]
  if (a.holdings === 'yes') rows.push(...[
    { title: '케이뱅크 기존 잔액', value: `${Number(a.kbankBalance).toLocaleString('ko-KR')}원` },
    { title: '카카오뱅크 기존 잔액', value: `${Number(a.kakaoBalance).toLocaleString('ko-KR')}원` },
    { title: '토스뱅크 기존 잔액', value: `${Number(a.tossBalance).toLocaleString('ko-KR')}원` },
    { title: '보유한 코드K 자유적금', value: `${a.kbankCount}개` },
    { title: '토스 자유 적금 보유', value: label(a.tossHeld) },
  ])
  if (a.tossAccount !== 'no') rows.push({ title: '토스 가입 시 설정한 자동이체 사용', value: label(a.tossSchedule) }, { title: '토스 모든 자동이체 성공 계획', value: label(a.tossTransfers) })
  return rows
}

export function guidedFacts(a: GuidedAnswers): Record<string, unknown> {
  return {
    age: a.adult === 'yes' ? 19 : null,
    nationality: a.adult === 'yes' ? 'KR' : null, residency: a.adult === 'yes' ? 'KR' : null,
    'held_count.finlife:202608:saving:0014674:01012000200000000003': a.holdings === 'no' ? 0 : a.holdings === 'yes' ? Number(a.kbankCount) : null,
    toss_account: yesNo(a.tossAccount), 'kakao.auto_months': a.autoUnknown ? null : Number(a.autoMonths),
    'kakao.renewed_principal': yesNo(a.renewed), 'contract.hold_to_maturity': yesNo(a.hold),
    'toss.original_monthly_schedule': yesNo(a.tossSchedule), 'toss.all_transfers': yesNo(a.tossTransfers),
  }
}
const factTitle: Record<string, string> = {
  toss_account: '토스뱅크 입출금통장 보유 여부', 'kakao.auto_months': '카카오뱅크 자동이체 개월 수',
  'kakao.renewed_principal': '카카오뱅크 자동연장 원리금 여부', 'contract.hold_to_maturity': '만기 유지 계획',
  'toss.original_monthly_schedule': '토스 가입 시 설정한 월 자동이체', 'toss.all_transfers': '토스 모든 자동이체 성공 계획',
}
export function recommendGuided(a: GuidedAnswers, catalog: GuidedCatalog): GuidedResult {
  const stopped = (status: string, reason: string): GuidedResult => ({ status, reason, cards: [], missing: [], excluded: [], provisional: true })
  for (let step = 0; step < 2; step++) { const error = validateStep(a, step); if (error) return stopped('NEEDS_INPUT', error) }
  if (a.reserve !== 'yes') return stopped('ADJUST_CASH', '생활비와 비상금을 먼저 남겨두고, 그 밖에서 매달 모을 수 있는 금액을 정해 주세요.')
  if (a.debt !== 'no') return stopped('REVIEW_DEBT', '먼저 검토할 대출 상환이 있거나 아직 모른다면, 저축을 확정하기 전에 대출 비용과 상환 계획을 확인해 주세요.')
  if (a.hold !== 'yes') return stopped('NEEDS_WITHDRAWAL_TERMS', '중간에 쓸 수 있는 돈은 따로 남겨야 해요. 이 시연은 만기까지 유지하는 적금만 비교하므로, 중도인출이 필요하면 조건을 먼저 확인해 주세요.')
  if (validateStep(a, 2)) return stopped('NEEDS_INPUT', validateStep(a, 2))
  if (a.adult !== 'yes') return stopped('NEEDS_ONBOARDING_REVIEW', '이번 시연에서 연결한 가입 기준은 국내 거주 만 19세 이상 내국인이에요. 해당하지 않거나 확실하지 않다면 가입 절차를 먼저 확인해야 해요.')
  if (a.mobile !== 'yes') return stopped('DIGITAL_CHANNEL_REQUIRED', '현재 연결한 세 상품은 앱으로 가입해요. 앱 가입이 가능한지 확인한 뒤 다시 비교해 주세요.')
  if (validateStep(a, 3)) return stopped('NEEDS_INPUT', validateStep(a, 3))
  if (a.holdings === 'unknown') return stopped('NEEDS_HOLDINGS', '기존 잔액과 보유 적금에 따라 가입 가능 여부가 달라져요. 케이뱅크·카카오뱅크·토스뱅크의 보유 현황을 먼저 확인해 주세요.')
  if (validateStep(a, 4)) return stopped('NEEDS_INPUT', validateStep(a, 4))
  const monthly = Number(a.monthly), months = Number(a.months), goal = Number(a.goal)
  if (!catalog.monthly.includes(monthly) || !catalog.months.includes(months)) return stopped('NEEDS_INPUT', '시연에서 지원하는 금액과 기간을 선택해 주세요.')
  const facts = guidedFacts(a), known: { card: Card; upper: number; missing: string[]; id: number }[] = [], possible: { upper: number; missing: string[] }[] = []
  const excluded = new Map<string, { name: string; reason: string }>()
  const included = new Set<string>()
  for (const rule of catalog.rules) {
    if (rule.term > months) continue
    const exclude = (reason: string) => excluded.set(rule.product_id, { name: rule.name, reason })
    if (monthly < rule.minimum || monthly > rule.maximum) { exclude(`월 납입 범위 ${rule.minimum.toLocaleString('ko-KR')}~${rule.maximum.toLocaleString('ko-KR')}원에 맞지 않아요.`); continue }
    if (rule.single && a.holdings === 'yes' && a.tossHeld === 'yes') { exclude('이미 같은 적금을 보유해 1인 1계좌 조건에 맞지 않아요.'); continue }
    const eligibility = evaluate(rule.eligibility, facts)
    if (eligibility.state === false) { exclude(rule.name.includes('코드K') ? '기존 코드K 자유적금 개수 조건에 맞지 않아요.' : '필요한 토스뱅크 입출금통장을 보유하지 않았어요.'); continue }
    const components = rule.bonus.map(b => ({ ...b, ...evaluate(b.when, facts) }))
    const low = Math.min(rule.bonus_cap, components.filter(b => b.state === true).reduce((sum, b) => sum + b.rate, 0))
    const high = Math.min(rule.bonus_cap, components.filter(b => b.state !== false).reduce((sum, b) => sum + b.rate, 0))
    const estimate = catalog.projections[`${rule.option_id}|${monthly}|${(rule.base_rate + low).toFixed(2)}`]
    const ceiling = catalog.projections[`${rule.option_id}|${monthly}|${(rule.base_rate + high).toFixed(2)}`]
    if (!estimate || !ceiling) return stopped('DATA_ERROR', '이 조건의 계산 근거를 찾지 못했어요. 다시 시작해 주세요.')
    const existing = a.holdings === 'no' ? 0 : Number(rule.institution.includes('케이') ? a.kbankBalance : rule.institution.includes('카카오') ? a.kakaoBalance : a.tossBalance)
    if (existing + ceiling.gross_balance_ceiling > catalog.protection_limit) { exclude('기존 잔액을 합치면 이번 시연의 은행별 비교 한도를 넘어요.'); continue }
    const missing = [...eligibility.missing, ...components.flatMap(b => b.state === null ? b.missing : [])]
    if (rule.single && a.holdings === 'yes' && a.tossHeld === 'unknown') missing.push('토스 자유 적금 보유 여부')
    const upper = monthly * months + ceiling.net_interest
    possible.push({ upper, missing })
    if (eligibility.state === null || (rule.single && a.holdings === 'yes' && a.tossHeld === 'unknown')) { exclude('가입에 필요한 답변을 아직 확인하지 못했어요.'); continue }
    included.add(rule.product_id)
    const product: Product = { product_id: rule.product_id, option_id: rule.option_id, institution: rule.institution, name: rule.name, rate: rule.base_rate + low, base_rate: rule.base_rate, term: rule.term, net_interest: estimate.net_interest, source: rule.source_url, calculation_assumption: rule.model_basis, maturity: addMonths(catalog.start, rule.term), bonus_earned: components.filter(b => b.state === true).map(b => b.id), additional_cost: 0 }
    const total = monthly * months + estimate.net_interest
    const why = [
      `답변한 월 ${monthly.toLocaleString('ko-KR')}원이 상품 납입 범위에 맞아요.`,
      low ? `자동이체 답변을 반영해 기본 ${rule.base_rate.toFixed(2)}%에 우대 ${low.toFixed(2)}%p를 더했어요.` : components.length ? '충족이 확인되지 않은 우대는 금리에 더하지 않았어요.' : '추가 우대 실적 없이 기본금리로 비교해요.',
      `상품 만기는 ${rule.term}개월로, 목표 기간 ${months}개월 안에 들어와요.`,
    ]
    known.push({ card: { products: [product], goal_total: total, shortfall: Math.max(0, goal - total), why, role: '' }, upper, missing, id: rule.option_id })
  }
  known.sort((a, b) => a.card.shortfall - b.card.shortfall || b.card.goal_total - a.card.goal_total || a.id - b.id)
  const best = known.filter((item, index, all) => all.findIndex(other => other.card.products[0].product_id === item.card.products[0].product_id) === index).slice(0, 3)
  const missing = [...new Set(possible.filter(p => p.missing.length && (best.length < 3 || p.upper >= best[best.length - 1].card.goal_total)).flatMap(p => p.missing).map(k => factTitle[k] || k))]
  const provisional = missing.length > 0
  const cards = best.map((item, index) => ({ ...item.card, role: index ? `대안 ${index}` : '추천', provisional }))
  const status = provisional ? 'NEEDS_ANSWERS' : !cards.length ? 'NO_MATCH' : cards[0].shortfall ? 'ADJUST_GOAL' : 'COMPARISON'
  return { status, cards, provisional, missing, excluded: [...excluded].filter(([id]) => !included.has(id)).map(([, value]) => value), reason: provisional ? '모르는 답변에 따라 순서가 달라질 수 있어요. 확인한 조건만 반영한 초안이에요.' : !cards.length ? '답변한 조건에 맞는 상품을 이번 비교 범위에서 찾지 못했어요.' : cards[0].shortfall ? '지금 월 저축액과 기간으로는 목표 금액에 부족해요. 목표를 조정하거나 초안으로 남겨 보세요.' : '같은 월 저축액으로 비교하고, 답변상 적용할 수 있는 금리와 예상 금액을 반영했어요.' }
}
