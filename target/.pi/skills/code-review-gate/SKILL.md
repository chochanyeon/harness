---
name: code-review-gate
description: Use as the Pi harness commit-unlock review gate. Run the normal code-review process, count Critical/Major/Minor findings, and always call the submit_review_result tool so the in-memory commit token is created or a failing review is recorded. Output language is Korean.
---

# Code Review Gate (Pi Harness)

Run the same review process as `/skill:code-review`, then always call `submit_review_result` with the exact finding counts. This tool call is the only supported way to create the in-memory commit approval token.

## Output Language

Respond to the user in Korean.

## Required Process

1. Perform the `/skill:code-review` review workflow.
   - Inspect staged and unstaged changes with `git diff --cached` and `git diff`.
   - Review across five dimensions: Correctness, Readability, Architecture, Security, Performance.
   - Report findings in Korean.

2. Count findings by severity.
   - 🔴 Critical Issues section → `critical`
   - 🟡 Major Issues section → `major`
   - 🔵 Minor Issues section → `minor`

3. Always call the tool below after the review is complete.
   ```
   submit_review_result(critical=<N>, major=<N>, minor=<N>)
   ```

## Non-Negotiable Rules

- Do not skip `submit_review_result`.
- The counts must honestly reflect the review result.
- Call the tool even when Critical or Major findings exist; the harness uses the submitted counts to block the commit when needed.
- The token is stored only in process memory and expires after 60 minutes.
- Creating files in the workspace cannot bypass this gate.
