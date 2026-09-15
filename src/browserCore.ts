import manifest from '../public/browser-core/manifest.json'
import type { CoreMeta, CoreRequest, CoreResponse } from './coreApi'

let worker: Worker | undefined
let sequence = 0
let warming: Promise<unknown> | undefined
let progress = '추천에 필요한 자료를 준비하고 있어요'
const listeners = new Set<(message: string) => void>()
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; cleanup: () => void }
const pending = new Map<number, Pending>()
const base = () => new URL(import.meta.env.BASE_URL, location.href).href

export function browserProgress() { return progress }
export function onBrowserProgress(listener: (message: string) => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
function setProgress(message: string) {
  progress = message
  listeners.forEach(listener => listener(message))
}
function stop(error: Error) {
  worker?.terminate()
  worker = undefined
  warming = undefined
  for (const task of pending.values()) { task.cleanup(); task.reject(error) }
  pending.clear()
}
function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./core.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = ({ data }) => {
    if (data.progress) { setProgress(data.progress); return }
    if (data.fatal) { stop(Error('계산 자료를 준비하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.')); return }
    const task = pending.get(data.id)
    if (!task) return
    task.cleanup()
    pending.delete(data.id)
    if (data.ok) task.resolve(data.data)
    else task.reject(Error(data.error || '입력한 조건을 계산하지 못했어요. 다시 시도해 주세요.'))
  }
  worker.onerror = event => {
    event.preventDefault()
    stop(Error('계산 기능을 불러오지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.'))
  }
  worker.onmessageerror = () => stop(Error('계산 결과를 읽지 못했어요. 다시 시도해 주세요.'))
  return worker
}
function call<T>(input: CoreRequest | { action: 'metadata' }, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
  return new Promise<T>((resolve, reject) => {
    let target: Worker
    try { target = getWorker() } catch { reject(Error('이 브라우저에서 계산 기능을 시작하지 못했어요. 최신 브라우저로 다시 시도해 주세요.')); return }
    const id = ++sequence
    const timer = setTimeout(() => stop(Error('자료 준비나 계산이 오래 걸리고 있어요. 입력한 답은 유지됩니다. 다시 시도해 주세요.')), 120_000)
    const abort = () => {
      pending.get(id)?.cleanup()
      pending.delete(id)
      target.postMessage({ cancel: id })
      reject(new DOMException('Aborted', 'AbortError'))
    }
    pending.set(id, { resolve: value => resolve(value as T), reject, cleanup: () => { clearTimeout(timer); signal?.removeEventListener('abort', abort) } })
    signal?.addEventListener('abort', abort, { once: true })
    target.postMessage({ id, input, base: base() })
  })
}
export function warmBrowserCore() {
  return warming ||= call<CoreMeta>({ action: 'metadata' }).catch(error => { warming = undefined; throw error })
}
export async function browserMeta(signal?: AbortSignal): Promise<CoreMeta> {
  const response = await fetch(`${base()}browser-core/meta.json?v=${manifest.metadata_sha256}`, { signal })
  if (!response.ok) throw Error('상품 조건을 불러오지 못했어요. 다시 시도해 주세요.')
  const bytes = await response.arrayBuffer()
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('')
  if (hash !== manifest.metadata_sha256) throw Error('상품 자료 버전이 달라요. 새로고침 후 다시 시도해 주세요.')
  const meta = JSON.parse(new TextDecoder().decode(bytes)) as CoreMeta
  if (meta.version !== manifest.version) throw Error('추천 자료 버전을 확인할 수 없어요.')
  // Warm while the user answers the basic questions; the form does not wait.
  if (!signal?.aborted) void warmBrowserCore().catch(() => {})
  return meta
}
export function browserRecommend(input: CoreRequest, signal?: AbortSignal) {
  return call<CoreResponse>(input, signal)
}
