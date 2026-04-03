"""parse_review_response ve JSON ayrıştırma: model sonrası metin / Extra data senaryoları."""

import json
import unittest

from services.llm_review import (
    _loads_llm_json_first,
    _merge_two_part_single_rule,
    _numbered_sql,
    _split_sql_into_two_parts,
    parse_review_response,
)
from services.rules_store import RuleBundle, RuleLine


def _bundle_kural01() -> RuleBundle:
    return RuleBundle(
        critical=[
            RuleLine(
                id="Kural01",
                text="Örnek kural metni.",
            )
        ],
        normal=[],
    )


class TestLoadsJsonFirst(unittest.TestCase):
    def test_object_with_trailing_prose(self) -> None:
        raw = '{"violations": []}\n\nAçıklama: ihlal yok.'
        data = _loads_llm_json_first(raw)
        self.assertEqual(data, {"violations": []})

    def test_array_with_trailing(self) -> None:
        raw = '[]\nextra'
        data = _loads_llm_json_first(raw)
        self.assertEqual(data, [])

    def test_prefix_before_json(self) -> None:
        raw = 'Tamam, işte sonuç: {"violations": []}'
        data = _loads_llm_json_first(raw)
        self.assertEqual(data, {"violations": []})


class TestParseReviewResponse(unittest.TestCase):
    def test_violations_empty_plus_extra_text_yields_pass(self) -> None:
        b = _bundle_kural01()
        raw = '{"violations": []}\n\nNot: SQL uygun görünüyor.'
        checks, violations, warn = parse_review_response(raw, b, source_sql="SELECT 1")
        self.assertEqual(len(checks), 1)
        self.assertEqual(checks[0].rule_id, "Kural01")
        self.assertEqual(checks[0].status, "PASS")
        self.assertEqual(len(violations), 0)
        self.assertIsNone(warn)

    def test_violations_string_json(self) -> None:
        b = _bundle_kural01()
        raw = json.dumps({"violations": "[]"})
        checks, violations, warn = parse_review_response(raw, b, source_sql="SELECT 1")
        self.assertEqual(checks[0].status, "PASS")
        self.assertIsNone(warn)

    def test_markdown_fence_then_extra(self) -> None:
        b = _bundle_kural01()
        raw = '```json\n{"violations": []}\n```\n\nEk not.'
        checks, violations, warn = parse_review_response(raw, b, source_sql="SELECT 1")
        self.assertEqual(checks[0].status, "PASS")
        self.assertIsNone(warn)

    def test_root_array_rule_code_same_as_violations_object(self) -> None:
        """Model bazen kökte dizi döner; öğeler rule_code ile (rule_id değil)."""
        b = _bundle_kural01()
        raw = json.dumps(
            [
                {
                    "rule_code": "Kural01",
                    "object_name": "",
                    "snippet": "SELECT 1",
                    "reason": "örnek",
                }
            ]
        )
        checks, violations, warn = parse_review_response(raw, b, source_sql="SELECT 1")
        self.assertEqual(len(checks), 1)
        self.assertEqual(checks[0].rule_id, "Kural01")
        self.assertEqual(checks[0].status, "FAIL")
        self.assertEqual(len(violations), 1)
        self.assertIsNone(warn)

    def test_root_empty_array_is_all_pass(self) -> None:
        b = _bundle_kural01()
        checks, violations, warn = parse_review_response("[]", b, source_sql="SELECT 1")
        self.assertEqual(checks[0].status, "PASS")
        self.assertEqual(len(violations), 0)
        self.assertIsNone(warn)


class TestSqlTwoPartHelpers(unittest.TestCase):
    def test_numbered_sql_start_line(self) -> None:
        s = _numbered_sql("a\nb", start_line=5)
        self.assertIn("L005", s)
        self.assertIn("L006", s)

    def test_split_multiline_halves(self) -> None:
        sql = "L1\nL2\nL3\nL4"
        p1, p2, start_b = _split_sql_into_two_parts(sql)
        self.assertEqual(p1, "L1\nL2")
        self.assertEqual(p2, "L3\nL4")
        self.assertEqual(start_b, 3)

    def test_merge_two_parts_both_pass(self) -> None:
        b = _bundle_kural01()
        raw = '{"violations": []}'
        rc, viol, warn = _merge_two_part_single_rule(
            "Kural01",
            "critical",
            err_a=None,
            raw_a=raw,
            err_b=None,
            raw_b=raw,
            mini=b,
            source_sql="SELECT 1",
        )
        self.assertEqual(rc.status, "PASS")
        self.assertEqual(len(viol), 0)


if __name__ == "__main__":
    unittest.main()
