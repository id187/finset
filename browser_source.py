"""Read-only browser snapshot adapter; the original vendor source.py stays intact.

The build verifies the complete original DB. Only its public inventory columns
are copied here: ranking uses the unchanged rules, not the collected raw pages.
sha() reports that original DB's provenance, not this smaller file's checksum.
The smaller file has its own independently verified checksum in source.json.
"""
import hashlib
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent / 'browser_data'
SNAPSHOT = ROOT / 'inventory.sqlite3'


def lock():
    return json.loads((ROOT / 'source.json').read_text(encoding='utf-8'))


def sha():
    return lock()['source_sha256']


def connect():
    if hashlib.sha256(SNAPSHOT.read_bytes()).hexdigest() != lock()['snapshot_sha256']:
        raise RuntimeError('시연용 상품 자료가 변경되었습니다. 새로고침 후 다시 시도해 주세요.')
    c = sqlite3.connect(SNAPSHOT.as_uri() + '?mode=ro&immutable=1', uri=True)
    c.execute('PRAGMA query_only=ON')
    c.row_factory = sqlite3.Row
    return c


def inventory():
    with connect() as c:
        return [dict(x) for x in c.execute('select id,source,product_type,institution,name,detail_status from products')]
