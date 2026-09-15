import type { PyodideInterface } from 'pyodide'
import manifest from '../public/browser-core/manifest.json'

let ready: Promise<PyodideInterface> | undefined
let queue = Promise.resolve()
const cancelled = new Set<number>()
const report = (progress: string) => self.postMessage({ progress })

async function initialize(base: string) {
  report('처음 비교할 때 필요한 계산 자료를 내려받고 있어요')
  const indexURL = `${base}python/v${manifest.pyodide}/`
  const [{ loadPyodide }, response] = await Promise.all([
    import(/* @vite-ignore */ `${indexURL}pyodide.mjs`) as Promise<typeof import('pyodide')>,
    fetch(`${base}browser-core/core.zip?v=${manifest.package_sha256}`),
  ])
  if (!response.ok) throw Error('Browser core download failed')
  const bytes = await response.arrayBuffer()
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('')
  if (hash !== manifest.package_sha256) throw Error('Browser core checksum mismatch')
  const python = await loadPyodide({ indexURL })
  report('상품 조건과 계산 자료를 확인하고 있어요')
  python.unpackArchive(bytes, 'zip', { extractDir: '/finset' })
  python.runPython("import sys\nsys.path.insert(0, '/finset')\nfrom browser_entry import execute_json")
  return python
}

self.onmessage = ({ data }) => {
  if (data.cancel) { cancelled.add(data.cancel); return }
  const { id, input, base } = data
  // Python owns global module state; process requests one at a time.
  queue = queue.then(async () => {
    if (cancelled.delete(id)) return
    let python: PyodideInterface
    try { python = await (ready ||= initialize(base)) } catch (error) {
      console.error('Browser core initialization failed', error)
      self.postMessage({ id, fatal: true })
      return
    }
    if (cancelled.delete(id)) return
    report('답변에 맞는 상품 조건과 예상 금액을 계산하고 있어요')
    try {
      python.globals.set('_request_json', JSON.stringify(input))
      const result = JSON.parse(python.runPython('execute_json(_request_json)') as string)
      if (!cancelled.delete(id)) self.postMessage({ id, ...result })
    } catch (error) {
      console.error('Browser core calculation failed', error)
      self.postMessage({ id, ok: false, error: '계산 중 문제가 생겼어요. 입력한 답은 유지됩니다. 다시 시도해 주세요.' })
    } finally { python.globals.delete('_request_json') }
  }).catch(() => self.postMessage({ id, fatal: true }))
}
