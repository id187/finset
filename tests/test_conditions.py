import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import condition_db as db


class DerivedConditionsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.before = db.digest(db.source.DB)
        db.build()
        cls.products = db.catalog()['products']
        cls.kakao = next(p for p in cls.products if p['name'] == '카카오뱅크 자유적금' and p['term'] == 12)
        cls.toss = next(p for p in cls.products if p['name'] == '토스뱅크 자유 적금')

    def assess_kakao(self, months=6, renewed=False, maturity=True):
        return db.evaluate_answers(self.kakao['option_id'], {'kakao.auto_months':months,'kakao.renewed_principal':renewed,'contract.hold_to_maturity':maturity})

    def test_original_hash_unchanged(self):
        self.assertEqual(self.before, db.digest(db.source.DB))
        self.assertEqual(self.before, json.loads((db.DATA/'finset_recommendation/source_lock.json').read_text(encoding='utf-8'))['sha256'])

    def test_empty_answers_earn_no_bonus(self):
        r = db.evaluate_answers(self.kakao['option_id'], {})
        self.assertEqual(r['bonus_rate'], 0)
        self.assertEqual(r['components'][0]['state'], 'unknown')

    def test_exact_half_term_boundary(self):
        self.assertEqual(self.assess_kakao(months=5)['bonus_rate'], 0)
        self.assertAlmostEqual(self.assess_kakao(months=6)['bonus_rate'], .2)

    def test_renewed_principal_exclusion(self):
        self.assertEqual(self.assess_kakao(renewed=True)['bonus_rate'], 0)

    def test_maturity_required_from_source(self):
        self.assertEqual(self.assess_kakao(maturity=False)['bonus_rate'], 0)
        self.assertEqual(self.assess_kakao(maturity=None)['bonus_rate'], 0)

    def test_complete_answers_add_percentage_points(self):
        self.assertAlmostEqual(self.assess_kakao()['rate'], self.kakao['base_rate'] + .2)

    def test_invalid_numeric_answers_rejected(self):
        for value in (True, -1, 13, 6.5, '6'):
            with self.subTest(value=value), self.assertRaises(ValueError): self.assess_kakao(months=value)

    def test_unknown_keys_rejected(self):
        with self.assertRaises(ValueError): db.evaluate_answers(self.kakao['option_id'], {'not_a_question': True})

    def test_both_toss_clauses_required(self):
        key = self.toss['option_id']
        self.assertEqual(db.evaluate_answers(key, {'toss.all_transfers':True})['bonus_rate'], 0)
        self.assertAlmostEqual(db.evaluate_answers(key, {'toss.original_monthly_schedule':True,'toss.all_transfers':True})['bonus_rate'], .5)

    def test_modified_text_requires_review(self):
        text = self.kakao['source_text']
        self.assertIsNone(db.parse_source(text+' 단, 이벤트 대상 고객에 한함', 12))
        self.assertIsNone(db.parse_source('급여이체 또는 카드 실적 충족 시 우대',12))

    def test_decimal_rate_is_preserved(self):
        parsed=db.parse_source(self.kakao['source_text'],12)
        self.assertAlmostEqual(parsed['rate'], .2)

    def test_fragment_offsets_reconstruct_exact_source(self):
        text = self.kakao['source_text']
        for f in db.fragments(text): self.assertEqual(text[f['start']:f['end']],f['text'])

    def test_legacy_rule_cannot_be_auto_applied(self):
        with db.connect_derived() as c:
            option_id=c.execute("SELECT option_id FROM rule_options WHERE review_status='legacy_needs_source_review' LIMIT 1").fetchone()[0]
        with self.assertRaises(ValueError): db.evaluate_answers(option_id,{})

    def test_source_and_derived_are_query_only(self):
        for connector in (db.source.connect, db.connect_derived):
            with connector() as c:
                self.assertEqual(c.execute('PRAGMA query_only').fetchone()[0],1)
                self.assertEqual(c.execute('PRAGMA integrity_check').fetchone()[0],'ok')


if __name__ == '__main__': unittest.main()
