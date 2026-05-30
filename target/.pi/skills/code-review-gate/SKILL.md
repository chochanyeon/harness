---
name: code-review-gate
description: |
  Pi harness용 코드 리뷰 게이트 스킬. /skill:code-review 실행 후 반드시 이 스킬을 연계하거나,
  /skill:code-review 대신 이 스킬을 직접 사용하세요.
  리뷰 완료 후 submit_review_result 도구를 호출하여 커밋 허가 토큰을 발급합니다.
---

# Code Review Gate (Pi Harness)

이 스킬은 `/skill:code-review` 의 리뷰 프로세스를 그대로 수행하되,
완료 후 반드시 `submit_review_result` 도구를 호출하여 커밋 허가 토큰을 발급합니다.

## 실행 순서

1. `/skill:code-review` 의 리뷰 절차를 따라 코드를 분석합니다
   - 변경 파일 확인: `git diff --cached` 및 `git diff`
   - 5가지 차원으로 검토: Correctness, Readability, Architecture, Security, Performance
   - 한국어로 결과 출력

2. 리뷰 완료 후 이슈 수를 집계합니다
   - 🔴 Critical Issues 섹션 → critical 개수
   - 🟡 Major Issues 섹션 → major 개수
   - 🔵 Minor Issues 섹션 → minor 개수

3. **반드시** `submit_review_result` 도구를 호출합니다
   ```
   submit_review_result(critical=<N>, major=<N>, minor=<N>)
   ```
   이 호출로 in-memory 커밋 허가 토큰이 생성됩니다.
   토큰 없이는 git commit이 차단되므로 절대 생략하지 마세요.

## 주의사항

- `submit_review_result` 는 리뷰 결과를 정직하게 반영해야 합니다
- Critical/Major 이슈가 있어도 도구는 호출해야 합니다 (그래야 커밋이 차단됨)
- 토큰 TTL은 60분이며, 이후 재리뷰가 필요합니다
