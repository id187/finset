export type AnswerValue = string | number | boolean | null | string[] | Record<string, number>
export type CoreProfile = Record<string, unknown>
export type CoreRequest = { case_id?: string; profile?: CoreProfile; answers?: Record<string, AnswerValue> }
export type CoreQuestion = { id: string; title: string; help?: string; allow_unknown: boolean; type: string; unit?: string; minimum?: number; maximum?: number; options?: { value: AnswerValue; label: string }[]; components?: { id: string; label: string }[]; context: { id: string; name: string; institution: string; clause: string; source: string }[] }
export type CoreProduct = { product_id: string; option_id: number; institution: string; name: string; kind: string; term: number; rate: number; base_rate: number; net_interest: number; principal: number; additional_cost: number; maturity: string; source: string; calculation_assumption: string }
export type CoreCard = { role: string; products: CoreProduct[]; goal_total: number; shortfall: number; goal_fit: string; goal_notice: string; why: string[]; comparison_explanation: { summary: string; scope: string; goal: string; rate_notice: string; limit: string; provisional: boolean } }
type ChoicePreview = { available: boolean; status: string; notice?: string; projected_amount?: number; shortfall?: number; products?: { name: string; kind: string; term: number; rate: number; net_interest: number }[] }
export type CoreResult = { status: string; cards: CoreCard[]; reason?: string; provisional?: boolean; questions?: string[]; remaining_questions?: string[]; required_cash?: number; budget?: { monthly: number; monthly_reduced: boolean; total_principal: number; deposit: number; horizon: number }; goal_projection_notice?: string;
  contribution_choice?: { title: string; show_comparison: boolean; fixed_allowed: ChoicePreview; adjustable_only: ChoicePreview; notice: string };
  goal_guidance?: { title: string; provisional: boolean; goal_amount: number; projected_amount: number; principal: number; shortfall: number; required_monthly_principal_only: number; calculation_notice: string; actions: { id: string; label: string }[] };
  liquid_comparison?: { status: string; notice?: string; reason?: string; questions?: string[]; cards: { product_id: string; institution: string; name: string; rate: number; interest_estimate: number; source_url: string; role: string; why: string[] }[] };
  schedule_alternative?: { goal_date: string; requires_confirmation: boolean; notice: string; result: CoreResult } }
export type CoreResponse = { version: string; result: CoreResult; questions: CoreQuestion[]; review_questions: CoreQuestion[]; answer_values: Record<string, AnswerValue>; profile: CoreProfile; input_sha256: string; demo: boolean; details: Record<string, { source_text: string; eligibility_text: string; notes: string; minimum: number; maximum: number | null; flexible: boolean; required_actions: {title: string; description: string}[]; bonus_terms: { name: string; rate: number }[] }> }
export type CoreMeta = { version: string; snapshot: string; connected_products: number; source_sha256: string; help: Record<string, string>; replay_only?: boolean; notice?: string; cases: { id: string; name: string; profile: CoreProfile; input_sha256: string }[]; banks?: {id: string; name: string}[]; holdings_products?: {id: string; bank: string; name: string; kind: string}[] }
type Replay = { meta: CoreMeta; snapshots: Record<string, CoreResponse> }
export const CORE_API_BASE = (import.meta.env.VITE_FINSET_API_URL || '').replace(/\/$/, '')
export const CORE_REPLAY = import.meta.env.MODE === 'pages' && !CORE_API_BASE
let replay: Promise<Replay> | undefined
function loadReplay() {
  return replay ||= fetch(`${import.meta.env.BASE_URL}demo/mvp2.json`).then(async r => {
    if (!r.ok) throw Error('검증 사례를 불러오지 못했어요. 다시 시도해 주세요.')
    const data = await r.json() as Replay
    if (data.meta?.version !== '2026-09-13-consistency-1') throw Error('시연 데이터 버전을 확인할 수 없어요.')
    return data
  }).catch(e => { replay = undefined; throw e })
}
export function replayKey(request: CoreRequest) {
  const answers = request.answers || {}
  if (Object.keys(request.profile || {}).length || Object.keys(answers).some(k => !['contribution_preference', 'bonus_intent.kakao.auto_transfer'].includes(k))) throw Error('이 입력은 추천 서버에서 계산해야 해요. 공개 사례의 우대 행동과 납입 방식을 바꾸거나 로컬에서 직접 입력해 주세요.')
  const part = (key: string) => key in answers ? JSON.stringify(answers[key]) : 'default'
  return [request.case_id, part('contribution_preference'), part('bonus_intent.kakao.auto_transfer')].join('|')
}
async function request<T>(path: string, body?: unknown, signal?: AbortSignal) {
  const r = await fetch(`${CORE_API_BASE}/api/v2/${path}`, { signal, ...(body ? { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body) } : {}) })
  let data
  try { data = await r.json() } catch { throw Error('추천 서버에 연결하지 못했어요. 로컬 실행 상태를 확인해 주세요.') }
  if (!r.ok) throw Error(data.message || '추천을 계산하지 못했어요.')
  return data as T
}
export async function coreMeta(signal?: AbortSignal): Promise<CoreMeta> { return CORE_REPLAY ? (await loadReplay()).meta : request<CoreMeta>('meta', undefined, signal) }
export async function coreRecommend(input: CoreRequest, signal?: AbortSignal): Promise<CoreResponse> {
  if (!CORE_REPLAY) return request<CoreResponse>('recommend', input, signal)
  const result = (await loadReplay()).snapshots[replayKey(input)]
  if (!result) throw Error('이 조합은 준비된 사례에 없어요. 다른 사례를 선택해 주세요.')
  return structuredClone(result)
}
