from dpaa.parser import MarkdownParser
from dpaa.layers.referential import ReferentialLayer
from pathlib import Path

FIXTURES = Path("tests/fixtures")


def test_detects_unresolved_pronoun():
    text = (FIXTURES / "bad_plan.md").read_text(encoding="utf-8")
    doc = MarkdownParser().parse(text)
    result = ReferentialLayer().analyze(doc)
    rules = {f.rule for f in result.findings}
    assert "unresolved_pronoun" in rules


def test_good_plan_no_referential_findings():
    text = (FIXTURES / "good_plan.md").read_text(encoding="utf-8")
    doc = MarkdownParser().parse(text)
    result = ReferentialLayer().analyze(doc)
    assert result.score == 0
