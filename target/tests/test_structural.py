from dpaa.parser import MarkdownParser
from dpaa.layers.structural import StructuralLayer
from pathlib import Path

FIXTURES = Path("tests/fixtures")


def test_detects_placeholder():
    text = (FIXTURES / "bad_plan.md").read_text(encoding="utf-8")
    doc = MarkdownParser().parse(text)
    result = StructuralLayer().analyze(doc)
    rules = {f.rule for f in result.findings}
    assert "placeholder_found" in rules


def test_good_plan_no_structural_findings():
    text = (FIXTURES / "good_plan.md").read_text(encoding="utf-8")
    doc = MarkdownParser().parse(text)
    result = StructuralLayer().analyze(doc)
    assert result.score == 0
