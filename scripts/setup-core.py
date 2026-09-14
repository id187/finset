"""Install the read-only handoff data needed by the pinned core, without overwriting files."""
import argparse,hashlib,json,shutil
from pathlib import Path
root=Path(__file__).resolve().parents[1]
a=argparse.ArgumentParser();a.add_argument('--package',type=Path,required=True,help='Path to the handoff 최신코어 directory');args=a.parse_args()
vendor=root/'core_vendor';manifest=json.loads((vendor/'manifest.json').read_text(encoding='utf-8'))
for name,sha in manifest['files'].items():
    dst=vendor/name
    if dst.exists():
        if hashlib.sha256(dst.read_bytes()).hexdigest()!=sha:raise SystemExit('Existing file differs; preserved without overwrite: '+name)
        continue
    src=args.package.resolve()/name
    if not src.is_file() or hashlib.sha256(src.read_bytes()).hexdigest()!=sha:raise SystemExit('Wrong or missing source file: '+str(src))
    dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dst)
print('Pinned core package verified; existing files preserved.')
