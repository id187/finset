import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, ChevronLeft, Info, RefreshCw, ShieldCheck, Sparkles, Target } from 'lucide-react'
import type { GuidedAnswers } from './guided'
import { catalogueAdjustments, defaultFilters, loadCatalogue, recommendCatalogue, sectors } from './catalogue'
import type { Catalogue } from './catalogue'
import { bumpAmount, demoProfile, quickBlank, quickFromAnswers, quickValidate } from './quick'
import type { QuickInputs } from './quick'
import { projectSaving } from './projection'
import { money } from './model'

const goals = [{ name: '일단 모으기', amount: '', hint: '목표는 천천히 정할게요' }, { name: '여행 자금', amount: '3000000', hint: '300만원' }, { name: '첫 목돈', amount: '5000000', hint: '500만원' }, { name: '주거 준비', amount: '10000000', hint: '1,000만원' }]
const transfers = [{ id: 'yes', label: '가능해요', hint: '가입할 때 설정한 월 자동이체를 만기까지 빠짐없이' }, { id: 'no', label: '직접 넣을게요', hint: '자동이체 우대 없이 비교' }, { id: 'unknown', label: '아직 모르겠어요', hint: '기본금리로 먼저 추천받기' }] as const

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
function CatalogueFlow({ initialAnswers, showResults = false, onExit, onBrowse, catalog }: Props & { catalog: Catalogue }) {
  const [input, setInput] = useState<QuickInputs>(() => initialAnswers ? quickFromAnswers(initialAnswers) : quickBlank())
  const [step, setStep] = useState(showResults && initialAnswers ? 2 : 0)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState(defaultFilters)
  const [extra, setExtra] = useState<Record<string, unknown>>({})
  const heading = useRef<HTMLHeadingElement>(null)
  const set = <K extends keyof QuickInputs>(key: K, value: QuickInputs[K]) => { setInput(a => ({ ...a, [key]: value })); setError('') }
  const move = (n: number) => { setError(''); setStep(n); window.scrollTo({ top: 0, behavior: 'instant' }) }
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [step])
  const result = useMemo(() => step === 2 ? recommendCatalogue(input, catalog, filters, extra) : null, [step, input, catalog, filters, extra])
  const adjustments = useMemo(() => result?.cards[0]?.shortfall ? catalogueAdjustments(input, catalog, filters, extra) : [], [result, input, catalog, filters, extra])
  const first = result?.cards[0]
  const noGoal = input.purpose === '일단 모으기'
  const next = () => { const invalid = quickValidate(input); if (invalid) { setError(invalid); return }; move(input.transfer ? 2 : 1) }
  const selectTransfer = (value: QuickInputs['transfer']) => { set('transfer', value); move(2) }
  const profile = <details className="quick-profile"><summary><ShieldCheck size={16}/>시연용 기본 금융정보 적용</summary><p>실제 계좌 연결 대신 아래 가상 인물의 정보를 사용해요.</p><ul>{demoProfile.map(line => <li key={line}>{line}</li>)}</ul></details>
  return <section className="guided-flow quick-flow">
    <div className="page-heading"><div><div className="eyebrow">A SAVING PLAN THAT FITS</div><h1 ref={heading} tabIndex={-1}>{step === 2 ? '이렇게 모아보세요' : step === 1 ? '자동이체 계획 확인' : '얼마씩 모아볼까요'}<span className="blue-dot">.</span></h1><p>{step === 2 ? '답변에 맞는 상품과 예상 금액을 함께 골랐어요.' : step === 1 ? '답변하면 바로 추천 결과를 보여드려요.' : '목표를 고르고, 무리 없는 월 저축액을 정해 주세요.'}</p></div><span className="pill">{step === 2 ? '추천 결과' : `${step + 1} / 2 단계`}</span></div>
    <p className="quick-demo-line"><ShieldCheck size={15}/>가상 금융정보로 시연 · 선택한 금액과 답변을 추천에 반영 <button className="text-link" onClick={onBrowse}>전체 상품 보기 ↗</button></p>
    {step < 2 ? <div className="guided-layout"><section className="card guided-card">
      <div className="quick-progress" role="progressbar" aria-label="질문 진행률" aria-valuemin={0} aria-valuemax={2} aria-valuenow={step + 1}><i style={{ width: `${(step + 1) * 50}%` }}/></div>
      <div className="guided-body">
        {step === 0 ? <>
          <fieldset className="guided-field quick-goals"><legend>무엇을 위해 모으나요?</legend><div className="choice-grid">{goals.map(g => <button type="button" key={g.name} aria-pressed={input.purpose === g.name} className={`choice ${input.purpose === g.name ? 'selected' : ''}`} onClick={() => { setInput(a => ({ ...a, purpose: g.name, goal: g.amount })); setError('') }}><span><strong>{g.name}</strong><small>{g.hint}</small></span>{input.purpose === g.name && <Check size={16}/>}</button>)}</div></fieldset>
          {input.purpose && !noGoal && <details className="quick-custom-goal"><summary>목표 금액 변경 · {money(Number(input.goal))}원</summary><AmountInput goal value={input.goal} onChange={v => set('goal', v)}/></details>}
          <AmountInput value={input.monthly} onChange={v => set('monthly', v)}/>
          <fieldset className="guided-field quick-period"><legend>얼마 동안 모을까요?</legend><div className="guided-answers">{catalog.months.map(n => <button type="button" key={n} aria-pressed={input.months === String(n)} className={input.months === String(n) ? 'selected' : ''} onClick={() => set('months', String(n))}>{n}개월</button>)}</div></fieldset>
          {input.monthly && Number(input.monthly) > 0 && <div className="quick-plan-hint"><Target size={17}/><span>{noGoal || !input.purpose ? `${input.months}개월 동안 원금 ${money(Number(input.monthly) * Number(input.months))}원을 모을 수 있어요.` : `이자 없이 목표를 채우려면 월 ${money(Math.ceil(Number(input.goal) / Number(input.months)))}원이 필요해요.`}</span></div>}
        </> : <><span className="small-icon"><RefreshCw size={23}/></span><h2>자동이체를 끝까지 유지할 수 있나요?</h2><p className="guided-lead">가입할 때 매달 자동이체를 설정하고, 상품 만기까지 빠짐없이 납입하는 계획이에요.</p><div className="quick-transfer-options">{transfers.map(t => <button type="button" key={t.id} aria-pressed={input.transfer === t.id} onClick={() => selectTransfer(t.id)}><span><strong>{t.label}</strong><small>{t.hint}</small></span><ArrowRight size={19}/></button>)}</div><p className="quick-bonus-hint">카카오·하나: 계약 절반 이상 · 토스: 모든 자동이체 성공<br/>우대는 실제 조건을 지켜야 받을 수 있어요.</p></>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <div className="form-footer"><button className="secondary" onClick={() => step ? move(0) : onExit()}><ChevronLeft size={17}/>{step ? '금액 수정' : '시작 화면'}</button>{step === 0 ? <button className="primary" onClick={next}>{input.transfer ? '추천 다시 계산' : '우대조건 확인'}<ArrowRight size={18}/></button> : <span>답변 선택 → 바로 추천</span>}</div>
    </section><aside className="guided-aside"><span className="small-icon"><Target size={22}/></span><h3>내 저축 미리보기</h3><div><span>매달 모을 돈</span><strong>{input.monthly ? `${money(Number(input.monthly))}원` : '직접 정해 주세요'}</strong></div><div><span>저축 기간</span><strong>{input.months}개월</strong></div><div><span>{noGoal ? '모을 원금' : '목표 금액'}</span><strong>{noGoal && input.monthly ? `${money(Number(input.monthly) * Number(input.months))}원` : input.goal ? `${money(Number(input.goal))}원` : '목표가 없어도 괜찮아요'}</strong></div>{profile}</aside><div className="quick-mobile-profile">{profile}</div></div> : result && <>
      <div className="guided-result-toolbar"><div className="result-context"><span>월 {money(Number(input.monthly))}원</span><span>{input.months}개월</span><span>{noGoal ? '일단 모으기' : `목표 ${money(Number(input.goal))}원`}</span></div><button className="secondary" onClick={() => move(0)}>금액·목표 수정<ArrowRight size={16}/></button></div>
      <div className="quick-answer-strip"><span>자동이체 계획</span><div className="guided-answers" role="group" aria-label="자동이체 답변 변경">{transfers.map(t => <button type="button" key={t.id} className={input.transfer === t.id ? 'selected' : ''} aria-pressed={input.transfer === t.id} onClick={() => set('transfer', t.id)}>{t.label}</button>)}</div></div>
      <details className="catalogue-filter card"><summary>비교 범위 · {sectors.find(s => s.id === filters.sector)?.label} · {money(result.matched)}개 상품 <span>필터 변경</span></summary><div className="row-between"><strong>비교 범위</strong><button className="text-link" onClick={onBrowse}>전체 상품·검증 현황 ↗</button></div><div className="guided-answers" role="group" aria-label="금융기관 필터">{sectors.map(s => <button key={s.id} className={filters.sector === s.id ? 'selected' : ''} aria-pressed={filters.sector === s.id} onClick={() => setFilters(f => ({ ...f, sector: s.id }))}>{s.label}</button>)}</div><label className="catalogue-check"><input type="checkbox" checked={filters.flexible} onChange={e => setFilters(f => ({ ...f, flexible: e.target.checked }))}/>자유롭게 납입하는 적금만 보기</label><p>{money(result.compared)}개 상품 확인 · 내 금액·기간에 맞는 상품 {money(result.matched)}개</p></details>
      {result.questions.length > 0 && <section className="card catalogue-questions"><h3>이 조건도 확인하면 더 정확해져요</h3><p>아직 모르면 우대를 제외한 결과로 비교할 수 있어요.</p>{result.questions.map(question => <fieldset key={question.key} className="guided-field"><legend>{question.title}</legend><div className="guided-answers">{[{ label: '가능해요', value: true }, { label: '해당 없어요', value: false }, { label: '모르겠어요', value: null }].map(option => <button key={option.label} aria-pressed={extra[question.key] === option.value} className={extra[question.key] === option.value ? 'selected' : ''} onClick={() => setExtra(a => ({ ...a, [question.key]: option.value }))}>{option.label}</button>)}</div></fieldset>)}</section>}
      {result.provisional && <div className="notice amber" role="status"><Info size={18}/><span>모르는 우대는 빼고 추천했어요. 조건을 확인하면 추천 순서가 달라질 수 있어요.</span></div>}
      {first && first.shortfall > 0 && <div className="quick-gap" role="status"><strong>지금 계획은 목표까지 {money(first.shortfall)}원이 부족해요.</strong><p>월 저축액이나 기간을 바꿔 다시 비교할 수 있어요.</p><div>{adjustments.map(option => <button className="secondary" key={option.label} onClick={() => setInput(option.input)}>{option.label}<ArrowRight size={15}/></button>)}<button className="text-link" onClick={() => move(0)}>직접 조정하기</button></div></div>}
      <div className="quick-products">{result.cards.map((card, index) => {
        const p = card.products[0], bonus = p.rate - p.base_rate
        const rule = catalog.rules.find(r => r.option_id === p.option_id)!
        const baseProjection = projectSaving(Number(input.monthly), p.term, p.base_rate, rule.model, catalog.start)
        return <article key={p.option_id} className={`card product-card ${index === 0 ? 'recommended' : ''}`}>
          <div className="row-between"><span className="pill">{index === 0 ? <><Sparkles size={14}/>{result.provisional ? '기본금리 기준 추천' : '이 조건에서 추천'}</> : `함께 비교한 상품 ${index}`}</span><small className="muted">{p.term}개월 상품</small></div>
          <div className="product-identity"><span className={`bank-mark ${p.institution.includes('카카오') ? 'kakao' : ''}`}>{p.institution.includes('케이') ? 'K' : p.institution.includes('카카오') ? 'B' : p.institution.slice(0, 1)}</span><div><small>{p.institution.replace('주식회사 ', '')}</small><h3>{p.name}</h3></div><div className="product-rate"><small>{bonus > 0 ? '조건 이행 시 · 연' : '기본금리 · 연'}</small><strong>{p.rate.toFixed(2)}<span>%</span></strong></div></div>
          <p className="quick-rate-explain">{bonus > 0 ? `기본 ${p.base_rate.toFixed(2)}% + 자동이체 우대 ${bonus.toFixed(2)}%p` : rule.bonus.length ? '확인하지 않은 우대는 포함하지 않았어요.' : rule.bonus_basis === 'base_only_code_not_assumed' ? '별도 코드 우대는 제외한 기본금리예요.' : '수집된 기본금리로 비교했어요.'}</p>
          <div className="product-facts"><span>{input.months}개월 후 예상 금액<strong>{money(card.goal_total)}원</strong></span><span>{bonus > 0 ? '조건 이행 시 세후 이자' : '예상 세후 이자'}<strong>+{money(p.net_interest)}원</strong></span></div>
          {index === 0 && <p className="quick-reason"><Check size={18}/><span>{result.cards.length > 1 ? `월 ${money(Number(input.monthly))}원으로 가능한 상품 중 예상 금액이 가장 커요.` : `월 ${money(Number(input.monthly))}원과 선택한 기간에 맞는 상품이에요.`}{!noGoal && card.shortfall === 0 && ' 예상 금액이 목표를 채워요.'}</span></p>}
          <details className="quick-product-detail"><summary>추천 근거·금리 자세히 보기</summary><dl className="guided-summary"><div><dt>기본금리 기준 세후 이자</dt><dd>{money(baseProjection.net_interest)}원</dd></div><div><dt>계획한 우대로 늘어나는 이자</dt><dd>{money(p.net_interest - baseProjection.net_interest)}원</dd></div><div><dt>월 납입 가능 범위</dt><dd>{money(rule.minimum)}원 이상{rule.maximum === null ? '' : ` ~ ${money(rule.maximum)}원 이하`}</dd></div></dl><p>{rule.flexible ? '자유적립식' : '정액적립식'} · 상품 계약 {p.term}개월 동안 매월 같은 금액을 납입하는 계산이에요.</p><p className="source-clause">{rule.source_text}</p><p>가입대상: {rule.eligibility_text}</p><p className="source-clause">{rule.notes}</p>{p.term < Number(input.months) && <p>상품 만기 이후 {Number(input.months) - p.term}개월은 원금만 모으는 별도 계획이며, 재예치 이자는 포함하지 않아요.</p>}<a className="official-link" href={p.source} target="_blank" rel="noopener noreferrer">상품·공시 근거 보기 ↗</a></details>
        </article>
      })}</div>
      {!first && <div className="card empty-state"><Target size={30}/><h3>이 금액에 맞는 상품이 없어요</h3><p>{result.reason}</p><button className="primary" onClick={() => move(0)}>월 저축액 조정하기<ArrowRight size={17}/></button></div>}
      {result.excluded.length > 0 && <details className="card guided-exclusions"><summary>비교에서 제외한 상품</summary>{result.excluded.map(item => <div key={item.name}><strong>{item.name}</strong><p>{item.reason}</p></div>)}</details>}
      <div className="quick-result-profile">{profile}</div>
      <div className="bottom-notice"><Info size={17}/><span>{catalog.report.snapshot} 수집 자료 · 전체 {money(catalog.report.source_products)}개 중 비교 기준을 통과한 {money(catalog.report.comparison_products)}개 적금의 범위입니다. 가상 금융정보를 사용하며 현재 판매·금리·실제 가입은 금융기관에서 확인해야 해요.</span></div>
    </>}
  </section>
}
