import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { evaluateAnswers, projectRecovery } from '../src/offline.ts'

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const catalog = read('../public/demo/catalog.json')
const fixtures = read('./fixtures/pages-parity.json')

test('Published results cover every selectable combination with matching inputs and hashes', () => {
  let count = 0
  for (const monthly of catalog.inputs.monthly) for (const goal of catalog.inputs.goals) {
    const filename = `${monthly}-${goal}.json`
    const raw = readFileSync(new URL(`../public/demo/recommendations/${filename}`, import.meta.url))
    assert.equal(createHash('sha256').update(raw).digest('hex'), catalog.provenance.bundles_sha256[filename])
    const bundle = JSON.parse(raw)
    assert.equal(Object.keys(bundle).length, 40)
    for (const months of catalog.inputs.months) for (const sector of ['bank', 'all']) for (const start of catalog.inputs.starts) for (const scenario of ['base', 'unknown']) {
      const result = bundle[[months, sector, start, scenario].join('|')]
      assert.ok(result?.status)
      assert.equal(result.profile_summary.monthly, monthly)
      assert.equal(result.profile_summary.goal_amount, goal)
      assert.equal(result.profile_summary.start_date, start)
      assert.deepEqual(result.profile_summary.sectors, sector === 'bank' ? ['bank'] : ['bank', 'savings_bank'])
      assert.equal(result.demo, true)
      assert.equal('facts' in result, false)
      count++
    }
  }
  assert.equal(count, 1000)
  assert.equal(catalog.provenance.cases, count)
})

test(`${fixtures.conditions.length} bonus outcomes match the original Python evaluator`, () => {
  for (const sample of fixtures.conditions) {
    const option = catalog.conditions.products.find(p => p.option_id === sample.option_id)
    assert.deepEqual(evaluateAnswers(option, sample.answers), sample.expected, JSON.stringify(sample))
  }
})

test('Unknown, invalid and out-of-contract answers never grant a bonus', () => {
  for (const option of catalog.conditions.products) {
    assert.equal(evaluateAnswers(option, {}).bonus_rate, 0)
    assert.throws(() => evaluateAnswers(option, { unknown_fact: true }))
    for (const q of option.questions) {
      assert.throws(() => evaluateAnswers(option, { [q.key]: 'yes' }))
      if (q.type === 'number') {
        for (const value of [-1, 1.5, q.maximum + 1, Infinity, true]) assert.throws(() => evaluateAnswers(option, { [q.key]: value }))
      }
    }
  }
  assert.throws(() => evaluateAnswers(undefined, {}))
})

test(`${fixtures.recovery.length} recovery cases match Python without mutating the saved plan`, () => {
  for (const sample of fixtures.recovery) {
    const before = structuredClone(sample.plan)
    assert.deepEqual(projectRecovery(sample.plan, sample.change), sample.expected, sample.label)
    assert.deepEqual(sample.plan, before, `${sample.label}: input changed`)
  }
})
