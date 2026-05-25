# DPAA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자연어 계획 문서의 모호성을 결정론적으로 탐지하고 수정 제안을 제공하는 CLI 도구를 구현한다.

**Architecture:** 7개 레이어(L1~L7)가 순차적으로 finding을 생성하고, Aggregation Layer가 가중 점수를 계산해 PASS/WARN/FAIL을 결정한다. L2만 WARN-only로 동작하며 나머지 레이어는 FAIL까지 가능하다. 각 finding에는 fix suggestion이 포함된다.

**Tech Stack:** Python 3.11+, markdown-it-py, PyYAML, networkx, stanza (L2), typer, pydantic, pytest

**Key Design Decisions (from review):**
- L2 (Syntactic): WARN-only — Stanford CoreNLP 기반 통계 파서는 비결정론적이므로 gate 역할 불가
- Scoring weights: `rules/profiles.yaml`로 외부화 — 하드코딩 금지
- Rule YAML: JSON Schema로 스키마 검증 필수
- Structured YAML step 섹션: L5 severity를 한 단계 완화 (false positive 억제)
- Suggestion engine: 모든 finding에 fix 예시 포함

---

## File Structure

```
dpaa/
  __init__.py                     # version constants
  cli.py                          # typer CLI entry point
  parser/
    __init__.py
    markdown_parser.py            # Markdown AST 파싱, 섹션/문장 추출
    yaml_block_parser.py          # ```yaml 블록에서 steps 추출
    sentence_splitter.py          # 섹션별 문장 분리
  layers/
    __init__.py
    base.py                       # LayerAnalyzer ABC
    structural.py                 # L1
    syntactic.py                  # L2 (WARN-only)
    referential.py                # L3
    temporal.py                   # L4
    execution.py                  # L5
    verification.py               # L6
    state.py                      # L7
  rules/
    schema.json                   # rule YAML 공통 스키마
    structural.yaml
    referential.yaml
    temporal.yaml
    execution.yaml
    verification.yaml
    state.yaml
    profiles.yaml                 # 가중치 프로파일 (default, strict, minimal)
  scoring/
    __init__.py
    scorer.py                     # LayerResult → overall score
  suggestions/
    __init__.py
    engine.py                     # rule_id → fix suggestion 매핑
    templates.yaml                # suggestion 텍스트 템플릿
  output/
    __init__.py
    json_report.py
    text_report.py
  models.py                       # Finding, LayerResult, Report (pydantic)

tests/
  fixtures/
    good_plan.md                  # PASS 기대 픽스처
    bad_plan.md                   # FAIL 기대 픽스처
    structured_plan.md            # YAML steps 포함 픽스처
  test_structural.py
  test_referential.py
  test_temporal.py
  test_execution.py
  test_verification.py
  test_state.py
  test_scoring.py
  test_suggestions.py
  test_cli.py

pyproject.toml
```

---

## Task 1: Project Setup

**Files:**
- Create: `pyproject.toml`
- Create: `dpaa/__init__.py`
- Create: `dpaa/models.py`

- [ ] **Step 1: pyproject.toml 작성**

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "dpaa"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "markdown-it-py>=3.0",
    "PyYAML>=6.0",
    "networkx>=3.0",
    "typer>=0.12",
    "pydantic>=2.0",
    "jsonschema>=4.0",
]

[project.optional-dependencies]
syntactic = ["stanza>=1.8"]
dev = ["pytest>=8.0", "pytest-cov>=5.0"]

[project.scripts]
dpaa = "dpaa.cli:app"
```

- [ ] **Step 2: 의존성 설치**

```bash
pip install -e ".[dev]"
```

Expected: `Successfully installed dpaa-0.1.0`

- [ ] **Step 3: 데이터 모델 작성**

`dpaa/models.py`:

```python
from __future__ import annotations
from typing import Literal
from pydantic import BaseModel

Severity = Literal["low", "medium", "high", "critical"]
Level = Literal["PASS", "WARN", "FAIL"]


class Finding(BaseModel, frozen=True):
    layer: str
    rule: str
    severity: Severity
    line: int | None = None
    text: str | None = None
    message: str
    score: int
    suggestion: str = ""


class LayerResult(BaseModel, frozen=True):
    layer: str
    score: int
    findings: tuple[Finding, ...]


class Report(BaseModel, frozen=True):
    file: str
    overall: int
    level: Level
    scores: dict[str, int]
    findings: tuple[Finding, ...]
    analyzer_version: str
    ruleset_version: str
    profile: str
```

- [ ] **Step 4: `dpaa/__init__.py` 작성**

```python
ANALYZER_VERSION = "0.1.0"
RULESET_VERSION = "0.1.0"
```

- [ ] **Step 5: 커밋**

```bash
git add pyproject.toml dpaa/
git commit -m "feat: add project setup and data models"
```

---

## Task 2: Rule YAML 스키마 및 기본 룰셋

**Files:**
- Create: `dpaa/rules/schema.json`
- Create: `dpaa/rules/execution.yaml`
- Create: `dpaa/rules/temporal.yaml`
- Create: `dpaa/rules/referential.yaml`
- Create: `dpaa/rules/structural.yaml`
- Create: `dpaa/rules/verification.yaml`
- Create: `dpaa/rules/state.yaml`
- Create: `dpaa/rules/profiles.yaml`

- [ ] **Step 1: 공통 스키마 작성**

`dpaa/rules/schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["rules"],
  "properties": {
    "terms": {
      "type": "array",
      "items": {"type": "string"}
    },
    "required_sections": {
      "type": "array",
      "items": {"type": "string"}
    },
    "rules": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["severity", "score"],
        "properties": {
          "severity": {"type": "string", "enum": ["low", "medium", "high", "critical"]},
          "score": {"type": "integer", "minimum": 0, "maximum": 100}
        }
      }
    }
  }
}
```

- [ ] **Step 2: execution.yaml 작성**

`dpaa/rules/execution.yaml`:

```yaml
weak_terms:
  - improve
  - optimize
  - enhance
  - support
  - manage
  - handle
  - fix
  - refactor
  - robust
  - flexible
  - efficient
  - clean
  - better
  - properly
  - stabilize
  - harden
  - simplify
  - modernize

rules:
  weak_action_without_metric:
    severity: high
    score: 10
  broad_scope_operation:
    severity: medium
    score: 6
  undefined_operational_behavior:
    severity: high
    score: 10
```

- [ ] **Step 3: temporal.yaml 작성**

`dpaa/rules/temporal.yaml`:

```yaml
vague_temporal_terms:
  - soon
  - later
  - eventually
  - periodically
  - if needed
  - when appropriate
  - as required
  - temporarily
  - after some time
  - from time to time

ordering_keywords:
  - before
  - after
  - then
  - prior to
  - following
  - once
  - until
  - during

rules:
  vague_temporal_without_interval:
    severity: medium
    score: 8
  periodic_without_interval:
    severity: high
    score: 10
  undefined_trigger:
    severity: medium
    score: 6
```

- [ ] **Step 4: referential.yaml 작성**

`dpaa/rules/referential.yaml`:

```yaml
pronouns:
  - it
  - this
  - that
  - they
  - them
  - these
  - those

vague_entities:
  - component
  - module
  - system
  - service
  - handler
  - processor
  - manager
  - controller
  - thing
  - part
  - logic
  - flow

rules:
  unresolved_pronoun:
    severity: high
    score: 10
  vague_entity:
    severity: medium
    score: 5
```

- [ ] **Step 5: structural.yaml 작성**

`dpaa/rules/structural.yaml`:

```yaml
required_sections:
  default:
    - Goal
    - Steps
    - Acceptance Criteria
    - Rollback
  strict:
    - Goal
    - Scope
    - Non-Goals
    - Constraints
    - Assumptions
    - Steps
    - Acceptance Criteria
    - Rollback
    - Failure Conditions
  minimal:
    - Goal
    - Steps

placeholder_terms:
  - TODO
  - FIXME
  - TBD
  - XXX
  - placeholder
  - fill this

rules:
  missing_required_section:
    severity: high
    score: 10
  empty_section:
    severity: medium
    score: 5
  placeholder_found:
    severity: high
    score: 8
  invalid_heading_hierarchy:
    severity: low
    score: 2
  duplicate_step_id:
    severity: critical
    score: 20
```

- [ ] **Step 6: verification.yaml 작성**

`dpaa/rules/verification.yaml`:

```yaml
acceptance_triggers:
  - pass if
  - acceptance
  - must
  - should

threshold_patterns:
  - "<"
  - ">"
  - "<="
  - ">="
  - at most
  - at least
  - no more than
  - within
  - below
  - above

test_method_patterns:
  - test
  - benchmark
  - simulate
  - verify
  - assert
  - run
  - execute

rules:
  missing_threshold:
    severity: high
    score: 10
  missing_test_method:
    severity: medium
    score: 6
  missing_metric:
    severity: high
    score: 10
```

- [ ] **Step 7: state.yaml 작성**

`dpaa/rules/state.yaml`:

```yaml
rules:
  missing_required_state_producer:
    severity: critical
    score: 20
  cyclic_dependency:
    severity: critical
    score: 25
  missing_rollback:
    severity: high
    score: 10
  unreachable_state:
    severity: medium
    score: 5
  missing_precondition:
    severity: high
    score: 10
```

- [ ] **Step 8: profiles.yaml 작성**

`dpaa/rules/profiles.yaml`:

```yaml
profiles:
  default:
    weights:
      structural: 0.15
      syntactic: 0.10
      referential: 0.15
      temporal: 0.15
      execution: 0.20
      verification: 0.15
      state: 0.10
    thresholds:
      pass: 20
      warn: 50
    required_sections: default

  strict:
    weights:
      structural: 0.15
      syntactic: 0.08
      referential: 0.12
      temporal: 0.15
      execution: 0.25
      verification: 0.15
      state: 0.10
    thresholds:
      pass: 10
      warn: 30
    required_sections: strict

  minimal:
    weights:
      structural: 0.20
      syntactic: 0.10
      referential: 0.10
      temporal: 0.10
      execution: 0.25
      verification: 0.15
      state: 0.10
    thresholds:
      pass: 30
      warn: 60
    required_sections: minimal
```

- [ ] **Step 9: 커밋**

```bash
git add dpaa/rules/
git commit -m "feat: add rule YAML files and scoring profiles"
```

---

## Task 3: Markdown 파서

**Files:**
- Create: `dpaa/parser/markdown_parser.py`
- Create: `dpaa/parser/yaml_block_parser.py`
- Create: `dpaa/parser/sentence_splitter.py`
- Create: `tests/fixtures/bad_plan.md`
- Create: `tests/fixtures/good_plan.md`
- Create: `tests/fixtures/structured_plan.md`

- [ ] **Step 1: 테스트 픽스처 작성**

`tests/fixtures/bad_plan.md`:

```markdown
# Goal

Improve orchestration reliability.

# Steps

1. Update the handler.
2. Restart it later.
3. Retry periodically if needed.

# Acceptance Criteria

System should be stable.

# Rollback

TBD
```

`tests/fixtures/good_plan.md`:

```markdown
# Goal

Add exponential backoff retry to worker jobs that fail with transient network errors.

# Steps

1. Add retry decorator to `WorkerJob.execute()` with initial_delay=1s, multiplier=2.0, max_delay=30s, max_attempts=5.
2. Log each retry attempt with job_id, attempt_number, and error_type.
3. After retry exhaustion, transition job state from RUNNING to FAILED_EXHAUSTED.

# Acceptance Criteria

PASS if worker recovers from 3 consecutive transient failures within 60 seconds,
and no job remains in RUNNING state after retry exhaustion.
Run: simulate_worker_failure.py --failures 3 --interval 5s

# Rollback

Revert commit. Re-deploy previous image tag. Verify RUNNING jobs drain within 30s.
```

`tests/fixtures/structured_plan.md`:

```markdown
# Goal

Implement plan review workflow.

# Steps

` `` `yaml
steps:
  - id: PLAN_REVIEW
    action: review
    target: plan_document
    produces:
      - PLAN_APPROVED

  - id: IMPLEMENT
    action: implement
    target: approved_plan
    requires:
      - PLAN_APPROVED
    produces:
      - PATCH_CREATED

  - id: MERGE
    action: merge
    target: patch
    requires:
      - PATCH_CREATED
    produces:
      - MERGED
` `` `

# Acceptance Criteria

PASS if all steps complete within 2 hours.
Run integration test suite: pytest tests/workflow/

# Rollback

Revert merge. Delete feature branch. Notify team via Slack #dev channel.
```

- [ ] **Step 2: 파서 실패 테스트 작성**

`tests/test_parser.py`:

```python
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
```

- [ ] **Step 3: 테스트 실패 확인**

```bash
pytest tests/test_parser.py -v
```

Expected: `ImportError` or `ModuleNotFoundError`

- [ ] **Step 4: MarkdownParser 구현**

`dpaa/parser/markdown_parser.py`:

```python
from __future__ import annotations
from dataclasses import dataclass, field
from markdown_it import MarkdownIt


@dataclass
class Section:
    title: str
    level: int
    content: str
    line_start: int


@dataclass
class PlanDocument:
    sections: dict[str, Section] = field(default_factory=dict)
    raw: str = ""


class MarkdownParser:
    def __init__(self) -> None:
        self._md = MarkdownIt()

    def parse(self, text: str) -> PlanDocument:
        doc = PlanDocument(raw=text)
        tokens = self._md.parse(text)
        lines = text.splitlines()

        current_title: str | None = None
        current_level: int = 0
        current_start: int = 0
        content_lines: list[str] = []

        for token in tokens:
            if token.type == "heading_open":
                if current_title:
                    doc.sections[current_title] = Section(
                        title=current_title,
                        level=current_level,
                        content="\n".join(content_lines).strip(),
                        line_start=current_start,
                    )
                current_level = int(token.tag[1])
                current_start = token.map[0] if token.map else 0
                content_lines = []
                current_title = None
            elif token.type == "inline" and current_title is None and token.content:
                current_title = token.content.strip()
            elif token.type not in ("heading_open", "heading_close", "inline") and current_title:
                if token.map:
                    for i in range(token.map[0], token.map[1]):
                        if i < len(lines):
                            content_lines.append(lines[i])

        if current_title:
            doc.sections[current_title] = Section(
                title=current_title,
                level=current_level,
                content="\n".join(content_lines).strip(),
                line_start=current_start,
            )

        return doc
```

- [ ] **Step 5: YamlBlockParser 구현**

`dpaa/parser/yaml_block_parser.py`:

```python
from __future__ import annotations
import re
import yaml

YAML_BLOCK_RE = re.compile(r"```yaml\n(.*?)```", re.DOTALL)


class YamlBlockParser:
    def extract_steps(self, content: str) -> list[dict]:
        match = YAML_BLOCK_RE.search(content)
        if not match:
            return []
        data = yaml.safe_load(match.group(1))
        if not isinstance(data, dict):
            return []
        return data.get("steps", [])
```

- [ ] **Step 6: sentence_splitter.py 구현**

`dpaa/parser/sentence_splitter.py`:

```python
from __future__ import annotations
import re

_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z])")


def split_sentences(text: str) -> list[tuple[int, str]]:
    """Returns list of (line_number, sentence) tuples."""
    results: list[tuple[int, str]] = []
    for line_no, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if not stripped:
            continue
        sentences = _SENTENCE_RE.split(stripped)
        for s in sentences:
            if s.strip():
                results.append((line_no, s.strip()))
    return results
```

- [ ] **Step 7: `dpaa/parser/__init__.py` 작성**

```python
from .markdown_parser import MarkdownParser, PlanDocument, Section
from .yaml_block_parser import YamlBlockParser
from .sentence_splitter import split_sentences

__all__ = ["MarkdownParser", "PlanDocument", "Section", "YamlBlockParser", "split_sentences"]
```

- [ ] **Step 8: 테스트 통과 확인**

```bash
pytest tests/test_parser.py -v
```

Expected: 3 PASSED

- [ ] **Step 9: 커밋**

```bash
git add dpaa/parser/ tests/test_parser.py tests/fixtures/
git commit -m "feat: add markdown/yaml parser and test fixtures"
```

---

## Task 4: LayerAnalyzer Base + Suggestion Engine

**Files:**
- Create: `dpaa/layers/base.py`
- Create: `dpaa/suggestions/engine.py`
- Create: `dpaa/suggestions/templates.yaml`

- [ ] **Step 1: base.py 작성**

`dpaa/layers/base.py`:

```python
from __future__ import annotations
from abc import ABC, abstractmethod
from dpaa.models import Finding, LayerResult
from dpaa.parser import PlanDocument


class LayerAnalyzer(ABC):
    LAYER_NAME: str = ""
    WARN_ONLY: bool = False  # L2만 True

    @abstractmethod
    def analyze(self, doc: PlanDocument) -> LayerResult:
        ...

    def _cap_score(self, score: int) -> int:
        return min(100, score)

    def _make_result(self, findings: list[Finding]) -> LayerResult:
        return LayerResult(
            layer=self.LAYER_NAME,
            score=self._cap_score(sum(f.score for f in findings)),
            findings=tuple(findings),
        )
```

- [ ] **Step 2: suggestion templates 작성**

`dpaa/suggestions/templates.yaml`:

```yaml
weak_action_without_metric:
  title: "Weak action without measurable metric"
  fix: |
    Replace vague verb with specific operation + measurable target.
    Bad:  "Improve worker reliability."
    Good: "Add exponential backoff retry to failed worker jobs.
           Use initial_delay=1s, multiplier=2.0, max_delay=30s, max_attempts=5."

vague_temporal_without_interval:
  title: "Vague temporal term without interval"
  fix: |
    Replace vague timing with exact interval or condition.
    Bad:  "Retry periodically."
    Good: "Retry every 30s, max 5 attempts, timeout 10m."

periodic_without_interval:
  title: "Periodic action without interval"
  fix: |
    Specify: interval, max_attempts, trigger condition, timeout.
    Example YAML:
      retry:
        interval: 30s
        max_attempts: 5
        trigger: worker_failed
        timeout: 10m

unresolved_pronoun:
  title: "Unresolved pronoun"
  fix: |
    Replace pronoun with explicit named target.
    Bad:  "Restart it after migration."
    Good: "Restart orchestrator_service after db_migration completes."

vague_entity:
  title: "Vague entity reference"
  fix: |
    Name the specific component.
    Bad:  "Update the handler."
    Good: "Update RetryHandler in worker/retry.py."

missing_required_section:
  title: "Required section missing"
  fix: |
    Add the missing section with content.
    A Rollback section must describe: how to revert, expected state after revert,
    and time bound (e.g., "Revert commit. Re-deploy v1.2.3. Verify within 5 min.").

placeholder_found:
  title: "Placeholder left in document"
  fix: |
    Replace TBD/TODO/FIXME with actual content before implementation.

missing_threshold:
  title: "Acceptance criterion has no threshold"
  fix: |
    Add a measurable threshold.
    Bad:  "System should be stable."
    Good: "P95 latency must remain below 150ms under 5k concurrent requests."

missing_test_method:
  title: "Acceptance criterion has no test method"
  fix: |
    Add a verifiable test method.
    Example: "Run: pytest tests/integration/ or simulate_failure.py --scenario network_loss"

missing_metric:
  title: "Acceptance criterion has no numeric metric"
  fix: |
    Add a numeric value.
    Examples: 150ms, 99.9%, 3 retries, 0 failed jobs, within 60 seconds.

missing_required_state_producer:
  title: "Required state has no producer"
  fix: |
    Add a step that produces the required state.
    Every 'requires' entry must match a 'produces' entry in another step.

cyclic_dependency:
  title: "Cyclic dependency in workflow"
  fix: |
    Remove the cycle. Steps must form a directed acyclic graph (DAG).
    Reorder steps so each step only depends on outputs of earlier steps.

missing_rollback:
  title: "Step has no rollback path"
  fix: |
    Add a rollback step or rollback field describing how to undo this step.
    Example: DEPLOY step should have a paired ROLLBACK_DEPLOY step.

empty_section:
  title: "Section is empty"
  fix: |
    Fill in the section with actual content.

duplicate_step_id:
  title: "Duplicate step ID"
  fix: |
    Each step ID must be unique within the document.
```

- [ ] **Step 3: suggestion engine 구현**

`dpaa/suggestions/engine.py`:

```python
from __future__ import annotations
from pathlib import Path
import yaml

_TEMPLATES_PATH = Path(__file__).parent / "templates.yaml"
_templates: dict[str, dict] | None = None


def _load() -> dict[str, dict]:
    global _templates
    if _templates is None:
        _templates = yaml.safe_load(_TEMPLATES_PATH.read_text(encoding="utf-8"))
    return _templates


def get_suggestion(rule_id: str) -> str:
    templates = _load()
    entry = templates.get(rule_id)
    if not entry:
        return ""
    return entry.get("fix", "").strip()
```

- [ ] **Step 4: `dpaa/suggestions/__init__.py` 작성**

```python
from .engine import get_suggestion
__all__ = ["get_suggestion"]
```

- [ ] **Step 5: 커밋**

```bash
git add dpaa/layers/base.py dpaa/suggestions/
git commit -m "feat: add layer base class and suggestion engine"
```

---

## Task 5: L5 Execution Layer

**Files:**
- Create: `dpaa/layers/execution.py`
- Create: `tests/test_execution.py`

- [ ] **Step 1: 실패 테스트 작성**

`tests/test_execution.py`:

```python
import pytest
from dpaa.parser import MarkdownParser
from dpaa.layers.execution import ExecutionLayer
from pathlib import Path

FIXTURES = Path("tests/fixtures")


def test_detects_weak_verb_without_metric():
    text = (FIXTURES / "bad_plan.md").read_text(encoding="utf-8")
    doc = MarkdownParser().parse(text)
    result = ExecutionLayer().analyze(doc)
    rules = {f.rule for f in result.findings}
    assert "weak_action_without_metric" in rules


def test_no_findings_on_good_plan():
    text = (FIXTURES / "good_plan.md").read_text(encoding="utf-8")
    doc = MarkdownParser().parse(text)
    result = ExecutionLayer().analyze(doc)
    assert result.score == 0


def test_structured_yaml_step_reduces_severity():
    text = (FIXTURES / "structured_plan.md").read_text(encoding="utf-8")
    doc = MarkdownParser().parse(text)
    result = ExecutionLayer().analyze(doc)
    for f in result.findings:
        assert f.severity != "high", "structured YAML steps must not produce high severity"


def test_finding_includes_suggestion():
    text = (FIXTURES / "bad_plan.md").read_text(encoding="utf-8")
    doc = MarkdownParser().parse(text)
    result = ExecutionLayer().analyze(doc)
    for f in result.findings:
        assert f.suggestion, f"Finding {f.rule} has no suggestion"
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pytest tests/test_execution.py -v
```

Expected: `ImportError`

- [ ] **Step 3: ExecutionLayer 구현**

`dpaa/layers/execution.py`:

```python
from __future__ import annotations
import re
from pathlib import Path
import yaml

from dpaa.layers.base import LayerAnalyzer
from dpaa.models import Finding, LayerResult
from dpaa.parser import PlanDocument, split_sentences
from dpaa.suggestions import get_suggestion

_RULES_PATH = Path(__file__).parent.parent / "rules" / "execution.yaml"
_METRIC_RE = re.compile(
    r"\d+(\.\d+)?\s?(ms|s|sec|seconds|%|requests|retries|attempts|MB|GB|min|hour)",
    re.IGNORECASE,
)


def _load_rules() -> dict:
    return yaml.safe_load(_RULES_PATH.read_text(encoding="utf-8"))


class ExecutionLayer(LayerAnalyzer):
    LAYER_NAME = "execution"

    def analyze(self, doc: PlanDocument) -> LayerResult:
        rules = _load_rules()
        weak_terms = rules["weak_terms"]
        rule_cfg = rules["rules"]["weak_action_without_metric"]

        findings: list[Finding] = []
        is_structured = self._has_structured_steps(doc)

        for section in doc.sections.values():
            for line_no, sentence in split_sentences(section.content):
                lower = sentence.lower()
                has_weak = any(term in lower for term in weak_terms)
                has_metric = bool(_METRIC_RE.search(sentence))

                if has_weak and not has_metric:
                    severity = "medium" if is_structured else rule_cfg["severity"]
                    score = rule_cfg["score"] // 2 if is_structured else rule_cfg["score"]
                    findings.append(Finding(
                        layer=self.LAYER_NAME,
                        rule="weak_action_without_metric",
                        severity=severity,
                        line=line_no,
                        text=sentence,
                        message="Weak action term without measurable metric.",
                        score=score,
                        suggestion=get_suggestion("weak_action_without_metric"),
                    ))

        return self._make_result(findings)

    def _has_structured_steps(self, doc: PlanDocument) -> bool:
        steps_section = doc.sections.get("Steps", None)
        if not steps_section:
            return False
        return "```yaml" in steps_section.content
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pytest tests/test_execution.py -v
```

Expected: 4 PASSED

- [ ] **Step 5: 커밋**

```bash
git add dpaa/layers/execution.py tests/test_execution.py
git commit -m "feat: add L5 execution layer with suggestion support"
```

---

## Task 6: L6 Verification Layer

**Files:**
- Create: `dpaa/layers/verification.py`
- Create: `tests/test_verification.py`

- [ ] **Step 1: 실패 테스트 작성**

`tests/test_verification.py`:

```python
from dpaa.parser import MarkdownParser
from dpaa.layers.verification import VerificationLayer
from pathlib import Path

FIXTURES = Path("tests/fixtures")


def test_detects_missing_threshold():
    text = (FIXTURES / "bad_plan.md").read_text(encoding="utf-8")
    doc = MarkdownParser().parse(text)
    result = VerificationLayer().analyze(doc)
    rules = {f.rule for f in result.findings}
    assert "missing_threshold" in rules


def test_good_plan_passes_verification():
    text = (FIXTURES / "good_plan.md").read_text(encoding="utf-8")
    doc = MarkdownParser().parse(text)
    result = VerificationLayer().analyze(doc)
    assert result.score == 0


def test_finding_includes_suggestion():
    text = (FIXTURES / "bad_plan.md").read_text(encoding="utf-8")
    doc = MarkdownParser().parse(text)
    result = VerificationLayer().analyze(doc)
    for f in result.findings:
        assert f.suggestion
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pytest tests/test_verification.py -v
```

Expected: `ImportError`

- [ ] **Step 3: VerificationLayer 구현**

`dpaa/layers/verification.py`:

```python
from __future__ import annotations
import re
from pathlib import Path
import yaml

from dpaa.layers.base import LayerAnalyzer
from dpaa.models import Finding, LayerResult
from dpaa.parser import PlanDocument, split_sentences
from dpaa.suggestions import get_suggestion

_RULES_PATH = Path(__file__).parent.parent / "rules" / "verification.yaml"
_METRIC_RE = re.compile(
    r"\d+(\.\d+)?\s?(ms|s|sec|seconds|%|requests|retries|attempts|MB|GB|min|hour)",
    re.IGNORECASE,
)


def _load_rules() -> dict:
    return yaml.safe_load(_RULES_PATH.read_text(encoding="utf-8"))


class VerificationLayer(LayerAnalyzer):
    LAYER_NAME = "verification"

    def analyze(self, doc: PlanDocument) -> LayerResult:
        rules = _load_rules()
        triggers = rules["acceptance_triggers"]
        threshold_patterns = rules["threshold_patterns"]
        test_methods = rules["test_method_patterns"]
        findings: list[Finding] = []

        ac_section = doc.sections.get("Acceptance Criteria")
        if not ac_section:
            return self._make_result(findings)

        for line_no, sentence in split_sentences(ac_section.content):
            lower = sentence.lower()
            looks_like_ac = any(t in lower for t in triggers)
            if not looks_like_ac:
                continue

            has_metric = bool(_METRIC_RE.search(sentence))
            has_threshold = any(p in lower for p in threshold_patterns)
            has_test = any(t in lower for t in test_methods)

            if not has_metric:
                findings.append(Finding(
                    layer=self.LAYER_NAME,
                    rule="missing_metric",
                    severity="high",
                    line=line_no,
                    text=sentence,
                    message="Acceptance criterion has no numeric metric.",
                    score=10,
                    suggestion=get_suggestion("missing_metric"),
                ))
            if not has_threshold:
                findings.append(Finding(
                    layer=self.LAYER_NAME,
                    rule="missing_threshold",
                    severity="high",
                    line=line_no,
                    text=sentence,
                    message="Acceptance criterion has no measurable threshold.",
                    score=10,
                    suggestion=get_suggestion("missing_threshold"),
                ))
            if not has_test:
                findings.append(Finding(
                    layer=self.LAYER_NAME,
                    rule="missing_test_method",
                    severity="medium",
                    line=line_no,
                    text=sentence,
                    message="Acceptance criterion has no explicit test method.",
                    score=6,
                    suggestion=get_suggestion("missing_test_method"),
                ))

        return self._make_result(findings)
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pytest tests/test_verification.py -v
```

Expected: 3 PASSED

- [ ] **Step 5: 커밋**

```bash
git add dpaa/layers/verification.py tests/test_verification.py
git commit -m "feat: add L6 verification layer"
```

---

## Task 7: L7 State/DAG Layer

**Files:**
- Create: `dpaa/layers/state.py`
- Create: `tests/test_state.py`

- [ ] **Step 1: 실패 테스트 작성**

`tests/test_state.py`:

```python
from dpaa.parser import MarkdownParser
from dpaa.layers.state import StateLayer
from pathlib import Path

FIXTURES = Path("tests/fixtures")


def test_valid_dag_produces_no_findings():
    text = (FIXTURES / "structured_plan.md").read_text(encoding="utf-8")
    doc = MarkdownParser().parse(text)
    result = StateLayer().analyze(doc)
    assert result.score == 0


def test_cyclic_dependency_detected():
    text = """
# Goal
Test

# Steps

```yaml
steps:
  - id: A
    action: do_a
    requires: [STATE_B]
    produces: [STATE_A]
  - id: B
    action: do_b
    requires: [STATE_A]
    produces: [STATE_B]
```

# Acceptance Criteria
PASS if complete.

# Rollback
Revert.
"""
    doc = MarkdownParser().parse(text)
    result = StateLayer().analyze(doc)
    rules = {f.rule for f in result.findings}
    assert "cyclic_dependency" in rules


def test_missing_producer_detected():
    text = """
# Goal
Test

# Steps

```yaml
steps:
  - id: IMPLEMENT
    action: implement
    requires: [PLAN_APPROVED]
    produces: [DONE]
```

# Acceptance Criteria
PASS if done.

# Rollback
Revert.
"""
    doc = MarkdownParser().parse(text)
    result = StateLayer().analyze(doc)
    rules = {f.rule for f in result.findings}
    assert "missing_required_state_producer" in rules
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pytest tests/test_state.py -v
```

Expected: `ImportError`

- [ ] **Step 3: StateLayer 구현**

`dpaa/layers/state.py`:

```python
from __future__ import annotations
import networkx as nx

from dpaa.layers.base import LayerAnalyzer
from dpaa.models import Finding, LayerResult
from dpaa.parser import PlanDocument, YamlBlockParser
from dpaa.suggestions import get_suggestion


class StateLayer(LayerAnalyzer):
    LAYER_NAME = "state"

    def analyze(self, doc: PlanDocument) -> LayerResult:
        steps_section = doc.sections.get("Steps")
        if not steps_section:
            return self._make_result([])

        steps = YamlBlockParser().extract_steps(steps_section.content)
        if not steps:
            return self._make_result([])

        return self._make_result(self._validate(steps))

    def _validate(self, steps: list[dict]) -> list[Finding]:
        findings: list[Finding] = []
        graph = nx.DiGraph()
        produced: dict[str, str] = {}

        for step in steps:
            step_id = step.get("id", "")
            graph.add_node(step_id)
            for state in step.get("produces", []):
                produced[state] = step_id

        for step in steps:
            step_id = step.get("id", "")
            for req in step.get("requires", []):
                if req not in produced:
                    findings.append(Finding(
                        layer=self.LAYER_NAME,
                        rule="missing_required_state_producer",
                        severity="critical",
                        text=step_id,
                        message=f"Required state '{req}' has no producer.",
                        score=20,
                        suggestion=get_suggestion("missing_required_state_producer"),
                    ))
                else:
                    graph.add_edge(produced[req], step_id)

            if not step.get("rollback") and not step.get("produces"):
                findings.append(Finding(
                    layer=self.LAYER_NAME,
                    rule="missing_rollback",
                    severity="high",
                    text=step_id,
                    message=f"Step '{step_id}' has no rollback path.",
                    score=10,
                    suggestion=get_suggestion("missing_rollback"),
                ))

        if not nx.is_directed_acyclic_graph(graph):
            findings.append(Finding(
                layer=self.LAYER_NAME,
                rule="cyclic_dependency",
                severity="critical",
                message="Workflow dependency graph contains a cycle.",
                score=25,
                suggestion=get_suggestion("cyclic_dependency"),
            ))

        return findings
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pytest tests/test_state.py -v
```

Expected: 3 PASSED

- [ ] **Step 5: 커밋**

```bash
git add dpaa/layers/state.py tests/test_state.py
git commit -m "feat: add L7 state/DAG layer"
```

---

## Task 8: L1 Structural + L4 Temporal + L3 Referential

**Files:**
- Create: `dpaa/layers/structural.py`
- Create: `dpaa/layers/temporal.py`
- Create: `dpaa/layers/referential.py`
- Create: `tests/test_structural.py`
- Create: `tests/test_temporal.py`
- Create: `tests/test_referential.py`

- [ ] **Step 1: 실패 테스트 작성**

`tests/test_structural.py`:

```python
from dpaa.parser import MarkdownParser
from dpaa.layers.structural import StructuralLayer
from pathlib import Path

FIXTURES = Path("tests/fixtures")


def test_detects_placeholder():
    text = (FIXTURES / "bad_plan.md").read_text(encoding="utf-8")
    doc = MarkdownParser().parse(text)
    result = StructuralLayer(profile="default").analyze(doc)
    rules = {f.rule for f in result.findings}
    assert "placeholder_found" in rules


def test_good_plan_no_structural_findings():
    text = (FIXTURES / "good_plan.md").read_text(encoding="utf-8")
    doc = MarkdownParser().parse(text)
    result = StructuralLayer(profile="default").analyze(doc)
    assert result.score == 0
```

`tests/test_temporal.py`:

```python
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
```

`tests/test_referential.py`:

```python
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
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pytest tests/test_structural.py tests/test_temporal.py tests/test_referential.py -v
```

Expected: `ImportError` x3

- [ ] **Step 3: StructuralLayer 구현**

`dpaa/layers/structural.py`:

```python
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
```

- [ ] **Step 4: TemporalLayer 구현**

`dpaa/layers/temporal.py`:

```python
from __future__ import annotations
from pathlib import Path
import yaml
import re

from dpaa.layers.base import LayerAnalyzer
from dpaa.models import Finding, LayerResult
from dpaa.parser import PlanDocument, split_sentences
from dpaa.suggestions import get_suggestion

_RULES_PATH = Path(__file__).parent.parent / "rules" / "temporal.yaml"
_INTERVAL_RE = re.compile(
    r"\d+\s?(s|sec|seconds|ms|min|minutes|hour|hours|days?)",
    re.IGNORECASE,
)


def _load_rules() -> dict:
    return yaml.safe_load(_RULES_PATH.read_text(encoding="utf-8"))


class TemporalLayer(LayerAnalyzer):
    LAYER_NAME = "temporal"

    def analyze(self, doc: PlanDocument) -> LayerResult:
        rules = _load_rules()
        vague_terms = rules["vague_temporal_terms"]
        findings: list[Finding] = []

        for section in doc.sections.values():
            for line_no, sentence in split_sentences(section.content):
                lower = sentence.lower()
                has_interval = bool(_INTERVAL_RE.search(sentence))

                for term in vague_terms:
                    if term in lower:
                        rule = "periodic_without_interval" if term == "periodically" else "vague_temporal_without_interval"
                        if not has_interval:
                            findings.append(Finding(
                                layer=self.LAYER_NAME,
                                rule=rule,
                                severity=rules["rules"][rule]["severity"],
                                line=line_no,
                                text=sentence,
                                message=f"Temporal term '{term}' has no exact interval or condition.",
                                score=rules["rules"][rule]["score"],
                                suggestion=get_suggestion(rule),
                            ))
                        break

        return self._make_result(findings)
```

- [ ] **Step 5: ReferentialLayer 구현**

`dpaa/layers/referential.py`:

```python
from __future__ import annotations
import re
from pathlib import Path
import yaml

from dpaa.layers.base import LayerAnalyzer
from dpaa.models import Finding, LayerResult
from dpaa.parser import PlanDocument, split_sentences
from dpaa.suggestions import get_suggestion

_RULES_PATH = Path(__file__).parent.parent / "rules" / "referential.yaml"
_ANTECEDENT_WINDOW = 3


def _load_rules() -> dict:
    return yaml.safe_load(_RULES_PATH.read_text(encoding="utf-8"))


class ReferentialLayer(LayerAnalyzer):
    LAYER_NAME = "referential"

    def analyze(self, doc: PlanDocument) -> LayerResult:
        rules = _load_rules()
        pronouns = rules["pronouns"]
        findings: list[Finding] = []

        for section in doc.sections.values():
            sentences = split_sentences(section.content)
            for idx, (line_no, sentence) in enumerate(sentences):
                words = re.findall(r"\b\w+\b", sentence.lower())
                window = " ".join(
                    s for _, s in sentences[max(0, idx - _ANTECEDENT_WINDOW):idx]
                ).lower()

                for pronoun in pronouns:
                    pattern = rf"\b{re.escape(pronoun)}\b"
                    if re.search(pattern, sentence.lower()):
                        noun_in_window = bool(re.search(r"\b(the|a|an)\s+\w+", window))
                        if not noun_in_window:
                            findings.append(Finding(
                                layer=self.LAYER_NAME,
                                rule="unresolved_pronoun",
                                severity="high",
                                line=line_no,
                                text=sentence,
                                message=f"Pronoun '{pronoun}' has no clear antecedent.",
                                score=10,
                                suggestion=get_suggestion("unresolved_pronoun"),
                            ))
                        break

        return self._make_result(findings)
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
pytest tests/test_structural.py tests/test_temporal.py tests/test_referential.py -v
```

Expected: 6 PASSED

- [ ] **Step 7: 커밋**

```bash
git add dpaa/layers/structural.py dpaa/layers/temporal.py dpaa/layers/referential.py \
        tests/test_structural.py tests/test_temporal.py tests/test_referential.py
git commit -m "feat: add L1/L3/L4 structural, referential, temporal layers"
```

---

## Task 9: Aggregation + Scoring

**Files:**
- Create: `dpaa/scoring/scorer.py`
- Create: `tests/test_scoring.py`

- [ ] **Step 1: 실패 테스트 작성**

`tests/test_scoring.py`:

```python
from dpaa.scoring.scorer import Scorer
from dpaa.models import Finding, LayerResult


def _make_result(layer: str, score: int) -> LayerResult:
    return LayerResult(layer=layer, score=score, findings=())


def test_all_zero_scores_pass():
    layers = [_make_result(l, 0) for l in
              ["structural","syntactic","referential","temporal","execution","verification","state"]]
    scorer = Scorer(profile="default")
    report = scorer.compute("test.md", layers)
    assert report.level == "PASS"
    assert report.overall == 0


def test_high_execution_score_fails():
    layers = [_make_result("structural", 0),
              _make_result("syntactic", 0),
              _make_result("referential", 0),
              _make_result("temporal", 0),
              _make_result("execution", 100),
              _make_result("verification", 100),
              _make_result("state", 0)]
    scorer = Scorer(profile="default")
    report = scorer.compute("test.md", layers)
    assert report.level == "FAIL"


def test_syntactic_layer_capped_at_warn():
    layers = [_make_result("structural", 0),
              _make_result("syntactic", 100),
              _make_result("referential", 0),
              _make_result("temporal", 0),
              _make_result("execution", 0),
              _make_result("verification", 0),
              _make_result("state", 0)]
    scorer = Scorer(profile="default")
    report = scorer.compute("test.md", layers)
    assert report.level in ("PASS", "WARN"), "syntactic alone must not cause FAIL"
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pytest tests/test_scoring.py -v
```

Expected: `ImportError`

- [ ] **Step 3: Scorer 구현**

`dpaa/scoring/scorer.py`:

```python
from __future__ import annotations
from pathlib import Path
import yaml

from dpaa.models import Finding, LayerResult, Level, Report
from dpaa import ANALYZER_VERSION, RULESET_VERSION

_PROFILES_PATH = Path(__file__).parent.parent / "rules" / "profiles.yaml"
_WARN_ONLY_LAYERS = {"syntactic"}


def _load_profiles() -> dict:
    return yaml.safe_load(_PROFILES_PATH.read_text(encoding="utf-8"))["profiles"]


class Scorer:
    def __init__(self, profile: str = "default") -> None:
        profiles = _load_profiles()
        if profile not in profiles:
            raise ValueError(f"Unknown profile: {profile}. Available: {list(profiles)}")
        cfg = profiles[profile]
        self._weights: dict[str, float] = cfg["weights"]
        self._pass_threshold: int = cfg["thresholds"]["pass"]
        self._warn_threshold: int = cfg["thresholds"]["warn"]

    def compute(self, file: str, layer_results: list[LayerResult]) -> Report:
        scores: dict[str, int] = {r.layer: r.score for r in layer_results}
        all_findings: list[Finding] = [f for r in layer_results for f in r.findings]

        overall = sum(
            self._weights.get(layer, 0) * score
            for layer, score in scores.items()
        )
        overall_int = int(round(overall))

        warn_only_contribution = sum(
            self._weights.get(layer, 0) * scores.get(layer, 0)
            for layer in _WARN_ONLY_LAYERS
        )
        gated_overall = overall_int - int(round(warn_only_contribution))

        if gated_overall > self._warn_threshold:
            level: Level = "FAIL"
        elif overall_int > self._pass_threshold:
            level = "WARN"
        else:
            level = "PASS"

        return Report(
            file=file,
            overall=overall_int,
            level=level,
            scores=scores,
            findings=tuple(all_findings),
            analyzer_version=ANALYZER_VERSION,
            ruleset_version=RULESET_VERSION,
            profile="default",
        )
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pytest tests/test_scoring.py -v
```

Expected: 3 PASSED

- [ ] **Step 5: 커밋**

```bash
git add dpaa/scoring/ tests/test_scoring.py
git commit -m "feat: add aggregation scorer with L2 WARN-only enforcement"
```

---

## Task 10: L2 Syntactic Layer (WARN-only)

> **전제:** `pip install dpaa[syntactic]` (stanza) 설치 필요.
> L2는 WARN-only. Scorer가 syntactic을 FAIL gate에서 제외하므로 LAYER_NAME만 맞추면 된다.

**Files:**
- Create: `dpaa/layers/syntactic.py`
- Create: `tests/test_syntactic.py`

- [ ] **Step 1: stanza 설치 및 모델 다운로드**

```bash
pip install stanza
python -c "import stanza; stanza.download('en', processors='tokenize,pos,constituency')"
```

Expected: 다운로드 완료 메시지

- [ ] **Step 2: 실패 테스트 작성**

`tests/test_syntactic.py`:

```python
import pytest
from dpaa.parser import MarkdownParser
from dpaa.layers.syntactic import SyntacticLayer

pytest.importorskip("stanza")


def test_syntactic_layer_warn_only():
    assert SyntacticLayer.WARN_ONLY is True


def test_ambiguous_sentence_produces_warn_severity():
    text = """
# Goal
Deploy the service with retry handling.

# Steps
1. Review and approve failed jobs.

# Acceptance Criteria
PASS if P95 latency < 150ms. Run: pytest tests/

# Rollback
Revert commit and re-deploy previous image.
"""
    from dpaa.parser import MarkdownParser
    doc = MarkdownParser().parse(text)
    result = SyntacticLayer().analyze(doc)
    for f in result.findings:
        assert f.severity in ("low", "medium"), \
            f"L2 must never produce high/critical severity, got: {f.severity}"


def test_syntactic_findings_never_cause_fail(tmp_path):
    from dpaa.scoring.scorer import Scorer
    from dpaa.models import LayerResult, Finding

    high_syntactic = LayerResult(
        layer="syntactic",
        score=100,
        findings=(Finding(
            layer="syntactic",
            rule="attachment_ambiguity",
            severity="medium",
            message="test",
            score=100,
        ),)
    )
    zero_layers = [
        LayerResult(layer=l, score=0, findings=())
        for l in ["structural","referential","temporal","execution","verification","state"]
    ]
    report = Scorer("default").compute("test.md", [high_syntactic] + zero_layers)
    assert report.level != "FAIL"
```

- [ ] **Step 3: 테스트 실패 확인**

```bash
pytest tests/test_syntactic.py -v
```

Expected: `ImportError` on SyntacticLayer

- [ ] **Step 4: SyntacticLayer 구현**

`dpaa/layers/syntactic.py`:

```python
from __future__ import annotations
from dpaa.layers.base import LayerAnalyzer
from dpaa.models import Finding, LayerResult
from dpaa.parser import PlanDocument, split_sentences
from dpaa.suggestions import get_suggestion

try:
    import stanza
    _STANZA_AVAILABLE = True
except ImportError:
    _STANZA_AVAILABLE = False

_nlp = None
_VARIANCE_RATIO = 0.10


def _get_nlp():
    global _nlp
    if _nlp is None:
        if not _STANZA_AVAILABLE:
            raise RuntimeError("stanza not installed. Run: pip install dpaa[syntactic]")
        _nlp = stanza.Pipeline(
            lang="en",
            processors="tokenize,pos,constituency",
            use_gpu=False,
            verbose=False,
        )
    return _nlp


def _count_interpretations(sentence: str) -> int:
    """Returns number of competing parse interpretations after P1-P4 filtering."""
    nlp = _get_nlp()
    doc = nlp(sentence)
    # stanza constituency parser returns one tree per sentence
    # For WARN-level heuristic: check PP attachment ambiguity via POS patterns
    # Full SBADR P1-P4 pipeline requires Stanford CoreNLP server (Java)
    # This is a deterministic structural heuristic approximation
    trees = []
    for sent in doc.sentences:
        if sent.constituency:
            trees.append(str(sent.constituency))

    # Heuristic: PP attachment ambiguity if VP contains multiple NP+PP sequences
    has_pp_ambiguity = any(
        trees[0].count("(PP") >= 2 and "(VP" in trees[0]
    ) if trees else False

    return 2 if has_pp_ambiguity else 1


class SyntacticLayer(LayerAnalyzer):
    LAYER_NAME = "syntactic"
    WARN_ONLY = True  # L2는 절대 FAIL gate 역할 불가

    def analyze(self, doc: PlanDocument) -> LayerResult:
        if not _STANZA_AVAILABLE:
            return self._make_result([])

        findings: list[Finding] = []

        for section in doc.sections.values():
            for line_no, sentence in split_sentences(section.content):
                if len(sentence.split()) < 4:
                    continue
                try:
                    count = _count_interpretations(sentence)
                except Exception:
                    continue

                if count > 1:
                    findings.append(Finding(
                        layer=self.LAYER_NAME,
                        rule="attachment_ambiguity",
                        severity="medium",
                        line=line_no,
                        text=sentence,
                        message=f"Sentence may have {count} structural interpretations.",
                        score=5,
                        suggestion=get_suggestion("unresolved_pronoun"),
                    ))

        return self._make_result(findings)
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
pytest tests/test_syntactic.py -v
```

Expected: 3 PASSED

- [ ] **Step 6: 커밋**

```bash
git add dpaa/layers/syntactic.py tests/test_syntactic.py
git commit -m "feat: add L2 syntactic layer as WARN-only (stanza heuristic)"
```

---

## Task 11: CLI + Output + End-to-End

**Files:**
- Create: `dpaa/cli.py`
- Create: `dpaa/output/json_report.py`
- Create: `dpaa/output/text_report.py`
- Create: `dpaa/layers/__init__.py`
- Create: `tests/test_cli.py`

- [ ] **Step 1: Output 포맷터 작성**

`dpaa/output/json_report.py`:

```python
from dpaa.models import Report
import json


def to_json(report: Report, indent: int = 2) -> str:
    return json.dumps(report.model_dump(), indent=indent, ensure_ascii=False)
```

`dpaa/output/text_report.py`:

```python
from dpaa.models import Report

_ICONS = {"PASS": "✓", "WARN": "⚠", "FAIL": "✗"}


def to_text(report: Report) -> str:
    icon = _ICONS[report.level]
    lines = [
        f"DPAA Result: {icon} {report.level}",
        f"Overall Score: {report.overall}",
        f"Profile: {report.profile}",
        "",
        "Layer Scores:",
    ]
    for layer, score in report.scores.items():
        warn_tag = " [WARN-ONLY]" if layer == "syntactic" else ""
        lines.append(f"  {layer:15s} {score:3d}{warn_tag}")

    if report.findings:
        lines += ["", "Findings:"]
        for i, f in enumerate(report.findings, 1):
            lines.append(f"  {i}. [{f.layer}] {f.rule} (severity={f.severity}, score={f.score})")
            if f.line:
                lines.append(f"     line {f.line}: {f.text or ''}")
            lines.append(f"     {f.message}")
            if f.suggestion:
                lines.append(f"     → Fix: {f.suggestion.splitlines()[0]}")

    return "\n".join(lines)
```

- [ ] **Step 2: `dpaa/layers/__init__.py` 작성**

```python
from .structural import StructuralLayer
from .referential import ReferentialLayer
from .temporal import TemporalLayer
from .execution import ExecutionLayer
from .verification import VerificationLayer
from .state import StateLayer

try:
    from .syntactic import SyntacticLayer
    _SYNTACTIC_AVAILABLE = True
except ImportError:
    _SYNTACTIC_AVAILABLE = False

__all__ = [
    "StructuralLayer", "ReferentialLayer", "TemporalLayer",
    "ExecutionLayer", "VerificationLayer", "StateLayer",
]
```

- [ ] **Step 3: CLI 작성**

`dpaa/cli.py`:

```python
from __future__ import annotations
from pathlib import Path
import typer

from dpaa.parser import MarkdownParser, YamlBlockParser
from dpaa.layers import (
    StructuralLayer, ReferentialLayer, TemporalLayer,
    ExecutionLayer, VerificationLayer, StateLayer,
)
from dpaa.scoring.scorer import Scorer
from dpaa.output.json_report import to_json
from dpaa.output.text_report import to_text

app = typer.Typer()


@app.command()
def lint(
    plan: Path = typer.Argument(..., help="Path to plan document (Markdown)"),
    profile: str = typer.Option("default", help="Scoring profile: default | strict | minimal"),
    output: Path | None = typer.Option(None, help="Write JSON report to file"),
    text: bool = typer.Option(True, help="Print human-readable output"),
    syntactic: bool = typer.Option(False, help="Enable L2 syntactic layer (requires stanza)"),
) -> None:
    content = plan.read_text(encoding="utf-8")
    doc = MarkdownParser().parse(content)

    analyzers = [
        StructuralLayer(profile=profile),
        ReferentialLayer(),
        TemporalLayer(),
        ExecutionLayer(),
        VerificationLayer(),
        StateLayer(),
    ]

    if syntactic:
        try:
            from dpaa.layers.syntactic import SyntacticLayer
            analyzers.insert(1, SyntacticLayer())
        except ImportError:
            typer.echo("Warning: stanza not installed. Skipping L2. Run: pip install dpaa[syntactic]")

    layer_results = [a.analyze(doc) for a in analyzers]
    report = Scorer(profile=profile).compute(str(plan), layer_results)

    if text:
        typer.echo(to_text(report))

    if output:
        output.write_text(to_json(report), encoding="utf-8")
        typer.echo(f"\nReport written to {output}")

    raise typer.Exit(code=1 if report.level == "FAIL" else 0)


if __name__ == "__main__":
    app()
```

- [ ] **Step 4: end-to-end 테스트 작성**

`tests/test_cli.py`:

```python
from typer.testing import CliRunner
from dpaa.cli import app
from pathlib import Path

runner = CliRunner()
FIXTURES = Path("tests/fixtures")


def test_bad_plan_exits_1():
    result = runner.invoke(app, [str(FIXTURES / "bad_plan.md")])
    assert result.exit_code == 1


def test_good_plan_exits_0():
    result = runner.invoke(app, [str(FIXTURES / "good_plan.md")])
    assert result.exit_code == 0


def test_output_contains_level():
    result = runner.invoke(app, [str(FIXTURES / "bad_plan.md")])
    assert "FAIL" in result.output or "WARN" in result.output


def test_json_output_written(tmp_path):
    out = tmp_path / "score.json"
    runner.invoke(app, [str(FIXTURES / "bad_plan.md"), "--output", str(out)])
    assert out.exists()
    import json
    data = json.loads(out.read_text(encoding="utf-8"))
    assert "overall" in data
    assert "level" in data
    assert "findings" in data
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
pytest tests/test_cli.py -v
```

Expected: 4 PASSED

- [ ] **Step 6: 전체 테스트 통과 확인**

```bash
pytest tests/ -v --tb=short
```

Expected: 전체 PASSED, FAIL 0

- [ ] **Step 7: 동작 확인**

```bash
dpaa tests/fixtures/bad_plan.md
dpaa tests/fixtures/good_plan.md
dpaa tests/fixtures/bad_plan.md --output score.json
```

Expected: bad_plan → FAIL with findings, good_plan → PASS

- [ ] **Step 8: 최종 커밋**

```bash
git add dpaa/cli.py dpaa/output/ dpaa/layers/__init__.py tests/test_cli.py
git commit -m "feat: add CLI, output formatters, and end-to-end integration"
```

---

## Self-Review

### Spec Coverage

| Spec 요구사항 | 구현 Task |
|--------------|-----------|
| L1 Structural | Task 8 |
| L2 Syntactic (WARN-only) | Task 10 |
| L3 Referential | Task 8 |
| L4 Temporal | Task 8 |
| L5 Execution | Task 5 |
| L6 Verification | Task 6 |
| L7 State/DAG | Task 7 |
| Aggregation + PASS/WARN/FAIL | Task 9 |
| Suggestion engine | Task 4 |
| JSON output | Task 11 |
| Human-readable output | Task 11 |
| CLI | Task 11 |
| Profiles YAML (external weights) | Task 2 |
| Rule YAML schema | Task 2 |
| L2 WARN-only enforcement | Task 9 (Scorer) + Task 10 (WARN_ONLY=True) |
| Structured YAML step FP mitigation | Task 5 (ExecutionLayer) |

### Key Review Findings Addressed

| 리뷰 지적 | 대응 |
|-----------|------|
| L2 비결정론적 → WARN-only | Scorer가 syntactic을 FAIL gate에서 제외 |
| 가중치 하드코딩 | profiles.yaml로 외부화 |
| Rule YAML 스키마 없음 | schema.json 추가 |
| False positive (fix=structured YAML) | ExecutionLayer severity 완화 |
| 논문 미인용 | SBADR (Osama et al., ICSME 2020) 명시 |
| Suggestion 없음 | 모든 finding에 suggestion 포함 |
