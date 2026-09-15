import { useState } from 'react'
import { ArrowRight, ChevronRight } from 'lucide-react'
import { BankLogo, bankName } from './BankLogo'
import { amountLabel, alternativeDifference, goalProjection, periodLabel } from './refinePresentation'
import { money } from './model'
import type { CoreCard, CoreProduct, CoreQuestion, CoreResponse } from './coreApi'

export function RecommendationJourney({ current }: { current: number }) {
  return <ol className="recommendation-journey" aria-label="추천 진행 단계">{['목표 설정', '내 상황 확인', '추천'].map((title, i) => <li key={title} aria-current={current === i ? 'step' : undefined}><span>{title}</span>{i < 2 && <ArrowRight size={13} aria-hidden="true"/>}</li>)}</ol>
}

function Projection({ goal, expected, principalOnly = false }: { goal: number; expected: number; principalOnly?: boolean }) {
  const values = goalProjection(goal, expected)
  if (!values) return <p className="refine-note">목표금액과 저축할 금액을 먼저 입력해 주세요.</p>
  return <figure className="goal-projection" aria-label={`목표 ${money(goal)}원, ${principalOnly ? '이자를 제외한 원금' : '목표일까지 예상'} ${money(expected)}원, ${values.shortfall ? `부족액 ${money(values.shortfall)}원` : `초과액 ${money(values.surplus)}원`}`}>
    <figcaption><span>{principalOnly ? '이자 제외 · 모을 원금' : '목표일까지 예상'}</span><strong>{amountLabel(expected, true)}</strong></figcaption>
    <div className="refine-meter" aria-hidden="true"><span style={{ width: `${values.percent}%` }}/></div>
    <div className="refine-meter-labels"><span>목표 {amountLabel(goal)}</span><strong className={values.shortfall ? 'gap' : 'surplus'}>{values.shortfall ? `${amountLabel(values.shortfall, true)} 부족해요` : values.surplus ? `${amountLabel(values.surplus, true)} 더 모여요` : '목표금액과 같아요'}</strong></div>
    <p className="refine-note">{principalOnly ? '이자는 아래 계산 결과에서 따로 확인해요.' : '정한 납입액과 만기를 유지할 때의 예상이에요.'}</p>
  </figure>
}

function Product({ product: p, response, reason }: { product: CoreProduct; response: CoreResponse; reason?: string }) {
  const detail = response.details[String(p.option_id)]
  return <section className="refine-product">
    <div className="refine-identity"><BankLogo name={p.institution}/><div><span>{bankName(p.institution)}</span><h3>{p.name}</h3></div></div>
    <div className="refine-figures"><div><span>{p.rate > p.base_rate ? '조건 이행 시 · 연' : '기본금리 · 연'}</span><strong>{p.rate.toFixed(2)}%</strong></div><div><span>{p.additional_cost ? '세후 이자 − 추가비용' : '세후 예상 이자'}</span><strong>{money(p.net_interest)}원</strong></div></div>
    <p className="refine-rate-basis">기본 {p.base_rate.toFixed(2)}%{p.rate > p.base_rate ? ` + 적용 우대 ${(p.rate - p.base_rate).toFixed(2)}%p` : ' · 추가 우대 미반영'}<br/>{p.kind === 'deposit' ? `목돈 ${amountLabel(p.principal)}` : `매달 ${amountLabel(response.result.budget?.monthly || 0)}`} · {detail?.flexible ? '자유적립' : p.kind === 'saving' ? '정액적립' : '예금'} · {periodLabel(p.term)}</p>
    {reason && <p className="refine-reason">{reason}</p>}<div className="refine-required"><h4>이 금리를 받으려면</h4><p>선택한 기간 동안 유지해야 해요.</p>{detail?.required_actions.length ? detail.required_actions.map((a, i) => <p key={i}>{a.description}</p>) : <p>추가로 선택한 우대 행동은 없어요.</p>}</div>
    <details className="refine-detail"><summary>상품 조건·계산 기준 보기</summary>
      <p>일반과세 15.4% · 납입 원금 {money(p.principal)}원 · 세후 이자에서 추가비용을 뺀 금액 {money(p.net_interest)}원</p>
      <p>추가비용 {money(p.additional_cost)}원 · 첫 상품 만기 {p.maturity}</p><p>{p.calculation_assumption}</p>
      <p>최소 {money(detail?.minimum || 0)}원{detail?.maximum != null ? ` · 최대 ${money(detail.maximum)}원` : ''}</p>
      {!!p.bonus_states?.length && <div className="refine-bonus-list"><h4>우대 반영 내역</h4>{p.bonus_states.map(b => <p key={b.id}><strong>{b.name} · {b.rate.toFixed(2)}%p</strong><br/>{b.status === 'applied' ? '확인한 조건으로 반영했어요.' : b.reason}</p>)}</div>}
      <p className="source-clause">{detail?.source_text}</p><p>가입대상: {detail?.eligibility_text}</p>
      <a className="core-source-link" href={p.source} target="_blank" rel="noopener noreferrer">상품 조건·공시 확인 ↗</a>
    </details>
  </section>
}

function Alternative({ card, primary, response }: { card: CoreCard; primary: CoreCard; response: CoreResponse }) {
  const difference = alternativeDifference(primary, card)
  const p = card.products[0], first = primary.products[0]
  const detail = response.details[String(p.option_id)], firstDetail = response.details[String(first.option_id)]
  const sameTerms = card.products.length === primary.products.length && p.term === first.term && detail?.flexible === firstDetail?.flexible
  return <details className="refine-alternative"><summary><div className="refine-alternative-top"><BankLogo name={p.institution}/><div><span>{bankName(p.institution)}</span><strong>{card.products.map(x => x.name).join(' + ')}</strong></div><ChevronRight size={17} aria-hidden="true"/></div><p>{difference == null ? '납입 계획이 달라 상세에서 비교해 주세요.' : difference === 0 ? '예상 금액 차이 0원 · 같은 금액이에요' : `추천안보다 예상 금액이 ${money(Math.abs(difference))}원 ${difference > 0 ? '많아요' : '적어요'}`}</p><small>{sameTerms ? '납입 방식·상품 기간 동일' : `${detail?.flexible ? '자유적립' : p.kind === 'saving' ? '정액적립' : '예금'} · ${periodLabel(p.term)}`} · 연 {p.rate.toFixed(2)}%</small></summary><div className="refine-alternative-body"><p>목표일까지 예상 {money(card.goal_total)}원 · 목표 부족액 {money(card.shortfall)}원</p>{card.products.map(p => <Product key={p.option_id} product={p} response={response}/>)}<p className="refine-reason">{card.recommendation_reason || card.comparison_explanation.summary}</p></div></details>
}

type Props = { response: CoreResponse; showCards: boolean; setShowCards: (show: boolean) => void; edit: (step?: 'goal' | 'capacity') => void; review: (q: CoreQuestion) => void; explore: (id: string) => void; revisit: () => void; hasSkipped: boolean; changeDate: (date: string) => void; onBrowse: () => void }
export function CoreResults({ response, showCards, setShowCards, edit, review, explore, revisit, hasSkipped, changeDate, onBrowse }: Props) {
  const [benefitsOpen, setBenefitsOpen] = useState(false)
  const result = response.result, primary = result.cards[0], goal = Number(response.profile.goal_amount)
  const budget = result.budget, gate = !!result.goal_guidance && !showCards
  const title = String(response.profile.goal_name || '내 목표')
  return <div className={`refine-results ${gate ? 'is-gap' : ''}`}>
    <div className="refine-result-layout">
      <section className="refine-goal-summary">
        <p className="refine-eyebrow">{title} · {periodLabel(budget?.horizon || 0)}</p>
        <h1>{gate ? <>지금 정한 저축액으로는<br/>목표까지 차이가 있어요</> : budget?.monthly ? `매달 ${amountLabel(budget.monthly)}씩 모으면` : '지금 맡길 목돈으로 모으면'}</h1>
        {primary && <Projection goal={goal} expected={primary.goal_total}/>}
        {gate && result.goal_guidance && <section className="refine-gap-actions core-goal-gate" role="status">
          <p>이자 없이 모을 원금은 <strong>{amountLabel(result.goal_guidance.principal)}</strong>이에요.</p>
          <p>원금만으로 목표를 맞추려면<br/><strong>매달 약 {Math.ceil(result.goal_guidance.required_monthly_principal_only / 10000).toLocaleString('ko-KR')}만원</strong>이 필요해요.</p>
          <p className="refine-note">무리해서 저축하라는 뜻은 아니에요.</p>
          <button className="primary" onClick={() => edit('goal')}>목표금액·기간 바꾸기</button><button className="secondary" onClick={() => setShowCards(true)}>지금 여력으로 상품 보기</button>
          <p className="refine-note">원래 목표는 직접 바꾸기 전까지 유지돼요.</p>
          <details className="refine-detail"><summary>정확한 계산 금액 보기</summary><p>목표 {money(goal)}원 · 원금 {money(result.goal_guidance.principal)}원 · 예상 {money(result.goal_guidance.projected_amount)}원 · 부족액 {money(result.goal_guidance.shortfall)}원</p><p>이자 없이 필요한 월 금액 {money(result.goal_guidance.required_monthly_principal_only)}원</p><p>{result.goal_guidance.calculation_notice}</p></details>
        </section>}
        {!gate && primary && <><button className="refine-edit text-link" onClick={() => edit()}>금액·기간 수정</button><details className="refine-detail"><summary>목표와 정확한 금액 보기</summary><p>목표 {money(goal)}원 · 예상 {money(primary.goal_total)}원 · 부족액 {money(primary.shortfall)}원</p><p>{String(response.profile.start_date)}부터 {String(response.profile.goal_date)}까지</p></details></>}
        {!gate && primary && primary.products.some(p => p.term < (budget?.horizon || 0)) && <div className="refine-timeline"><h4>첫 만기와 최종 목표를 나눠 봐요</h4><ol><li><strong>모으기 시작</strong><time>{String(response.profile.start_date)}</time></li><li><strong>첫 상품 만기</strong>{primary.products.map(p => <time key={p.option_id}>{p.maturity}</time>)}</li><li><strong>최종 목표</strong><time>{String(response.profile.goal_date)}</time></li></ol><p className="refine-note">첫 만기 이후의 재가입 이자는 0원으로 계산했어요. 미래 금리는 확정하지 않아요.</p></div>}
      </section>
      {!gate && primary && <div className="refine-recommendations core-products"><article className="refine-primary card"><span className="pill">{result.basis_label || '확인한 조건 기준 추천'}</span>{primary.products.map((p, i) => <Product key={p.option_id} product={p} response={response} reason={i === 0 ? primary.recommendation_reason || primary.comparison_explanation.summary : undefined}/>)}</article>
        {result.cards.length > 1 && <section className="refine-alternatives"><h2>함께 비교한 상품</h2>{result.cards.slice(1).map(card => <Alternative key={card.products.map(p => p.option_id).join('-')} card={card} primary={primary} response={response}/>)}</section>}
      </div>}
    </div>
    {!primary && !result.liquid_comparison?.cards.length && <section className="card empty-state"><h2>{result.status === 'NO_MATCH' ? '현재 범위에서 맞는 상품을 찾지 못했어요' : result.status === 'NEEDS_ELIGIBILITY' ? '가입에 필요한 정보를 확인해 주세요' : '비교에 필요한 정보를 확인해 주세요'}</h2><p>{result.reason || '모르는 조건을 충족한 것으로 보지 않아요. 확인한 정보로 다시 비교할 수 있어요.'}</p><button className="primary" onClick={() => edit()}>입력 확인하기</button>{hasSkipped && <button className="secondary" onClick={revisit}>보류한 가입 정보 다시 확인</button>}</section>}
    {result.liquid_comparison && <section className="card core-schedule"><h2>목표일까지 잠시 보관할 돈</h2><p>{result.liquid_comparison.notice || result.liquid_comparison.reason}</p>{result.liquid_comparison.cards.map(p => <article className="core-liquid-card" key={p.product_id}><div className="refine-identity"><BankLogo name={p.institution}/><h3>{p.name}</h3></div><p>목표일까지 잔액 유지 시 세후 예상 이자 <strong>{money(p.interest_estimate)}원</strong></p><p>수집 당시 연 {p.rate.toFixed(2)}% · 변동 가능</p><a className="core-source-link" href={p.source_url} target="_blank" rel="noopener noreferrer">상품 조건·공시 확인 ↗</a></article>)}</section>}
    {!gate && primary && <section className="refine-followup">
      <div className="refine-edit-actions"><button className="secondary" onClick={() => edit('capacity')}>저축할 금액 수정</button>{response.review_questions.map(q => <button className="secondary" key={q.id} onClick={() => review(q)}>{q.id === 'bonus_intent.auto_transfer' ? '자동이체 답변 수정' : '납입 방식 수정'}</button>)}</div>
      {!!result.benefit_options?.length && <><button className="refine-benefit-toggle" aria-expanded={benefitsOpen} onClick={() => setBenefitsOpen(v => !v)}><span>추가 혜택을 확인할까요?<small>원하는 혜택만 골라 다시 비교해요.</small></span><ChevronRight size={19}/></button>{benefitsOpen && <div className="refine-benefit-options">{result.benefit_options.map(b => <button key={b.id} onClick={() => explore(b.id)}><strong>{bankName(b.institution)}</strong><span>{b.label}</span><ArrowRight size={16}/></button>)}</div>}</>}
      {!!result.eligibility_pending?.length && <details className="refine-detail"><summary>가입 정보를 확인하지 못한 상품 {result.eligibility_pending_count || result.eligibility_pending.length}개</summary><p>이 상품들은 확정 추천과 대안에 포함하지 않았어요.</p>{result.eligibility_pending.map(p => <button className="secondary" key={p.product_id} onClick={() => explore(`eligibility|${p.product_id}`)}>{p.name} 가입 정보 확인</button>)}</details>}
      <p className="refine-note">미확인 우대는 예상 이자에 넣지 않았어요. 모든 우대의 최대 가능성을 확인한 순위는 아니에요.</p>
    </section>}
    {result.schedule_alternative && <section className="card core-schedule"><h3>늦춰도 된다고 답한 범위의 별도 계획</h3><p>{result.schedule_alternative.notice}</p><p>{result.schedule_alternative.goal_date}까지 예상 {money(result.schedule_alternative.result.cards[0]?.goal_total || 0)}원</p><button className="secondary" onClick={() => changeDate(result.schedule_alternative!.goal_date)}>이 날짜로 변경하고 조건 다시 확인</button></section>}
    <p className="refine-source-note">2026년 8월 수집 자료 · 실제 가입과 실적을 확인한 결과는 아니에요. <button className="text-link" onClick={onBrowse}>상품·수집 기준</button></p>
  </div>
}
