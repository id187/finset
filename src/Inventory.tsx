import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Database, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import type { AuditReport } from './catalogue'
import { money } from './model'

type Item = { id: string; name: string; institution: string; kind: string; status: string; options: number; ready_options: number;
  option_issues: number; issues: string[]; bonus: string; eligibility: string; notes: string; source_url: string; product_url: string;
  collected_at: string; source_updated: string; base_min: number | null; base_max: number | null; reasons: string[] }
type InventoryData = { report: AuditReport; products: Item[] }
const statusLabels: Record<string, string> = { comparison_ready: '적금 비교 가능', review_required: '조건·경로 검수 필요', browse_only: '정보 조회', source_issue: '수집 오류' }
const kinds: Record<string, string> = { saving: '적금', deposit: '예금', demand_deposit: '입출금' }
const reasons: Record<string, string> = {
  not_digital: '앱·웹 가입 경로 미연결', bonus_clause_review: '우대 원문 추가 해석 필요', not_monthly_saving: '월 적금 추천 범위 밖',
  combined_limit_review: '다른 계좌와 합산한 한도 확인 필요', eligibility_review: '가입대상 추가 확인 필요',
  cost_review: '우대에 드는 추가 비용 확인 필요', model_review: '이자 계산 방식 추가 검수 필요',
  source_data_issue: '수집 데이터에 확인할 항목 있음', source_rate_mismatch: '공시·규칙 금리 불일치', source_term_mismatch: '공시·규칙 기간 불일치',
}
let cached: InventoryData | null = null
export function Inventory({ onStart }: { onStart: () => void }) {
  const [data, setData] = useState<InventoryData | null>(cached)
  const [error, setError] = useState(''), [retry, setRetry] = useState(0)
  const [search, setSearch] = useState(''), [kind, setKind] = useState('all'), [status, setStatus] = useState('all'), [page, setPage] = useState(0)
  const query = useDeferredValue(search.toLocaleLowerCase().trim())
  useEffect(() => {
    if (cached) return
    const controller = new AbortController(); setError('')
    fetch(`${import.meta.env.BASE_URL}demo/inventory.json`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('전체 상품 데이터를 불러오지 못했어요.')
      const result = await response.json() as InventoryData
      if (!Array.isArray(result.products) || result.products.length !== result.report?.source_products) throw new Error('전체 상품의 검증 정보가 일치하지 않아요.')
      cached = result; setData(result)
    }).catch(e => { if (e.name !== 'AbortError') setError(e.message) })
    return () => controller.abort()
  }, [retry])
  const items = useMemo(() => data?.products.filter(p => (kind === 'all' || p.kind === kind) && (status === 'all' || p.status === status) && (!query || `${p.name} ${p.institution}`.toLocaleLowerCase().includes(query))) || [], [data, kind, status, query])
  const currentPage = Math.min(page, Math.max(0, Math.ceil(items.length / 20) - 1))
  const reset = () => setPage(0)
  if (error) return <div className="card empty-state" role="alert"><h2>상품 조회가 잠시 어려워요</h2><p>{error}</p><button className="primary" onClick={() => setRetry(n => n + 1)}>다시 시도</button></div>
  if (!data) return <div className="loading-state" role="status"><RefreshCw className="spin"/><h2>전체 상품을 불러오고 있어요</h2></div>
  const report = data.report
  return <section className="inventory-page">
    <div className="page-heading"><div><div className="eyebrow">THE FULL PICTURE</div><h1>상품 데이터 한눈에<span className="blue-dot">.</span></h1><p>전체 상품의 수집 상태와 실제 비교 범위를 확인하세요.</p></div><button className="primary" onClick={onStart}>내 조건으로 추천<ArrowRight size={17}/></button></div>
    <div className="inventory-stats"><div className="card"><Database size={21}/><span>전체 상품</span><strong>{money(report.source_products)}</strong><small>금리 옵션 {money(report.rate_options)}개 검사</small></div><div className="card"><ShieldCheck size={21}/><span>적금 비교 가능</span><strong>{money(report.comparison_products)}</strong><small>{money(report.comparison_options)}개 기간 옵션</small></div><div className="card"><Search size={21}/><span>조건·경로 검수 필요</span><strong>{money(report.statuses.review_required || 0)}</strong><small>수집 오류 {report.statuses.source_issue || 0}개 별도 표시</small></div></div>
    <details className="card inventory-audit"><summary>DB 검증 결과 · 원본 보존 확인</summary><p>{report.notice}</p><ul>{report.databases.map(db => <li key={db.name}><strong>{db.name}</strong> · 무결성 {db.integrity === 'ok' ? '통과' : '확인 필요'} · 원본 {db.preserved ? '보존' : '변경'}<small>SHA256 {db.sha256}</small></li>)}</ul><p>문장 조각 {money(report.condition_fragments)}개를 포함해 전체 행을 검사했습니다. 문장 분리와 의미 해석 완료는 구분합니다.</p><a href={`${import.meta.env.BASE_URL}demo/audit-report.json`} download="finset-audit-report.json">검증 보고서 다운로드 ↗</a></details>
    <div className="card inventory-controls"><label htmlFor="inventory-search">상품명·금융기관 검색</label><div className="inventory-search"><Search size={18}/><input id="inventory-search" type="search" placeholder="예: 카카오, 정기적금, 신협" value={search} onChange={e => { setSearch(e.target.value); reset() }}/></div><div className="inventory-selects"><label>상품 종류<select aria-label="상품 종류" value={kind} onChange={e => { setKind(e.target.value); reset() }}><option value="all">전체 상품</option>{Object.entries(kinds).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>검증 상태<select aria-label="검증 상태" value={status} onChange={e => { setStatus(e.target.value); reset() }}><option value="all">모든 상태</option>{Object.entries(statusLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div><p role="status">검색 결과 {money(items.length)}개 · {report.snapshot} 수집 기준</p></div>
    <div className="inventory-list">{items.slice(currentPage * 20, (currentPage + 1) * 20).map(p => <article className="card inventory-item" key={p.id}><div className="row-between"><span className={`pill ${p.status === 'comparison_ready' ? 'green' : ''}`}>{statusLabels[p.status]}</span><small>{kinds[p.kind] || p.kind}</small></div><small className="muted">{p.institution}</small><h3>{p.name}</h3><p className="inventory-rate">공시 기본금리 <strong>{p.base_min === null ? '확인 필요' : `${p.base_min.toFixed(2)}${p.base_min !== p.base_max ? `~${p.base_max?.toFixed(2)}` : ''}%`}</strong></p><p>{p.options}개 금리 옵션 · {p.ready_options ? `${p.ready_options}개 적금 비교 연결` : '자동 추천에 사용하지 않음'}</p><details><summary>가입조건·우대 원문 보기</summary><dl><dt>가입대상</dt><dd>{p.eligibility || '수집 내용 없음'}</dd><dt>우대조건 원문</dt><dd>{p.bonus || '수집 내용 없음'}</dd><dt>추가 조건</dt><dd>{p.notes || '수집 내용 없음'}</dd></dl>{p.reasons.length > 0 && <p>확인할 내용: {p.reasons.map(r => reasons[r] || r).join(' · ')}</p>}{p.status === 'source_issue' && <p>상세정보 수집에 오류가 있어 추천에서 제외했습니다.</p>}<p>수집일: {p.collected_at || '확인 필요'}<br/>공시 갱신값: {p.source_updated || '제공되지 않음'}</p>{/^https?:\/\//.test(p.product_url || p.source_url) && <a href={p.product_url || p.source_url} target="_blank" rel="noopener noreferrer">상품·공시 근거 보기 ↗</a>}</details></article>)}</div>
    {!items.length && <div className="card empty-state"><h3>검색 결과가 없어요</h3><p>검색어나 필터를 바꿔 보세요.</p><button className="secondary" onClick={() => { setSearch(''); setKind('all'); setStatus('all'); reset() }}>검색 초기화</button></div>}
    <div className="inventory-pagination"><button className="secondary" disabled={currentPage === 0} onClick={() => { setPage(currentPage - 1); window.scrollTo({ top: 0 }) }}>이전</button><span>{currentPage + 1} / {Math.max(1, Math.ceil(items.length / 20))}</span><button className="secondary" disabled={(currentPage + 1) * 20 >= items.length} onClick={() => { setPage(currentPage + 1); window.scrollTo({ top: 0 }) }}>다음</button></div>
  </section>
}
