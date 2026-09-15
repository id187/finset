import test from 'node:test'
import assert from 'node:assert/strict'
import {freshBasicPlan,basicProfile,validateBasic} from '../src/basicPlan.ts'
test('상환 검토 응답은 API에서 참으로 보존하며 안내 화면이 우회 승인이 되지 않는다',()=>{
 const f={...freshBasicPlan(),sector:'bank',fund:'personal',debt:'yes'}
 assert.equal(basicProfile(f,{}).high_interest_debt,true)
 assert.notEqual(validateBasic(2,f),'')
 assert.equal(validateBasic(2,{...f,debt:'no'}),'')
 assert.notEqual(validateBasic(2,{...f,debt:''}),'')
})
