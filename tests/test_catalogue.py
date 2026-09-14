import copy
import unittest

from catalogue_db import parse_bonus
from conditions import bonus


class CatalogueClauses(unittest.TestCase):
    def test_hana_full_clause_and_boundary(self):
        text = '하나은행 통장에서 계약기간의 1/2이상 월부금 자동이체실적 충족 시 연 0.50%'
        rule = {'term': 12, 'bonus': [], 'base_rate': 3., 'max_rate': 3.5, 'bonus_cap': .5}
        original = copy.deepcopy(rule)
        parsed = parse_bonus(text, rule)
        executable = {**rule, 'bonus': parsed[0]}
        facts = {'hana.account': True, 'hana.auto_months_before_maturity': 6, 'contract.hold_to_maturity': True}
        self.assertEqual(bonus(executable, facts)[0], .5)
        self.assertEqual(bonus(executable, {**facts, 'hana.auto_months_before_maturity': 5})[0], 0)
        self.assertEqual(bonus(executable, {**facts, 'hana.account': None})[0], 0)
        self.assertEqual(bonus(executable, {**facts, 'contract.hold_to_maturity': False})[0], 0)
        self.assertIsNone(parse_bonus(text + ' 단 신규고객만 적용', rule))
        self.assertEqual(rule, original)

    def test_absent_bonus_is_not_assumed_from_missing_or_changed_text(self):
        rule = {'term': 12, 'bonus': [], 'base_rate': 3., 'max_rate': 3.}
        self.assertEqual(parse_bonus('없음', rule)[0], [])
        self.assertIsNone(parse_bonus('', rule))
        self.assertIsNone(parse_bonus('없음. 단 카드 실적 충족 시 추가 금리', rule))
        self.assertIsNone(parse_bonus('없음', {**rule, 'max_rate': 3.5}))


if __name__ == '__main__': unittest.main()
