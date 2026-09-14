import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, ChevronLeft, Info, RefreshCw, ShieldCheck, Sparkles, Target } from 'lucide-react'
import type { GuidedAnswers } from './guided'
import { loadCatalogue } from './catalogue'
import type { Catalogue } from './catalogue'
import { bumpAmount, quickBlank, quickFromAnswers, quickValidate } from './quick'
import type { QuickInputs } from './quick'
import { answerInterview, interviewState, interviewReasons, interviewAdjustments, reviseInterview } from './interview'
import type { Answer, InterviewAnswers, InterviewId } from './interview'
import { projectSaving } from './projection'
import { money } from './model'

const goals = [{ name: '일단 모으기', amount: '', hint: '목표는 천천히 정할게요' }, { name: '여행 자금', amount: '3000000', hint: '300만원' }, { name: '첫 목돈', amount: '5000000', hint: '500만원' }, { name: '주거 준비', amount: '10000000', hint: '1,000만원' }]
const answerLabels: Record<Answer, string> = { yes: '예', no: '아니오', unknown: '모르겠어요' }
const profileLines = ['국내 거주 만 19세 내국인 · 금융기관 앱·웹 가입 가능', '우선 검토할 대출 상환 없음', '비교하는 금융기관의 기존 예·적금 잔액 0원 · 보유 적금 없음']

function AmountInput({ value, onChange, goal = false }: { value: string; onChange: (v: string) => void; goal?: boolean }) {
  const id = goal ? 'quick-goal' : 'quick-monthly'
  return <div className="quick-amount"><label htmlFor={id}>{goal ? '목표 금액' : '매달 얼마까지 저축할 수 있나요?'}</label><div className="money-input"><input id={id} type="number" inputMode="numeric" min="1" max="1000000000" step="1" placeholder={goal ? '목표 금액을 입력해 주세요' : '직접 입력해 주세요'} value={value} onChange={e => onChange(e.target.value)}/><span>원</span></div><div className="quick-increments">{(goal ? [100000, 500000, 1000000] : [10000, 30000, 50000]).map(n => <button type="button" key={n} onClick={() => onChange(bumpAmount(value, n))}>+{n / 10000}만</button>)}<button type="button" onClick={() => onChange(bumpAmount(value, goal ? -100000 : -10000))}>{goal ? '−10만' : '−1만'}</button><button type="button" onClick={() => onChange('')}>초기화</button></div><small>{value && Number(value) > 0 ? `${money(Number(value))}원${goal ? '' : ' / 월'}` : '버튼을 여러 번 눌러 더할 수도 있어요.'}</small></div>
}

type Props = { initialAnswers?: GuidedAnswers; showResults?: boolean; onExit: () => void; onBrowse: () => void }
export function GuidedFlow(props: Props) {
  const [catalog, setCatalog] = useState<Catalogue | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => { let active = true; setError(''); loadCatalogue().then(data => { if (active) setCatalog(data) }).catch(e => { if (active) setError(e.message) }); return () => { active = false } }, [retry])
  if (error) return <div className="card empty-state" role="alert"><h2>상품 데이터를 불러오지 못했어요</h2><p>{error}</p><button className="primary" onClick={() => setRetry(n => n + 1)}>다시 시도</button></div>
  if (!catalog) return <div className="loading-state" role="status"><RefreshCw className="spin"/><h2>비교할 상품을 준비하고 있어요</h2><p>전체 데이터의 검증 결과를 불러옵니다.</p></div>
  return <CatalogueFlow {...props} catalog={catalog}/>
}
function CatalogueFlow({ initialAnswers, onExit, onBrowse, catalog }: Props & { catalog: Catalogue }) {
  const [input, setInput] = useState<QuickInputs>(() => initialAnswers ? quickFromAnswers(initialAnswers) : quickBlank())
  const [phase, setPhase] = useState<'input' | 'interview'>('input')
  const [answers, setAnswers] = useState<InterviewAnswers>({})
  const [error, setError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const state = useMemo(() => interviewState(input, answers, catalog), [input, answers, catalog])
  const result = phase === 'interview' && state.kind === 'complete' ? state.result : undefined
  const question = phase === 'interview' ? state.question : undefined
  const blocked = phase === 'interview' && state.kind === 'blocked'
  const adjustments = useMemo(() => result?.cards[0]?.shortfall ? interviewAdjustments(input, answers, catalog) : [], [result, input, answers, catalog])
  const first = result?.cards[0]
  const noGoal = input.purpose === '일단 모으기'
  const scroll = () => window.scrollTo({ top: 0, behavior: 'instant' })
  const set = <K extends keyof QuickInputs>(key: K, value: QuickInputs[K]) => { setInput(a => ({ ...a, [key]: value })); setAnswers({}); setError('') }
  const editAmount = () => { setPhase('input'); setError(''); scroll() }
  const revise = (id: InterviewId) => { setAnswers(reviseInterview(state, id)); setPhase('interview'); scroll() }
  const next = () => { const invalid = quickValidate(input); if (invalid) { setError(invalid); return }; setPhase('interview'); scroll() }
  const choose = (id: InterviewId, answer: Answer) => { setAnswers(previous => answerInterview(input, previous, catalog, id, answer)); scroll() }
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [phase, question?.id, state.kind])
  const profile = <details className="quick-profile"><summary><ShieldCheck size={16}/>시연용 기본 금융정보</summary><p>실제 계좌 연결 대신 아래 가상 정보를 사용해요. 질문한 내용은 직접 답한 값으로 비교합니다.</p><ul>{profileLines.map(line => <li key={line}>{line}</li>)}</ul></details>
  const history = <details className="interview-history card" open={!!result || blocked}><summary>내 답변 {state.history.length}개 · 수정할 수 있어요</summary><div>{state.history.map(row => <button type="button" key={row.question.id} onClick={() => revise(row.question.id)} aria-label={`${row.question.summary} 답변 수정`}><span>{row.question.summary}<small>{row.question[row.answer]}</small></span><strong>{answerLabels[row.answer]} <ChevronLeft size={14}/></strong></button>)}</div><p>이전 답변을 바꾸면 그 뒤의 질문부터 다시 확인해요.</p></details>
  return <section className="guided-flow quick-flow">
    <div className="page-heading"><div><div className="eyebrow">A SAVING PLAN THAT FITS</div><h1 ref={heading} tabIndex={-1}>{result ? '이렇게 모아보세요' : blocked ? '저축할 돈을 먼저 나눠요' : question ? '한 가지씩 확인할게요' : '얼마씩 모아볼까요'}<span className="blue-dot">.</span></h1><p>{result ? '답변으로 고른 후보를 예상 세후 금액 순으로 비교했어요.' : blocked ? '중간에 필요한 돈을 남긴 뒤 다시 시작할 수 있어요.' : question ? '예·아니오로 답하면 필요한 다음 질문을 골라드려요.' : '목표를 고르고, 무리 없는 월 저축액을 정해 주세요.'}</p></div><span className="pill">{result ? '최종 추천' : question ? `질문 ${state.history.length + 1}` : blocked ? '계획 점검' : '금액 입력'}</span></div>
    <p className="quick-demo-line"><ShieldCheck size={15}/>가상 금융정보 · 내 답변으로 비교 <button className="text-link" onClick={onBrowse}>전체 상품 보기 ↗</button></p>
    <ol className="interview-steps" aria-label="추천 진행 단계">{['금액 입력', '조건 질문', '최종 추천'].map((label, i) => <li key={label} aria-current={(result ? 2 : phase === 'input' ? 0 : 1) === i ? 'step' : undefined}><span>{i + 1}</span>{label}</li>)}</ol>
    {phase === 'input' || question ? <div className="guided-layout"><section className="card guided-card">
      <div className="guided-body">
        {phase === 'input' ? <>
          <fieldset className="guided-field quick-goals"><legend>무엇을 위해 모으나요?</legend><div className="choice-grid">{goals.map(g => <button type="button" key={g.name} aria-pressed={input.purpose === g.name} className={`choice ${input.purpose === g.name ? 'selected' : ''}`} onClick={() => { setInput(a => ({ ...a, purpose: g.name, goal: g.amount })); setAnswers({}); setError('') }}><span><strong>{g.name}</strong><small>{g.hint}</small></span>{input.purpose === g.name && <Check size={16}/>}</button>)}</div></fieldset>
          {input.purpose && !noGoal && <details className="quick-custom-goal"><summary>목표 금액 변경 · {money(Number(input.goal))}원</summary><AmountInput goal value={input.goal} onChange={v => set('goal', v)}/></details>}
          <AmountInput value={input.monthly} onChange={v => set('monthly', v)}/>
          <fieldset className="guided-field quick-period"><legend>얼마 동안 모을까요?</legend><div className="guided-answers">{catalog.months.map(n => <button type="button" key={n} aria-pressed={input.months === String(n)} className={input.months === String(n) ? 'selected' : ''} onClick={() => set('months', String(n))}>{n}개월</button>)}</div></fieldset>
          {input.monthly && Number(input.monthly) > 0 && <div className="quick-plan-hint"><Target size={17}/><span>{noGoal || !input.purpose ? `${input.months}개월 동안 원금 ${money(Number(input.monthly) * Number(input.months))}원을 모을 수 있어요.` : `이자 없이 목표를 채우려면 월 ${money(Math.ceil(Number(input.goal) / Number(input.months)))}원이 필요해요.`}</span></div>}
        </> : question && <div className="interview-question" key={question.id} data-question={question.id}>
          <span className="interview-count">금액·기간 후보 <strong>{money(state.candidateCount)}개</strong></span>
          <h2>{question.title}</h2><p className="guided-lead">{question.hint}</p>
          <div className="quick-transfer-options" role="group" aria-label={question.title}>{(['yes', 'no', 'unknown'] as Answer[]).map(value => <button type="button" key={value} aria-label={answerLabels[value]} onClick={() => choose(question.id, value)}><span><strong>{answerLabels[value]}</strong><small>{question[value]}</small></span><ArrowRight size={19}/></button>)}</div>
          <details className="interview-why"><summary>이 질문은 왜 하나요?</summary><p>{question.why}</p></details>
        </div>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <div className="form-footer"><button className="secondary" onClick={() => phase === 'input' ? onExit() : state.history.length ? revise(state.history.at(-1)!.question.id) : editAmount()}><ChevronLeft size={17}/>{phase === 'input' ? '시작 화면' : state.history.length ? '이전 질문' : '금액 수정'}</button>{phase === 'input' ? <button className="primary" onClick={next}>질문 시작<ArrowRight size={18}/></button> : <span>답변에 따라 질문 수가 달라져요</span>}</div>
    </section><aside className="guided-aside"><span className="small-icon"><Target size={22}/></span><h3>내 저축 미리보기</h3><div><span>매달 모을 돈</span><strong>{input.monthly ? `${money(Number(input.monthly))}원` : '직접 정해 주세요'}</strong></div><div><span>저축 기간</span><strong>{input.months}개월</strong></div><div><span>{noGoal ? '모을 원금' : '목표 금액'}</span><strong>{noGoal && input.monthly ? `${money(Number(input.monthly) * Number(input.months))}원` : input.goal ? `${money(Number(input.goal))}원` : '목표가 없어도 괜찮아요'}</strong></div>{phase === 'interview' && <button className="text-link" onClick={editAmount}>금액·목표 수정</button>}{profile}</aside><div className="quick-mobile-profile">{profile}</div></div> : blocked ? <section className="card empty-state"><Target size={30}/><h2>{state.title}</h2><p>{state.reason}</p><button className="primary" onClick={() => { setAnswers({}); editAmount() }}>저축 가능 금액 다시 정하기<ArrowRight size={17}/></button></section> : result && <>
      <div className="guided-result-toolbar"><div className="result-context"><span>월 {money(Number(input.monthly))}원</span><span>{input.months}개월</span><span>{noGoal ? '일단 모으기' : `목표 ${money(Number(input.goal))}원`}</span></div><button className="secondary" onClick={editAmount}>금액·목표 수정<ArrowRight size={16}/></button></div>
      <section className="interview-conclusion card"><h2>이렇게 답해서 추천했어요</h2><p>전체 비교 대상 {money(catalog.report.comparison_products)}개 → 답변·금액·기간에 맞는 {money(result.matched)}개</p><ul>{interviewReasons(state).map(reason => <li key={reason}><Check size={16}/>{reason}</li>)}</ul></section>
      {result.provisional && <div className="notice amber" role="status"><Info size={18}/><span>모르는 가입조건은 후보에서, 모르는 우대는 금리에서 제외했어요. 확인하면 추천 순서가 달라질 수 있어요.</span></div>}
      {first && first.shortfall > 0 && <div className="quick-gap" role="status"><strong>지금 계획은 목표까지 {money(first.shortfall)}원이 부족해요.</strong><p>같은 답변을 유지하고 월 저축액이나 기간을 바꿔 비교할 수 있어요.</p><div>{adjustments.map(option => <button className="secondary" key={option.label} onClick={() => { setInput(option.input); scroll() }}>{option.label}<ArrowRight size={15}/></button>)}<button className="text-link" onClick={editAmount}>직접 조정하기</button></div></div>}
      <div className="quick-products">{result.cards.map((card, index) => {
        const p = card.products[0], bonus = p.rate - p.base_rate
        const rule = catalog.rules.find(r => r.option_id === p.option_id)!
        const baseProjection = projectSaving(Number(input.monthly), p.term, p.base_rate, rule.model, catalog.start)
        return <article key={p.option_id} className={`card product-card ${index === 0 ? 'recommended' : ''}`}>
          <div className="row-between"><span className="pill">{index === 0 ? <><Sparkles size={14}/>{result.provisional ? '확인한 조건 기준 추천' : '이 조건에서 추천'}</> : `함께 비교한 상품 ${index}`}</span><small className="muted">{p.term}개월 상품</small></div>
          <div className="product-identity"><span className={`bank-mark ${p.institution.includes('카카오') ? 'kakao' : ''}`}>{p.institution.includes('케이') ? 'K' : p.institution.includes('카카오') ? 'B' : p.institution.slice(0, 1)}</span><div><small>{p.institution.replace('주식회사 ', '')}</small><h3>{p.name}</h3></div><div className="product-rate"><small>{bonus > 0 ? '조건 이행 시 · 연' : '기본금리 · 연'}</small><strong>{p.rate.toFixed(2)}<span>%</span></strong></div></div>
          <p className="quick-rate-explain">{bonus > 0 ? `기본 ${p.base_rate.toFixed(2)}% + 자동이체 우대 ${bonus.toFixed(2)}%p` : rule.bonus.length ? '확인하지 않은 우대는 포함하지 않았어요.' : rule.bonus_basis === 'base_only_code_not_assumed' ? '별도 코드 우대는 제외한 기본금리예요.' : '수집된 기본금리로 비교했어요.'}</p>
          <div className="product-facts"><span>{input.months}개월 후 예상 금액<strong>{money(card.goal_total)}원</strong></span><span>{bonus > 0 ? '조건 이행 시 세후 이자' : '예상 세후 이자'}<strong>+{money(p.net_interest)}원</strong></span></div>
          {index === 0 && <p className="quick-reason"><Check size={18}/><span>{result.cards.length > 1 ? `월 ${money(Number(input.monthly))}원으로 가능한 상품 중 예상 금액이 가장 커요.` : `월 ${money(Number(input.monthly))}원과 선택한 기간에 맞는 상품이에요.`}{!noGoal && card.shortfall === 0 && ' 예상 금액이 목표를 채워요.'}</span></p>}
          <details className="quick-product-detail"><summary>추천 근거·금리 자세히 보기</summary><dl className="guided-summary"><div><dt>기본금리 기준 세후 이자</dt><dd>{money(baseProjection.net_interest)}원</dd></div><div><dt>계획한 우대로 늘어나는 이자</dt><dd>{money(p.net_interest - baseProjection.net_interest)}원</dd></div><div><dt>월 납입 가능 범위</dt><dd>{money(rule.minimum)}원 이상{rule.maximum === null ? '' : ` ~ ${money(rule.maximum)}원 이하`}</dd></div></dl><p>{rule.flexible ? '자유적립식' : '정액적립식'} · 상품 계약 {p.term}개월 동안 매월 같은 금액을 납입하는 계산이에요.</p><p className="source-clause">{rule.source_text}</p><p>가입대상: {rule.eligibility_text}</p><p className="source-clause">{rule.notes}</p>{p.term < Number(input.months) && <p>상품 만기 이후 {Number(input.months) - p.term}개월은 원금만 모으는 별도 계획이며, 재예치 이자는 포함하지 않아요.</p>}<a className="official-link" href={p.source} target="_blank" rel="noopener noreferrer">상품·공시 근거 보기 ↗</a></details>
        </article>
      })}</div>
      {!first && <div className="card empty-state"><Target size={30}/><h3>이 답변에 맞는 상품이 없어요</h3><p>{result.reason}</p><button className="primary" onClick={editAmount}>월 저축액 조정하기<ArrowRight size={17}/></button></div>}
      {result.excluded.length > 0 && <details className="card guided-exclusions"><summary>비교에서 제외한 상품</summary>{result.excluded.map(item => <div key={item.name}><strong>{item.name}</strong><p>{item.reason}</p></div>)}</details>}
      <div className="quick-result-profile">{profile}</div>
      <div className="bottom-notice"><Info size={17}/><span>{catalog.report.snapshot} 수집 자료 · 전체 {money(catalog.report.source_products)}개 중 비교 기준을 통과한 {money(catalog.report.comparison_products)}개 적금의 범위입니다. 가상 금융정보를 사용하며 현재 판매·금리·실제 가입은 금융기관에서 확인해야 해요.</span></div>
    </>}
    {phase === 'interview' && state.history.length > 0 && history}
  </section>
}
