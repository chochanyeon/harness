# harness

[English README](README.en.md)

![Pi Workflow Harness closed-loop overview](docs/assets/harness-overview.svg)

## What this is

**Pi 기반 AI 코딩 세션을 `interview → plan → guard → implement → review → document → commit/push` 흐름으로 묶어 주는 프로젝트 로컬 하네스입니다.**

단순 프롬프트 모음이 아니라, AI 개발 세션에 **SDLC 거버넌스, 기계적 품질 게이트, 장기 기억, 실패 증거 로그**를 붙인 재사용 가능한 런타임 템플릿입니다.

![Before and after applying harness](docs/assets/harness-before-after.svg)

## How it works

핵심은 “자동화”가 아니라 **되돌아갈 수 있는 loop**입니다. 계획이 모호하면 구현으로 가지 않고 plan을 보수하고, 리뷰에서 문제가 나오면 완료 처리하지 않고 다시 수정합니다.

![Harness guard and feedback loops](docs/assets/harness-guard-loop.svg)

기본 phase:

```text
interview
→ plan
→ plan_review      # DPAA/SBADR ambiguity guard
→ implement        # TDD/verification-aware execution
→ code_review      # self-review + independent review + quality gate
→ review_approved
→ document
→ commit
→ push             # human approval + policy scan
→ done
```

- 안전한 구간은 agent가 자율 진행합니다.
- 위험 경계인 `commit → push`는 사용자 승인과 policy scan을 요구합니다.
- guard 실패는 skip이 아니라 원인 수정 후 재시도가 기본입니다.
- Run Ledger, task queue, external memory가 다음 iteration의 재개 단서를 남깁니다.
- long-running workflow에서는 heartbeat와 `workflow_run_command` 증거를 남겨 context pollution을 줄입니다.
- runtime workflow prompt는 현재 phase의 행동·전이·필수 guard 증거만 주입해 context noise를 줄입니다.
- Pre-code_review 단계의 누락된 검증은 `code_review → review_approved` 전에 드러나며, 나중에 처리할 개선은 명시적으로 deferred로 남깁니다.

## What gets installed

![Harness install footprint](docs/assets/harness-install-footprint.svg)

`target/`는 이 저장소의 배포 템플릿입니다. 다른 프로젝트에 설치하면 `target/.pi/` 내용이 해당 프로젝트의 `.pi/`로 배치됩니다.

## Key components

| 영역 | 위치 | 역할 |
|---|---|---|
| Workflow runtime | `target/.pi/extensions/workflow.ts`, `target/.pi/extensions/workflow/` | phase, guard, command policy, reminders, ledger |
| Memory runtime | `target/.pi/extensions/memory.ts` | durable memory, candidate memory, feedback, relevance scoring |
| Skills/personas | `target/.pi/skills/`, `target/.pi/personas/` | review, trace, TDD, documentation, continuation safety 등 |
| Policies/schemas | `target/.harness/`, `target/.pi/schemas/` | workflow hard rules, field log/memory schema |
| TUI helpers/theme | `target/.pi/themes/`, `target/.pi/extensions/assistant-markdown-box.ts` | workflow console theme, boxed markdown rendering |
| Docs | `docs/` | guard recovery, runtime events, prompt contracts, protocol taxonomy |

## Ownership boundary

| 분류 | 하네스가 관리/갱신 가능 | 프로젝트가 소유 |
|---|---|---|
| Runtime | `.pi/extensions/`, `.pi/skills/`, `.pi/personas/`, `.pi/workflows/`, `.pi/dpaa/`, `.pi/sbadr/` | `.pi/local/`, `.pi/config/`, `.pi/LOCAL.md` |
| Policy | `.harness/workflow-policy.json`, `.pi/WORKFLOW.md`, `.pi/GOVERNANCE.md` | `AGENTS.md` |
| Generated | `.pi/.venv/`, `.pi/.cache/`, `.pi/dpaa-runs/`, `.project-memory/` | 커밋하지 않는 로컬 산출물 |

설치된 프로젝트의 runtime `.pi/extensions/**` 수정은 사용자 승인이 필요합니다. 단, 이 저장소에서는 `target/.pi/extensions/**`가 배포 템플릿 소스이므로 일반 개발 대상입니다.

---

# Commands

## 다른 프로젝트에 설치

설치할 프로젝트 루트에서 실행합니다.

### Windows PowerShell

```powershell
$p=Join-Path $env:TEMP 'init-harness.ps1'; Invoke-WebRequest https://raw.githubusercontent.com/chochanyeon/harness/main/scripts/init-target-harness.ps1 -OutFile $p; $env:HARNESS_DEST=(Get-Location).Path; powershell -NoProfile -ExecutionPolicy Bypass -File $p
```

### macOS/Linux

```bash
curl -fsSL https://raw.githubusercontent.com/chochanyeon/harness/main/scripts/init-target-harness.sh | sh
```

설치 후 같은 프로젝트 루트에서 Pi를 실행합니다.

```bash
pi
```

설치 상태 확인:

```text
/workflow doctor
```

## component별 설치

```bash
# workflow만 설치
curl -fsSL https://raw.githubusercontent.com/chochanyeon/harness/main/scripts/init-target-harness.sh | sh -s -- --component workflow

# memory만 설치
curl -fsSL https://raw.githubusercontent.com/chochanyeon/harness/main/scripts/init-target-harness.sh | sh -s -- --component memory
```

깨끗하게 재설치하려면 managed runtime을 지우고 다시 복사합니다. `AGENTS.md`, `.pi/LOCAL.md`, `.ai/interview` 산출물은 보존됩니다.

```powershell
$p=Join-Path $env:TEMP 'init-harness.ps1'; Invoke-WebRequest https://raw.githubusercontent.com/chochanyeon/harness/main/scripts/init-target-harness.ps1 -OutFile $p; $env:HARNESS_DEST=(Get-Location).Path; powershell -NoProfile -ExecutionPolicy Bypass -File $p -Clean
```

```bash
curl -fsSL https://raw.githubusercontent.com/chochanyeon/harness/main/scripts/init-target-harness.sh | sh -s -- --clean
```

## 업데이트

설치된 프로젝트 루트에서 실행합니다.

### Windows PowerShell

```powershell
$p=Join-Path $env:TEMP 'update-harness.ps1'; Invoke-WebRequest https://raw.githubusercontent.com/chochanyeon/harness/main/scripts/update-harness.ps1 -OutFile $p; powershell -NoProfile -ExecutionPolicy Bypass -File $p
```

### macOS/Linux

```bash
curl -fsSL https://raw.githubusercontent.com/chochanyeon/harness/main/scripts/update-harness.sh | sh
```

component별 업데이트:

```bash
# workflow만 업데이트
curl -fsSL https://raw.githubusercontent.com/chochanyeon/harness/main/scripts/update-harness.sh | sh -s -- --component workflow

# memory만 업데이트
curl -fsSL https://raw.githubusercontent.com/chochanyeon/harness/main/scripts/update-harness.sh | sh -s -- --component memory
```

업데이트는 upstream-managed 파일만 덮어씁니다. 프로젝트별 사용자 정의는 `.pi/local/` 또는 `.pi/config/` 아래에 두세요.

## 주요 runtime 명령

### Workflow

```text
/workflow start <title>
/workflow status
/workflow approve
/workflow doctor
/workflow failures
/workflow failures export
/workflow failures report   # alias: /workflow failures improve
/workflow list
/workflow load <id>
/workflow unload
/workflow state <phase>
/workflow skip <gate> <reason>
/workflow abort
/workflow dpaa-audit
```

### Memory

```text
/memory remember <text>
memory_remember({ text })
/memory list
/memory search <query>
/memory show <id>
/memory disable <id>
/memory enable <id>
/memory explain
/memory doctor
/memory stats
/memory feedback <id> helpful|irrelevant|wrong|stale
/memory missed <description>
```

## 개발 repo에서 템플릿 미리보기

```bash
cd target
pi
```

## 최소 검증 명령

```bash
python -m pytest tests/test_workflow_fake_llm_session.py -q
python -m pytest tests/test_harness_consumer_smoke.py -q
python -m pytest tests/test_workflow_reminders.py tests/test_workflow_run_command.py tests/test_code_quality_gate.py tests/test_workflow_tool_policy.py -q
```
