from __future__ import annotations
from pathlib import Path
import yaml

from dpaa.layers.base import LayerAnalyzer
from dpaa.models import Finding, LayerResult
from dpaa.parser import PlanDocument
from dpaa.suggestions import get_suggestion

_RULES_PATH = Path(__file__).parent.parent / "rules" / "structural.yaml"


def _load_rules() -> dict:
    return yaml.safe_load(_RULES_PATH.read_text(encoding="utf-8"))


class StructuralLayer(LayerAnalyzer):
    LAYER_NAME = "structural"

    def __init__(self, profile: str = "default") -> None:
        self._profile = profile

    def analyze(self, doc: PlanDocument) -> LayerResult:
        rules = _load_rules()
        findings: list[Finding] = []
        required = rules["required_sections"].get(self._profile, [])
        placeholders = rules["placeholder_terms"]
        rule_cfg = rules["rules"]

        for section_name in required:
            if section_name not in doc.sections:
                findings.append(Finding(
                    layer=self.LAYER_NAME,
                    rule="missing_required_section",
                    severity=rule_cfg["missing_required_section"]["severity"],
                    message=f"Required section '{section_name}' is missing.",
                    score=rule_cfg["missing_required_section"]["score"],
                    suggestion=get_suggestion("missing_required_section"),
                ))
            elif not doc.sections[section_name].content.strip():
                findings.append(Finding(
                    layer=self.LAYER_NAME,
                    rule="empty_section",
                    severity=rule_cfg["empty_section"]["severity"],
                    message=f"Section '{section_name}' is empty.",
                    score=rule_cfg["empty_section"]["score"],
                    suggestion=get_suggestion("empty_section"),
                ))

        for section in doc.sections.values():
            for line_no, line in enumerate(section.content.splitlines(), start=section.line_start + 1):
                upper = line.upper()
                for placeholder in placeholders:
                    if placeholder.upper() in upper:
                        findings.append(Finding(
                            layer=self.LAYER_NAME,
                            rule="placeholder_found",
                            severity=rule_cfg["placeholder_found"]["severity"],
                            line=line_no,
                            text=line.strip(),
                            message=f"Placeholder '{placeholder}' found.",
                            score=rule_cfg["placeholder_found"]["score"],
                            suggestion=get_suggestion("placeholder_found"),
                        ))
                        break

        return self._make_result(findings)
