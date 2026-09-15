import { useEffect, useRef } from 'react'
export function BrandIntro({done}:{done:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null)
 useEffect(()=>{
  const el=dialog.current, motion=window.matchMedia('(prefers-reduced-motion: reduce)')
  if(motion.matches){done();return}
  el?.showModal()
  const timer=window.setTimeout(done,2400)
  const reduceMotion=()=>{if(motion.matches)done()}
  motion.addEventListener('change',reduceMotion)
  return ()=>{window.clearTimeout(timer);motion.removeEventListener('change',reduceMotion);el?.close()}
 },[done])
 return <dialog ref={dialog} className="brand-intro" aria-labelledby="brand-intro-title" onCancel={done}><div className="brand-stage"><div className="brand-intro-mark" aria-hidden="true"><span className="brand-fin">Fin</span><span className="brand-hyphen">-</span><span className="brand-set">Set</span><span className="brand-dot">.</span></div><div className="brand-rule" aria-hidden="true"/><h2 id="brand-intro-title"><span>내 조건에 맞게.</span><span>내 목표에 닿게.</span></h2><p>나다운 저축의 시작</p></div></dialog>
}
