import copy,hashlib,json,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import core_runtime as core

def execute_original(request):
 return core.execute(request, original_policy=True)

class CoreTransport(unittest.TestCase):
 def test_delivered_fixtures_match_full_response(self):
  for i,c in enumerate(core.runtime()[5]):
   with self.subTest(case=c['name']):self.assertEqual(execute_original({'case_id':str(i)})['result'],c['expected'])
 def test_compare_is_not_consent_and_unknown_is_not_false(self):
  compare=execute_original({'case_id':'13','answers':{'contribution_preference':'compare'}})
  self.assertEqual(compare['result']['cards'],[]);self.assertTrue(compare['result']['contribution_choice']['show_comparison'])
  no=execute_original({'case_id':'0','answers':{'bonus_intent.kakao.auto_transfer':False}})
  unknown=execute_original({'case_id':'0','answers':{'bonus_intent.kakao.auto_transfer':None}})
  self.assertEqual(no['result']['cards'][0]['products'][0]['name'],'코드K 자유적금');self.assertTrue(unknown['result']['provisional'])
 def test_zero_and_unanswered_confirmation_are_preserved(self):
  response=execute_original({'profile':{'start_date':'2026-09-14','goal_date':'2031-09-14','monthly':0,'cash':0,'reserve':0,'goal_amount':100000000},'answers':{'reserve_confirmed':None}})
  self.assertEqual(response['profile']['monthly'],0);self.assertEqual(response['profile']['goal_date'],'2031-09-14');self.assertNotIn('reserve_confirmed',response['profile']);self.assertEqual(response['result']['status'],'NEEDS_INPUT')
 def test_unconfirmed_facts_and_intent_remain_separate(self):
  response=execute_original({'case_id':'0','answers':{'kakao.auto_months':0,'bonus_intent.kakao.auto_transfer':True}})
  self.assertFalse(any(p['rate']>p['base_rate'] for card in response['result']['cards'] for p in card['products'] if '카카오' in p['name']))
 def test_invalid_transport_values_are_rejected(self):
  for body in [[],{'case_id':'999'},{'case_id':'0','answers':{'bonus_intent.kakao.auto_transfer':'yes'}},{'profile':{'monthly':True}},{'answers':{'contribution_preference':True}}]:
   with self.subTest(body=body),self.assertRaises(ValueError):execute_original(body)
 def test_question_units_and_nested_liquid_questions(self):
  profile=core.runtime()[5][0]['profile']
  self.assertEqual(core.question_card('minor_children_count',profile)['unit'],'명')
  self.assertEqual(core.question_card('age',profile)['unit'],'세')
  response=execute_original({'case_id':'0','profile':{'goal_date':'2026-09-20','cash':4000000},'answers':{'age':None}})
  self.assertEqual(response['result']['status'],'LIQUID_ONLY');self.assertIn('age',[q['id'] for q in response['questions']])
 def test_source_hash_preserved(self):self.assertEqual(core.runtime()[1].sha(),'15597888b0965ef565783957abea501d38130c0585ba3c86cd6355d86b954ef7')
if __name__=='__main__':unittest.main()
