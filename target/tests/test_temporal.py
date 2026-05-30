from dpaa.parser import MarkdownParser
from dpaa.layers.temporal import TemporalLayer
from pathlib import Path

FIXTURES = Path("tests/fixtures")


def test_detects_vague_temporal():
    text = (FIXTURES / "bad_plan.md").read_text(encoding="utf-8")
    doc = MarkdownParser().parse(text)
    result = TemporalLayer().analyze(doc)
    rules = {f.rule for f in result.findings}
    assert "vague_temporal_without_interval" in rules or "periodic_without_interval" in rules


def test_good_plan_no_temporal_findings():
    text = (FIXTURES / "good_plan.md").read_text(encoding="utf-8")
    doc = MarkdownParser().parse(text)
    result = TemporalLayer().analyze(doc)
    assert result.score == 0
