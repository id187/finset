"""Local mockup adapter: real immutable source and engine, explicitly fictional profiles."""
import copy
import json
import logging
import os
import sys
import time
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('FINSET_DATA_DIR', str(ROOT.parent / 'mvp' / '핀셋_MVP_팀원전달')))
sys.path.insert(0, str(DATA / 'finset_recommendation'))
from engine import recommend
from questions import render
from recovery import project_recovery
from calculator import month
from datetime import date
import source
from condition_db import build as build_conditions, catalog, evaluate_answers
from core_runtime import call as call_core

logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
BASE = json.loads((DATA / 'fixtures/recommendation_base.json').read_text(encoding='utf-8'))


@lru_cache(maxsize=32)
def comparison(monthly, goal, months, sector, start_date='2026-09-11', scenario='base'):
    profile = copy.deepcopy(BASE)
    profile.update(monthly=monthly, goal_amount=goal, start_date=start_date,
                   goal_date=month(date.fromisoformat(start_date), months).isoformat(),
                   sectors=['bank'] if sector == 'bank' else ['bank', 'savings_bank'])
    if scenario == 'unknown':
        profile['facts'] = {k:v for k,v in profile.get('facts',{}).items() if k in ('age','nationality','residency')}
    started = time.monotonic()
    result = recommend(profile)
    result['question_cards'] = render(result.get('questions', []))
    result['demo'] = True
    result['profile_summary'] = {key: profile[key] for key in ('start_date', 'goal_date', 'monthly', 'goal_amount', 'reserve', 'sectors')}
    logging.info('Recommendation completed in %.2fs', time.monotonic() - started)
    return result


class Handler(BaseHTTPRequestHandler):
    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        try:
            if parsed.path == '/api/v2/meta':
                self.send_json(call_core({'action': 'metadata'}))
            elif parsed.path == '/api/conditions':
                self.send_json(catalog())
            elif parsed.path == '/api/source':
                rows = source.inventory()
                self.send_json({'products': len(rows), 'institutions': len({r['institution'] for r in rows}),
                                'snapshot': '2026년 8월', 'verified': True, 'read_only': True,
                                'notice': '수집 DB 전체 상품 수입니다. 실제 추천 범위는 연결된 규칙과 가입 조건에 따라 달라집니다.'})
            elif parsed.path == '/api/recommendations':
                q = parse_qs(parsed.query)
                monthly = int(q.get('monthly', ['300000'])[0])
                goal = int(q.get('goal', ['3600000'])[0])
                months = int(q.get('months', ['12'])[0])
                sector = q.get('sector', ['bank'])[0]
                start_date = q.get('start', ['2026-09-11'])[0]
                scenario = q.get('scenario', ['base'])[0]
                if not (0 < monthly <= 10000000 and 0 < goal <= 1000000000 and months in (6, 12, 24, 36, 60) and sector in ('bank', 'all') and start_date in ('2026-09-11', '2027-01-11') and scenario in ('base','unknown')):
                    raise ValueError('목표 금액과 기간을 확인해 주세요.')
                source.connect().close()
                self.send_json(comparison(monthly, goal, months, sector, start_date, scenario))
            else:
                self.send_json({'message': '요청한 화면 정보를 찾지 못했어요.'}, 404)
        except ValueError as exc:
            self.send_json({'message': str(exc)}, 400)
        except Exception:
            logging.exception('Source or recommendation error')
            self.send_json({'message': '상품 데이터를 불러오지 못했어요. 데이터 경로와 API 실행 상태를 확인해 주세요.'}, 503)

    def do_POST(self):
        if self.path not in ('/api/recovery', '/api/conditions/evaluate', '/api/v2/recommend'):
            return self.send_json({'message': '지원하지 않는 요청이에요.'}, 404)
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 65536:
                raise ValueError('요청 크기를 확인해 주세요.')
            payload = json.loads(self.rfile.read(size))
            if self.path == '/api/v2/recommend':
                return self.send_json(call_core(payload))
            if self.path == '/api/conditions/evaluate':
                return self.send_json(evaluate_answers(payload.get('option_id'), payload.get('answers')))
            result = project_recovery(payload['plan'], payload['change'])
            self.send_json(result, 400 if result['status'] == 'INVALID' else 200)
        except (ValueError, KeyError, TypeError) as exc:
            self.send_json({'message': str(exc) if isinstance(exc, ValueError) else '입력값을 확인해 주세요.'}, 400)
        except Exception:
            logging.exception('Recovery error')
            self.send_json({'message': '회복안을 계산하지 못했어요. 다시 시도해 주세요.'}, 500)


if __name__ == '__main__':
    source.connect().close()  # Verify the pinned hash before serving any data.
    build_conditions()
    port = int(os.environ.get('FINSET_API_PORT', '8000'))
    print(f'Fin-Set API ready: http://127.0.0.1:{port}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
