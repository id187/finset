import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { unpackCatalogue } from '../src/catalogue.ts'
import { interviewState, answerInterview, reviseInterview, interviewAdjustments } from '../src/interview.ts'
const data = unpackCatalogue(JSON.parse(readFileSync(new URL('../public/demo/full-catalogue.json', import.meta.url))))
const input = { purpose: '일단 모으기', monthly: '171237', months: '12', goal: '', transfer: '' }
const bank = { liquidity: 'no', flexible: 'no', savingsBank: 'no', creditUnion: 'no' }
function finish(q = input, supplied = {}) {
  let answers = {}, state
  for (let n = 0; n < 12; n++) {
    state = interviewState(q, answers, data)
    if (state.kind !== 'question') return { state, answers }
    assert.equal(state.result, undefined, 'No recommendation before all relevant questions are answered')
    const id = state.question.id
    const answer = supplied[id] || (id === 'liquidity' || id === 'renewed' ? 'no' : 'yes')
    answers = answerInterview(q, answers, data, id, answer)
  }
  assert.fail('The adaptive interview did not terminate')
}

test('The first answer is never assumed; potential withdrawals require a separate budget', () => {
  assert.equal(interviewState(input, {}, data).question.id, 'liquidity')
  for (const liquidity of ['yes', 'unknown']) {
    assert.equal(interviewState(input, { liquidity }, data).question.id, 'separate')
    for (const separate of ['no', 'unknown']) {
      const state = interviewState(input, { ...bank, liquidity, separate }, data)
      assert.equal(state.kind, 'blocked'); assert.equal(state.result, undefined)
    }
    assert.equal(finish(input, { liquidity, separate: 'yes' }).state.kind, 'complete')
  }
  assert.equal(interviewState({ ...input, monthly: '0' }, {}, data).kind, 'invalid')
})

test('Institution and deposit preferences actually narrow the candidate set', () => {
  const all = finish(input, { flexible: 'no' }).state
  const selected = finish(input, { ...bank, flexible: 'yes' }).state
  assert.ok(all.candidateCount > selected.candidateCount)
  assert.ok(selected.result.cards.every(c => {
    const rule = data.rules.find(r => r.option_id === c.products[0].option_id)
    return rule.sector === 'bank' && rule.flexible
  }))
  assert.ok(!selected.history.some(r => r.question.id === 'savingsBank'), 'No savings-bank question when no flexible candidates exist')
  assert.ok(!all.history.some(r => ['transfer', 'tossAccount', 'renewed', 'hanaAccount'].includes(r.question.id)), 'Do not ask about bonuses unable to affect the leading candidates')
})

test('Confirmed transfer answers change the recommendation; no and unknown never earn that bonus', () => {
  const yes = finish(input, bank).state
  assert.equal(yes.result.cards[0].products[0].name, '카카오뱅크 자유적금')
  assert.equal(yes.result.cards[0].products[0].rate, 3.85)
  for (const transfer of ['no', 'unknown']) {
    const state = finish(input, { ...bank, transfer }).state
    assert.equal(state.kind, 'complete')
    assert.equal(state.result.cards[0].products[0].name, '코드K 자유적금')
    assert.ok(state.result.cards.every(c => c.products[0].rate === c.products[0].base_rate))
    if (transfer === 'no') assert.ok(!state.history.some(r => r.question.id === 'renewed'))
  }
  for (const renewed of ['yes', 'unknown']) {
    const state = finish(input, { ...bank, renewed }).state
    const kakao = state.result.cards.find(c => c.products[0].name === '카카오뱅크 자유적금')
    if (kakao) assert.equal(kakao.products[0].rate, kakao.products[0].base_rate)
  }
})

test('Unknown eligibility excludes that product, including when fewer than three candidates remain', () => {
  for (const tossAccount of ['no', 'unknown']) {
    const state = finish(input, { ...bank, tossAccount }).state
    assert.ok(!state.result.cards.some(c => c.products[0].institution.includes('토스')))
    assert.ok(state.history.some(r => r.question.id === 'tossAccount'))
  }
  const q = { ...input, monthly: '3000001' }
  for (const hanaAccount of ['yes', 'no', 'unknown']) {
    const state = finish(q, { ...bank, flexible: 'yes', hanaAccount }).state
    assert.equal(state.kind, 'complete')
    assert.ok(state.history.some(r => r.question.id === 'hanaAccount'))
    assert.equal(state.result.cards[0].products[0].rate, hanaAccount === 'yes' ? 2.3 : 1.8)
  }
})

test('Backtracking discards dependent answers; stale and duplicate clicks cannot answer the next question', () => {
  const { state } = finish(input, bank)
  const revised = reviseInterview(state, 'creditUnion')
  assert.deepEqual(Object.keys(revised), ['liquidity', 'flexible', 'savingsBank'])
  assert.equal(interviewState(input, revised, data).question.id, 'creditUnion')
  const next = answerInterview(input, revised, data, 'creditUnion', 'yes')
  const done = interviewState(input, next, data)
  assert.equal(done.kind, 'complete')
  assert.ok(!done.history.some(r => r.question.id === 'transfer'))
  assert.deepEqual(answerInterview(input, next, data, 'creditUnion', 'no'), next)
  const first = answerInterview(input, {}, data, 'liquidity', 'no')
  assert.deepEqual(answerInterview(input, first, data, 'liquidity', 'yes'), first)
})

test('Amount changes re-evaluate relevance and never reuse an irrelevant bank-account answer', () => {
  const old = finish(input, bank)
  const changed = interviewState({ ...input, monthly: '3000001' }, old.answers, data)
  assert.equal(changed.kind, 'question'); assert.equal(changed.question.id, 'hanaAccount')
  assert.ok(!changed.history.some(r => ['tossAccount', 'renewed'].includes(r.question.id)))
})

test('All answer combinations finish, and no unknown answer invents bonus or eligibility', () => {
  for (const transfer of ['yes', 'no', 'unknown']) for (const tossAccount of ['yes', 'no', 'unknown']) for (const renewed of ['yes', 'no', 'unknown']) {
    const { state } = finish(input, { ...bank, transfer, tossAccount, renewed })
    assert.equal(state.kind, 'complete')
    assert.equal(new Set(state.history.map(r => r.question.id)).size, state.history.length)
    if (tossAccount !== 'yes') assert.ok(!state.result.cards.some(c => c.products[0].institution.includes('토스')))
    if (transfer !== 'yes') assert.ok(state.result.cards.every(c => c.products[0].rate === c.products[0].base_rate))
  }
})

test('Goal adjustments replay the same answers and only offer a verified, goal-reaching result', () => {
  const q = { ...input, purpose: '여행 자금', goal: '3000000' }
  const { answers, state } = finish(q, { flexible: 'no' })
  assert.ok(state.result.cards[0].shortfall > 0)
  const options = interviewAdjustments(q, answers, data)
  assert.ok(options.length)
  for (const option of options) {
    const next = interviewState(option.input, answers, data)
    assert.equal(next.kind, 'complete'); assert.equal(next.result.cards[0].shortfall, 0)
  }
  const huge = finish({ ...input, monthly: '1000000000' }).state
  assert.equal(huge.kind, 'complete'); assert.equal(huge.result.cards.length, 0)
})
