import { evaluate, evaluateBonus } from './offline.ts'
import type { Expression } from './offline.ts'
import { projectSaving } from './projection.ts'
import { addMonths } from './model.ts'
import type { Card, Product } from './model.ts'
import { quickValidate } from './quick.ts'
import type { QuickInputs } from './quick.ts'
import type { GuidedResult } from './guided.ts'

export type Question = { key: string; title: string; type: string }
export type CatalogueRule = {
  product_id: string; option_id: number; bank_id: string; institution: string; name: string; sector: string;
  term: number; minimum: number; maximum: number | null; flexible: boolean; single: boolean;
  base_rate: number; max_rate: number; eligibility: Expression;
  bonus: { id: string; rate: number; when: Expression; exclusive_group?: string }[]; bonus_cap: number;
  model: string; model_basis: string; source_url: string; product_url: string; source_text: string;
  eligibility_text: string; notes: string; questions: Question[]; bonus_basis: string;
}
export type AuditReport = {
  snapshot: string; source_products: number; rate_options: number; condition_fragments: number;
  comparison_products: number; comparison_options: number; bonus_question_products: number;
  statuses: Record<string, number>; option_issue_counts: Record<string, number>; source_preserved: boolean;
  databases: { name: string; integrity: string; preserved: boolean; sha256: string }[]; notice: string;
}
export type Catalogue = { version: number; start: string; months: number[]; monthly: number[]; comparison_limit: number;
  rules: CatalogueRule[]; report: AuditReport }
export type Filters = { sector: string; flexible: boolean }
export const defaultFilters = (): Filters => ({ sector: 'all', flexible: false })
export const sectors = [{ id: 'all', label: '전체' }, { id: 'bank', label: '은행' }, { id: 'savings_bank', label: '저축은행' }, { id: 'credit_union', label: '신협' }]
export type FullResult = GuidedResult & { questions: Question[]; compared: number; matched: number }

export function unpackCatalogue(raw: unknown): Catalogue {
  const data = raw as Catalogue & { groups: (Partial<CatalogueRule> & { options: Partial<CatalogueRule>[] })[] }
  if (data.version !== 2 || !Array.isArray(data.groups) || !data.report?.source_preserved) throw new Error('상품 데이터의 검증 정보를 확인할 수 없어요.')
  const rules = data.groups.flatMap(({ options, ...group }) => options.map(o => ({ ...group, ...o } as CatalogueRule)))
  if (rules.length !== data.report.comparison_options || new Set(rules.map(r => r.option_id)).size !== rules.length || data.groups.length !== data.report.comparison_products) throw new Error('상품 데이터 개수가 검증 결과와 달라요.')
  return { ...data, rules }
}

let cache: Promise<Catalogue> | undefined
export function loadCatalogue() {
  if (!cache) cache = fetch(`${import.meta.env.BASE_URL}demo/full-catalogue.json`).then(async response => {
    if (!response.ok) throw new Error('상품 데이터를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.')
    return unpackCatalogue(await response.json())
  }).catch(error => { cache = undefined; throw error })
  return cache
}

export function recommendCatalogue(q: QuickInputs, catalogue: Catalogue, filters = defaultFilters(), extra: Record<string, unknown> = {}): FullResult {
  const empty = (status: string, reason: string): FullResult => ({ status, reason, cards: [], missing: [], questions: [], excluded: [], provisional: true, compared: 0, matched: 0 })
  const invalid = quickValidate(q)
  if (invalid || !q.transfer) return empty('NEEDS_INPUT', invalid || '자동이체 계획을 선택해 주세요.')
  if (!sectors.some(s => s.id === filters.sector)) return empty('NEEDS_INPUT', '금융기관 종류를 선택해 주세요.')
  const monthly = Number(q.monthly), months = Number(q.months)
  const goal = q.purpose === '일단 모으기' ? monthly * months : Number(q.goal)
  const facts: Record<string, unknown> = {
    age: 19, nationality: 'KR', residency: 'KR', toss_account: true,
    'held_count.finlife:202608:saving:0014674:01012000200000000003': 0,
    'kakao.auto_months': q.transfer === 'unknown' ? null : q.transfer === 'yes' ? months : 0,
    'kakao.renewed_principal': false, 'contract.hold_to_maturity': true,
    'toss.original_monthly_schedule': q.transfer === 'unknown' ? null : q.transfer === 'yes',
    'toss.all_transfers': q.transfer === 'unknown' ? null : q.transfer === 'yes',
    'hana.auto_months_before_maturity': q.transfer === 'unknown' ? null : q.transfer === 'yes' ? months : 0,
    'jb.auto_months': q.transfer === 'unknown' ? null : q.transfer === 'yes' ? months : 0,
  }
  const coreKeys = new Set(Object.keys(facts))
  // Only declared supplementary questions can supply facts. Core profile and
  // transfer facts cannot be overwritten by an arbitrary caller or stale state.
  for (const rule of catalogue.rules) for (const question of rule.questions) {
    if (!(question.key in facts) && (typeof extra[question.key] === 'boolean' || extra[question.key] === null)) facts[question.key] = extra[question.key]
  }
  const projectionCache = new Map<string, ReturnType<typeof projectSaving>>()
  const project = (r: CatalogueRule, rate: number) => {
    const key = `${r.term}|${rate}|${r.model}`
    if (!projectionCache.has(key)) projectionCache.set(key, projectSaving(monthly, r.term, rate, r.model, catalogue.start))
    return projectionCache.get(key)!
  }
  const all: { card: Card; rule: CatalogueRule; upper: number; missing: string[] }[] = []
  const excluded = new Map<string, { name: string; reason: string }>()
  const examined = new Set<string>()
  for (const rule of catalogue.rules) {
    if (filters.sector !== 'all' && rule.sector !== filters.sector || filters.flexible && !rule.flexible) continue
    examined.add(rule.product_id)
    const exclude = (reason: string) => excluded.set(rule.product_id, { name: `${rule.institution} · ${rule.name}`, reason })
    if (rule.term > months) { exclude('선택한 목표일보다 상품 만기가 늦어요.'); continue }
    if (monthly < rule.minimum || rule.maximum !== null && monthly > rule.maximum) { exclude(`월 납입 범위 ${rule.minimum.toLocaleString('ko-KR')}원 이상${rule.maximum === null ? '' : ` ~ ${rule.maximum.toLocaleString('ko-KR')}원 이하`}에 맞지 않아요.`); continue }
    if (evaluate(rule.eligibility, facts).state !== true) { exclude('가입조건을 확인할 수 없어 추천에서 제외했어요.'); continue }
    const evaluated = evaluateBonus(rule, facts)
    const rate = evaluated.rate
    const low = project(rule, rate), high = project(rule, rule.base_rate + evaluated.possible_bonus_rate)
    if (high.gross_balance_ceiling > catalogue.comparison_limit) { exclude('원리금이 시연의 기관별 비교 한도 1억원을 넘어요.'); continue }
    const p: Product = { product_id: rule.product_id, option_id: rule.option_id, institution: rule.institution, name: rule.name,
      term: rule.term, rate, base_rate: rule.base_rate, net_interest: low.net_interest,
      maturity: addMonths(catalogue.start, rule.term), source: rule.product_url || rule.source_url,
      calculation_assumption: rule.model_basis, bonus_earned: evaluated.earned, additional_cost: 0 }
    const total = monthly * months + low.net_interest
    all.push({ rule, upper: monthly * months + high.net_interest, missing: evaluated.missing,
      card: { products: [p], role: '', goal_total: total, shortfall: Math.max(0, goal - total), why: [
        `월 ${monthly.toLocaleString('ko-KR')}원이 납입 범위에 맞아요.`,
        `${rule.flexible ? '자유적립식' : '정액적립식'} · 앱 또는 웹으로 가입할 수 있는 상품이에요.`,
        '수집한 원문의 조건과 현재 답변으로 적용 금리를 계산했어요.',
      ] } })
  }
  all.sort((a, b) => a.card.shortfall - b.card.shortfall || b.card.goal_total - a.card.goal_total || a.rule.option_id - b.rule.option_id)
  const included = new Set<string>(), best: typeof all = []
  for (const item of all) if (!included.has(item.rule.product_id)) { included.add(item.rule.product_id); if (best.length < 3) best.push(item) }
  const cutoff = best.length === 3 ? best[2].card.goal_total : 0
  const competitive = all.filter(item => item.missing.length && item.upper >= cutoff)
  const missing = [...new Set(competitive.flatMap(item => item.missing))]
  const questionCandidates = [...competitive, ...all.filter(item => item.rule.questions.some(question => question.key in extra))]
  const questions = [...new Map(questionCandidates.flatMap(item => item.rule.questions.filter(question => !coreKeys.has(question.key) && (missing.includes(question.key) || question.key in extra))).map(q => [q.key, q])).values()]
  const provisional = missing.length > 0
  const cards = best.map((item, index) => ({ ...item.card, role: index ? `대안 ${index}` : '추천', provisional }))
  return { cards, questions, missing, provisional, compared: examined.size, matched: included.size,
    excluded: [...excluded].filter(([id]) => !included.has(id)).slice(0, 30).map(([, value]) => value),
    status: !cards.length ? 'NO_MATCH' : provisional ? 'NEEDS_ANSWERS' : cards[0].shortfall ? 'ADJUST_GOAL' : 'COMPARISON',
    reason: !cards.length ? '선택한 금융기관·금액·기간에 맞는 상품이 없어요. 필터나 저축 계획을 바꿔 보세요.' : provisional ? '확인하지 않은 우대는 제외했어요. 답변에 따라 추천 순서가 달라질 수 있어요.' : '같은 월 저축액과 목표 기간으로 예상 세후 금액을 비교했어요.' }
}

export function catalogueAdjustments(q: QuickInputs, catalogue: Catalogue, filters: Filters, extra: Record<string, unknown>) {
  if (q.purpose === '일단 모으기') return []
  const options: { label: string; input: QuickInputs }[] = []
  for (const monthly of catalogue.monthly.filter(n => n > Number(q.monthly))) {
    const input = { ...q, monthly: String(monthly) }
    if (recommendCatalogue(input, catalogue, filters, extra).cards[0]?.shortfall === 0) { options.push({ label: `월 ${monthly / 10000}만원으로 비교`, input }); break }
  }
  for (const months of catalogue.months.filter(n => n > Number(q.months))) {
    const input = { ...q, months: String(months) }
    if (recommendCatalogue(input, catalogue, filters, extra).cards[0]?.shortfall === 0) { options.push({ label: `${months}개월로 늘려 비교`, input }); break }
  }
  return options
}
