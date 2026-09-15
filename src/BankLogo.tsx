import { useState } from 'react'

const logos: Record<string, string> = { '카카오뱅크': 'kakao.png', '케이뱅크': 'kbank.ico' }
export function bankName(name: string) { return name.replace(/주식회사|㈜/g, '').trim() }
export function BankLogo({ name }: { name: string }) {
  const [failed, setFailed] = useState(false)
  const key = Object.keys(logos).find(key => name.includes(key))
  const short = bankName(name).replace(/은행|저축/g, '').slice(0, 2)
  return <span className="bank-logo" aria-hidden="true">{key && !failed ? <img src={`${import.meta.env.BASE_URL}banks/${logos[key]}`} alt="" onError={() => setFailed(true)}/> : <span>{short || '은행'}</span>}</span>
}
