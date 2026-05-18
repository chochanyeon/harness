# DevCenter Harness — Workflow Guide

> superpowers lifecycle을 DevCenter 하네스(hooks + skills)로 구현한 운영 가이드.
> 브랜치 유형에 따른 flow를 따르면 품질·절차·문서화가 자동 강제됩니다.

---

## 1. Task 유형 선택

**Task 유형은 사용자 프롬프트의 맥락에서 판단합니다.**
브랜치 패턴은 판단된 유형을 반영하는 네이밍 컨벤션이며, hook이 enforcement 신호로 사용합니다.

```
사용자 프롬프트 맥락 분석
    → Claude가 task 유형 판단
        → 브랜치 네이밍 컨벤션 적용 (feat/*, fix/*, ...)
            → hook이 브랜치 패턴을 enforcement 프록시로 사용
```

| 프롬프트 자연어 신호                          | 유형          | 브랜치 컨벤션       | Workflow                              |
|-----------------------------------------------|---------------|---------------------|---------------------------------------|
| "새 기능 추가", "~을 구현해줘", "feature"     | Feature       | `feat/*`            | [Full Lifecycle](#2-feat--feature)    |
| "버그 수정", "~이 안 돼", "고쳐줘", "fix"    | Bug Fix       | `fix/*`, `hotfix/*` | [Abbreviated](#3-fix-hotfix--bug-fix) |
| "리팩토링", "구조 개선", "기능 변경 없이"    | Refactor      | `refactor/*`        | [Quality-focused](#4-refactor--refactor) |
| "설정 변경", "의존성 업데이트", "빌드 스크립트" | Chore      | `chore/*`           | [Minimal](#5-chore--chore)            |
| "문서 작성", "docs", "README 수정"            | Documentation | `docs/*`            | [Docs-only](#6-docs--documentation)  |

---

## 2. feat/* — Feature (Full Lifecycle)

```
superpowers Phase               Action                        Gate
──────────────────────────────────────────────────────────────────────
① idea-refine (optional)       아이디어 구체화               —
② spec-driven-development      인수 기준 정의                —
③ planning-and-task-breakdown  TaskCreate로 슬라이스 분해    ⚠ commit 시 plan 경고
④ context-engineering          관련 코드 파악                —
⑤ incremental-implementation
   ├ architecture-sensitive    Entity·Controller·Gradle 수정 ⚠ guard-persona-reminder.sh
   ├ test-driven-development   테스트 먼저 작성 (신규 파일)  🔒 guard-test-first.sh
   └ quality-gate              핵심 코드·스타일·PMD 검사     🔒 code-guardrail.js
⑥ code-review-and-quality      /code-review                  🔒 guard-skill-prereqs.sh
⑦ documentation-and-adrs       /document-feature             🔒 validate-feat-html/index
⑧ git-workflow-and-versioning  git commit                    🔒 guard-code-review.sh
⑨ shipping-and-launch          /push-with-review             —  (스킬 호출 = 승인)
```

🔒 차단(block)   ⚠ 경고(advisory)

---

## 3. fix/*, hotfix/* — Bug Fix (Abbreviated)

```
superpowers Phase               Action                        Gate
──────────────────────────────────────────────────────────────────────
① debugging-and-error-recovery 버그 재현 테스트 작성         🔒 guard-test-first.sh
② incremental-implementation   최소 수정                     🔒 code-guardrail.js
③ code-review-and-quality      /code-review                  🔒 guard-skill-prereqs.sh
④ git-workflow-and-versioning  git commit                    🔒 guard-code-review.sh
⑤ shipping-and-launch          /push-with-review (lite)      —  (스킬 호출 = 승인)
```

---

## 4. refactor/* — Refactor (Quality-Focused)

```
superpowers Phase               Action                        Gate
──────────────────────────────────────────────────────────────────────
① pre-check                    기존 테스트 통과 확인 (수동)  —
② incremental-implementation   구조 개선, 기능 변경 없음     🔒 code-guardrail.js
③ code-review-and-quality      /code-review                  🔒 guard-skill-prereqs.sh
④ git-workflow-and-versioning  git commit                    🔒 guard-code-review.sh
⑤ shipping-and-launch          /push-with-review (lite)      —  (스킬 호출 = 승인)
```

---

## 5. chore/* — Chore (Minimal)

```
superpowers Phase               Action                        Gate
──────────────────────────────────────────────────────────────────────
① implementation                설정·의존성 변경              🔒 code-guardrail.js (if .java)
② git-workflow-and-versioning   git commit                    🔒 guard-code-review.sh
③ shipping-and-launch           git push                      —
```

---

## 6. docs/* — Documentation (Docs-only)

```
superpowers Phase               Action                        Gate
──────────────────────────────────────────────────────────────────────
① documentation-and-adrs       /document-feature             🔒 validate-feat-html/index
② git-workflow-and-versioning  git commit                    🔒 guard-code-review.sh
③ shipping-and-launch          git push                      —
```

---

## 7. 게이트 빠른 참조

| 게이트                     | 차단 조건                               | 해제 방법                                          |
|----------------------------|-----------------------------------------|----------------------------------------------------|
| `guard-test-first.sh`      | 테스트 없이 신규 `.java` Write          | 테스트 클래스 먼저 작성                            |
| `code-guardrail.js`        | 핵심 코드 삭제 / Checkstyle·PMD 위반   | 수정 또는 `GUARDRAIL_SKIP=1`                       |
| `guard-code-review.sh`     | 리뷰 결과 없이 `git commit`             | `/code-review` 실행 후 재시도                      |
| `guard-static-analysis.sh` | Checkstyle·PMD 위반 시 `git commit`    | 위반 수정 또는 `STATIC_ANALYSIS_SKIP=1`            |
| `guard-coverage.sh`        | 커버리지 임계값 미달 시 `git commit`    | 테스트 추가 또는 `COVERAGE_SKIP=1`                 |
| `guard-skill-prereqs.sh`   | 변경사항 없이 `/code-review`            | 코드 변경 후 재시도                                |
| `validate-feat-html.js`    | HTML 구조 이상                          | validate 통과 후 재시도                            |
| `validate-feat-index.js`   | INDEX 누락 항목                         | `docs/feat/INDEX.md` 업데이트                      |

### Override 명령

```bash
# 커밋 단건 승인 (10분 유효)
touch ~/.claude/hooks/.commit-gate

# 커밋 세션 승인 (하네스 모드 — 종료 시 rm -f .commit-gate-session)
touch ~/.claude/hooks/.commit-gate-session

# Push 단건 승인 (push-with-review가 자동 생성)
touch ~/.claude/hooks/.push-gate            # 10분 유효

# Guardrail 우회 (대규모 리팩토링 등 의도적 삭제)
GUARDRAIL_SKIP=1                            # 환경변수 방식
touch .claude/.guardrail-skip               # 파일 방식
```

---

## 8. 하네스 구성 요소 전체 맵

| 구성 요소                  | 유형  | 이벤트                   | 대상 파일                     | lifecycle 단계             |
|----------------------------|-------|--------------------------|-------------------------------|----------------------------|
| `guard-test-first.sh`      | Hook  | PreToolUse / Write       | `*.java` (src/main)           | Test-Driven Development    |
| `code-guardrail.js`        | Hook  | PreToolUse / Edit, Write | `*.java`                      | Implementation, Review     |
| `guard-persona-reminder.sh`| Hook  | PreToolUse / Edit, Write | Entity·Controller·Security    | Governance (advisory)      |
| `guard-code-review.sh`     | Hook  | PreToolUse / Bash        | `git commit`                  | Code Review & Quality      |
| `guard-static-analysis.sh` | Hook  | PreToolUse / Bash        | `git commit` (Java 변경 시)   | Static Analysis            |
| `guard-coverage.sh`        | Hook  | PreToolUse / Bash        | `git commit` (Java 변경 시)   | Test Coverage              |
| `guard-doc-gate.sh`        | Hook  | PreToolUse / Bash        | `git commit` (feat/*)         | Documentation              |
| `guard-skill-prereqs.sh`   | Hook  | PreToolUse / Skill       | `/code-review`                | 전처리                     |
| `guard-settings.sh`        | Hook  | PreToolUse / Edit, Write | `.claude/settings.json`       | Security                   |
| `guard-settings-bash.sh`   | Hook  | PreToolUse / Bash        | `.claude/` 수정 시도          | Security                   |
| `validate-feat-html.js`    | Hook  | PostToolUse / Write      | `docs/feat/html/*.html`       | Documentation              |
| `validate-feat-index.js`   | Hook  | PostToolUse / Write      | `docs/feat/html/index.html`   | Documentation              |
| `post-tool-use-memory.js`  | Hook  | PostToolUse / Write,Edit | 모든 파일                     | Memory                     |
| `/code-review`             | Skill | 수동                     | 변경 파일                     | Code Review & Quality      |
| `/document-feature`        | Skill | 수동                     | —                             | Documentation & ADRs       |
| `/push-with-review`        | Skill | 수동                     | —                             | Shipping & Launch          |
| `/render-docs`             | Skill | 수동                     | `docs/feat/*.md`              | Documentation              |
