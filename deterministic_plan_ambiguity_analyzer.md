# Deterministic Plan Ambiguity Analyzer (DPAA)

## Overview

Deterministic Plan Ambiguity Analyzer (DPAA)는 자연어 기반 계획 문서(Plan Document)의 모호성을 정적 분석(static analysis) 기반으로 탐지하고 점수화하는 결정론적(deterministic) 분석 시스템이다.

본 시스템은 다음을 목표로 한다.

- ambiguity detection
- execution divergence suppression
- orchestration reliability
- enforceable planning workflow
- reproducible planning quality analysis
- LLM-free planning gate

DPAA는 LLM, probabilistic inference, generative reasoning을 사용하지 않는다.

모든 결과는 다음 조건이 동일할 경우 재현 가능해야 한다.

```text
same input
+ same parser version
+ same ruleset version
+ same scoring version
= identical output
```

---

# Core Philosophy

## Fundamental Problem

자연어 계획 문서는 본질적으로 ambiguity를 가진다.

예:

```text
Improve orchestration reliability.
```

이 문장은 문법적으로는 문제가 없어 보이지만, 실제 실행 관점에서는 다음이 불명확하다.

- reliability의 정의가 없음
- metric이 없음
- implementation boundary가 없음
- acceptance criteria가 없음
- rollback condition이 없음
- failure condition이 없음
- 책임 주체가 없음

따라서 서로 다른 구현자가 서로 다른 결과물을 만들 수 있다.

```text
engineer A
engineer B
automation system A
automation system B
```

이들이 같은 계획 문서를 보고 서로 다른 구현을 한다면, 문제의 핵심은 문법 오류가 아니라 execution divergence다.

DPAA는 이 divergence 가능성을 줄이기 위해 계획 문서를 deterministic하게 linting하고 scoring한다.

---

# System Goals

## G1. Ambiguity Quantification

계획 문서의 ambiguity를 수치화한다.

## G2. Deterministic Enforcement

동일 입력은 반드시 동일 결과를 생성해야 한다.

```text
same PLAN.md
+ same analyzer version
+ same ruleset
= same score.json
```

## G3. Execution Divergence Reduction

계획 문서를 사람이든 자동화 시스템이든 서로 다르게 해석하는 가능성을 줄인다.

## G4. Planning Gate Integration

CI/CD 또는 orchestration pipeline에서 사용 가능해야 한다.

예:

```text
PLAN.md
  ↓
ambiguity-lint
  ↓
FAIL
  ↓
implementation blocked
```

## G5. LLM-Free Operation

LLM inference 없이 작동해야 한다.

---

# Non-Goals

초기 버전에서는 다음을 하지 않는다.

## N1. Semantic Intent Understanding

작성자의 의도를 추론하지 않는다.

## N2. LLM Reasoning

LLM inference를 사용하지 않는다.

## N3. Autonomous Plan Repair

계획을 자동으로 rewrite하지 않는다.

## N4. Probabilistic Interpretation Generation

확률 기반 의미 추론을 하지 않는다.

## N5. Human Preference Modeling

작성자의 취향이나 암묵적 선호를 학습하지 않는다.

---

# High-Level Architecture

```text
Raw Plan
  ↓
L1. Structural Layer
  ↓
L2. Syntactic Layer
  ↓
L3. Referential Layer
  ↓
L4. Temporal Layer
  ↓
L5. Execution Layer
  ↓
L6. Verification Layer
  ↓
L7. Dependency/State Layer
  ↓
Aggregation Layer
  ↓
Final Ambiguity Score
  ↓
PASS / WARN / FAIL
```

---

# Layer Responsibility Summary

| Layer | Responsibility | Deterministic Implementation |
|---|---|---|
| L1 Structural | 문서 구조 검증 | Markdown AST, schema validation |
| L2 Syntactic | 문법적 모호성 분석 | parser, parse tree filtering |
| L3 Referential | 참조 대상 모호성 탐지 | pronoun/reference rules |
| L4 Temporal | 시간/순서 모호성 탐지 | keyword rules, ordering graph |
| L5 Execution | 실행 의미 모호성 탐지 | weak verb/action linting |
| L6 Verification | 완료 판정 가능성 검증 | metric/threshold/test detection |
| L7 Dependency/State | workflow/state 검증 | DAG, FSM validation |

---

# Input Model

## Supported Formats

초기 구현은 다음 입력을 지원한다.

- Markdown
- Markdown + YAML blocks
- YAML
- JSON

## Recommended Format

실무적으로는 Markdown + YAML block 혼합 형식을 권장한다.

Markdown은 사람이 읽기 좋고, YAML block은 기계 검증에 적합하다.

```markdown
# Goal

Add deterministic ambiguity linting for planning documents.

# Steps

```yaml
steps:
  - id: PLAN_REVIEW
    action: review
    target: plan_document
    produces:
      - PLAN_APPROVED
```
```

---

# L1. Structural Layer

## Purpose

문서 구조 자체의 무결성을 검증한다.

이 레이어는 문서가 최소한 다음 조건을 만족하는지 검사한다.

- 파싱 가능함
- 필수 섹션이 있음
- step이 식별 가능함
- workflow로 변환 가능함
- 미완성 placeholder가 남아 있지 않음

## Responsibilities

### Required Section Validation

필수 섹션 존재 여부를 확인한다.

권장 필수 섹션:

```text
Goal
Scope
Non-Goals
Constraints
Assumptions
Steps
Acceptance Criteria
Rollback
Failure Conditions
```

### Empty Section Detection

내용 없는 section을 탐지한다.

예:

```markdown
# Acceptance Criteria
```

### Heading Hierarchy Validation

잘못된 heading 구조를 탐지한다.

예:

```markdown
# Goal
#### Steps
```

### Duplicate Step ID Detection

중복 step id를 탐지한다.

### TODO/FIXME Detection

미완성 placeholder를 탐지한다.

탐지 대상:

```text
TODO
FIXME
TBD
XXX
placeholder
later
fill this
```

### Malformed Workflow Ordering

step ordering이 깨진 경우를 탐지한다.

예:

```text
Step 4 references Step 7, but Step 7 does not exist.
```

## Structural Score Inputs

```text
missing_required_sections
empty_sections
invalid_heading_order
duplicate_step_ids
todo_count
malformed_structure_count
```

## Example Finding

```json
{
  "layer": "structural",
  "rule": "missing_section",
  "severity": "high",
  "target": "Rollback",
  "message": "Rollback section is required but missing."
}
```

---

# L2. Syntactic Layer

## Purpose

문장의 syntactic ambiguity를 분석한다.

이 레이어는 업로드된 논문의 핵심 영역이다.

논문의 방식은 다음 구조에 해당한다.

```text
Sentence
  ↓
Top-K Parse Trees
  ↓
Filtering Pipelines
  ↓
Remaining Competing Interpretations
  ↓
Syntactic Ambiguity Score
```

## What the Paper Contributes

논문이 직접적으로 제공하는 것은 다음이다.

- attachment ambiguity detection
- coordination ambiguity detection
- analytical ambiguity detection
- parser score 기반 interpretation filtering
- redundant parse tree elimination
- top-scored competing interpretation extraction

## Responsibilities

### Attachment Ambiguity

예:

```text
Deploy the service with retry handling.
```

가능한 해석:

1. retry handling이 service에 붙음
2. retry handling이 deploy action에 붙음

### Coordination Ambiguity

예:

```text
Review and approve failed jobs.
```

가능한 해석:

1. review failed jobs and approve failed jobs
2. review something, then approve failed jobs

### Analytical Ambiguity

예:

```text
general recovery mechanism
```

가능한 해석:

1. general (recovery mechanism)
2. (general recovery) mechanism

## Processing Pipeline

논문 기반 파이프라인:

```text
Sentence
  ↓
Parser
  ↓
Top-K Parse Trees
  ↓
P1 Meaningless Parse Elimination
  ↓
P2 Structural Duplicate Elimination
  ↓
P3 Dependency Duplicate Elimination
  ↓
P4 Score Variance Filtering
```

## P1. Meaningless Parse Elimination

의미 없는 parse tree 제거.

예:

- fragment root
- invalid sentence root
- noun phrase only parse
- broken sentence structure

## P2. Structural Duplicate Elimination

구조적으로 동일한 parse tree 제거.

예:

- identical structure
- interchangeable labels
- normalized equivalent structure

## P3. Dependency Duplicate Elimination

typed dependency가 동일한 해석 제거.

## P4. Score Variance Filtering

parser score가 최고 score 근처에 있는 해석만 유지한다.

예:

```text
keep parse trees within 10% score variance
```

## Metrics

```text
parse_entropy
parse_branch_count
dependency_conflict_count
score_variance
interpretation_count
```

## Syntactic Score Example

```text
syntactic_score =
  0.30 * parse_entropy
+ 0.25 * dependency_conflict_count
+ 0.25 * interpretation_count
+ 0.20 * score_variance
```

---

# L3. Referential Layer

## Purpose

참조 대상 ambiguity를 탐지한다.

## Core Problem

예:

```text
Restart it after update.
```

문제:

- it이 무엇을 가리키는가?
- update 대상은 무엇인가?
- restart 대상은 무엇인가?

## Responsibilities

### Pronoun Resolution Failure

탐지 대상:

```text
it
this
that
they
them
these
those
he
she
```

### Vague Entity Detection

탐지 대상:

```text
component
module
system
service
handler
processor
manager
controller
thing
part
logic
flow
```

### Missing Antecedent Detection

대상 없이 등장하는 reference를 탐지한다.

## Referential Distance Rule

```text
if pronoun exists
and no candidate noun phrase exists within previous N sentences
then unresolved_reference
```

## Stronger Deterministic Alternative

자유 텍스트 대신 structured target을 요구한다.

```yaml
step:
  id: RESTART_ORCHESTRATOR
  action: restart
  target: orchestrator_service
```

## Failure Examples

```text
Restart it after migration.
```

```text
Update the handler before restarting the service.
```

문제:

- 어떤 handler인지 불명확
- service가 여러 개일 수 있음

## Metrics

```text
unresolved_reference_count
pronoun_without_antecedent_count
vague_entity_count
reference_distance_score
```

---

# L4. Temporal Layer

## Purpose

시간 및 순서 ambiguity를 탐지한다.

## Core Problem

예:

```text
Retry periodically.
```

문제:

- interval 없음
- trigger 없음
- max retry 없음
- timeout 없음

## Responsibilities

### Vague Temporal Wording Detection

탐지 대상:

```text
soon
later
eventually
periodically
if needed
when appropriate
as required
temporarily
after some time
from time to time
```

### Missing Interval Detection

예:

```text
Retry periodically.
```

interval이 없으면 FAIL 또는 WARN.

### Ordering Validation

탐지 대상:

```text
before
after
then
prior to
following
once
until
during
```

### Cyclic Temporal Dependency Detection

예:

```text
A after B
B after A
```

### Trigger Validation

예:

```text
Restart if necessary.
```

문제:

- necessary의 조건이 정의되지 않음

## Recommended Structured Form

```yaml
retry:
  interval: 30s
  max_attempts: 5
  trigger: worker_failed
  timeout: 10m
```

## Metrics

```text
vague_temporal_count
missing_interval_count
invalid_ordering_count
cyclic_temporal_dependency_count
undefined_trigger_count
```

---

# L5. Execution Layer

## Purpose

실행 의미 ambiguity를 탐지한다.

이 레이어는 실무 계획 문서에서 가장 중요하다.

## Core Problem

예:

```text
Improve reliability.
```

문제:

- 무엇을 개선하는가?
- 어떤 방식으로 개선하는가?
- 어느 범위까지 개선하는가?
- 완료 조건은 무엇인가?

## Responsibilities

### Weak Action Detection

탐지 대상:

```text
improve
optimize
enhance
support
manage
handle
fix
refactor
robust
flexible
efficient
clean
better
properly
stabilize
harden
simplify
modernize
```

### Broad Scope Action Detection

예:

```text
Refactor orchestration layer.
```

문제:

- 대상 범위가 넓음
- 어떤 파일/모듈/상태 전이를 변경하는지 불명확

### Undefined Operational Behavior

예:

```text
Handle failures gracefully.
```

문제:

- gracefully의 의미가 없음
- retry인지 rollback인지 alert인지 skip인지 불명확

### Non-Measurable Action Detection

예:

```text
Make system more reliable.
```

## Strong Recommendation

weak verb 대신 explicit operational verb를 사용한다.

나쁜 예:

```text
Improve worker reliability.
```

좋은 예:

```text
Add exponential backoff retry to failed worker jobs.
```

더 좋은 예:

```text
Add exponential backoff retry to worker jobs that fail with transient network errors.
Use initial delay 1s, multiplier 2.0, max delay 30s, max attempts 5.
```

## Metrics

```text
weak_verb_count
non_measurable_action_count
undefined_behavior_count
broad_scope_operation_count
```

---

# L6. Verification Layer

## Purpose

완료 판정 가능성을 검증한다.

## Core Problem

예:

```text
System should be stable.
```

문제:

- stable의 정의가 없음
- metric 없음
- threshold 없음
- PASS/FAIL 불가

## Responsibilities

### Acceptance Criteria Validation

PASS 조건 존재 여부 확인.

### Metric Validation

수치 metric 존재 여부 확인.

예:

```text
150ms
99.9%
3 retries
5 seconds
0 failed jobs
```

### Threshold Validation

비교 연산 존재 여부 확인.

예:

```text
<
>
<=
>=
at most
at least
no more than
within
```

### Reproducibility Validation

재현 가능한 테스트 조건 존재 여부 확인.

### Testability Validation

검증 방법 존재 여부 확인.

예:

```text
run benchmark
execute integration test
simulate worker failure
run unit test
verify state transition
```

## Good Example

```text
P95 latency must remain below 150ms under 5k concurrent requests.
```

## Better Example

```text
PASS if worker recovers from 3 consecutive transient failures within 60 seconds,
and no job remains stuck in RUNNING state after retry exhaustion.
```

## Failure Examples

```text
System should work reliably.
```

```text
Latency should improve.
```

```text
The orchestration flow should be robust.
```

## Metrics

```text
missing_metric_count
missing_threshold_count
missing_test_method_count
undefined_success_condition_count
```

---

# L7. Dependency / State Layer

## Purpose

workflow/state transition ambiguity를 검증한다.

이 레이어는 orchestration/harness 시스템에서 가장 중요하다.

## Core Concept

계획을 finite-state workflow로 간주한다.

## Responsibilities

### DAG Validation

workflow graph가 DAG인지 확인한다.

### Cyclic Dependency Detection

cycle을 탐지한다.

### Invalid Transition Detection

허용되지 않은 state transition을 탐지한다.

### Missing Preconditions

예:

```text
Implement before approval.
```

### Missing Postconditions

step 완료 후 상태 정의가 없는 경우 탐지.

### Rollback Validation

rollback path 존재 여부 확인.

### Unreachable State Detection

도달 불가능 상태 탐지.

## Example Structured State Definition

```yaml
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

  - id: AUDIT
    action: audit
    target: patch
    requires:
      - PATCH_CREATED
    produces:
      - AUDIT_PASSED

  - id: MERGE
    action: merge
    target: patch
    requires:
      - AUDIT_PASSED
    produces:
      - MERGED
```

## Failure Examples

### Implementation Before Approval

```yaml
steps:
  - id: IMPLEMENT
    requires: []
```

문제:

- PLAN_APPROVED 없이 implementation 가능

### Missing Rollback

```yaml
steps:
  - id: DEPLOY
    produces:
      - DEPLOYED
```

문제:

- rollback transition 없음

## Metrics

```text
invalid_transition_count
cyclic_dependency_count
missing_precondition_count
missing_postcondition_count
missing_rollback_count
unreachable_state_count
```

---

# Aggregation Layer

## Purpose

레이어별 점수를 통합한다.

## Example Weighting

```text
overall =
0.15 * structural
0.10 * syntactic
0.15 * referential
0.15 * temporal
0.20 * execution
0.15 * verification
0.10 * state
```

## Rationale

실무 계획 문서에서는 syntactic ambiguity보다 execution, verification, state ambiguity가 더 위험하다.

따라서 L2의 비중은 낮게 두고, 다음 레이어의 비중을 높인다.

- L5 Execution
- L6 Verification
- L7 Dependency/State

## Severity Levels

```text
0-20   PASS
21-50  WARN
51+    FAIL
```

## Alternative Strict Profile

```text
0-10   PASS
11-30  WARN
31+    FAIL
```

---

# Output Format

## JSON Output

```json
{
  "overall": 72,
  "level": "FAIL",
  "scores": {
    "structural": 5,
    "syntactic": 12,
    "referential": 10,
    "temporal": 15,
    "execution": 20,
    "verification": 25,
    "state": 10
  },
  "findings": [
    {
      "layer": "execution",
      "rule": "weak_action",
      "severity": "high",
      "line": 14,
      "text": "Improve reliability.",
      "message": "Weak action without concrete operation or measurable target."
    }
  ]
}
```

## Human-Readable Output

```text
DPAA Result: FAIL

Overall Score: 72

Top Findings:
1. L5 Execution: weak action at line 14
2. L6 Verification: missing acceptance threshold at line 18
3. L7 State: missing rollback path for DEPLOY
```

---

# Enforcement Model

## CI/CD Integration

```text
PLAN.md
  ↓
ambiguity-lint
  ↓
score.json
  ↓
PASS/WARN/FAIL
```

## Merge Policy

### PASS

Implementation allowed.

### WARN

Manual review required.

### FAIL

Implementation blocked.

## Example Gate

```bash
ambiguity-lint PLAN.md --profile strict --output score.json
```

```bash
if jq -e '.level == "FAIL"' score.json; then
  echo "Plan ambiguity too high."
  exit 1
fi
```

---

# Determinism Requirements

## Mandatory Guarantees

```text
same input
+ same parser version
+ same ruleset
+ same scoring version
= identical output
```

## Forbidden Components

DPAA must not use:

- LLM inference
- probabilistic scoring
- stochastic ranking
- runtime semantic generation
- self-modifying scoring
- remote model calls
- hidden heuristic updates

## Version Pinning

The following must be pinned.

```text
analyzer_version
ruleset_version
parser_version
scoring_version
profile_version
```

---

# Recommended Python Implementation

Python으로도 충분히 구현 가능하다.

오히려 다음 이유로 초기 프로토타입은 Python이 더 적합할 수 있다.

- Markdown parsing library 접근성 좋음
- YAML/JSON 처리 간단함
- NLP parser integration 쉬움
- graph validation library 사용 가능
- rule engine 작성이 빠름
- CI tool로 배포 가능

---

## Recommended Python Stack

### Markdown Parsing

- markdown-it-py
- mistune
- markdown
- mdformat

### YAML / JSON

- PyYAML
- ruamel.yaml
- jsonschema

### NLP / Syntax

- spaCy
- Stanza
- Stanford CoreNLP server client
- benepar, if constituency parsing is needed

### Graph Validation

- networkx
- custom DAG validator

### CLI

- typer
- click
- argparse

### Output

- pydantic
- dataclasses
- json

---

# Python Project Structure

```text
dpaa/
  __init__.py

  cli.py

  parser/
    __init__.py
    markdown_parser.py
    yaml_block_parser.py
    sentence_splitter.py

  layers/
    __init__.py
    structural.py
    syntactic.py
    referential.py
    temporal.py
    execution.py
    verification.py
    state.py

  rules/
    structural.yaml
    referential.yaml
    temporal.yaml
    execution.yaml
    verification.yaml
    state.yaml

  scoring/
    __init__.py
    scorer.py
    profiles.yaml

  graph/
    __init__.py
    dag.py
    fsm.py

  output/
    __init__.py
    json_report.py
    text_report.py

tests/
  test_structural.py
  test_referential.py
  test_temporal.py
  test_execution.py
  test_verification.py
  test_state.py

pyproject.toml
README.md
```

---

# Python Data Model

## Finding

```python
from dataclasses import dataclass
from typing import Literal

Severity = Literal["low", "medium", "high", "critical"]

@dataclass(frozen=True)
class Finding:
    layer: str
    rule: str
    severity: Severity
    line: int | None
    text: str | None
    message: str
    score: int
```

## Layer Result

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class LayerResult:
    layer: str
    score: int
    findings: list[Finding]
```

## Final Report

```python
@dataclass(frozen=True)
class Report:
    file: str
    overall: int
    level: str
    scores: dict[str, int]
    findings: list[Finding]
    analyzer_version: str
    ruleset_version: str
```

---

# Example Python CLI

```python
import typer
from pathlib import Path

app = typer.Typer()

@app.command()
def lint(
    plan: Path,
    profile: str = "default",
    output: Path = Path("score.json"),
):
    text = plan.read_text(encoding="utf-8")
    report = analyze_plan(text, profile=profile)
    output.write_text(report.to_json(), encoding="utf-8")

if __name__ == "__main__":
    app()
```

---

# Example Ruleset

## execution.yaml

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

rules:
  weak_action_without_metric:
    severity: high
    score: 10
```

## temporal.yaml

```yaml
vague_temporal_terms:
  - soon
  - later
  - eventually
  - periodically
  - if needed
  - when appropriate
  - as required

rules:
  vague_temporal_without_interval:
    severity: medium
    score: 8
```

---

# Example Layer Implementation: Execution

```python
import re

WEAK_TERMS = [
    "improve", "optimize", "enhance", "support", "manage",
    "handle", "fix", "refactor", "robust", "flexible",
    "efficient", "clean", "better", "properly",
]

METRIC_PATTERN = re.compile(
    r"(\d+(\.\d+)?\s?(ms|s|sec|seconds|%|requests|retries|attempts|MB|GB))",
    re.IGNORECASE,
)

def analyze_execution(lines: list[str]) -> list[Finding]:
    findings = []

    for i, line in enumerate(lines, start=1):
        lower = line.lower()
        has_weak_term = any(term in lower for term in WEAK_TERMS)
        has_metric = bool(METRIC_PATTERN.search(line))

        if has_weak_term and not has_metric:
            findings.append(Finding(
                layer="execution",
                rule="weak_action_without_metric",
                severity="high",
                line=i,
                text=line,
                message="Weak action term appears without measurable metric.",
                score=10,
            ))

    return findings
```

---

# Example Layer Implementation: Verification

```python
import re

THRESHOLD_PATTERN = re.compile(
    r"(<|>|<=|>=|at most|at least|no more than|within|below|above)",
    re.IGNORECASE,
)

TEST_METHOD_PATTERN = re.compile(
    r"(test|benchmark|simulate|verify|assert|run|execute)",
    re.IGNORECASE,
)

def analyze_verification(lines: list[str]) -> list[Finding]:
    findings = []

    for i, line in enumerate(lines, start=1):
        lower = line.lower()

        looks_like_acceptance = (
            "pass if" in lower
            or "acceptance" in lower
            or "must" in lower
            or "should" in lower
        )

        if looks_like_acceptance:
            has_threshold = bool(THRESHOLD_PATTERN.search(line))
            has_test_method = bool(TEST_METHOD_PATTERN.search(line))

            if not has_threshold:
                findings.append(Finding(
                    layer="verification",
                    rule="missing_threshold",
                    severity="high",
                    line=i,
                    text=line,
                    message="Acceptance-like statement has no threshold.",
                    score=10,
                ))

            if not has_test_method:
                findings.append(Finding(
                    layer="verification",
                    rule="missing_test_method",
                    severity="medium",
                    line=i,
                    text=line,
                    message="Acceptance-like statement has no explicit test method.",
                    score=6,
                ))

    return findings
```

---

# Example Layer Implementation: State Graph

```python
import networkx as nx

def validate_state_graph(steps: list[dict]) -> list[Finding]:
    findings = []
    graph = nx.DiGraph()

    produced_states = set()

    for step in steps:
        step_id = step["id"]
        graph.add_node(step_id)

        for state in step.get("produces", []):
            produced_states.add(state)

    for step in steps:
        step_id = step["id"]

        for required_state in step.get("requires", []):
            producers = [
                s["id"]
                for s in steps
                if required_state in s.get("produces", [])
            ]

            if not producers:
                findings.append(Finding(
                    layer="state",
                    rule="missing_required_state_producer",
                    severity="critical",
                    line=None,
                    text=step_id,
                    message=f"Required state has no producer: {required_state}",
                    score=20,
                ))

            for producer in producers:
                graph.add_edge(producer, step_id)

    if not nx.is_directed_acyclic_graph(graph):
        findings.append(Finding(
            layer="state",
            rule="cyclic_dependency",
            severity="critical",
            line=None,
            text=None,
            message="Workflow dependency graph contains a cycle.",
            score=25,
        ))

    return findings
```

---

# Scoring Model

## Finding-Based Scoring

각 finding은 score를 가진다.

```text
low       2
medium    5
high     10
critical 20
```

## Layer Score

```text
layer_score = min(100, sum(finding.score for finding in layer_findings))
```

## Overall Score

```text
overall =
0.15 * structural
0.10 * syntactic
0.15 * referential
0.15 * temporal
0.20 * execution
0.15 * verification
0.10 * state
```

## Level

```text
0-20   PASS
21-50  WARN
51+    FAIL
```

---

# Example Plan Input

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

---

# Example DPAA Findings

```json
{
  "overall": 78,
  "level": "FAIL",
  "findings": [
    {
      "layer": "execution",
      "rule": "weak_action_without_metric",
      "line": 3,
      "text": "Improve orchestration reliability.",
      "message": "Weak action term appears without measurable metric."
    },
    {
      "layer": "referential",
      "rule": "unresolved_reference",
      "line": 8,
      "text": "Restart it later.",
      "message": "Pronoun 'it' has ambiguous target."
    },
    {
      "layer": "temporal",
      "rule": "vague_temporal_without_interval",
      "line": 8,
      "text": "Restart it later.",
      "message": "Temporal term 'later' has no exact condition or time."
    },
    {
      "layer": "temporal",
      "rule": "periodic_without_interval",
      "line": 9,
      "text": "Retry periodically if needed.",
      "message": "Periodic action has no interval."
    },
    {
      "layer": "verification",
      "rule": "missing_threshold",
      "line": 13,
      "text": "System should be stable.",
      "message": "Acceptance criterion has no measurable threshold."
    },
    {
      "layer": "structural",
      "rule": "placeholder",
      "line": 17,
      "text": "TBD",
      "message": "Rollback section contains placeholder."
    }
  ]
}
```

---

# Implementation Roadmap

## Phase 1: Rule-Based MVP

Scope:

- Markdown parsing
- required section validation
- TODO/FIXME detection
- weak term detection
- vague temporal detection
- metric/threshold detection
- JSON output
- PASS/WARN/FAIL

Expected effort: low.

## Phase 2: Structured Plan Support

Scope:

- YAML step extraction
- step id validation
- dependency graph construction
- DAG validation
- missing producer detection
- missing rollback detection

Expected effort: medium.

## Phase 3: Syntactic Layer

Scope:

- sentence splitting
- parser integration
- parse tree collection
- parse duplicate filtering
- score variance filtering
- syntactic ambiguity scoring

Expected effort: medium to high.

## Phase 4: CI Integration

Scope:

- CLI packaging
- GitHub Actions/GitLab CI example
- exit code policy
- profile configuration
- score artifact output

Expected effort: low to medium.

## Phase 5: Domain Rule Packs

Scope:

- distributed systems
- database migration
- CI/CD
- deployment
- rollback
- incident response
- LLM harness/orchestration

Expected effort: ongoing.

---

# Recommended Initial MVP

초기 버전은 L2를 나중으로 미루고 L1, L3, L4, L5, L6, L7부터 구현하는 것이 좋다.

이유:

- L2는 parser integration 비용이 큼
- 실무 ambiguity는 대부분 L5, L6, L7에서 발생
- deterministic gate로 빠르게 활용 가능
- 룰 기반만으로도 효과가 큼

## MVP Layer Priority

```text
1. L5 Execution
2. L6 Verification
3. L7 Dependency/State
4. L1 Structural
5. L4 Temporal
6. L3 Referential
7. L2 Syntactic
```

---

# Python vs Go

## Python Advantages

- 빠른 프로토타이핑
- NLP 라이브러리 접근성
- Markdown/YAML 처리 쉬움
- graph validation 쉬움
- rule iteration 빠름

## Python Disadvantages

- 단일 바이너리 배포 불리
- dependency 관리 필요
- 실행 환경 고정 필요

## Go Advantages

- 단일 바이너리 배포
- CI hook에 적합
- deterministic CLI tool로 패키징 쉬움
- 빠른 실행 속도

## Go Disadvantages

- NLP integration 상대적으로 불편
- Markdown/YAML/rule iteration은 Python보다 느릴 수 있음
- parser ecosystem이 제한적

## Practical Recommendation

초기 MVP는 Python으로 만든다.

이후 안정화되면 다음 중 하나를 선택한다.

1. Python CLI 그대로 유지
2. Go로 core linter 재작성
3. Python analyzer + Go wrapper 구조 사용

---

# Final Direction

DPAA는 다음 원칙을 따른다.

```text
Do not infer intent.
Do not generate meaning.
Do not rely on LLMs.
Detect structural ambiguity.
Detect execution ambiguity.
Detect verification ambiguity.
Block unsafe plans before implementation.
```

핵심은 계획 문서를 자유로운 자연어 덩어리로 두지 않고, 기계가 검증 가능한 구조로 점진적으로 좁히는 것이다.

최종적으로 DPAA는 다음 역할을 한다.

```text
PLAN.md
  ↓
deterministic ambiguity analysis
  ↓
score.json
  ↓
planning gate
  ↓
implementation allowed only when ambiguity is acceptable
```
