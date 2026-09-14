import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { unpackCatalogue, recommendCatalogue, defaultFilters } from '../src/catalogue.ts'
import { projectSaving } from '../src/projection.ts'
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const raw = read('../public/demo/full-catalogue.json'), data = unpackCatalogue(raw)
const inventory = read('../public/demo/inventory.json')
const base = { purpose: '일단 모으기', monthly: '171237', months: '12', transfer: 'no', goal: '' }

test('Every source product is visible once; every published option is accounted for', () => {
  assert.equal(inventory.products.length, 12542)
  assert.equal(new Set(inventory.products.map(p => p.id)).size, 12542)
  assert.equal(inventory.products.reduce((n, p) => n + p.options, 0), 44678)
  assert.equal(inventory.products.reduce((n, p) => n + p.ready_options, 0), data.rules.length)
  assert.ok(data.rules.length > 7000)
  assert.equal(inventory.products.filter(p => p.status === 'source_issue').length, 5)
  const ready = new Set(raw.groups.map(g => g.product_id))
  assert.ok(inventory.products.filter(p => p.status === 'source_issue').every(p => !ready.has(p.id)))
  assert.ok(data.report.databases.every(db => db.integrity === 'ok' && db.preserved))
  assert.throws(() => unpackCatalogue({ ...raw, report: { ...raw.report, comparison_options: 1 } }))
})

test('All unique rates, terms and models match independent original Python Decimal calculations', () => {
  const fixtures = read('./fixtures/catalogue-parity.json')
  assert.equal(fixtures.start, data.start)
  for (const [key, expected] of Object.entries(fixtures.cases)) {
    const [amount, term, rate, model] = key.split('|')
    assert.deepEqual(projectSaving(+amount, +term, +rate, model, data.start), expected, key)
  }
  for (const rule of data.rules) for (const rate of [rule.base_rate, rule.max_rate]) {
    assert.ok(fixtures.cases[`171237|${rule.term}|${rate}|${rule.model}`])
  }
})

test('All-source comparison, sector filters and flexible-only preference change eligible scope', () => {
  const all = recommendCatalogue(base, data)
  assert.equal(all.compared, data.report.comparison_products)
  assert.ok(all.matched > 2000); assert.equal(all.cards.length, 3)
  assert.equal(new Set(all.cards.map(c => c.products[0].product_id)).size, 3)
  for (const sector of ['bank', 'savings_bank', 'credit_union']) {
    const result = recommendCatalogue(base, data, { sector, flexible: false })
    assert.ok(result.cards.length)
    assert.ok(result.cards.every(card => data.rules.find(r => r.option_id === card.products[0].option_id).sector === sector))
  }
  const flexible = recommendCatalogue(base, data, { sector: 'all', flexible: true })
  assert.ok(flexible.cards.every(card => data.rules.find(r => r.option_id === card.products[0].option_id).flexible))
})

test('Unknown is never bonus; Hana account question remains editable after answering', () => {
  const unknown = recommendCatalogue({ ...base, transfer: 'unknown' }, data, { sector: 'bank', flexible: false })
  assert.ok(unknown.cards.every(c => c.products[0].rate === c.products[0].base_rate))
  const q = { ...base, transfer: 'yes', monthly: '3000001' }, filters = { sector: 'bank', flexible: false }
  const unanswered = recommendCatalogue(q, data, filters)
  assert.ok(unanswered.questions.some(q => q.key === 'hana.account'))
  const yes = recommendCatalogue(q, data, filters, { 'hana.account': true })
  assert.ok(yes.cards.some(c => c.products[0].rate > c.products[0].base_rate))
  assert.ok(yes.questions.some(q => q.key === 'hana.account'))
  const no = recommendCatalogue(q, data, filters, { 'hana.account': false })
  assert.ok(no.cards.every(c => c.products[0].rate === c.products[0].base_rate))
  assert.deepEqual(recommendCatalogue(q, data, filters, { age: 1, 'contract.hold_to_maturity': false }), unanswered)
})

test('Limits, invalid input, goal gaps and post-maturity principal remain correct', () => {
  for (const monthly of ['0', '-1', '1e5', '0.1', '1000000001']) assert.equal(recommendCatalogue({ ...base, monthly }, data).cards.length, 0)
  assert.equal(recommendCatalogue({ ...base, transfer: '' }, data).cards.length, 0)
  const huge = recommendCatalogue({ ...base, monthly: '1000000000' }, data)
  assert.equal(huge.cards.length, 0)
  const long = recommendCatalogue({ ...base, months: '60' }, data)
  assert.ok(long.cards.every(c => c.goal_total === 171237 * 60 + c.products[0].net_interest && c.products[0].term <= 60))
  const copied = structuredClone(data)
  recommendCatalogue(base, data, defaultFilters())
  assert.deepEqual(data, copied)
})
