---
name: push-with-review
description: Required workflow before any push. ALWAYS use this skill when the user says "push해줘", "푸시해줘", "push 갑시다", "push it", "commit and push", or mentions pushing code to remote. Never run git push directly — this skill ensures code review, documentation, scope validation, and proper commit gates are applied first. Runs in order — code review → document → commit → push. Output language is Korean; skill instructions are English.
---

# Push with Review Skill

Complete the full flow from commit to push in order. Do not skip any step.

> **출력 언어**: 모든 응답과 최종 리포트는 한국어로 작성합니다.

## Branch Detection

```bash
git branch --show-current
```

- `feat/*` or `feature/*` → **Full workflow** (Steps 1–4)
- `fix/*`, `hotfix/*`, `chore/*`, etc. → **Lite workflow** (Steps 1–3)
- `main`, `master`, `dev` direct push → **Abort and warn the user**

## Scope Validation Process (CRITICAL)

**Before committing on ANY branch, verify that staged changes align with the branch's original context.**

### Step 1: Check branch context

```bash
git branch --show-current
git log origin/dev..HEAD --oneline
```

### Step 2: Compare staged changes against branch context

- Does the current work match the branch name? (e.g., `feat/oauth` should be OAuth-related)
- Are the staged changes addressing the same concern as existing commits on this branch?

### Step 3: If scope mismatch detected

**⚠️ STOP and warn the user strongly:**

```
⚠️ **SCOPE MISMATCH DETECTED**

현재 브랜치: <branch-name>
기존 작업: <summary of existing commits>

현재 변경사항: <summary of staged changes>

→ 이 변경사항은 브랜치의 원래 목적과 다릅니다.

**권장 조치:**
1. 서브 브랜치를 생성하여 분리 작업
   `git stash`
   `git checkout -b <new-branch-name>`
   `git stash pop`
   
2. 현재 브랜치에 그대로 커밋 (비권장)
   - MR에 코멘트로 범위 외 작업 포함됨을 명시

어떻게 진행하시겠습니까?
```

Wait for explicit user decision before proceeding.

---

## Full Workflow (feat/* branches)

### Step 1: Code Review

Run the `/code-review` skill.

- Review target: `git diff` (uncommitted changes)
- If Critical or Major issues are found, report to the user and confirm whether to fix before proceeding
- Minor and below: report only, then continue

### Step 2: Feature Documentation

Run the `/document-feature` skill.

- Creates `docs/feat/<feature-name>.md`
- Updates `docs/feat/INDEX.md`
- Renders `docs/feat/html/<feature-name>.html` and updates `docs/feat/html/index.html`
- Confirm completion before proceeding

### Step 3: Scope Validation

Apply the **Scope Validation Process** defined above.

### Step 4: Commit

Summarize all changes (code + docs/feat/) and propose a commit message.

- After user approval, commit:
  ```bash
  git add <files>
  git commit -m "<message>"
  ```
  (`docs/feat/html/` 파일이 포함된 경우 `prepare-commit-msg` 훅이 artifact URL을 자동 추가)
- If changes should be split into multiple commits, confirm with the user first.

### Step 5: Push

Push to remote:

```bash
git push -u origin <branch>
```

**If git push fails** (non-fast-forward, network error, permission denied, etc.):

1. **STOP immediately** — do NOT retry automatically
2. Analyze the error and present the cause to the user
3. Present options (e.g., "rebase 필요합니다", "pull --rebase 후 재시도", "force push (위험)")
4. **Wait for explicit user approval** before any action
5. Only after approval, run the approved command (e.g., git pull --rebase, git push --force)

**NEVER:**
- Retry git push automatically
- Run destructive commands (pull --rebase, push --force) without approval

Final report after push:
```
✓ 코드 리뷰 완료 (Critical: 0, Major: N, Minor: N)
✓ docs/feat/<name>.md 문서화 완료
✓ 커밋 완료
✓ Push 완료 → origin/<branch>
```

## Lite Workflow (non-feat/* branches)

### Step 1: Code Review

Run the `/code-review` skill. (Scope: changed files only)

### Step 2: Scope Validation

Apply the **Scope Validation Process** defined above.

### Step 3: Commit

Check for uncommitted changes → propose commit message → after user approval:

```bash
git add <files>
git commit -m "<message>"
```

### Step 4: Push

```bash
git push -u origin <branch>
```

**If git push fails**: Follow the same failure handling protocol as Full Workflow Step 5 (STOP → present options → wait for user approval).

## Rules

- **Scope Validation is MANDATORY** — never skip checking whether staged changes match the branch's original purpose
- If scope mismatch is detected, STOP and wait for user decision (sub-branch vs. continue)
- Commit message must be approved by the user before running (per CLAUDE.md Git Commit Protocol)
- Push only after code review is complete
- `git push --force` only when explicitly requested by the user; never on `main` or `dev`
- Step order cannot be changed
- **No autonomous retry** — never automatically retry failed git commands; always wait for user decision
