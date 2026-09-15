import copy,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import core_runtime as core

def execute_original(request):
 return core.execute(request, original_policy=True)


class AvailableBudget(unittest.TestCase):
 def base(self):
  return dict(start_date='2026-09-14',goal_date='2027-09-14',goal_amount=3600000,budget_basis='available_after_expenses',available_now=0,available_amounts_confirmed=True,monthly=300000,income_pattern='steady',fund_type='personal',sectors=['bank'],channels=['mobile','web'],withdrawal_need='none',high_interest_debt=False,holdings_complete=True,bank_balances_complete=True,held_product_ids=[],bank_balances={},facts={'age':25,'nationality':'KR','residency':'KR','kakao.renewed_principal':False})
 def test_available_and_gross_produce_identical_core_result(self):
  for cash,monthly in [(5000000,0),(0,300000),(1500000,300000)]:
   p=self.base();p.update(available_now=cash,monthly=monthly)
   expected=core.runtime()[0].recommend(core.normalize_budget(p),core.runtime()[4])
   before=copy.deepcopy(p);actual=execute_original({'profile':p})
   self.assertEqual(p,before);self.assertEqual(actual['result'],expected);self.assertEqual(actual['result']['budget']['deposit'],cash)
   self.assertEqual(actual['profile']['reserve'],0)
 def test_mixed_basis_and_missing_confirmation_rejected(self):
  for patch in [{'cash':3000000},{'reserve':0},{'planned_spending':[]},{'available_amounts_confirmed':False},{'available_now':True}]:
   p=self.base();p.update(patch)
   with self.assertRaises(ValueError):execute_original({'profile':p})
 def test_18_and_60_months_variable_and_bank_scope(self):
  for date in ['2028-03-14','2031-09-14']:
   p=self.base();p.update(goal_date=date,income_pattern='variable',low_month_capacity=200000)
   z=execute_original({'profile':p})['result'];self.assertEqual(z['budget']['monthly'],200000);self.assertLessEqual(len(z['cards']),3)
   for card in z['cards']:
    self.assertEqual(card['shortfall'],max(0,p['goal_amount']-card['goal_total']))
    for product in card['products']:self.assertLessEqual(product['maturity'],date)
if __name__=='__main__':unittest.main()
