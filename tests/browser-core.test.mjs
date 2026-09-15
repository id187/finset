import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPyodide } from 'pyodide';
import digests from '../scripts/response-digest.cjs';

const root = new URL('../', import.meta.url);
const read = file => readFileSync(new URL(file, root));
let python;
before(async () => {
  python = await loadPyodide({ indexURL: fileURLToPath(new URL('node_modules/pyodide/', root)) });
  python.unpackArchive(new Uint8Array(read('public/browser-core/core.zip')), 'zip', { extractDir: '/finset' });
  python.runPython("import sys\nsys.path.insert(0, '/finset')\nfrom browser_entry import execute_json");
});
function calculate(input) {
  python.globals.set('_request_json', JSON.stringify(input));
  try { return JSON.parse(python.runPython('execute_json(_request_json)')); }
  finally { python.globals.delete('_request_json'); }
}
test('Packaged WebAssembly Python matches all 280 full native responses', () => {
  const replay = JSON.parse(read('tests/fixtures/refine-responses.json'));
  for (const [key, expected] of Object.entries(replay.sha256)) {
    const [case_id, preference, intent] = key.split('|'), answers = {};
    if (preference !== 'default') answers.contribution_preference = JSON.parse(preference);
    if (intent !== 'default') answers['bonus_intent.kakao.auto_transfer'] = JSON.parse(intent);
    const actual = calculate({ case_id, answers });
    assert.equal(actual.ok, true, key);
    assert.equal(digests.digest(actual.data), expected, key);
  }
});
test('Arbitrary amounts, terms, unknowns and invalid inputs match native Python', () => {
  for (const item of JSON.parse(read('tests/fixtures/browser-core.json'))) {
    assert.deepEqual(calculate(item.request), item.error ? { ok: false, error: item.error } : { ok: true, data: item.expected }, item.name);
  }
});
test('Derived DB is complete for inventory, read-only, and rejects corruption', () => {
  const manifest = JSON.parse(read('public/browser-core/manifest.json'));
  assert.equal(python.runPython('len(__import__("browser_source").inventory())'), manifest.source.products);
  assert.equal(python.runPython('__import__("browser_source").connect().execute("PRAGMA query_only").fetchone()[0]'), 1);
  assert.throws(() => python.runPython('__import__("browser_source").connect().execute("DELETE FROM products")'), /readonly/);
  const path = '/finset/browser_data/inventory.sqlite3';
  const data = python.FS.readFile(path);
  try {
    python.FS.writeFile(path, new Uint8Array([0]));
    assert.throws(() => python.runPython('__import__("browser_source").connect()'), /시연용 상품 자료가 변경/);
  } finally { python.FS.writeFile(path, data); }
});
