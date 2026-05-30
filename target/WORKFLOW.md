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
③ planning-and-task-breakdown  TaskCreate로 슬라이스 분해    —
④ context-engineering          관련 코드 파악                —
⑤ incremental-implementation
   ├ architecture-sensitive    Entity·Controller·Gradle 수정 ⚠ persona-inject.sh
   └ test-driven-development   테스트 먼저 작성              📋 CLAUDE.md 지침
⑥ code-review-and-quality      /code-review                  🔒 guard-skill-prereqs.sh
⑦ documentation-and-adrs       /document-feature             ⚠ validate-feat-html/index
⑧ git-workflow-and-versioning  git commit                    🔒 commit-message + code-review + static-analysis
⑨ shipping-and-launch          /push-with-review             —  (스킬 호출 = 승인)
```

🔒 차단(deny)   ⚠ 경고(advisory)   📋 지침(guideline)

---

## 3. fix/*, hotfix/* — Bug Fix (Abbreviated)

```
superpowers Phase               Action                        Gate
──────────────────────────────────────────────────────────────────────
① debugging-and-error-recovery 버그 재현 테스트 작성         📋 CLAUDE.md 지침
② incremental-implementation   최소 수정                     —
③ code-review-and-quality      /code-review                  🔒 guard-skill-prereqs.sh
④ git-workflow-and-versioning  git commit                    🔒 commit-message + code-review + static-analysis
⑤ shipping-and-launch          /push-with-review (lite)      —  (스킬 호출 = 승인)
```

---

## 4. refactor/* — Refactor (Quality-Focused)

```
superpowers Phase               Action                        Gate
──────────────────────────────────────────────────────────────────────
① pre-check                    기존 테스트 통과 확인 (수동)  —
② incremental-implementation   구조 개선, 기능 변경 없음     —
③ code-review-and-quality      /code-review                  🔒 guard-skill-prereqs.sh
④ git-workflow-and-versioning  git commit                    🔒 commit-message + code-review + static-analysis
⑤ shipping-and-launch          /push-with-review (lite)      —  (스킬 호출 = 승인)
```

---

## 5. chore/* — Chore (Minimal)

```
superpowers Phase               Action                        Gate
──────────────────────────────────────────────────────────────────────
① implementation                설정·의존성 변경              —
② git-workflow-and-versioning   git commit                    🔒 commit-message + static-analysis (Java 변경 시)
③ shipping-and-launch           git push                      —
```

Java production 코드 변경이 없으면 code-review 게이트는 자동 통과합니다.

---

## 6. docs/* — Documentation (Docs-only)

```
superpowers Phase               Action                        Gate
──────────────────────────────────────────────────────────────────────
① documentation-and-adrs       /document-feature             ⚠ validate-feat-html/index
② git-workflow-and-versioning  git commit                    🔒 commit-message
③ shipping-and-launch          git push                      —
```

Java production 코드 변경이 없으면 code-review 및 static-analysis 게이트는 자동 통과합니다.

---

## 7. 게이트 빠른 참조

### Final-Stage Gates (deny — 커밋 시점)

| 게이트 | 차단 조건 | 해제 방법 |
|--------|----------|----------|
| `guard-commit-message.sh` | Conventional Commits 형식 위반 | 메시지 형식 수정 |
| `guard-code-review.sh` | 리뷰 결과 없이 `git commit` (Java 변경 시) | `/code-review` 실행 후 재시도 |
| `guard-static-analysis.sh` | Checkstyle·PMD 위반 (Java 변경 시) | 위반 수정 |

### Advisory Hooks

| 훅 | 역할 |
|-----|------|
| `guard-skill-prereqs.sh` | 변경없이 `/code-review` 시도 시 deny |
| `validate-feat-html.js` | HTML 구조 검증 후 수정 안내 |
| `validate-feat-index.js` | INDEX.md 누락 시 안내 |

### 지침화된 항목 (기존 hook → CLAUDE.md 지침)

| 항목 | 검증 위치 |
|------|----------|
| TDD (test-first) | 코드리뷰에서 테스트 누락 검증 |
| 커버리지 | CI/CD에서 JaCoCo 검증 |
| 문서화 | push-with-review 스킬에서 강제 |

---

## 8. 하네스 구성 요소 전체 맵

| 구성 요소                  | 유형  | 이벤트                   | 대상 파일                     | lifecycle 단계             |
|----------------------------|-------|--------------------------|-------------------------------|----------------------------|
### Final-Stage Gates

| 구성 요소 | 이벤트 | 대상 | lifecycle |
|---------|--------|------|----------|
| `guard-commit-message.sh` | PreToolUse / Bash | `git commit` | Commit Format |
| `guard-code-review.sh` | PreToolUse / Bash | `git commit` (Java 변경 시) | Code Review |
| `guard-static-analysis.sh` | PreToolUse / Bash | `git commit` (Java 변경 시) | Static Analysis |

### Advisory Hooks

| 구성 요소 | 이벤트 | 대상 | lifecycle |
|---------|--------|------|----------|
| `session-start-context.sh` | SessionStart | — | Context Injection |
| `persona-inject.sh` | PreToolUse / Write,Edit | Entity·Security·Gradle | Governance |
| `pre-commit-context.sh` | PreToolUse / Bash | `git commit` | Context Injection |
| `guard-skill-prereqs.sh` | PreToolUse / Skill | `/code-review` | 전처리 |
| `guard-settings.sh` | PreToolUse / Write,Edit | `.claude/settings.json` | Security |
| `guard-settings-bash.sh` | PreToolUse / Bash | `.claude/` 수정 | Security |
| `validate-feat-html.js` | PostToolUse / Write | `docs/feat/html/*.html` | Documentation |
| `validate-feat-index.js` | PostToolUse / Write | `docs/feat/html/index.html` | Documentation |
| `post-tool-use-memory.js` | PostToolUse / Write,Edit | 모든 파일 | Memory |
| `session-stop-report.sh` | Stop | — | Session Report |

### Skills

| 구성 요소 | 대상 | lifecycle |
|---------|------|----------|
| `/code-review` | 변경 파일 | Code Review & Quality |
| `/document-feature` | — | Documentation & ADRs |
| `/push-with-review` | — | Shipping & Launch |
| `/render-docs` | `docs/feat/*.md` | Documentation |
