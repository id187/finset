"""The source catalog is immutable. No API in this module can write to it."""
import hashlib,json,sqlite3
from pathlib import Path
ROOT=Path(__file__).resolve().parent
DB=ROOT.parent/'service_data_collection/service_products.sqlite3'
PIN=ROOT/'source_lock.json'
def sha():return hashlib.sha256(DB.read_bytes()).hexdigest()
def connect():
 expected=json.loads(PIN.read_text())['sha256']
 if sha()!=expected:raise RuntimeError('원본 DB가 변경되었습니다. 자동으로 새 원본을 승인하지 않습니다.')
 c=sqlite3.connect(DB.as_uri()+'?mode=ro&immutable=1',uri=True)
 c.execute('PRAGMA query_only=ON');c.row_factory=sqlite3.Row
 return c

def inventory():
 with connect() as c:
  return [dict(x) for x in c.execute('select id,source,product_type,institution,name,detail_status from products')]
