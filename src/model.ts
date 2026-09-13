export type Product = { product_id: string; option_id: number; institution: string; name: string; rate: number; base_rate: number; term: number; net_interest: number; source: string; calculation_assumption: string; maturity?: string; additional_cost?: number; bonus_earned?: string[] }
export type Card = { products: Product[]; goal_total: number; shortfall: number; why: string[]; role: string; provisional?: boolean }
export type Payment = { id: string; date: string; amount: number; scheduledDate?: string | null }
export type Schedule = { date: string; amount: number }
export type PlanVersion = { at: string; label: string; before: Schedule[]; after: Schedule[] }
export type Saved = { title: string; goal: number; monthly: number; months: number; startDate?: string; product?: Product; products?: Product[]; payments: Payment[]; schedule?: Schedule[]; changes: string[]; versions?: PlanVersion[]; paymentEvents?: { at: string; action: string; before: Payment; after?: Payment }[] }
export type Draft = { id: string; title: string; goal: number; monthly: number; months: number; startDate: string; sector: string; scenario?: string; card: Card; at: string }
export const TODAY = '2027-01-11'
export const BASE_START = '2026-09-11'
export const money = (n: number) => n.toLocaleString('ko-KR')
export function addMonths(start: string, count: number) {
  const [y,m,d] = start.split('-').map(Number)
  const last = new Date(Date.UTC(y,m+count,0)).getUTCDate()
  return new Date(Date.UTC(y,m-1+count,Math.min(d,last))).toISOString().slice(0,10)
}
export const startOf = (p: Saved) => p.startDate || BASE_START
export const paymentSlot = (p: Payment) => p.scheduledDate === undefined ? p.date : p.scheduledDate
export const totalPrincipal = (p: Saved) => p.payments.reduce((n,r)=>n+r.amount,0)
export function originalSchedule(p: Saved): Schedule[] { return Array.from({length:p.months},(_,i)=>({date:addMonths(startOf(p),i),amount:p.monthly})) }
export function fullSchedule(p: Saved): Schedule[] { return p.schedule || originalSchedule(p) }
export function remainingSchedule(p: Saved): Schedule[] {
  return fullSchedule(p).map(s=>({...s,amount:Math.max(0,s.amount-p.payments.filter(r=>paymentSlot(r)===s.date).reduce((n,r)=>n+r.amount,0))})).filter(s=>s.amount>0)
}
export function applyRemaining(p: Saved, remaining: Schedule[], label: string): Saved {
  const dates = new Set(remaining.map(r=>r.date))
  const past = fullSchedule(p).filter(r=>!dates.has(r.date))
  const next = [...past,...remaining.map(s=>({...s,amount:s.amount+p.payments.filter(r=>paymentSlot(r)===s.date).reduce((n,r)=>n+r.amount,0)}))].sort((a,b)=>a.date.localeCompare(b.date))
  return {...p,schedule:next,changes:[...p.changes,label],versions:[...(p.versions||[]),{at:new Date().toISOString(),label,before:fullSchedule(p),after:next}]}
}
export function readSaved(): Saved {
  try {
    const r=JSON.parse(localStorage.getItem('finset-demo-v1')||'null')
    const valid=r && Number.isSafeInteger(r.goal) && r.goal>0 && Number.isSafeInteger(r.monthly) && r.monthly>0 && [6,12,24,36,60].includes(r.months) && Array.isArray(r.payments) && r.payments.every((p:Payment)=>Number.isSafeInteger(p.amount)&&p.amount>0&&typeof p.date==='string'&&typeof p.id==='string') && Array.isArray(r.changes)
    return valid ? r : initial
  } catch { return initial }
}
export const initial: Saved = {title:'나의 첫 목돈 만들기',goal:3600000,monthly:300000,months:12,startDate:BASE_START,payments:[9,10,11,12].map(m=>({id:`demo-${m}`,date:`2026-${String(m).padStart(2,'0')}-11`,amount:300000})),changes:[]}
