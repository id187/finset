"""Build a deterministic, separate browser package from verified read-only data.

Run locally with the delivered original DB present. Commit the package so Pages
CI never needs the private workspace or the 125 MB collected-page database.
"""
import hashlib
import io
import json
import sqlite3
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import core_runtime as core


def digest(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def main():
    _, source, _, _, _, _, _ = core.runtime()  # Full DB and every vendor file checked.
    original_sha = source.sha()
    rows = source.inventory()
    columns = ['id', 'source', 'product_type', 'institution', 'name', 'detail_status']
    with sqlite3.connect(':memory:') as db:
        db.execute('CREATE TABLE products (id TEXT, source TEXT, product_type TEXT, institution TEXT, name TEXT, detail_status TEXT)')
        db.executemany('INSERT INTO products VALUES (?,?,?,?,?,?)', [[row[k] for k in columns] for row in rows])
        db.commit()
        assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        db.row_factory = sqlite3.Row
        assert [dict(x) for x in db.execute('SELECT * FROM products')] == rows
        snapshot = db.serialize()
    source_lock = {
        'source_sha256': original_sha, 'snapshot_sha256': digest(snapshot),
        'source_verification': 'Full original DB SHA256 verified at package build; browser verifies the derived snapshot.',
        'products': len(rows), 'columns': columns,
    }
    # These repository-owned text files use LF in Git/CI. Vendor bytes below
    # remain untouched, including their original line endings.
    files = {name: (ROOT / name).read_bytes().replace(b'\r\n', b'\n') for name in ['core_runtime.py', 'browser_entry.py', 'browser_source.py', 'public/demo/inventory.json']}
    manifest = json.loads((ROOT / 'core_vendor/manifest.json').read_text(encoding='utf-8'))
    files['core_vendor/manifest.json'] = (ROOT / 'core_vendor/manifest.json').read_bytes()
    for name in manifest['files']:
        files['core_vendor/' + name] = (ROOT / 'core_vendor' / name).read_bytes()
    files['browser_data/inventory.sqlite3'] = snapshot
    files['browser_data/source.json'] = json_bytes(source_lock)
    meta = core.execute({'action': 'metadata'})
    meta['replay_only'] = False
    meta['notice'] = '입력한 금액과 답변을 브라우저에서 계산합니다. 수집 당시 상품 조건을 사용합니다.'
    meta_bytes = json_bytes(meta)
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    package = output.getvalue()
    if source.sha() != original_sha:
        raise RuntimeError('Original DB changed during export')
    out = ROOT / 'public/browser-core'
    out.mkdir(parents=True, exist_ok=True)
    (out / 'core.zip').write_bytes(package)
    (out / 'meta.json').write_bytes(meta_bytes)
    (out / 'manifest.json').write_bytes(json_bytes({
        'version': core.VERSION, 'pyodide': '314.0.7', 'source': source_lock,
        'package_sha256': digest(package), 'metadata_sha256': digest(meta_bytes),
        'files': {name: digest(data) for name, data in sorted(files.items())},
        'sizes': {'original_db': core.DB.stat().st_size, 'snapshot_db': len(snapshot), 'package': len(package)},
    }))
    print(json.dumps({'products': len(rows), 'original_bytes': core.DB.stat().st_size, 'snapshot_bytes': len(snapshot), 'package_bytes': len(package), 'source_sha256': original_sha}))


if __name__ == '__main__':
    main()
