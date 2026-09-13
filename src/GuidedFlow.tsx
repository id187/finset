import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowRight, Check, CheckCircle2, ChevronLeft, Info, ListChecks, Play, ShieldCheck, Sparkles, Target, X } from 'lucide-react'
import catalog from '../public/demo/guided.json'
import { answerSummary, blankAnswers, recommendGuided, validateStep } from './guided'
import type { Choice, GuidedAnswers, GuidedCatalog } from './guided'
import type { Card } from './model'
import { money } from './model'

const steps = ['나의 목표', '저축 여력', '가입 기준', '기존 계좌', '우대조건', '답변 확인']
function Field({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return <fieldset className="guided-field"><legend>{title}</legend>{hint && <p>{hint}</p>}{children}</fieldset>
}
function Answer({ title, value, set, hint, yes = '예', no = '아니요' }: { title: string; value: Choice; set: (value: Choice) => void; hint?: string; yes?: string; no?: string }) {
  return <Field title={title} hint={hint}><div className="guided-answers">{[{ id: 'yes', label: yes }, { id: 'no', label: no }, { id: 'unknown', label: '모르겠어요' }].map(option => <button type="button" key={option.id} aria-pressed={value === option.id} className={value === option.id ? 'selected' : ''} onClick={() => set(option.id as Choice)}>{value === option.id && <Check size={15}/>} {option.label}</button>)}</div></Field>
}

export function GuidedFlow({ initialAnswers, showResults = false, onSave, onExit }: { initialAnswers?: GuidedAnswers; showResults?: boolean; onSave: (answers: GuidedAnswers, card: Card, status: string) => void; onExit: () => void }) {
  const [answers, setAnswers] = useState<GuidedAnswers>(() => initialAnswers ? structuredClone(initialAnswers) : blankAnswers())
  const [step, setStep] = useState(showResults ? 6 : 0)
  const [error, setError] = useState('')
  const [chosen, setChosen] = useState<Card | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null), saveLock = useRef(false)
  const result = step === 6 ? recommendGuided(answers, catalog as GuidedCatalog) : null
  const draft = result?.status !== 'COMPARISON'
  const set = <K extends keyof GuidedAnswers>(key: K, value: GuidedAnswers[K]) => { setAnswers(a => ({ ...a, [key]: value })); setError('') }
  const move = (to: number) => { setError(''); setStep(to); setChosen(null); window.scrollTo({ top: 0, behavior: 'instant' }) }
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [step])
  useEffect(() => { if (chosen) { setConfirmed(false); saveLock.current = false; dialog.current?.showModal() } }, [chosen])
  const next = () => {
    const invalid = step < 5 ? validateStep(answers, step) : Array.from({ length: 5 }, (_, i) => validateStep(answers, i)).find(Boolean)
    if (invalid) { setError(invalid); return }
    if ((step === 1 && (answers.reserve !== 'yes' || answers.debt !== 'no' || answers.hold !== 'yes')) || (step === 2 && (answers.adult !== 'yes' || answers.mobile !== 'yes')) || (step === 3 && answers.holdings === 'unknown')) { move(6); return }
    move(step + 1)
  }
  const choose = (card: Card) => { setChosen(card); setConfirmed(false) }
  const summary = answerSummary(answers)
  return <section className="guided-flow">
    <div className="page-heading"><div><div className="eyebrow">YOUR ANSWERS, YOUR SAVING PLAN</div><h1 ref={heading} tabIndex={-1}>{step < 6 ? '내 답변으로 시작하는 저축' : result?.cards.length ? '답변에 맞춰 골라봤어요' : '먼저 확인할 내용이 있어요'}<span className="blue-dot">.</span></h1><p>{step < 6 ? '질문에 하나씩 답하면, 조건에 맞는 적금을 함께 찾아요.' : '선택한 답변과 연결된 상품 조건을 함께 확인해 보세요.'}</p></div><span className="pill"><Play size={13}/>질문형 시연</span></div>
    <div className="guided-scope"><ShieldCheck size={18}/><span>케이뱅크 · 카카오뱅크 · 토스뱅크의 적금 3개 비교<span>2026년 8월 수집 금리 · 만기까지 같은 월 금액을 모으는 시연</span></span></div>
    {step < 6 ? <div className="guided-layout"><section className="card guided-card">
      <div className="guided-progress"><div><span>STEP {String(step + 1).padStart(2, '0')}</span><strong>{steps[step]}</strong><small>{step + 1} / 6</small></div><div role="progressbar" aria-label="질문 진행률" aria-valuemin={0} aria-valuemax={6} aria-valuenow={step + 1}><i style={{ width: `${(step + 1) / 6 * 100}%` }}/></div></div>
      <div className="guided-body">
        {step === 0 && <><h2>어떤 목표를 준비하고 있나요?</h2><p className="guided-lead">이미 모아둔 목돈은 넣지 않고, 앞으로 매달 모을 돈으로 시작해요.</p>
          <Field title="저축 목적"><div className="choice-grid">{['목돈 마련', '여행', '주거', '비상금'].map(p => <button key={p} aria-pressed={answers.purpose === p} className={`choice ${answers.purpose === p ? 'selected' : ''}`} onClick={() => set('purpose', p)}>{p}{answers.purpose === p && <Check size={16}/>}</button>)}</div></Field>
          <label htmlFor="guided-goal">목표로 모을 금액</label><div className="money-input"><input id="guided-goal" type="number" inputMode="numeric" min="1" max="1000000000" value={answers.goal} placeholder="예: 3600000" onChange={e => set('goal', e.target.value)}/><span>원</span></div><div className="amount-presets">{[1000000, 3000000, 3600000, 5000000].map(n => <button key={n} onClick={() => set('goal', String(n))}>{money(n / 10000)}만원</button>)}</div>
          <label htmlFor="guided-months">목표까지 남은 기간</label><select id="guided-months" value={answers.months} onChange={e => set('months', e.target.value)}><option value="">기간을 선택해 주세요</option>{catalog.months.map(n => <option key={n} value={n}>{n}개월</option>)}</select></>}
        {step === 1 && <><h2>무리 없이 모을 수 있는 금액은?</h2><p className="guided-lead">생활비·기존 납입·예정 지출을 빼고, 수입이 적은 달에도 가능한 금액을 골라요.</p>
          <label htmlFor="guided-monthly">매달 모을 수 있는 금액</label><select id="guided-monthly" value={answers.monthly} onChange={e => set('monthly', e.target.value)}><option value="">월 저축액을 선택해 주세요</option>{catalog.monthly.map(n => <option key={n} value={n}>{money(n)}원</option>)}</select>
          <Answer title="생활비와 비상금은 따로 확보했나요?" value={answers.reserve} set={v => set('reserve', v)}/>
          <Answer title="저축보다 먼저 검토할 대출 상환이 있나요?" value={answers.debt} set={v => set('debt', v)}/>
          <Answer title="저축할 돈을 만기까지 유지할 수 있나요?" hint="중간에 써야 할 돈은 별도로 남겨두는 경우를 포함해요." value={answers.hold} set={v => set('hold', v)}/></>}
        {step === 2 && <><h2>가입 기준부터 확인할게요</h2><p className="guided-lead">해당하지 않는 상품을 추천하지 않도록 먼저 확인해요.</p>
          <Answer title="국내에 거주하는 만 19세 이상 대한민국 국민인가요?" value={answers.adult} set={v => set('adult', v)}/>
          <Answer title="은행 앱으로 가입 절차를 진행할 수 있나요?" hint="이번에 연결한 세 상품은 모바일 가입 상품이에요." value={answers.mobile} set={v => set('mobile', v)}/></>}
        {step === 3 && <><h2>이미 이용 중인 상품이 있나요?</h2><p className="guided-lead">계좌 수와 기존 잔액은 가입 가능 여부를 비교하는 데 필요해요.</p>
          <Answer title="비교할 세 은행에 예·적금 잔액이나 가입 중인 적금이 있나요?" hint="케이뱅크·카카오뱅크·토스뱅크를 함께 확인해 주세요. 잔액이 0원인 입출금통장만 있다면 아니요를 선택할 수 있어요." value={answers.holdings} set={v => set('holdings', v)}/>
          {answers.holdings === 'yes' && <div className="guided-subquestions"><p>은행별로 기존 원금과 이자를 합쳐 입력해 주세요. 잔액이 없으면 0원이에요.</p>{([{ key: 'kbankBalance', name: '케이뱅크' }, { key: 'kakaoBalance', name: '카카오뱅크' }, { key: 'tossBalance', name: '토스뱅크' }] as const).map(bank => <div key={bank.key}><label htmlFor={bank.key}>{bank.name} 기존 잔액</label><div className="money-input"><input id={bank.key} type="number" min="0" inputMode="numeric" value={answers[bank.key]} onChange={e => set(bank.key, e.target.value)}/><span>원</span></div></div>)}<label htmlFor="guided-kbank-count">현재 보유한 코드K 자유적금 개수</label><input id="guided-kbank-count" type="number" min="0" max="100" value={answers.kbankCount} onChange={e => set('kbankCount', e.target.value)}/><Answer title="토스뱅크 자유 적금을 이미 보유하고 있나요?" value={answers.tossHeld} set={v => set('tossHeld', v)}/></div>}
          <Answer title="토스뱅크 입출금통장을 보유하고 있나요?" hint="토스뱅크 자유 적금의 가입 조건이에요. 토스 앱 설치 여부와는 달라요." value={answers.tossAccount} set={v => set('tossAccount', v)}/></>}
        {step === 4 && <><h2>어떤 우대조건을 지킬 수 있나요?</h2><p className="guided-lead">실제 납입 전의 계획을 묻는 질문이에요. 답변을 충족해야 예상 우대를 받을 수 있어요.</p>
          <div className="guided-bank-label">카카오뱅크 자유적금</div><label htmlFor="guided-auto-months">자동이체로 납입할 수 있는 개월 수</label><div className="money-input"><input id="guided-auto-months" type="number" min="0" max={answers.months} inputMode="numeric" disabled={answers.autoUnknown} value={answers.autoUnknown ? '' : answers.autoMonths} placeholder="사용하지 않으면 0" onChange={e => set('autoMonths', e.target.value)}/><span>개월</span></div><label className="check-label"><input type="checkbox" checked={answers.autoUnknown} onChange={e => set('autoUnknown', e.target.checked)}/>자동이체 기간은 아직 모르겠어요</label>
          <p className="muted">상품 계약 기간의 절반 이상을 자동이체해야 해요. 예를 들어 12개월 상품은 6개월 이상이에요.</p>
          <Answer title="카카오뱅크 적금의 자동연장 원리금에 해당하나요?" hint="새로 납입할 금액과 자동연장된 원리금을 구분해요." value={answers.renewed} set={v => set('renewed', v)} yes="해당해요" no="해당하지 않아요"/>
          {answers.tossAccount !== 'no' && <><div className="guided-bank-label">토스뱅크 자유 적금</div><Answer title="가입할 때 설정한 월 자동이체를 사용할 계획인가요?" value={answers.tossSchedule} set={v => set('tossSchedule', v)}/><Answer title="계약 기간의 모든 자동이체를 성공시킬 수 있나요?" value={answers.tossTransfers} set={v => set('tossTransfers', v)}/></>}
          <div className="notice"><Info size={17}/><span>모르겠다는 답변은 확인 필요로 남기고 우대금리에 더하지 않아요. 실제 실적 달성과 가입 승인은 금융사 확인이 필요해요.</span></div></>}
        {step === 5 && <><h2>이 답변으로 비교할까요?</h2><p className="guided-lead">답변을 바꾸면 금리와 추천 순서도 다시 비교해요.</p><dl className="guided-summary">{summary.map(row => <div key={row.title}><dt>{row.title}</dt><dd>{row.value}</dd></div>)}</dl><div className="notice"><ShieldCheck size={18}/><span>입력은 이 브라우저에서만 처리해요. 저장한 뒤에는 납입 기록과 회복 계획까지 시연할 수 있어요.</span></div></>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <div className="form-footer"><button className="secondary" onClick={() => step ? move(step - 1) : onExit()}><ChevronLeft size={17}/>{step ? '이전 질문' : '시작 화면'}</button><button className="primary" onClick={next}>{step === 5 ? '내 답변으로 추천받기' : '다음 질문'}<ArrowRight size={18}/></button></div>
    </section><aside className="guided-aside"><span className="small-icon"><Target size={22}/></span><h3>내가 정하는 저축</h3><div><span>목표 금액</span><strong>{answers.goal ? `${money(Number(answers.goal))}원` : '아직 답하지 않았어요'}</strong></div><div><span>기간</span><strong>{answers.months ? `${answers.months}개월` : '아직 답하지 않았어요'}</strong></div><div><span>월 저축액</span><strong>{answers.monthly ? `${money(Number(answers.monthly))}원` : '아직 답하지 않았어요'}</strong></div><hr/><p>이미 저장한 계획과 기록은<br/>새 계획을 저장하기 전까지 유지돼요.</p></aside></div> : result && <>
      <div className="guided-result-toolbar"><div className="result-context"><span>월 {money(Number(answers.monthly))}원</span><span>{answers.months}개월</span><span>목표 {money(Number(answers.goal))}원</span></div><button className="secondary" onClick={() => move(0)}><ListChecks size={17}/>답변 수정하기</button></div>
      <div className={`notice ${result.status !== 'COMPARISON' ? 'amber' : ''}`} role="status"><Info size={18}/><span>{result.reason}</span></div>
      {result.missing.length > 0 && <div className="card guided-missing"><h3>추천을 확정하기 전에 확인할 질문</h3><ul>{result.missing.map(q => <li key={q}>{q}</li>)}</ul><button className="text-link" onClick={() => move(4)}>우대 답변 다시 확인하기<ArrowRight size={16}/></button></div>}
      <div className="product-list">{result.cards.map((card, i) => { const p = card.products[0]; return <article key={p.option_id} className={`card product-card ${i === 0 ? 'recommended' : ''}`}><div className="row-between"><span className="pill">{i === 0 ? <><Sparkles size={13}/>내 답변 기준 추천</> : `대안 ${i}`}</span><span className="muted">{result.provisional ? '확인할 조건 있음' : '연결된 3개 상품 내 비교'}</span></div><div className="product-identity"><span className={`bank-mark ${p.institution.includes('카카오') ? 'kakao' : ''}`}>{p.institution.includes('케이') ? 'K' : p.institution.includes('카카오') ? 'B' : 'T'}</span><div><small>{p.institution.replace('주식회사 ', '')}</small><h3>{p.name}</h3></div><div className="product-rate"><small>답변상 적용 금리 · 연</small><strong>{p.rate.toFixed(2)}<span>%</span></strong></div></div><div className="product-facts"><span>목표일까지 예상 금액<strong>{money(card.goal_total)}원</strong></span><span>첫 상품의 예상 세후 이자<strong>{money(p.net_interest)}원</strong></span></div><ul className="reasons">{card.why.map(why => <li key={why}><Check size={15}/>{why}</li>)}</ul>{card.shortfall > 0 && <p className="guided-shortfall">목표까지 {money(card.shortfall)}원이 부족해요.</p>}<button className={i === 0 ? 'primary full' : 'secondary full'} onClick={() => choose(card)}>{draft ? '이 추천을 초안으로 남기기' : '이 상품으로 계획 시작하기'}<ArrowRight size={17}/></button></article> })}</div>
      {!result.cards.length && <div className="card empty-state"><ListChecks size={32}/><h3>확인한 다음 이어갈 수 있어요</h3><p>답변한 내용은 유지돼요. 확인이 필요한 항목을 수정해 주세요.</p><button className="primary" onClick={() => move(result.status === 'NEEDS_ONBOARDING_REVIEW' || result.status === 'DIGITAL_CHANNEL_REQUIRED' ? 2 : result.status === 'NEEDS_HOLDINGS' ? 3 : 1)}>답변 확인하고 이어가기<ArrowRight size={17}/></button></div>}
      {result.excluded.length > 0 && <details className="card guided-exclusions"><summary>이번 비교에서 제외한 상품과 이유</summary>{result.excluded.map(item => <div key={item.name}><strong>{item.name}</strong><p>{item.reason}</p></div>)}</details>}
      <details className="card guided-exclusions"><summary>추천에 반영한 내 답변 보기</summary><dl className="guided-summary">{summary.map(row => <div key={row.title}><dt>{row.title}</dt><dd>{row.value}</dd></div>)}</dl></details>
      <div className="bottom-notice"><Info size={17}/><span>기존 계산기의 상품별 예상 이자를 사용했어요. 목표일이 상품 만기보다 늦으면 이후에는 원금만 이어서 모으고, 재예치 이자는 더하지 않아요. 현재 금리·실제 수령액·가입 승인과는 다를 수 있어요.</span></div>
    </>}
    {chosen && result && <dialog ref={dialog} className="modal" aria-labelledby="guided-save-title" onCancel={() => setChosen(null)}><div className="modal-title"><h2 id="guided-save-title">{draft ? '확인할 답변과 함께 초안으로 남겨요' : '내 답변으로 만든 계획을 시작할까요?'}</h2><button className="icon-button" aria-label="닫기" onClick={() => setChosen(null)}><X size={20}/></button></div><p className="modal-description">{chosen.products[0].name} · 답변상 연 {chosen.products[0].rate.toFixed(2)}%</p><div className="save-summary"><span>목표 금액<strong>{money(Number(answers.goal))}원</strong></span><span>매달 모을 돈<strong>{money(Number(answers.monthly))}원</strong></span><span>저축 기간<strong>{answers.months}개월</strong></span></div><div className="notice"><Info size={18}/><span>{draft ? '확인한 답변과 추천을 초안으로 저장해요. 현재 계획과 기록은 유지돼요.' : '기존 가상 계획과 납입 기록을 새 계획으로 교체해요. 기록한 원금은 0원부터 시작하고, 추천에 사용한 답변도 함께 저장돼요.'}</span></div><label className="check-label"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>{draft ? '확인할 조건을 남긴 초안임을 확인했어요.' : '새 시연 계획으로 교체하고 시작할게요.'}</label><button className="primary full" disabled={!confirmed} onClick={() => { if (saveLock.current || !confirmed) return; saveLock.current = true; onSave(answers, chosen, result.status) }}>{draft ? '답변과 초안 저장하기' : '새 저축 계획 저장하기'}<CheckCircle2 size={18}/></button></dialog>}
  </section>
}
