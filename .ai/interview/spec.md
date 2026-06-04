# Task Spec: INTERVIEW UI Improvements

## Problem
The current workflow `interview` phase presents several questions in chat and effectively expects the user to answer by manually matching numbered items such as `1. 2. 3. 4. 5.`. This is inconvenient because answer mapping is manual, progress is unclear, and the user cannot easily preview the answers collected so far.

Pi extensions provide UI APIs such as `ctx.ui.custom()`, `ctx.ui.setWidget()`, `ctx.ui.setStatus()`, and `ctx.ui.setEditorText()`, so the workflow extension can improve the interview experience with a guided wizard and clearer workflow phase status.

## Acceptance Criteria
- [ ] When `/workflow start <goal>` starts a workflow in the `interview` phase, the interview wizard opens automatically when UI is available.
- [ ] The wizard keeps the existing five interview skill questions and improves wording/help text for UI presentation.
- [ ] The wizard presents one question at a time.
- [ ] Most questions provide choices, and users can combine selected choices with free-text input.
- [ ] Optional questions support `unknown/skip`; required questions cannot advance without an answer or explicit valid selection.
- [ ] Users can answer questions without manually entering numbered responses.
- [ ] A progress widget above the editor shows the current question, completed questions, and remaining questions.
- [ ] The footer status shows workflow title, current phase, next phase, and overall phase progress.
- [ ] Users can open an answer-summary preview during the interview with a key command.
- [ ] An answer-summary preview is shown automatically after the final question.
- [ ] The preview shows only the collected answer summary and does not include full generated spec/plan drafts.
- [ ] If the wizard is cancelled or no UI is available, the existing chat-based interview flow remains usable.
- [ ] Existing workflow phase ordering and approval gate behavior remain unchanged.

## Constraints
- The deployed harness source is under `target/.pi/`; implementation changes must target `target/.pi/extensions/**`.
- Editing extension files requires explicit interactive user approval during implementation.
- Preserve the workflow phase order: `interview → plan → plan_review → implement → code_review → review_approved → document → commit → push → done`.
- Use Pi extension UI APIs only.
- Do not change DPAA, code review, or push gate semantics.
- Non-UI modes must use a non-fatal fallback.
- Keep `README.md` and `README.en.md` synchronized.

## In Scope
Automatic interview wizard, choices plus free-text input, optional-question skip, progress widget, footer phase status, answer-summary preview, and README synchronization.

## Out of Scope
Editing full spec/plan documents inside the wizard, a complex form builder, changing workflow phase order, changing gate policies, editing theme files, or external integrations.

## Expected Affected Files
- `target/.pi/extensions/workflow.ts`
- `target/.pi/extensions/workflow/ui.ts` or new `target/.pi/extensions/workflow/interview-ui.ts`
- `target/.pi/extensions/workflow/format.ts` or related formatter
- `README.md`
- `README.en.md`

## Risks
Custom TUI keyboard/IME complexity, duplicate automatic wizard and chat continuation messages, and UI assumptions in non-UI modes.
