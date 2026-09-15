import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const manifest = JSON.parse(read('public/browser-core/manifest.json'));
const vendor = JSON.parse(read('core_vendor/manifest.json'));
if (manifest.version !== vendor.version) throw Error('Browser core version is stale');
for (const [file, expected] of Object.entries(vendor.files)) {
  if (manifest.files['core_vendor/' + file] !== expected) throw Error(`Browser vendor mismatch: ${file}`);
}
for (const file of ['core_runtime.py', 'browser_entry.py', 'browser_source.py', 'public/demo/inventory.json', 'core_vendor/manifest.json']) {
  const bytes = file.startsWith('core_vendor/') ? read(file) : Buffer.from(read(file).toString('utf8').replaceAll('\r\n', '\n'));
  if (sha(bytes) !== manifest.files[file]) throw Error(`Browser package needs re-export: ${file}`);
}
for (const [file, expected] of [['core.zip', manifest.package_sha256], ['meta.json', manifest.metadata_sha256]]) {
  if (sha(read('public/browser-core/' + file)) !== expected) throw Error(`Corrupt browser package: ${file}`);
}
const source = JSON.parse(read('core_vendor/finset_recommendation/source_lock.json'));
if (manifest.source.source_sha256 !== source.sha256) throw Error('Original DB provenance mismatch');
if (JSON.parse(read('package.json')).dependencies.pyodide !== manifest.pyodide) throw Error('Python runtime version mismatch');
console.log('Browser package, original source provenance and unchanged vendor hashes verified.');
