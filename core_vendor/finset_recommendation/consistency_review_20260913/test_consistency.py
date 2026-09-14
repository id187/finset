import sys,copy,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import engine,questions
from explanations import explain_cards
class Consistency(unittest.TestCase):
 def test_new_factual_question_invalidates_all_card_explanations(self):
  for status in ('COMPARISON','ADJUST_GOAL'):
   with self.subTest(status=status):
    before=dict(status=status,provisional=False,budget={'monthly':300000},cards=[{'goal_total':3600000,'goal_notice':'계산 가정에 따른 결과'}],questions=[],remaining_questions=[])
    if status=='ADJUST_GOAL':before['goal_guidance']={'provisional':False,'title':'목표 부족'}
    explain_cards(before)
    unresolved=dict(status='NEEDS_ANSWERS',provisional=True,cards=[],questions=['some_required_fact'],remaining_questions=[])
    with patch.object(engine,'_recommend_with_schedule',side_effect=[copy.deepcopy(before),unresolved]):z=engine.recommend({},[])
    self.assertTrue(z['provisional'])
    self.assertTrue(z['cards'][0]['comparison_explanation']['provisional'])
    self.assertIn('달라질 수',z['cards'][0]['comparison_explanation']['summary'])
    self.assertEqual(z['cards'][0]['goal_total'],3600000)
if __name__=='__main__':unittest.main()
