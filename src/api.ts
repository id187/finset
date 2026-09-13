import { evaluateAnswers, projectRecovery } from './offline'
import type { ConditionOption, RecoveryPlan, Change } from './offline'

export const PAGES_MODE = import.meta.env.MODE === 'pages'
export const DEMO_GOALS = [1000000, 3000000, 3600000, 5000000, 10000000]
export const DEMO_MONTHLY = [50000, 100000, 200000, 300000, 500000]
type Catalog = { source: unknown; conditions: { products: ConditionOption[] }; inputs: { monthly: number[]; goals: number[]; months: number[]; starts: string[] } }
const cache = new Map<string, Promise<unknown>>()
async function jsonFile<T>(path: string): Promise<T> {
  if (!cache.has(path)) cache.set(path, (async () => {
    const response = await fetch(`${import.meta.env.BASE_URL}demo/${path}`)
    if (!response.ok) throw new Error('시연 데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')
    return response.json()
  })().catch(error => { cache.delete(path); throw error }))
  return await cache.get(path) as T
}

export async function api<T>(url: string, body?: unknown): Promise<T> {
  if (PAGES_MODE) {
    const parsed = new URL(url, location.origin)
    if (parsed.pathname === '/api/recovery') {
      const request = body as { plan: RecoveryPlan; change: Change }
      const result = projectRecovery(request?.plan, request?.change)
      if (result.status === 'INVALID') throw new Error(result.reason)
      return result as T
    }
    const catalog = await jsonFile<Catalog>('catalog.json')
    if (parsed.pathname === '/api/source') return catalog.source as T
    if (parsed.pathname === '/api/conditions') return catalog.conditions as T
    if (parsed.pathname === '/api/conditions/evaluate') {
      const request = body as { option_id: number; answers: Record<string, unknown> }
      return evaluateAnswers(catalog.conditions.products.find(p => p.option_id === request.option_id), request.answers) as T
    }
    if (parsed.pathname === '/api/recommendations') {
      const q = parsed.searchParams
      const monthly = Number(q.get('monthly') ?? 300000), goal = Number(q.get('goal') ?? 3600000)
      const months = Number(q.get('months') ?? 12), sector = q.get('sector') ?? 'bank'
      const start = q.get('start') ?? '2026-09-11', scenario = q.get('scenario') ?? 'base'
      if (!catalog.inputs.monthly.includes(monthly) || !catalog.inputs.goals.includes(goal) || !catalog.inputs.months.includes(months) || !catalog.inputs.starts.includes(start) || !['bank', 'all'].includes(sector) || !['base', 'unknown'].includes(scenario)) throw new Error('공개 시연에서 준비한 금액을 선택해 주세요. 자유 입력 비교는 로컬 실행에서 사용할 수 있어요.')
      const bundle = await jsonFile<Record<string, T>>(`recommendations/${monthly}-${goal}.json`)
      const result = bundle[[months, sector, start, scenario].join('|')]
      if (!result) throw new Error('이 시연 결과를 찾지 못했어요. 다른 조건을 선택해 주세요.')
      return structuredClone(result)
    }
    throw new Error('지원하지 않는 요청이에요.')
  }
  const response = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined)
  let data
  try { data = await response.json() } catch { throw new Error('데이터 서버에 연결하지 못했어요. API를 실행한 뒤 다시 시도해 주세요.') }
  if (!response.ok) throw new Error(data.message || data.reason || '데이터를 불러오지 못했어요. 다시 시도해 주세요.')
  return data
}
