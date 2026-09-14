import {rmSync, existsSync} from 'node:fs';
import {resolve, dirname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist=resolve(root,'dist');
for(const name of ['demo/full-catalogue.json','demo/guided.json']) {
  const target=resolve(dist,name);
  if(!target.startsWith(dist+sep)) throw Error('Build output path is outside dist');
  if(existsSync(target)) rmSync(target);
}
console.log('Pages package uses Python replay responses; full recommendation rules excluded.');
