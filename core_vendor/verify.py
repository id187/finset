"""Validate the delivered core against an existing, immutable source DB."""
import argparse,hashlib,json,sys,copy,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parent
parser=argparse.ArgumentParser();parser.add_argument('--db',required=True,help='기존 읽기 전용 service_products.sqlite3의 경로');args=parser.parse_args()
manifest=json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'))
for name,digest in manifest['files'].items():
 p=ROOT/name
 if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=digest:raise SystemExit('전달 파일 불일치: '+name)
sys.path.insert(0,str(ROOT/'finset_recommendation'))
import engine,source,questions
source.DB=Path(args.db).resolve()
if not source.DB.is_file():raise SystemExit('기존 DB 파일이 없습니다. 새 DB를 만들지 말고 경로를 확인하세요.')
h=source.sha();pin=json.loads(source.PIN.read_text(encoding='utf-8'))['sha256']
if h!=pin:raise SystemExit('DB 해시 불일치. 핀이나 원본을 변경하지 마세요.')
c=source.connect();assert c.execute('PRAGMA query_only').fetchone()[0]==1;c.close()
rules=json.loads((ROOT/'finset_recommendation/rules.json').read_text(encoding='utf-8'));cases=json.loads((ROOT/'fixtures/cases.json').read_text(encoding='utf-8'))
assert cases['source_hash']==h
fail=[]
for row in cases['cases']:
 z=engine.recommend(copy.deepcopy(row['profile']),rules)
 if z!=row['expected']:fail.append(row['name'])
 print(('FAIL ' if z!=row['expected'] else 'PASS ')+row['name'],flush=True)
for key in ['cash','reserve','monthly','low_month_capacity','early_access_amount','goal_amount']:
 assert questions.render([key])[0].get('help'),key
suite=unittest.defaultTestLoader.discover(str(ROOT/'finset_recommendation/consistency_review_20260913'),pattern='test_consistency.py')
result=unittest.TextTestRunner().run(suite)
assert source.sha()==h
if fail or not result.wasSuccessful():raise SystemExit('검증 실패: '+str(fail))
print(f'PASS: {len(cases["cases"])}개 입력의 전체 응답 일치 / 질문 도움말 6항목 / 상태전환 단위 테스트 / DB 읽기 전용·해시 유지')
