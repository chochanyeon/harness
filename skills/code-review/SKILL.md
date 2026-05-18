---
name: code-review
description: Perform comprehensive pre-commit code reviews for Java/Spring Boot projects. Use this skill before any commit, when the user says "review", "check this code", "is this ready to commit", "코드 리뷰", "리뷰해줘", "커밋 전에 봐줘", "이거 괜찮아?", or as part of push-with-review workflow. Even simple changes benefit from review — use liberally. Analyzes code quality, potential bugs, performance issues, naming conventions, test coverage, and provides prioritized feedback. Output language is Korean; skill instructions are English.
---

# Code Review Skill

Perform thorough pre-commit code reviews focusing on code quality, bug detection, performance, naming conventions, and test coverage.

> **출력 언어**: 모든 리뷰 결과와 피드백은 한국어로 작성합니다. 스킬 설명은 영어입니다.

## Reviewer Perspective

Review as a **senior engineer on the DevCenter team** who:
- Knows the project's ADR-0001 architecture and team conventions
- Values pragmatism over perfection (working code > theoretical purity)
- Focuses on bugs and architectural issues, not style preferences
- Gives actionable feedback with concrete fix suggestions
- Respects the "Surgical Changes" principle (only review changed code)

## Review Process

Follow this workflow for every code review request:

1. **Identify the target**: Determine what code to review (files, directories, or git diff)
2. **Load project context**: 
   - For Java/Spring Boot: read `references/java-checklist.md` before analysis — without it, you'll flag Jackson/JPA fields as "unused" and miss ADR-0001 violations specific to this codebase
3. **Read the code**: Use appropriate tools to read file contents
4. **Analyze by language**: Apply language-specific checklist from references
5. **Generate report**: Provide prioritized findings with clear explanations

## Diff-Aware Review

- **Focus on changed lines**, not pre-existing code
- Only flag pre-existing issues if they interact with the changed code
- Never suggest "while you're here" improvements to adjacent code
- This aligns with the project's "Surgical Changes" principle (CLAUDE.md)

## Review Scope

### What to Review

- Code quality and readability
- Potential bugs and logic errors
- Performance issues and anti-patterns
- Naming conventions and code style
- Test coverage and test quality
- Design patterns and architecture

### Diff Size Limits

**Recommended limits for effective review:**
- **Ideal**: 1-5 files, <300 lines changed
- **Good**: 6-10 files, 300-500 lines changed
- **Maximum**: 15 files, <1000 lines changed

**If diff exceeds maximum:**
- Ask user to split into smaller commits/PRs
- Review high-impact files first (controllers, services)
- Focus on critical issues only (logic errors, security)

**Tip**: Large diffs (>500 lines) reduce review effectiveness. Smaller, focused changes catch more bugs.

### What NOT to Review

- Infrastructure configurations (Terraform, Kubernetes YAML)
- Build scripts (unless specifically requested)
- Pre-existing code not touched in this diff

## Language-Specific Guidelines

**Java/Spring Boot (DevCenter):**
- Read `references/java-checklist.md` before analysis — it has DevCenter-specific patterns (ADR-0001 rules, reflection-used fields, framework conventions) that generic review misses
- Without it: Jackson/JPA fields get flagged as "unused", ADR-0001 layer violations go undetected, project scoring criteria are ignored

## Specialized Review Perspectives

For focused or in-depth reviews, load additional perspective-specific checklists:

**Security Review** (OWASP Top 10, authentication, authorization):
- Read `references/security-checklist.md`
- Use when: Pre-release security audit, authentication changes, sensitive data handling

**Performance Review** (N+1 queries, algorithm complexity, caching):
- Read `references/performance-checklist.md`
- Use when: API response time > 500ms, large dataset changes, optimization needed

**Architecture Review** (ADR-0001 compliance, layer separation, domain model):
- Read `references/architecture-checklist.md`
- Use when: New feature design, refactoring, cross-cutting concerns

**Testing Review** (TDD compliance, coverage quality, test structure):
- Read `references/testing-checklist.md`
- Use when: Reviewing test code, coverage below threshold, flaky tests

**When to use specialized checklists:**
- **General commit review**: `java-checklist.md` only (comprehensive baseline)
- **Release audit**: All 4 specialized checklists
- **Specific concern**: Load relevant checklist (e.g., performance-checklist.md for slow API)

**How to combine:**
```
1. Always load java-checklist.md (baseline + project context)
2. Add specialized checklists as needed
3. Aggregate findings by severity (Critical/Major/Minor)
4. Report perspective-specific issues in separate sections
```

## Output Format

**IMPORTANT**: All output must be in Korean. Structure review feedback as follows:

```
# 코드 리뷰 결과

**리뷰 대상**: [파일 목록]
**언어**: [Java/Go]

## 🔴 Critical Issues (커밋 전 필수 수정)
[버그, 크래시, 심각한 문제를 일으킬 이슈들]

## 🟡 Major Issues (수정 권장)
[코드 품질, 유지보수성, 성능에 영향을 주는 이슈들]

## 🔵 Minor Issues (개선 고려)
[스타일 이슈, 작은 개선사항, 제안]

## ✅ 긍정적 관찰사항
[잘 작성된 부분, 좋은 패턴]

## 📝 종합 평가
[간단한 요약 및 권장사항: 커밋 가능 / 수정 필요 / 대폭 수정 필요]
```

## Priority Definitions

- **🔴 Critical**: Logic errors, null pointer risks, resource leaks, race conditions, incorrect API usage
- **🟡 Major**: Poor naming, code duplication, missing error handling, performance issues, missing tests
- **🔵 Minor**: Formatting, minor style inconsistencies, better alternatives, documentation suggestions

## Example Usage

User: "Review this file before I commit"
→ Read the file, identify language, apply checklist, generate report

User: "Review my recent changes"
→ Use git diff to see changes, review only modified code

User: "Check if this code is ready to commit"
→ Full review with commit readiness assessment

## Tips

- Focus on substance over style unless style severely impacts readability
- Provide concrete examples for suggested improvements
- Explain WHY something is an issue, not just WHAT
- Balance criticism with positive feedback
- Consider project context (backend API vs library vs script)

## Review Result Artifact (Enforcement)

After generating the Korean review report, write a result file for commit enforcement. The commit hook reads this file — if it's missing or expired, the commit is blocked.

This file is consumed by `guard-code-review.sh`.

**Location:** `.claude/review-result.json`

**Instructions:**

1. Count the exact number of issues by severity from your review output:
   - Critical: 🔴 Critical Issues section
   - Major: 🟡 Major Issues section
   - Minor: 🔵 Minor Issues section

2. Write the JSON file:
   ```bash
   cat > .claude/review-result.json <<EOF
   {
     "critical": <count>,
     "major": <count>,
     "minor": <count>,
     "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
   }
   EOF
   ```

**Example:**
If your review found:
- 🔴 Critical: 0개
- 🟡 Major: 2개
- 🔵 Minor: 5개

Write:
```json
{
  "critical": 0,
  "major": 2,
  "minor": 5,
  "timestamp": "2026-05-15T10:30:00Z"
}
```

**Enforcement criteria (from personas/reviewer/AGENTS.md):**
- ✅ Approve: Critical == 0 AND Major <= 2
- ⚠️ Request Changes: Critical >= 1 OR Major >= 3

**Always write this file**, even when the review passes. The commit hook validates and deletes it after use.
