# 작업 명세: INTERVIEW UI 개선

## 문제
현재 workflow의 `interview` 단계는 여러 질문을 채팅으로 한 번에 제시하고, 사용자가 `1. 2. 3. 4. 5.`처럼 직접 번호를 맞춰 답변해야 한다. 이 방식은 답변 매핑이 번거롭고, 진행 상태와 지금까지의 답변 요약을 확인하기 어렵다.

Pi extension은 `ctx.ui.custom()`, `ctx.ui.setWidget()`, `ctx.ui.setStatus()`, `ctx.ui.setEditorText()` 등 UI API를 제공하므로 workflow extension 안에서 interview wizard와 workflow phase 상태 표시를 개선할 수 있다.

## 완료 기준
- [ ] `/workflow start <목표>`로 workflow가 `interview` phase에서 시작되면 UI 가능 환경에서 interview wizard가 자동 표시된다.
- [ ] Wizard는 기존 interview skill의 기본 5개 질문을 유지하되, UI에 맞게 문구와 도움말을 개선해 질문을 하나씩 표시한다.
- [ ] 가능한 대부분의 질문은 선택지를 제공하고, 사용자는 선택지와 자유입력을 함께 사용할 수 있다.
- [ ] 선택 질문은 `모름/건너뛰기`가 가능하지만, 필수 질문은 답변 또는 명시적 선택 없이 다음으로 진행할 수 없다.
- [ ] 사용자는 번호를 직접 입력하지 않고 각 질문에 답변할 수 있다.
- [ ] Editor 위 progress widget은 현재 질문, 완료된 질문, 남은 질문을 표시한다.
- [ ] Footer status는 workflow title, 현재 phase, 다음 phase, 전체 phase progress를 표시한다.
- [ ] 사용자는 인터뷰 도중 키 입력으로 지금까지의 답변 요약 preview를 볼 수 있다.
- [ ] 마지막 질문 후 답변 요약 preview가 자동으로 표시된다.
- [ ] Preview는 지금까지의 답변 요약만 표시하며 spec/plan 전체 초안 미리보기는 포함하지 않는다.
- [ ] Wizard 취소 또는 비 UI 모드에서는 기존 채팅 기반 interview 흐름이 계속 사용 가능하다.
- [ ] 기존 workflow phase 순서와 approval gate 동작은 변경하지 않는다.

## 제약사항
- 배포 단위는 `target/.pi/`이므로 실제 구현은 `target/.pi/extensions/**`를 대상으로 한다.
- extension 파일 수정은 implement 단계에서 explicit interactive user approval 정책을 따른다.
- 기존 phase 순서(`interview → plan → plan_review → implement → code_review → review_approved → document → commit → push → done`)를 유지한다.
- UI 개선은 Pi extension API만 사용한다.
- DPAA/code review/push gate semantics는 변경하지 않는다.
- UI가 없는 모드에서는 non-fatal fallback을 사용한다.
- README.md와 README.en.md를 동기화한다.

## 범위
포함: interview wizard 자동 표시, 선택지+자유입력, 선택 질문 skip, progress widget, footer phase status, 답변 요약 preview, README 동기화.

범위 외: wizard 안에서 spec/plan 전체 편집, 복잡한 form builder, phase 순서 변경, gate 정책 변경, 테마 파일 수정, 외부 서비스 연동.

## 예상 영향 파일
- `target/.pi/extensions/workflow.ts`
- `target/.pi/extensions/workflow/ui.ts` 또는 신규 `target/.pi/extensions/workflow/interview-ui.ts`
- `target/.pi/extensions/workflow/format.ts` 또는 관련 formatter
- `README.md`
- `README.en.md`

## 위험
- Custom TUI keyboard/IME 처리 복잡도
- 자동 wizard와 기존 chat continuation 메시지 중복 가능성
- 비 UI 모드에서 UI 가정으로 오류가 날 가능성
