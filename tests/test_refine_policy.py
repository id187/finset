import copy
import hashlib
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import core_runtime as core
import recommendation_policy as policy


class RefinePolicy(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine, cls.source, _, _, cls.rules, _, _ = core.runtime()
        cls.source_hash = cls.source.sha()
        cls.rules_hash = hashlib.sha256(json.dumps(cls.rules, sort_keys=True).encode()).hexdigest()

    def profile(self, **patch):
        p = dict(start_date='2026-09-15', goal_date='2027-09-15', goal_amount=3600000,
                 cash=0, reserve=0, monthly=300000, income_pattern='steady', fund_type='personal',
                 sectors=['bank'], channels=['mobile','web'], withdrawal_need='none',
                 high_interest_debt=False, reserve_confirmed=True, holdings_complete=True,
                 bank_balances_complete=True, held_product_ids=[], bank_balances={},
                 contribution_preference='fixed_ok', facts={'age':25,'nationality':'KR','residency':'KR','kakao.renewed_principal':False},
                 bonus_intents={'auto_transfer':False,'extra_transactions':False})
        p.update(patch)
        return p

    def execute(self, auto=False, **patch):
        p = self.profile(**patch)
        intents = p.pop('bonus_intents')
        return core.execute({'profile':{k:v for k,v in p.items() if k in core.TOP | core.STRUCTURED},
                             'answers':{**{'bonus_intent.'+k:v for k,v in intents.items()}, 'bonus_intent.auto_transfer':auto,
                                        'contribution_preference':p['contribution_preference']}})

    def test_declined_and_unknown_finish_with_exact_base_rate_result(self):
        for auto in (False, None):
            r = self.execute(auto)
            self.assertEqual(r['questions'], [])
            self.assertEqual(r['result']['status'], 'COMPARISON')
            self.assertFalse(r['result']['provisional'])
            self.assertEqual(r['result']['cards'][0]['products'][0]['name'], '코드K 자유적금')
            self.assertEqual(r['result']['cards'][0]['goal_total'], 3661181)
            kakao = next(c['products'][0] for c in r['result']['cards'] if '카카오' in c['products'][0]['name'])
            self.assertEqual(kakao['rate'], kakao['base_rate'])
            self.assertEqual(kakao['bonus_states'][0]['status'], 'declined' if auto is False else 'unknown')

    def test_auto_yes_changes_only_verified_bonus_and_does_not_repeat_questions(self):
        r = self.execute(True)
        self.assertEqual(r['questions'], [])
        self.assertEqual(r['result']['cards'][0]['products'][0]['name'], '카카오뱅크 자유적금')
        self.assertEqual(r['result']['cards'][0]['goal_total'], 3663514)
        self.assertEqual(r['result']['cards'][0]['products'][0]['bonus_earned'], ['auto_transfer'])

    def test_optional_transaction_refusal_ends_the_branch(self):
        p=self.profile(bonus_intents={'auto_transfer':False,'extra_transactions':True,'kbank.transfer':False})
        r=next(r for r in self.rules if r['name']=='주거래우대 자유적금')
        response=self.execute(benefit_action=r['product_id']+'|transfer',bonus_intents=p['bonus_intents'])
        self.assertEqual(response['questions'],[])
        self.assertTrue(response['result']['cards'])

    def test_contract_months_and_source_account_are_distinct(self):
        p = self.profile(goal_date='2031-09-15', bonus_intents={'auto_transfer':True})
        z = policy.prepare(p, self.rules, self.engine)
        for r in z['rules']:
            facts = z['profile']['option_facts'][str(r['option_id'])]
            self.assertEqual(facts['kakao.auto_months'], r['term'])
            self.assertNotIn('hana.account', facts)
            self.assertNotIn('toss.all_transfers', facts)
        self.assertNotIn('kakao.auto_months', p['facts'])

    def test_no_holdings_derived_limits_include_the_new_payment(self):
        z = policy.prepare(self.profile(monthly=370000), self.rules, self.engine)
        for r in z['rules']:
            values = z['profile']['option_facts'][str(r['option_id'])]
            for key, value in values.items():
                if key.startswith('combined_monthly.'): self.assertEqual(value, 370000)
                if key.startswith('held_count.'): self.assertEqual(value, 0)
            self.assertNotIn('kn_no_saving_6m', values)

    def test_unknown_eligibility_excludes_candidate_not_known_results(self):
        r = self.execute()
        self.assertTrue(r['result']['cards'])
        self.assertTrue(any('토스' in c['name'] for c in r['result']['eligibility_pending']))
        self.assertFalse(any('토스' in p['name'] for c in r['result']['cards'] for p in c['products']))
        self.assertEqual(r['questions'], [])

    def test_no_eligible_candidates_ask_eligibility_not_bonus(self):
        rules = [r for r in self.rules if r['name']=='토스뱅크 자유 적금']
        result = policy.recommend(self.profile(), rules, self.engine)
        self.assertEqual(result['status'], 'NEEDS_ELIGIBILITY')
        self.assertEqual(result['cards'], [])
        self.assertIn('toss_account', result['questions'])

    def test_passive_bonus_survives_rejection_without_inventing_cost(self):
        p = self.profile()
        p['facts']['kn_no_saving_6m'] = True
        z = policy.prepare(p, self.rules, self.engine)
        c = next(c for c in z['candidates'] if c['name']=='행복 DREAM 적금' and c['term']==12)
        self.assertIn('kn_no_saving_6m', c['bonus_earned'])
        self.assertNotIn('kn_auto_transfer', c['bonus_earned'])
        self.assertEqual(p['facts']['kn_no_saving_6m'], True)

    def test_card_bonus_excluded_even_when_all_old_inputs_say_yes(self):
        p = self.profile(bonus_intents={'auto_transfer':False,'kbank.card':True,'extra_transactions':True})
        p['facts'].update({'kbank.card_months':12,'kbank.card_200k':True})
        p['incremental_costs']={r['product_id']:0 for r in self.rules if r['name']=='주거래우대 자유적금'}
        z=policy.prepare(p,self.rules,self.engine)
        self.assertTrue(all('card' not in c['bonus_earned'] for c in z['candidates']))

    def test_existing_confirmed_transaction_is_not_a_new_transaction(self):
        p=self.profile(bonus_intents={'auto_transfer':False,'extra_transactions':False,'kbank.transfer':True})
        p['facts'].update({'existing_transaction.kbank.transfer':True,'kbank.route':'salary','kbank.transfer_months':6,
                           'kbank.salary_500k':True,'kbank.qualified_label':True,'kbank.not_own_transfer':True})
        p['incremental_costs']={r['product_id']:0 for r in self.rules if r['name']=='주거래우대 자유적금'}
        z=policy.prepare(p,self.rules,self.engine)
        c=next(c for c in z['candidates'] if c['name']=='주거래우대 자유적금' and c['term']==12)
        self.assertEqual(c['rate'],3.9)
        p['facts'].pop('existing_transaction.kbank.transfer')
        z=policy.prepare(p,self.rules,self.engine)
        c=next(c for c in z['candidates'] if c['name']=='주거래우대 자유적금' and c['term']==12)
        self.assertEqual(c['rate'],3.6)

    def test_salary_amount_sender_and_occupation_never_imply_bank_recognition(self):
        p=self.profile(bonus_intents={'auto_transfer':False,'extra_transactions':True,'kbank.transfer':True})
        p['facts'].update({'occupation':'프리랜서','kbank.route':'salary','kbank.transfer_whole_term':True,'salary.monthly_amount':490000,'salary.sender':'self'})
        z=policy.prepare(p,self.rules,self.engine)
        c=next(c for c in z['candidates'] if c['name']=='주거래우대 자유적금' and c['term']==12)
        self.assertEqual(c['rate'],c['base_rate'])
        self.assertNotIn('kbank.qualified_label',p['facts'])

    def test_unconfirmed_cost_is_not_zero_or_an_eligibility_failure(self):
        p=self.profile(bonus_intents={'auto_transfer':True,'extra_transactions':False})
        z=policy.prepare(p,self.rules,self.engine)
        c=next(c for c in z['candidates'] if c['name']=='행복 DREAM 적금' and c['term']==12)
        self.assertTrue(c['eligibility_confirmed'])
        self.assertNotIn('kn_auto_transfer',c['bonus_earned'])
        record=next(b for b in z['states'][c['option_id']] if b['id']=='kn_auto_transfer')
        self.assertEqual(record['status'],'unknown');self.assertIn('비용',record['reason'])

    def test_zero_one_two_candidates_are_not_filled_with_unknowns(self):
        names=['코드K 자유적금','카카오뱅크 자유적금']
        for count in (0,1,2):
            rules=[r for r in self.rules if r['name'] in names[:count] and r['term']==12]
            result=policy.recommend(self.profile(),rules,self.engine)
            self.assertEqual(len(result['cards']),count)

    def test_unrealistic_five_year_goal_is_preserved(self):
        r=self.execute(goal_amount=100000000,goal_date='2031-09-15')
        g=r['result']['goal_guidance']
        self.assertEqual(r['profile']['goal_amount'],100000000)
        self.assertEqual(g['principal'],18000000)
        self.assertEqual(g['required_monthly_principal_only'],1666667)

    def test_source_and_original_rules_unchanged(self):
        self.assertEqual(self.source.sha(),self.source_hash)
        self.assertEqual(hashlib.sha256(json.dumps(self.rules,sort_keys=True).encode()).hexdigest(),self.rules_hash)


if __name__=='__main__': unittest.main()
