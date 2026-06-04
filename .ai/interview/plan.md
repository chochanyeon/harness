# Implementation Plan: INTERVIEW UI Improvements

## Approach
Create a deterministic interview wizard entry point in the Pi workflow extension. After `/workflow start <goal>` creates a workflow whose phase is `interview`, call a guarded UI launcher only when `ctx.hasUI === true`. The launcher returns a structured answer object with one entry per interview question; cancellation or runtime errors return control to the existing chat-based interview flow without changing the workflow phase.

The wizard uses five question records. Each record contains `id`, `title`, `prompt`, `helpText`, `required`, `choices`, `allowFreeText`, and `allowSkip`. The UI renders exactly one active question, the selected choice labels, a free-text area, navigation hints, and validation errors. Preview renders only the collected answer summary.

## Steps
1. **Inspect current workflow UI structure** — `target/.pi/extensions/workflow.ts`, `target/.pi/extensions/workflow/ui.ts`, `target/.pi/extensions/workflow/format.ts`
   - Locate the `/workflow start` success branch and existing `refreshBoard` / `refreshStatus` calls.
   - Locate the current chat continuation message generation for `interview` phase.
   - Record the exact insertion point where a UI-only launcher can run after workflow creation and before the continuation message is queued.

2. **Define the interview question model** — `target/.pi/extensions/workflow/interview-ui.ts`
   - Export a `DEFAULT_INTERVIEW_QUESTIONS` array with exactly five records matching the existing interview skill topics: scope, motivation, acceptance criteria, affected files/modules, and constraints/risks.
   - For each record, define `required: true` for scope, motivation, and acceptance criteria; define `required: false` and `allowSkip: true` for affected files/modules and constraints/risks.
   - Add at least three choice labels to each question except where free-text-only is explicitly required by the question model.

3. **Implement wizard state and validation** — `target/.pi/extensions/workflow/interview-ui.ts`
   - Store answers as `{ questionId, selectedChoiceIds, freeText, skipped }`.
   - Block `Next` when a required question has no selected choice and empty trimmed free text.
   - Allow `Skip` only when `allowSkip === true`; skipped answers are stored with `skipped: true`.
   - Preserve previously entered answers when navigating backward and forward.

4. **Implement the wizard TUI component** — `target/.pi/extensions/workflow/interview-ui.ts`
   - Use `ctx.ui.custom()` with a component that renders one active question per screen.
   - Provide keyboard handling for previous, next, cancel, preview, choice selection, and free-text editing.
   - Use Pi TUI built-in Input/Editor-compatible behavior for the free-text area to keep Korean IME behavior stable.
   - Return a completed answer summary only after the final question passes validation and the final preview is confirmed.

5. **Connect the interview progress widget** — `target/.pi/extensions/workflow.ts` and `target/.pi/extensions/workflow/interview-ui.ts`
   - Set an editor-above widget while the wizard is open.
   - Render five rows with markers: `>` for current, `✓` for answered or skipped, and `○` for pending.
   - Clear the widget when the wizard completes, cancels, or throws.

6. **Update workflow footer phase status** — `target/.pi/extensions/workflow.ts` or `target/.pi/extensions/workflow/format.ts`
   - Format footer status as `Workflow: <title> | phase: <current> → <next> | progress: <index>/<total>`.
   - Compute `<index>` from `WORKFLOW_PHASES.indexOf(currentPhase) + 1` and `<total>` from `WORKFLOW_PHASES.length`.
   - Keep existing gate-state text in the same status string or a second status key so phase progress and gate state are both visible.

7. **Wire automatic wizard launch from `/workflow start`** — `target/.pi/extensions/workflow.ts`
   - After workflow creation, call the launcher when `state.workflow.phase === "interview"` and `ctx.hasUI === true`.
   - Wrap the launcher in `try/catch`; on error, call `ctx.ui.notify()` with a warning and continue with the existing chat guidance.
   - On cancel, leave workflow state unchanged and continue with the existing chat guidance.

8. **Implement answer-summary preview** — `target/.pi/extensions/workflow/interview-ui.ts`
   - Render preview rows for each question containing the question title, selected choice labels, free-text value, and skipped state.
   - Bind a preview key during the wizard and show the same preview automatically after the final question.
   - Do not render spec or plan draft content in this preview.

9. **Update documentation** — `README.md`, `README.en.md`
   - Add the automatic launch condition, required/optional question behavior, progress widget, footer phase status, preview behavior, and non-UI fallback behavior.
   - Keep the Korean and English README descriptions equivalent.

## Test Strategy
- Start a workflow with `/workflow start "INTERVIEW UI 개선"` and confirm the wizard launches automatically in an interactive UI session.
- On each of the five questions, select at least one choice and enter free text; confirm both values appear in preview.
- On the three required questions, attempt `Next` with no choice and blank free text; confirm navigation is blocked with a validation message.
- On the two optional questions, use `Skip`; confirm preview marks those answers as skipped.
- Navigate backward after entering an answer; confirm the selected choices and free text are preserved.
- Confirm the progress widget shows exactly five rows and updates markers to `>`, `✓`, and `○` as navigation changes.
- Confirm footer status includes workflow title, current phase, next phase, and `1/10` progress during interview.
- Press the preview key during the wizard and confirm only answer-summary rows are shown.
- Complete the final question and confirm automatic preview appears before completion returns.
- Cancel the wizard and confirm the workflow remains in `interview` phase and chat-based guidance is still usable.
- Run a non-UI or guarded fallback path and confirm no exception is thrown.
- Run the narrowest available TypeScript or extension-loading check for `target/.pi/extensions/workflow.ts` and the new UI module.

## Escalation Points
- If built-in Pi TUI input/editor behavior cannot combine choices and free text in one component without IME regressions, ask whether to replace the custom component with a staged `ctx.ui.editor()` flow for MVP.
- If automatic wizard launch and chat continuation create duplicate prompts on screen, ask whether to suppress, shorten, or keep the continuation message.
- If footer text exceeds available width after including gate state, ask whether to prioritize phase progress or gate status.

## Risks
- **Keyboard/IME complexity**: use built-in Input/Editor-compatible behavior for free-text editing and keep custom cursor logic minimal.
- **Workflow conflict**: keep wizard output as UI data only and do not alter the workflow phase machine or gate checks.
- **Non-UI mode failure**: guard launch with `ctx.hasUI` and keep try/catch fallback.
- **Documentation omission**: update both README.md and README.en.md in the same implementation change.
