"""Reference outcomes from the unmodified Python engine, scoped to 13 rules."""
import copy
import itertools
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import server
from importlib.util import spec_from_file_location, module_from_spec
spec = spec_from_file_location('guided_export', Path(__file__).with_name('export-guided.py'))
exporter = module_from_spec(spec)
spec.loader.exec_module(exporter)
rules = exporter.scoped_rules()
K = 'finlife:202608:saving:0014674:01012000200000000003'
T = 'finlife:202608:saving:0017801:1001303001004'
base = dict(purpose='목돈 마련', goal='3600000', months='12', monthly='300000', reserve='yes', debt='no', hold='yes', adult='yes', mobile='yes', holdings='no', kbankBalance='', kakaoBalance='', tossBalance='', kbankCount='', tossHeld='', tossAccount='no', autoMonths='0', autoUnknown=False, renewed='no', tossSchedule='', tossTransfers='')


def boolean(value):
    return True if value == 'yes' else False if value == 'no' else None


def profile(a):
    p = dict(start_date=exporter.START, goal_date=server.month(date.fromisoformat(exporter.START), int(a['months'])).isoformat(), goal_amount=int(a['goal']), cash=0, reserve=0, reserve_confirmed=True, holdings_complete=True, monthly=int(a['monthly']), income_pattern='steady', fund_type='personal', withdrawal_need='none', sectors=['bank'], channels=['mobile'], protected_only=True, bank_balances_complete=True, held_product_ids=[T] if a['holdings']=='yes' and a['tossHeld']=='yes' else [])
    p['bank_balances'] = {r['bank_id']: 0 if a['holdings']=='no' else int(a['kbankBalance'] if '케이' in r['institution'] else a['kakaoBalance'] if '카카오' in r['institution'] else a['tossBalance']) for r in rules}
    p['facts'] = {'age': 19, 'nationality': 'KR', 'residency': 'KR', 'held_count.'+K: 0 if a['holdings']=='no' else int(a['kbankCount']), 'toss_account': boolean(a['tossAccount']), 'kakao.auto_months': None if a['autoUnknown'] else int(a['autoMonths']), 'kakao.renewed_principal': boolean(a['renewed']), 'contract.hold_to_maturity': boolean(a['hold']), 'toss.original_monthly_schedule': boolean(a['tossSchedule']), 'toss.all_transfers': boolean(a['tossTransfers'])}
    return p


cases = []
variations = [
    {}, {'autoMonths':'6'}, {'autoMonths':'6','renewed':'yes'}, {'autoUnknown':True},
    {'renewed':'unknown','autoMonths':'6'}, {'tossAccount':'unknown','tossSchedule':'unknown','tossTransfers':'unknown'},
    {'tossAccount':'yes','tossSchedule':'yes','tossTransfers':'yes'},
    {'tossAccount':'yes','tossSchedule':'yes','tossTransfers':'unknown'},
]
for monthly, months, variation in itertools.product(exporter.MONTHLY, [6,12,24,36,60], variations):
    a = {**base, 'monthly':str(monthly),'months':str(months),'goal':str(monthly*months),**variation}
    cases.append(a)
for variation in [
    {'kbankCount':'15'}, {'kbankBalance':'100000000'}, {'tossHeld':'yes','tossAccount':'yes','tossSchedule':'yes','tossTransfers':'yes'},
    {'kbankBalance':'100000000','kakaoBalance':'100000000','tossBalance':'100000000'},
    {'goal':'10000000'},
]:
    cases.append({**base,'holdings':'yes','kbankBalance':'0','kakaoBalance':'0','tossBalance':'0','kbankCount':'0','tossHeld':'no',**variation})
out = []
for a in cases:
    result = server.recommend(profile(a), rules)
    out.append({'answers':a,'expected':{'status':result['status'],'provisional':result.get('provisional',False),'cards':[{'option_id':c['products'][0]['option_id'],'rate':c['products'][0]['rate'],'net_interest':c['products'][0]['net_interest'],'goal_total':c['goal_total'],'shortfall':c['shortfall']} for c in result.get('cards',[])]}})
exporter.write(ROOT/'tests/fixtures/guided-parity.json',out)
print(f'Exported {len(out)} original-engine guided reference cases.')
