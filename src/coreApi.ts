import { browserMeta, browserRecommend } from './browserCore'

export type AnswerValue = string | number | boolean | null | string[] | Record<string, number>
export type CoreProfile = Record<string, unknown>
export type CoreRequest = { case_id?: string; profile?: CoreProfile; answers?: Record<string, AnswerValue> }
export type CoreQuestion = { purpose?: 'common' | 'eligibility' | 'bonus'; unknown_effect?: string; id: string; title: string; help?: string; allow_unknown: boolean; type: string; unit?: string; minimum?: number; maximum?: number; options?: { value: AnswerValue; label: string }[]; components?: { id: string; label: string }[]; context: { id: string; name: string; institution: string; clause: string; source: string }[] }
export type CoreBonus = { id: string; name: string; rate: number; status: string; reason: string; product_id?: string; option_id?: number }
export type CoreProduct = { bonus_states?: CoreBonus[]; bonus_earned?: string[]; product_id: string; option_id: number; institution: string; name: string; kind: string; term: number; rate: number; base_rate: number; net_interest: number; principal: number; additional_cost: number; maturity: string; source: string; calculation_assumption: string }
export type CoreCard = { recommendation_reason?: string; basis_label?: string; comparison_basis?: { goal_amount: number; goal_date: string; total_principal: number; monthly: number; deposit: number }; role: string; products: CoreProduct[]; goal_total: number; shortfall: number; goal_fit: string; goal_notice: string; why: string[]; comparison_explanation: { summary: string; scope: string; goal: string; rate_notice: string; limit: string; provisional: boolean } }
type ChoicePreview = { available: boolean; status: string; notice?: string; projected_amount?: number; shortfall?: number; products?: { name: string; kind: string; term: number; rate: number; net_interest: number }[] }
export type CoreResult = { policy_version?: string; basis_label?: string; optional_questions?: boolean; optional_eligibility?: boolean; eligibility_pending?: {product_id: string; institution: string; name: string; missing: string[]}[]; eligibility_pending_count?: number; bonus_not_applied?: CoreBonus[]; applied_bonus?: CoreBonus[]; benefit_options?: {id: string; label: string; institution: string; product_id: string; missing: string[]}[]; status: string; cards: CoreCard[]; reason?: string; provisional?: boolean; questions?: string[]; remaining_questions?: string[]; required_cash?: number; budget?: { monthly: number; monthly_reduced: boolean; total_principal: number; deposit: number; horizon: number }; goal_projection_notice?: string;
  contribution_choice?: { title: string; show_comparison: boolean; fixed_allowed: ChoicePreview; adjustable_only: ChoicePreview; notice: string };
  goal_guidance?: { title: string; provisional: boolean; goal_amount: number; projected_amount: number; principal: number; shortfall: number; required_monthly_principal_only: number; calculation_notice: string; actions: { id: string; label: string }[] };
  liquid_comparison?: { status: string; notice?: string; reason?: string; questions?: string[]; cards: { product_id: string; institution: string; name: string; rate: number; interest_estimate: number; source_url: string; role: string; why: string[] }[] };
  schedule_alternative?: { goal_date: string; requires_confirmation: boolean; notice: string; result: CoreResult } }
export type CoreResponse = { version: string; result: CoreResult; questions: CoreQuestion[]; review_questions: CoreQuestion[]; answer_values: Record<string, AnswerValue>; profile: CoreProfile; input_sha256: string; demo: boolean; details: Record<string, { source_text: string; eligibility_text: string; notes: string; minimum: number; maximum: number | null; flexible: boolean; required_actions: {title: string; description: string}[]; bonus_terms: { name: string; rate: number }[] }> }
export type CoreMeta = { version: string; snapshot: string; connected_products: number; source_sha256: string; help: Record<string, string>; replay_only?: boolean; notice?: string; cases: { id: string; name: string; profile: CoreProfile; input_sha256: string }[]; banks?: {id: string; name: string}[]; holdings_products?: {id: string; bank: string; name: string; kind: string}[] }
export const CORE_API_BASE = (import.meta.env.VITE_FINSET_API_URL || '').replace(/\/$/, '')
export const CORE_BROWSER = import.meta.env.MODE === 'pages' && !CORE_API_BASE
async function request<T>(path: string, body?: unknown, signal?: AbortSignal) {
  const r = await fetch(`${CORE_API_BASE}/api/v2/${path}`, { signal, ...(body ? { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body) } : {}) })
  let data
  try { data = await r.json() } catch { throw Error('추천 서버에 연결하지 못했어요. 로컬 실행 상태를 확인해 주세요.') }
  if (!r.ok) throw Error(data.message || '추천을 계산하지 못했어요.')
  return data as T
}
export async function coreMeta(signal?: AbortSignal): Promise<CoreMeta> { return CORE_BROWSER ? browserMeta(signal) : request<CoreMeta>('meta', undefined, signal) }
export async function coreRecommend(input: CoreRequest, signal?: AbortSignal): Promise<CoreResponse> {
  return CORE_BROWSER ? browserRecommend(input, signal) : request<CoreResponse>('recommend', input, signal)
}
