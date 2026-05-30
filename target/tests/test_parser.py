from dpaa.parser.markdown_parser import MarkdownParser
from pathlib import Path

FIXTURES = Path("tests/fixtures")


def test_parse_sections_extracts_all_headers():
    text = (FIXTURES / "bad_plan.md").read_text(encoding="utf-8")
    parser = MarkdownParser()
    doc = parser.parse(text)
    assert "Goal" in doc.sections
    assert "Steps" in doc.sections
    assert "Rollback" in doc.sections


def test_parse_sections_captures_content():
    text = (FIXTURES / "bad_plan.md").read_text(encoding="utf-8")
    parser = MarkdownParser()
    doc = parser.parse(text)
    assert "Improve orchestration reliability" in doc.sections["Goal"].content
