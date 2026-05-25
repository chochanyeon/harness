from dpaa.parser.markdown_parser import MarkdownParser
from dpaa.parser.yaml_block_parser import YamlBlockParser
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


def test_yaml_block_parser_extracts_steps():
    text = (FIXTURES / "structured_plan.md").read_text(encoding="utf-8")
    parser = MarkdownParser()
    doc = parser.parse(text)
    yaml_parser = YamlBlockParser()
    steps = yaml_parser.extract_steps(doc.sections["Steps"].content)
    assert len(steps) == 3
    assert steps[0]["id"] == "PLAN_REVIEW"
    assert "PLAN_APPROVED" in steps[0]["produces"]
