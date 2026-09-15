import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, ChevronLeft, RefreshCw, ShieldCheck } from 'lucide-react'
import { CORE_BROWSER, coreMeta, coreRecommend } from './coreApi'
import type { AnswerValue, CoreMeta, CoreProfile, CoreQuestion, CoreRequest, CoreResponse } from './coreApi'
import type { GuidedAnswers } from './guided'
import { money } from './model'
import { changeCoreAnswer, changeCorePlan, sameAnswer } from './coreState'
import './core.css'
import { browserProgress, onBrowserProgress } from './browserCore'
import { CoreOnboarding } from './CoreOnboarding'
import { CoreResults, RecommendationJourney } from './CoreResults'

type Props = { onExit: () => void; onBrowse: () => void; initialAnswers?: GuidedAnswers; showResults?: boolean }
type HoldingRow = { bank: string; product: string; balance: string }
type Entry = { key: string; title: string; label: string; value: AnswerValue; question: CoreQuestion }
const amount = (v: string) => /^\d+$/.test(v) && Number(v) <= 1000000000

function MoneyField({ id, title, value, onChange, help, increments = false }: { id: string; title: string; value: string; onChange: (v: string) => void; help?: string; increments?: boolean }) {
  const presets = increments ? [50000, 100000, 200000, 300000, 500000] : id === 'core-goal' ? [1000000, 3000000, 5000000, 10000000] : []
  const invalid = value !== '' && !amount(value)
  const shown = /^\d+$/.test(value) ? money(Number(value)) : value
  return <div className="quick-amount core-money"><label htmlFor={id}>{title}</label>{help && <p id={`${id}-help`} className="core-help">{help}</p>}<div className="money-input"><input id={id} type="text" inputMode="numeric" value={shown} placeholder="원 단위로 직접 입력" aria-invalid={invalid} aria-describedby={`${id}-help ${id}-feedback`} onChange={e => onChange(e.target.value.replaceAll(',', ''))}/><span>원</span></div>{presets.length > 0 && <div className="core-amount-presets" role="group" aria-label={`${title} 금액 선택`}>{presets.map(n => <button type="button" key={n} aria-pressed={amount(value) && Number(value) === n} className={amount(value) && Number(value) === n ? 'selected' : ''} onClick={() => onChange(String(n))}>{n / 10000}만원{amount(value) && Number(value) === n && <Check size={14}/>}</button>)}</div>}<p id={`${id}-feedback`} className={invalid ? 'form-error' : 'core-amount-confirm'}>{invalid ? '0~10억원 사이의 원 단위 정수로 입력해 주세요. 소수점·음수는 사용할 수 없어요.' : value !== '' ? `${increments ? '매달 ' : '선택한 금액 '}${money(Number(value))}원` : '없는 금액은 0원으로 입력해 주세요.'}</p></div>
}

function QuestionInput({ q, busy, answer, initial, back, comparing = false }: { q: CoreQuestion; busy: boolean; answer: (value: AnswerValue, label: string) => void; initial?: AnswerValue; back: () => void; comparing?: boolean }) {
  const [selected, setSelected] = useState<AnswerValue | undefined>(initial)
  const [value, setValue] = useState(typeof initial === 'number' || q.type === 'date' && typeof initial === 'string' ? String(initial) : '')
  const [costs, setCosts] = useState<Record<string, string>>(() => initial && typeof initial === 'object' && !Array.isArray(initial) ? Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v)])) : {})
  const [error, setError] = useState('')
  const options = [...(q.options || [])]
  if (!options.some(o => o.value === null)) options.push({ value: null, label: '모르겠어요 · 확인이 필요해요' })
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (selected === null) { answer(null, '모르겠어요'); return }
    if (q.type === 'number' || q.type === 'date') {
      if (q.type === 'number' && (!amount(value) || Number(value) < (q.minimum || 0) || Number(value) > (q.maximum ?? 1000000000)) || q.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) { setError('입력 범위에 맞는 값을 적어 주세요.'); return }
      answer(q.type === 'date' ? value : Number(value), q.type === 'date' ? value : `${money(Number(value))}${q.unit || ''}`); return
    }
    if (q.type === 'costs') {
      if (!q.components?.length || q.components.some(c => !amount(costs[c.id] || ''))) { setError('각 우대에 추가로 드는 비용을 입력해 주세요.'); return }
      answer(Object.fromEntries(q.components.map(c => [c.id, Number(costs[c.id])])), '우대별 추가비용 입력'); return
    }
    if (selected === undefined) { setError('답변을 선택한 뒤 다음을 눌러 주세요.'); return }
    if (comparing && selected === 'compare') { setError('차이를 확인한 뒤 원하는 납입 방식을 선택해 주세요.'); return }
    answer(selected, options.find(o => sameAnswer(o.value, selected))?.label || '확인한 답변')
  }
  return <form onSubmit={submit} className="core-answer-form">
    {q.type === 'number' || q.type === 'date' ? <><label className="core-number-label" htmlFor="core-answer">{q.type === 'date' ? '날짜 선택' : `답변 입력 · ${q.minimum || 0}~${money(q.maximum ?? 1000000000)}${q.unit || ''}`}</label><div className="money-input"><input id="core-answer" type={q.type === 'date' ? 'date' : 'text'} inputMode={q.type === 'date' ? undefined : 'numeric'} value={q.type === 'number' && /^\d+$/.test(value) ? money(Number(value)) : value} onChange={e => { setValue(e.target.value.replaceAll(',', '')); setSelected(undefined); setError('') }} autoFocus/><span>{q.unit}</span></div></> : q.type === 'costs' ? q.components?.map(c => <MoneyField id={`cost-${c.id}`} key={c.id} title={c.label} value={costs[c.id] || ''} onChange={v => { setCosts(p => ({ ...p, [c.id]: v })); setSelected(undefined) }}/>) : null}
    <div className="quick-transfer-options" role="radiogroup" aria-label={q.title}>{options.filter(o => !['number', 'date', 'costs'].includes(q.type) || o.value === null).map((o, i) => <button type="button" role="radio" aria-checked={sameAnswer(selected, o.value)} className={sameAnswer(selected, o.value) ? 'selected' : ''} disabled={busy} key={i} onClick={() => { setSelected(o.value); setError('') }}><span>{o.label}</span>{sameAnswer(selected, o.value) ? <Check size={19}/> : <span className="core-radio"/>}</button>)}</div>
    {selected !== undefined && <button type="button" className="text-link" onClick={() => setSelected(undefined)}>선택 해제</button>}
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="form-footer"><button type="button" className="secondary" onClick={back}><ChevronLeft size={17}/>이전</button><button type="submit" className="primary" disabled={busy}>다음<ArrowRight size={17}/></button></div>
  </form>
}

function HoldingsInput({ meta, rows, setRows, initial, submit, unknown, back }: { meta: CoreMeta; rows: HoldingRow[]; setRows: (rows: HoldingRow[]) => void; initial?: string; submit: (p: CoreProfile, label: string) => void; unknown: () => void; back: () => void }) {
  const [selected, setSelected] = useState(initial || ''), [error, setError] = useState('')
  const complete = () => {
    if (!selected) { setError('보유 상태를 선택해 주세요.'); return }
    if (selected === 'unknown') { unknown(); return }
    if (selected === 'none') { submit({ holdings_complete: true, bank_balances_complete: true, bank_balances: {}, held_product_ids: [], product_balances: {} }, '기존 예·적금 없음'); return }
    if (rows.some(r => !r.bank || !amount(r.balance))) { setError('금융기관과 원리금 합계를 확인해 주세요.'); return }
    const balances: Record<string, number> = {}, products: Record<string, number> = {}, counts: Record<string, number> = {}
    for (const r of rows) { balances[r.bank] = (balances[r.bank] || 0) + Number(r.balance); if (r.product) { products[r.product] = (products[r.product] || 0) + Number(r.balance); counts[`held_count.${r.product}`] = (counts[`held_count.${r.product}`] || 0) + 1 } }
    submit({ holdings_complete: true, bank_balances_complete: true, bank_balances: balances, held_product_ids: Object.keys(products), product_balances: products, facts: counts }, '보유 계좌 입력')
  }
  return <><div className="quick-transfer-options" role="radiogroup" aria-label="기존 보유 정보">{[{value:'none',label:'기존 예·적금과 잔액이 없어요'}, {value:'rows',label:'보유 정보를 입력할게요'}, {value:'unknown',label:'아직 확인하지 못했어요'}].map(o => <button key={o.value} role="radio" aria-checked={selected === o.value} className={selected === o.value ? 'selected' : ''} onClick={() => { setSelected(o.value); setError('') }}>{o.label}{selected === o.value ? <Check size={18}/> : <span className="core-radio"/>}</button>)}</div>{selected === 'rows' && <div className="core-holdings">{rows.map((row, i) => <fieldset key={i}><legend>보유 계좌 {i + 1}</legend><label>금융기관<select value={row.bank} onChange={e => setRows(rows.map((r, j) => j === i ? { ...r, bank: e.target.value, product: '' } : r))}><option value="">금융기관 선택</option>{meta.banks?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>보유 상품<select value={row.product} onChange={e => setRows(rows.map((r, j) => j === i ? { ...r, product: e.target.value } : r))}><option value="">입출금 등 목록 외 상품</option>{meta.holdings_products?.filter(p => p.bank === row.bank).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><MoneyField id={`holding-${i}`} title="현재 원금과 이자 합계" value={row.balance} onChange={v => setRows(rows.map((r, j) => j === i ? { ...r, balance: v } : r))}/>{rows.length > 1 && <button className="text-link" onClick={() => setRows(rows.filter((_, j) => j !== i))}>이 계좌 삭제</button>}</fieldset>)}<button className="secondary" onClick={() => setRows([...rows, { bank: '', product: '', balance: '' }])}>계좌 추가</button></div>}{error && <p className="form-error" role="alert">{error}</p>}<div className="form-footer"><button className="secondary" onClick={back}><ChevronLeft size={17}/>이전</button><button className="primary" onClick={complete}>다음<ArrowRight size={17}/></button></div></>
}

export function CoreFlow({ onExit, onBrowse }: Props) {
  const [meta, setMeta] = useState<CoreMeta | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  const [phase, setPhase] = useState<'start' | 'input' | 'flow'>(new URLSearchParams(location.search).get('examples') === '1' ? 'start' : 'input')
  const [basicEdit, setBasicEdit] = useState({ step: 0, revision: 0 })
  const [basicSession, setBasicSession] = useState(0)
  const [calculationProgress, setCalculationProgress] = useState(browserProgress)
  useEffect(() => onBrowserProgress(setCalculationProgress), [])
  const [editing, setEditing] = useState<CoreQuestion | null>(null)
  const [request, setRequestState] = useState<CoreRequest | null>(null)
  const [response, setResponse] = useState<CoreResponse | null>(null), [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<Entry[]>([]), [skipped, setSkipped] = useState<Set<string>>(new Set()), [showCards, setShowCards] = useState(false)
  const [holdingRows, setHoldingRows] = useState<HoldingRow[]>([{ bank: '', product: '', balance: '' }])
  const [holdingChoice, setHoldingChoice] = useState('')
  const setRequest = (value: React.SetStateAction<CoreRequest | null>) => { setBusy(value !== null); setResponse(null); setRequestState(value) }
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { const ctrl = new AbortController(); setError(''); coreMeta(ctrl.signal).then(setMeta).catch(e => { if (!ctrl.signal.aborted) setError(e.message) }); return () => ctrl.abort() }, [retry])
  useEffect(() => { if (!request) return; const ctrl = new AbortController(); setBusy(true); setError(''); setResponse(null); setShowCards(false); coreRecommend(request, ctrl.signal).then(r => { if (!ctrl.signal.aborted) setResponse(r) }).catch(e => { if (!ctrl.signal.aborted) setError(e.message) }).finally(() => { if (!ctrl.signal.aborted) setBusy(false) }); return () => ctrl.abort() }, [request, retry])
  useEffect(() => {
    const viewport = window.visualViewport
    const update = () => { if (viewport && window.innerHeight - viewport.height > 120) document.body.dataset.keyboard = 'open'; else delete document.body.dataset.keyboard }
    viewport?.addEventListener('resize', update); update()
    return () => { viewport?.removeEventListener('resize', update); delete document.body.dataset.keyboard }
  }, [])
  const result = response?.result
  const question = editing || response?.questions.find(q => !skipped.has(q.id))
  const previousAnswer = history.find(row => row.key === question?.id)
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [phase, question?.id, busy])
  const scroll = () => window.scrollTo({ top: 0, behavior: 'instant' })
  const reset = () => { setHoldingChoice(''); setHoldingRows([{ bank: '', product: '', balance: '' }]); setRequest(null); setResponse(null); setHistory([]); setSkipped(new Set()); setError(''); setPhase('start'); setEditing(null); scroll() }
  const chooseCase = (id: string) => { setEditing(null); setHistory([]); setSkipped(new Set()); setRequest({ case_id: id }); setPhase('flow'); scroll() }
  const answer = (q: CoreQuestion, value: AnswerValue, label: string) => {
    if (busy || question?.id !== q.id || !request) return
    const changed = changeCoreAnswer(request, q.id, value)
    setHistory(h => [...h.filter(row => row.key !== q.id && !changed.invalidated.includes(row.key)), { key: q.id, title: q.title, value, label, question: q }])
    setSkipped(s => { const n = new Set(s); changed.invalidated.forEach(k => n.delete(k)); if (value === null || q.id === 'reserve_confirmed' && value === false) n.add(q.id); else n.delete(q.id); return n })
    setEditing(null); setRequest(changed.request); scroll()
  }
  const revise = (index: number) => { setEditing(history[index].question); scroll() }
  const backQuestion = () => { if (editing && !response?.questions.some(q => !skipped.has(q.id))) { setEditing(null); return } const index = editing ? history.findIndex(r => r.key === editing.id) : history.length; if (index > 0) revise(index - 1); else edit() }
  const edit = (step: 'goal' | 'capacity' = 'goal') => {
    if (request?.case_id) { setError('사례의 금액은 내 정보로 바꿀 수 없어요. 처음부터 내 금액을 입력해 주세요.'); return }
    setBasicEdit(p => ({ step: step === 'goal' ? 0 : 1, revision: p.revision + 1 })); setPhase('input'); setEditing(null); setError(''); scroll()
  }
  const begin = (p: CoreProfile) => {
    const changed = changeCorePlan(request || {}, p, response?.profile || request?.profile || {})
    setRequest(changed.request); setSkipped(s => new Set([...s].filter(k => !changed.invalidated.includes(k)))); setHistory(h => h.filter(row => !changed.invalidated.includes(row.key))); setEditing(null); setPhase('flow'); scroll()
  }
  const explore = (id: string) => { setEditing(null); setSkipped(new Set()); setRequest(r => ({ ...r, profile: { ...r?.profile, benefit_action: id }, answers: { ...r?.answers, ...(id.startsWith('eligibility|') ? {} : { 'bonus_intent.extra_transactions': true }) } })); scroll() }
  const stopExploring = () => { setEditing(null); setSkipped(new Set()); setRequest(r => ({ ...r, profile: { ...r?.profile, benefit_action: '' } })); scroll() }
  const caseTitle = meta?.cases.find(c => c.id === request?.case_id)?.name
  const conclusion = result?.provisional ? '조건 확인 전 잠정 비교' : result?.status === 'ADJUST_GOAL' ? '목표와 저축액을 살펴봐요' : result?.status === 'COMPARISON' ? '확인한 조건 기준 추천' : '다음 내용을 확인해 주세요'
  if (!meta) return <section className="card empty-state">{error ? <><h2>상품 조건을 불러오지 못했어요</h2><p role="alert">{error}</p><button className="primary" onClick={() => setRetry(n => n + 1)}>다시 시도</button></> : <><RefreshCw className="spin"/><h2>추천 흐름을 준비하고 있어요</h2></>}</section>
  return <section className="guided-flow quick-flow core-flow">
    <div className="page-heading" hidden={phase === 'flow' && !busy && !question && !!response}><div><div className="eyebrow">YOUR GOAL, YOUR CHOICE</div><h1 ref={heading} tabIndex={-1}>{phase === 'start' ? '어떻게 시작할까요' : phase === 'input' ? '내 목표에 맞게 모아볼까요' : busy ? '답변으로 다시 비교해요' : question ? '한 가지씩 확인할게요' : conclusion}<span className="blue-dot">.</span></h1><p>{phase === 'input' ? '필요한 금액과 기간, 무리 없이 모을 수 있는 돈을 알려주세요.' : question ? '확인한 사실과 실제로 할 계획을 나누어 답해 주세요.' : '같은 입력의 금액·상태·추천 이유를 함께 보여드려요.'}</p></div><span className="pill">{request?.case_id ? '사례 비교' : '내 조건으로 비교'}</span></div>
    {phase === 'flow' && <RecommendationJourney current={question || busy ? 1 : 2}/>}
    {phase !== 'flow' && <p className="quick-demo-line"><ShieldCheck size={15}/>{meta.snapshot} 수집 자료 <button className="text-link" onClick={onBrowse}>상품과 수집 기준 ↗</button></p>}
    {CORE_BROWSER && phase !== 'flow' && <p className="core-replay-note">입력한 금액과 답변으로 바로 비교해요. 입력 정보는 서버로 전송되지 않아요.</p>}
    {phase === 'flow' && request?.case_id && <p className="core-replay-note">선택한 예시 정보로 계산한 결과예요. 개인 정보로 계산한 추천과 구분해 주세요.</p>}
    <CoreOnboarding key={basicSession} meta={meta} visible={phase === 'input'} edit={basicEdit} complete={begin} exit={reset} home={onExit} busy={busy} error={error}/>
    {phase === 'start' ? <><div className="core-start card"><h2>내 금액으로 시작하기</h2><p>금액을 직접 정하고, 필요한 질문에 답해 비교합니다.</p><button className="primary" onClick={() => { setRequest(null); setResponse(null); setHistory([]); setSkipped(new Set()); setBasicSession(n => n + 1); setBasicEdit({step:0,revision:0}); setPhase('input'); setError('') }}>금액 직접 입력<ArrowRight size={17}/></button></div><section className="card core-cases"><h2>검증된 예시 조건 살펴보기</h2><p>사례를 직접 선택해야 예시 정보가 적용됩니다. 내 입력값에는 적용하지 않아요.</p><div>{meta.cases.map(c => <button key={c.id} onClick={() => chooseCase(c.id)}><strong>{c.name.replaceAll('_', ' · ').replace('납입선호fixed_ok', '정액 허용').replace('납입선호adjustable', '자유적립').replace('납입선호None', '방식 미선택')}</strong><small>월 {money(Number(c.profile.monthly))}원 · {String(c.profile.goal_date)}</small><ArrowRight size={16}/></button>)}</div></section><button className="secondary" onClick={onExit}><ChevronLeft size={17}/>시작 화면</button></> : phase === 'input' ? null : <>
      <div className="guided-result-toolbar"><div className="result-context"><span>{caseTitle ? `예시 정보 · ${caseTitle.replaceAll('_', ' ')}` : '직접 입력한 정보'}</span>{response && <><span>월 {money(Number(response.profile.monthly))}원</span><span>목표일 {String(response.profile.goal_date)}</span></>}</div><button className="secondary" onClick={reset}>처음부터</button></div>
      {busy ? <div className="loading-state" role="status"><RefreshCw className="spin"/><h2>{CORE_BROWSER ? calculationProgress : '답변에 맞는 조건을 확인하고 있어요'}</h2>{CORE_BROWSER && <p>처음에는 준비에 잠시 시간이 걸릴 수 있어요.</p>}</div> : error ? <div className="card empty-state"><h2>비교를 완료하지 못했어요</h2><p role="alert">{error}</p><button className="primary" onClick={() => setRetry(n => n + 1)}>다시 시도</button><button className="text-link" onClick={reset}>사례 다시 선택</button></div> : response && result && <>
        {question ? <section className="card guided-card core-question" data-question={question.id}><div className="guided-body"><span className="interview-count">{question.purpose === 'bonus' ? '선택한 혜택 확인' : question.purpose === 'common' ? '저축하는 방법' : '필요한 가입 정보'}</span><h2>{question.title}</h2>{question.help && <p className="guided-lead">{question.help}</p>}{question.purpose === 'eligibility' && question.context.length > 0 && <p className="refine-note">확인할 상품 · {question.context.slice(0, 2).map(c => c.name).join(' / ')}</p>}{question.id === 'contribution_preference' && result.contribution_choice?.show_comparison && <div className="core-way-comparison">{[{ title: '정액 납입 포함 비교안', preview: result.contribution_choice.fixed_allowed }, { title: '자유적립만 비교한 안', preview: result.contribution_choice.adjustable_only }].map(({ title, preview }) => <article key={title}><h3>{title}</h3>{preview.available ? <><strong>{money(preview.projected_amount || 0)}원</strong>{preview.products?.map((p, i) => <p key={i}>{p.name}<br/>상품 기간 {p.term}개월 · 연 {p.rate.toFixed(2)}%</p>)}<p>목표 부족액 {money(preview.shortfall || 0)}원</p></> : <p>{preview.notice}</p>}</article>)}</div>}{question.id === 'contribution_preference' && result.contribution_choice && <p className="core-way-notice">{result.contribution_choice.notice}<br/>방식을 선택하기 전의 비교안이며 최종 추천이 아닙니다.</p>}{question.type === 'holdings' ? <HoldingsInput meta={meta} rows={holdingRows} setRows={setHoldingRows} initial={holdingChoice} back={backQuestion} unknown={() => { setHoldingChoice('unknown'); answer(question, null, '보유 정보 미확인') }} submit={(p, label) => { const stale = Object.keys(request?.answers || {}).filter(k => /^(bank_balance|product_balance|held_count|combined_monthly)\./.test(k)); setSkipped(s => new Set([...s].filter(k => !stale.includes(k)))); setHistory(h => h.filter(r => !stale.includes(r.key))); setHoldingChoice(label === '기존 예·적금 없음' ? 'none' : 'rows'); setHistory(h => [...h.filter(r => r.key !== 'holdings_complete'), { key: 'holdings_complete', title: question.title, label, value: true, question }]); setSkipped(s => new Set([...s].filter(k => k !== 'holdings_complete'))); setEditing(null); setRequest(r => ({ ...r, profile: { ...r?.profile, ...p }, answers: { ...Object.fromEntries(Object.entries(r?.answers || {}).filter(([k]) => !stale.includes(k))), holdings_complete: true } })); scroll() }}/> : <QuestionInput key={`${question.id}:${result.contribution_choice?.show_comparison}:${!!editing}`} q={question} busy={busy} initial={previousAnswer ? previousAnswer.value : response.answer_values[question.id]} comparing={result.contribution_choice?.show_comparison} back={backQuestion} answer={(v, l) => answer(question, v, l)}/>}{(result.optional_questions || result.optional_eligibility) && <button className="text-link refine-stop-exploring" onClick={stopExploring}>지금 확인한 조건으로 추천 보기</button>}</div></section> : <>
          <CoreResults response={response} showCards={showCards} setShowCards={setShowCards} edit={edit} review={q => { setEditing(q); scroll() }} explore={explore} revisit={() => setSkipped(new Set())} hasSkipped={skipped.size > 0} onBrowse={onBrowse} changeDate={date => { const changed = changeCorePlan(request || {}, { goal_date: date }, response.profile); setHistory(h => h.filter(row => !changed.invalidated.includes(row.key))); setSkipped(s => new Set([...s].filter(k => !changed.invalidated.includes(k)))); setRequest(changed.request) }}/>

        </>}
        {history.length > 0 && <details className="interview-history card"><summary>내 답변 {history.length}개 · 이전 답변 수정</summary><div>{history.map((row, i) => <button key={`${row.key}-${i}`} onClick={() => revise(i)}><span>{row.title}<small>{row.label}</small></span><strong>수정</strong></button>)}</div><p>이전 답변은 유지하고, 조건의 전제가 바뀐 우대 선택만 다시 확인합니다.</p></details>}
        <details className="core-profile"><summary>{response.demo ? '예시 정보 확인' : '내 입력 확인'}</summary><p>시작일 {String(response.profile.start_date)} · 목표일 {String(response.profile.goal_date)}</p><p>목표 {money(Number(response.profile.goal_amount))}원 · 지금 맡길 돈 {money(Number(response.profile.available_now ?? response.profile.cash))}원</p><p>매달 {money(Number(response.profile.monthly))}원 · {response.profile.income_pattern === 'variable' ? '변동 수입' : '선택한 수입 형태 반영'}</p>{response.demo && <p>선택한 검증 사례의 가상 정보와 이후 선택한 답변을 사용합니다. 실제 계좌나 사용자의 사실로 간주하지 않습니다.</p>}<p>금융권: {(response.profile.sectors as string[] || []).map(s => ({ bank: '은행', savings_bank: '저축은행', credit_union: '신협' }[s] || s)).join(' · ')}</p></details>
      </>}
    </>}
  </section>
}
