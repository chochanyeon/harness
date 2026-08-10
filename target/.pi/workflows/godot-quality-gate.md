# Godot Quality Gate

**When**: `code_review`, before `review_approved`, for a project with a root
`project.godot`.

This workflow uses the installed Godot skill and its safe CLI adapter. It does
not install Godot or execute editor UI automation. Godot 4.x and a headless CLI
are prerequisites; Godot 3.x is unsupported and is reported as `tool-error`.
See `skills/godot-development/SKILL.md` for the complete configuration contract.

## Interview-to-review contract

During interview and planning, identify the project as Godot 4.x and configure
`.pi/local/godot.json` only when the project needs non-default values. During
implementation, `project-test` and `project-build` remain available as focused
checks. Before `review_approved`, the harness `code-quality` command invokes the
adapter's `gate` action:

```text
code-quality → python .pi/skills/godot-development/tools/godot_quality.py gate
             → quality → test → export
             → review_approved (only after success)
```

The order is fixed and must not be changed:

1. **quality** — headless editor/import validation, then built-in script
   parse/check.
2. **test** — the configured in-root `test_scene` with fixed headless scene and
   quit arguments; no configured executable, working directory, `--path`, or
   arbitrary test argv is accepted.
3. **export** — the configured `export_preset` and canonical in-root
   `export_output`, after path, symlink, and overwrite checks. `project-build`
   is this export action, not compilation.

All three steps are represented in gate JSON and diagnostics are retained after
an earlier failure. Warnings do not stop later steps under the default policy.
A missing configuration or tool can produce synthetic failed step entries, but
the aggregate still has the same `quality`, `test`, `export` shape and a
non-zero result.

## Gate decision policy

The aggregate gate passes only when every step is successful or warning-only.
The default `.pi/local/godot.json` policy is `fail_on_warning: false`, so a
warning-only run returns aggregate `status: "pass"`, exit code `0`, non-empty
`warnings`, and empty `errors`. Setting `fail_on_warning: true` changes a step
with warnings to `fail` (`warning-policy-failure`) and blocks review approval.

A gate result contains `status`, `steps`, `command`, `exit_code`, `elapsed_ms`,
`errors`, `warnings`, and `checked_files`. The complete status contract is:

| Status | Meaning | Adapter process exit |
| --- | --- | ---: |
| `pass` | No errors or warnings. | 0 |
| `warning` | A focused action succeeded with warnings. | 0 |
| `fail` | Project, script, test, export, or warning-policy failure. | 1 |
| `config-error` | Invalid configuration, missing required setting, unsafe path, or rejected overwrite. | 1 |
| `tool-error` | Missing executable or executable is not valid Godot 4.x. | 1 |
| `timeout` | A bounded process exceeded `timeout_seconds`. | 1 |

The gate aggregate is `pass` with exit `0` when there are only warnings. Any
`fail`, `config-error`, `tool-error`, or `timeout` step makes the aggregate
exit `1` and prevents `review_approved`. A Godot command's own non-zero exit
code is retained in its step; the adapter process uses `1` for a failing JSON
result.

## Recovery and rerun

1. Read the aggregate `errors` and the affected step's `errors`, `warnings`,
   `command`, and `checked_files`.
2. For `tool-error` (`godot-executable-not-found` or
   `invalid-godot-version`), provide a Godot 4.x CLI through `GODOT_BIN` or
   `godot_bin`; the harness does not install it.
3. For `config-error`, correct malformed/unknown keys, add the required
   `test_scene`, `export_preset`, or `export_output`, and keep all paths below
   the project root. Existing export files are rejected by default; choose a
   new output or explicitly enable `overwrite_export` for a regular file.
4. For `missing-main-scene`, `missing-resource`, editor/script-parse errors,
   `test-failure`, or `export-failure`, repair the project, scene, script, test,
   preset, or export-template problem and rerun the focused action or `gate`.
5. For `timeout`, fix the hanging operation or raise `timeout_seconds` (greater
   than `0`, at most `3600`) and rerun.
6. Rerun `code-quality`; only an exit code `0` gate permits review approval.

Gameplay semantics, editor UI automation, Godot 3.x, engine installation, shell
strings, and arbitrary test arguments are not recovery options or supported
inputs.
