# 구현 계획: INTERVIEW UI 개선

## 접근 방식
Pi workflow extension에 interview wizard 진입점을 추가한다. `/workflow start <목표>`가 `interview` phase workflow를 생성한 뒤 `ctx.hasUI === true`인 경우에만 UI launcher를 호출한다. 취소 또는 오류 시 workflow phase를 바꾸지 않고 기존 채팅 기반 interview 흐름으로 돌아간다.

Wizard는 5개 질문 record를 사용한다. 각 record는 `id`, `title`, `prompt`, `helpText`, `required`, `choices`, `allowFreeText`, `allowSkip`을 가진다. UI는 활성 질문 1개, 선택 choice label, 자유입력 영역, navigation hint, validation error를 렌더링한다. Preview는 수집된 답변 요약만 렌더링한다.

## 단계
1. **현재 workflow UI 구조 확인** — `target/.pi/extensions/workflow.ts`, `target/.pi/extensions/workflow/ui.ts`, `target/.pi/extensions/workflow/format.ts`
   - `/workflow start` 성공 branch와 기존 `refreshBoard` / `refreshStatus` 호출 위치를 찾는다.
   - 현재 `interview` phase chat continuation 메시지 생성 위치를 찾는다.
   - Workflow 생성 후 continuation 메시지 queue 이전에 UI-only launcher를 실행할 정확한 삽입점을 기록한다.

2. **Interview 질문 모델 정의** — `target/.pi/extensions/workflow/interview-ui.ts`
   - 기존 interview skill 주제인 범위, 동기, 완료 기준, 영향 파일/모듈, 제약/위험과 일치하는 5개 record의 `DEFAULT_INTERVIEW_QUESTIONS` 배열을 export한다.
   - 범위, 동기, 완료 기준은 `required: true`로 정의한다.
   - 영향 파일/모듈과 제약/위험은 `required: false`, `allowSkip: true`로 정의한다.
   - Free-text-only가 명시적으로 필요한 질문을 제외하고 각 질문에 최소 3개 choice label을 추가한다.

3. **Wizard 상태와 validation 구현** — `target/.pi/extensions/workflow/interview-ui.ts`
   - 답변은 `{ questionId, selectedChoiceIds, freeText, skipped }` 형태로 저장한다.
   - 필수 질문에서 선택 choice가 없고 trimmed free text도 비어 있으면 `Next`를 차단한다.
   - `Skip`은 `allowSkip === true`일 때만 허용하고, skipped answer는 `skipped: true`로 저장한다.
   - 이전/다음 이동 시 기존 입력값을 보존한다.

4. **Wizard TUI component 구현** — `target/.pi/extensions/workflow/interview-ui.ts`
   - `ctx.ui.custom()`으로 활성 질문 1개를 렌더링하는 component를 만든다.
   - 이전, 다음, 취소, preview, choice 선택, 자유입력 편집 key handling을 제공한다.
   - 자유입력 영역은 한국어 IME 안정성을 위해 Pi TUI 내장 Input/Editor 호환 동작을 사용한다.
   - 마지막 질문 validation 통과 후 final preview 확인이 끝난 경우에만 completed answer summary를 반환한다.

5. **Interview progress widget 연결** — `target/.pi/extensions/workflow.ts`, `target/.pi/extensions/workflow/interview-ui.ts`
   - Wizard가 열린 동안 editor 위 widget을 설정한다.
   - 5개 row를 렌더링하고 current는 `>`, answered/skipped는 `✓`, pending은 `○` marker를 사용한다.
   - Wizard 완료, 취소, throw 시 widget을 clear한다.

6. **Workflow footer phase status 갱신** — `target/.pi/extensions/workflow.ts` 또는 `target/.pi/extensions/workflow/format.ts`
   - Footer status를 `Workflow: <title> | phase: <current> → <next> | progress: <index>/<total>` 형식으로 만든다.
   - `<index>`는 `WORKFLOW_PHASES.indexOf(currentPhase) + 1`, `<total>`은 `WORKFLOW_PHASES.length`로 계산한다.
   - 기존 gate-state text는 같은 status string 또는 두 번째 status key로 유지해 phase progress와 gate state가 모두 보이게 한다.

7. **`/workflow start` 자동 wizard 실행 연결** — `target/.pi/extensions/workflow.ts`
   - Workflow 생성 후 `state.workflow.phase === "interview"`이고 `ctx.hasUI === true`이면 launcher를 호출한다.
   - Launcher 호출은 `try/catch`로 감싸고 오류 시 `ctx.ui.notify()` warning을 표시한 뒤 기존 chat guidance를 계속 사용한다.
   - 취소 시 workflow state를 변경하지 않고 기존 chat guidance를 계속 사용한다.

8. **답변 요약 preview 구현** — `target/.pi/extensions/workflow/interview-ui.ts`
   - 각 질문 title, 선택 choice label, free-text value, skipped state를 preview row로 렌더링한다.
   - Wizard 중 preview key와 마지막 질문 이후 자동 preview가 같은 preview renderer를 사용한다.
   - Preview에는 spec 또는 plan draft content를 렌더링하지 않는다.

9. **문서 업데이트** — `README.md`, `README.en.md`
   - 자동 실행 조건, required/optional 질문 동작, progress widget, footer phase status, preview, non-UI fallback을 추가한다.
   - 한국어/영어 README의 설명을 동등하게 유지한다.

## 테스트 전략
- `/workflow start "INTERVIEW UI 개선"` 실행 후 interactive UI session에서 wizard가 자동 표시되는지 확인한다.
- 5개 질문 각각에서 choice 1개 이상 선택 및 free text 입력 후 preview에 두 값이 모두 표시되는지 확인한다.
- 3개 필수 질문에서 choice 없이 blank free text 상태로 `Next`를 시도해 validation message와 함께 이동이 차단되는지 확인한다.
- 2개 선택 질문에서 `Skip`을 사용하고 preview에 skipped로 표시되는지 확인한다.
- 답변 입력 후 이전으로 이동했다가 돌아왔을 때 choice와 free text가 보존되는지 확인한다.
- Progress widget이 정확히 5개 row를 표시하고 navigation 변화에 따라 `>`, `✓`, `○` marker가 갱신되는지 확인한다.
- Interview phase footer가 workflow title, current phase, next phase, `1/10` progress를 포함하는지 확인한다.
- Wizard 중 preview key를 눌러 answer-summary row만 표시되는지 확인한다.
- 마지막 질문 완료 후 completion 반환 전에 자동 preview가 표시되는지 확인한다.
- Wizard 취소 후 workflow가 `interview` phase에 남고 chat 기반 guidance가 사용 가능한지 확인한다.
- Non-UI 또는 guarded fallback path에서 exception이 발생하지 않는지 확인한다.
- `target/.pi/extensions/workflow.ts`와 신규 UI module에 대해 사용 가능한 최소 TypeScript 또는 extension-loading 검증을 실행한다.

## 에스컬레이션 포인트
- Pi TUI 내장 input/editor 동작으로 choice와 free text를 한 component에 결합할 때 IME regression이 발생하면 MVP를 staged `ctx.ui.editor()` 흐름으로 바꿀지 확인한다.
- 자동 wizard와 chat continuation이 화면에서 중복 prompt를 만들면 continuation 메시지를 suppress/shorten/keep 중 무엇으로 할지 확인한다.
- Footer text가 gate state 포함 후 너비를 초과하면 phase progress와 gate status 중 우선 표시 항목을 확인한다.

## 위험 및 완화
- **키 입력/IME 복잡도**: 자유입력은 내장 Input/Editor 호환 동작을 사용하고 custom cursor logic을 최소화한다.
- **Workflow 충돌**: Wizard output을 UI data로 제한하고 workflow phase machine/gate check를 변경하지 않는다.
- **비 UI 모드 오류**: `ctx.hasUI` guard와 try/catch fallback을 유지한다.
- **문서 누락**: README.md와 README.en.md를 같은 구현 change에서 함께 업데이트한다.
