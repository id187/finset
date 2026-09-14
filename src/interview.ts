import { recommendCatalogue } from './catalogue.ts'
import type { Catalogue, ComparisonContext, Filters, FullResult } from './catalogue.ts'
import { quickValidate } from './quick.ts'
import type { QuickInputs } from './quick.ts'

export type Answer = 'yes' | 'no' | 'unknown'
export type InterviewId = 'liquidity' | 'separate' | 'flexible' | 'savingsBank' | 'creditUnion' | 'transfer' | 'tossAccount' | 'renewed' | 'hanaAccount'
export type InterviewAnswers = Partial<Record<InterviewId, Answer>>
export type InterviewQuestion = { id: InterviewId; title: string; hint: string; why: string; summary: string; yes: string; no: string; unknown: string }
export type Answered = { question: InterviewQuestion; answer: Answer }
export type InterviewState = {
  kind: 'question' | 'complete' | 'blocked' | 'invalid'; history: Answered[];
  question?: InterviewQuestion; result?: FullResult; title?: string; reason?: string;
  candidateCount: number; initialCount: number; filters: Filters; context: ComparisonContext;
  extra: Record<string, unknown>; calculationInput: QuickInputs;
}
export const interviewQuestions: Record<InterviewId, InterviewQuestion> = {
  liquidity: { id: 'liquidity', title: '만기 전에 이 돈을 꺼내 써야 할 가능성이 있나요?', hint: '생활비나 예정된 큰 지출에 쓸 돈인지 생각해 주세요.', why: '중간에 필요한 돈을 만기 유지 전제로 추천하지 않기 위해 물어요.', summary: '만기 전 사용 가능성', yes: '중간에 쓸 수 있어요', no: '만기까지 모을 수 있어요', unknown: '아직 예상하기 어려워요' },
  separate: { id: 'separate', title: '중간에 쓸 돈은 따로 남기고, 입력한 금액은 만기까지 모을 수 있나요?', hint: '입력한 월 저축액에 생활비·비상금이 포함됐다면 먼저 금액을 바꿔 주세요.', why: '따로 남길 돈을 제외한 금액으로 적금 후보를 비교해요.', summary: '사용할 돈을 별도 확보', yes: '입력한 금액은 유지할 수 있어요', no: '월 저축액부터 다시 정할게요', unknown: '필요한 돈을 먼저 확인할게요' },
  flexible: { id: 'flexible', title: '매달 납입액을 바꿀 수 있는 적금을 원하나요?', hint: '자유적립식도 최소·최대 금액과 우대 실적 조건은 지켜야 해요.', why: '예라고 답하면 자유적립식만 남겨요. 예상 금액은 매달 같은 금액을 넣는 기준이에요.', summary: '자유적립식 선호', yes: '자유적립식만 볼게요', no: '정액적립식도 괜찮아요', unknown: '두 방식 모두 비교할게요' },
  savingsBank: { id: 'savingsBank', title: '저축은행 상품도 함께 비교할까요?', hint: '현재 비교 범위에는 앱·웹으로 가입하는 저축은행 적금도 있어요.', why: '이용할 금융기관의 범위를 직접 정할 수 있어요.', summary: '저축은행 포함', yes: '함께 비교할게요', no: '이번에는 제외할게요', unknown: '이번에는 제외하고 볼게요' },
  creditUnion: { id: 'creditUnion', title: '신협 상품도 함께 비교할까요?', hint: '수집 자료에서 비대면 가입 경로를 확인한 신협 적금을 비교해요.', why: '예라고 답하면 신협도 후보에 넣어요. 실제 개설 절차는 해당 기관에서 확인해야 해요.', summary: '신협 포함', yes: '함께 비교할게요', no: '이번에는 제외할게요', unknown: '이번에는 제외하고 볼게요' },
  transfer: { id: 'transfer', title: '가입할 때 설정한 월 자동이체를 만기까지 빠짐없이 유지할 수 있나요?', hint: '직접 납입하거나 아직 모르겠다면 자동이체 우대를 더하지 않아요.', why: '현재 후보의 우대금리와 추천 순위가 달라질 수 있어요.', summary: '자동이체 유지 계획', yes: '모든 회차를 유지할 계획이에요', no: '직접 넣을게요', unknown: '기본금리로 비교할게요' },
  tossAccount: { id: 'tossAccount', title: '토스뱅크 통장 또는 서브 통장을 가지고 있나요?', hint: '토스뱅크 자유 적금의 가입대상 조건이에요.', why: '입출금통장 보유를 확인해야 이 상품을 추천 후보로 넣을 수 있어요.', summary: '토스뱅크 입출금통장 보유', yes: '해당 통장이 있어요', no: '해당 통장이 없어요', unknown: '확인 전에는 후보에서 제외해요' },
  renewed: { id: 'renewed', title: '이번 비교 금액에 카카오뱅크 적금의 자동연장 원리금이 포함되나요?', hint: '만기 자동연장된 원리금에는 카카오뱅크 자동이체 우대를 적용하지 않아요.', why: '새로 납입하는 돈과 자동연장 원리금을 구분해야 우대를 계산할 수 있어요.', summary: '카카오 자동연장 원리금 포함', yes: '해당 우대는 제외할게요', no: '새로 넣는 돈이에요', unknown: '확인 전에는 우대를 제외해요' },
  hanaAccount: { id: 'hanaAccount', title: '하나은행 입출금통장에서 자동이체할 수 있나요?', hint: '내맘적금은 하나은행 통장에서 계약기간의 절반 이상 자동이체해야 우대를 받을 수 있어요.', why: '현재 후보에 적용할 수 있는 우대금리를 확인하는 질문이에요.', summary: '하나은행 계좌 자동이체', yes: '해당 계좌에서 이체할 수 있어요', no: '해당 계좌를 이용하지 않아요', unknown: '확인 전에는 우대를 제외해요' },
}

const validAnswer = (value: unknown): value is Answer => ['yes', 'no', 'unknown'].includes(value as string)
const fact = (answer: Answer | undefined) => answer === 'yes' ? true : answer === 'no' ? false : null

export function interviewState(input: QuickInputs, answers: InterviewAnswers, catalogue: Catalogue): InterviewState {
  const history: Answered[] = []
  const filters: Filters = { sector: 'all', flexible: false }
  const context: ComparisonContext = { sectors: ['bank', 'savings_bank', 'credit_union'], tossAccount: null, renewedPrincipal: null, holdToMaturity: true }
  const calculationInput: QuickInputs = { ...input, transfer: 'unknown' }
  const extra: Record<string, unknown> = {}
  const eligible = () => catalogue.rules.filter(r => r.term <= Number(input.months) && Number(input.monthly) >= r.minimum && (r.maximum === null || Number(input.monthly) <= r.maximum) && (!filters.flexible || r.flexible) && context.sectors!.includes(r.sector))
  const count = () => new Set(eligible().map(r => r.product_id)).size
  const initialCount = count()
  const state = (kind: InterviewState['kind'], details: Partial<InterviewState> = {}): InterviewState => ({ kind, history, filters, context, extra, calculationInput, candidateCount: count(), initialCount, ...details })
  const ask = (id: InterviewId) => {
    const answer = answers[id]
    if (!validAnswer(answer)) return state('question', { question: interviewQuestions[id] })
    history.push({ question: interviewQuestions[id], answer }); return null
  }
  const invalid = quickValidate(input)
  if (invalid) return state('invalid', { reason: invalid })
  let next = ask('liquidity'); if (next) return next
  if (answers.liquidity !== 'no') {
    next = ask('separate'); if (next) return next
    if (answers.separate !== 'yes') return state('blocked', { title: '중간에 쓸 돈부터 나눠주세요', reason: '현재 비교는 만기까지 유지하는 적금 기준이에요. 생활비·예정 지출을 따로 남기고, 유지할 수 있는 월 금액을 정한 뒤 다시 비교해 주세요.', candidateCount: 0 })
  }
  // Preferences are asked only while they can change the available scope.
  if (eligible().some(r => r.flexible) && eligible().some(r => !r.flexible)) {
    next = ask('flexible'); if (next) return next
    filters.flexible = answers.flexible === 'yes'
  }
  if (eligible().some(r => r.sector === 'savings_bank')) {
    next = ask('savingsBank'); if (next) return next
    if (answers.savingsBank !== 'yes') context.sectors = context.sectors!.filter(s => s !== 'savings_bank')
  }
  if (eligible().some(r => r.sector === 'credit_union')) {
    next = ask('creditUnion'); if (next) return next
    if (answers.creditUnion !== 'yes') context.sectors = context.sectors!.filter(s => s !== 'credit_union')
  }
  const consumed = new Set<InterviewId>()
  // Recalculate after every relevant answer. A stale answer to a question that
  // was skipped in the new path never enters the facts or the explanation.
  for (let i = 0; i < 5; i++) {
    const result = recommendCatalogue(calculationInput, catalogue, filters, extra, context)
    const required: [InterviewId, string[]][] = [
      ['tossAccount', ['toss_account']],
      ['transfer', ['kakao.auto_months', 'toss.original_monthly_schedule', 'toss.all_transfers', 'hana.auto_months_before_maturity', 'jb.auto_months']],
      ['renewed', ['kakao.renewed_principal']],
      ['hanaAccount', ['hana.account']],
    ]
    const pending = required.find(([id, keys]) => !consumed.has(id) && keys.some(key => result.missing.includes(key)))
    if (!pending) return state('complete', { result, candidateCount: result.matched })
    const [id] = pending
    next = ask(id); if (next) return next
    consumed.add(id)
    if (id === 'tossAccount') context.tossAccount = fact(answers[id])
    if (id === 'transfer') calculationInput.transfer = answers[id]!
    if (id === 'renewed') context.renewedPrincipal = fact(answers[id])
    if (id === 'hanaAccount') extra['hana.account'] = fact(answers[id])
  }
  return state('complete', { result: recommendCatalogue(calculationInput, catalogue, filters, extra, context) })
}

export function answerInterview(input: QuickInputs, answers: InterviewAnswers, catalogue: Catalogue, id: InterviewId, answer: Answer): InterviewAnswers {
  const current = interviewState(input, answers, catalogue)
  if (current.question?.id !== id || !validAnswer(answer)) return answers
  return { ...Object.fromEntries(current.history.map(row => [row.question.id, row.answer])), [id]: answer }
}

export function reviseInterview(state: InterviewState, id: InterviewId): InterviewAnswers {
  const index = state.history.findIndex(row => row.question.id === id)
  return Object.fromEntries(state.history.slice(0, Math.max(0, index)).map(row => [row.question.id, row.answer]))
}

export function interviewReasons(state: InterviewState) {
  const rows = state.history
  const is = (id: InterviewId, answer: Answer) => rows.some(row => row.question.id === id && row.answer === answer)
  const reasons = ['입력한 월 금액과 목표 기간에 맞는 상품만 남겼어요.']
  if (is('liquidity', 'no') || is('separate', 'yes')) reasons.push('만기까지 모을 수 있다고 답해 만기 유지 기준으로 비교했어요.')
  if (is('flexible', 'yes')) reasons.push('납입액을 바꾸고 싶다는 답변에 따라 자유적립식만 남겼어요.')
  if (rows.some(row => row.question.id === 'savingsBank' && row.answer !== 'yes')) reasons.push('저축은행은 이번 비교에서 제외했어요.')
  if (rows.some(row => row.question.id === 'creditUnion' && row.answer !== 'yes')) reasons.push('신협은 이번 비교에서 제외했어요.')
  if (is('transfer', 'no') || is('transfer', 'unknown')) reasons.push('자동이체 우대 없이 기본금리로 비교했어요.')
  return reasons
}

export function interviewAdjustments(input: QuickInputs, answers: InterviewAnswers, catalogue: Catalogue) {
  if (input.purpose === '일단 모으기') return []
  const options: { label: string; input: QuickInputs }[] = []
  // A proposed change must replay its questions before claiming a new result.
  // Skip alternatives that need new answers or cannot meet the goal yet.
  for (const monthly of catalogue.monthly.filter(n => n > Number(input.monthly))) {
    const next = { ...input, monthly: String(monthly) }, state = interviewState(next, answers, catalogue)
    if (state.kind === 'complete' && state.result?.cards[0]?.shortfall === 0) { options.push({ label: `월 ${monthly / 10000}만원으로 비교`, input: next }); break }
  }
  for (const months of catalogue.months.filter(n => n > Number(input.months))) {
    const next = { ...input, months: String(months) }, state = interviewState(next, answers, catalogue)
    if (state.kind === 'complete' && state.result?.cards[0]?.shortfall === 0) { options.push({ label: `${months}개월로 늘려 비교`, input: next }); break }
  }
  return options
}
