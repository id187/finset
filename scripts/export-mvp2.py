"""Publish bounded replay responses from the delivered Python core, never rules."""
import itertools
import json
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import core_runtime as core

def variant_key(case_id, answers):
    def part(key):
        return json.dumps(answers[key], ensure_ascii=False, separators=(',', ':')) if key in answers else 'default'
    return '|'.join([case_id, part('contribution_preference'), part('bonus_intent.kakao.auto_transfer')])

def main():
    meta = core.execute({'action': 'metadata'})
    meta.pop('banks'); meta.pop('holdings_products')
    meta['replay_only'] = True
    meta['notice'] = '전달된 가상 입력을 Python 코어로 계산한 사례 시연입니다. 자유 입력 계산은 로컬 실행 또는 추천 서버 연결이 필요합니다.'
    data = {'meta': meta, 'snapshots': {}}
    checks = []
    for i, case in enumerate(core.runtime()[5]):
        base = core.execute({'case_id': str(i)})
        assert base['result'] == case['expected'], case['name']
        checks.append({'case': case['name'], 'full_response_equal': True, 'input_sha256': base['input_sha256']})
        for pref, intent in itertools.product(['default', None, 'fixed_ok', 'adjustable', 'compare'], ['default', True, False, None]):
            answers = {}
            if pref != 'default': answers['contribution_preference'] = pref
            if intent != 'default': answers['bonus_intent.kakao.auto_transfer'] = intent
            response = base if not answers else core.execute({'case_id': str(i), 'answers': answers})
            data['snapshots'][variant_key(str(i), answers)] = response
        print('Exported', case['name'], flush=True)
    target = ROOT / 'public/demo/mvp2.json'
    target.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    (ROOT / '.qa/mvp2-core-verification.json').write_text(json.dumps({'version': core.VERSION, 'checks': checks, 'replay_states': len(data['snapshots']), 'source_sha256': core.runtime()[1].sha()}, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Published', len(data['snapshots']), 'Python responses;', target.stat().st_size, 'bytes')

if __name__ == '__main__': main()
