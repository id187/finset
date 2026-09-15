import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = resolve('node_modules/pyodide');
const version = JSON.parse(readFileSync(resolve(source, 'package.json'), 'utf8')).version;
if (version !== '314.0.7') throw Error('Unexpected Python runtime version');
const target = resolve(`dist/python/v${version}`);
mkdirSync(target, { recursive: true });
for (const file of ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json', 'package.json', 'README.md']) {
  copyFileSync(resolve(source, file), resolve(target, file));
}
console.log(`Bundled Pyodide ${version} for same-origin, server-free calculation.`);
