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


def test_parse_headerless_plan_keeps_body_as_document_section():
    doc = MarkdownParser().parse("TODO maybe later\n")

    assert "Document" in doc.sections
    assert doc.sections["Document"].content == "TODO maybe later"


def test_parse_duplicate_headings_preserves_all_sections():
    text = "# Plan\n\n## Steps\nTODO first\n\n## Steps\nsecond concrete\n"
    doc = MarkdownParser().parse(text)

    assert "Steps" in doc.sections
    assert "Steps#2" in doc.sections
    assert "TODO first" in doc.sections["Steps"].content
    assert "second concrete" in doc.sections["Steps#2"].content
