---
name: godot-development
description: Run the safe, non-interactive Godot 4.x project quality, test, and export checks.
disable-model-invocation: true
---

# Godot Development

This skill is the consumer contract for the installed adapter at
`.pi/skills/godot-development/tools/godot_quality.py`. It supports Godot 4.x
projects on Windows and Linux through the headless Godot CLI. The project root
must contain a root-level `project.godot`; nested project files are not detected.

## Prerequisites and installation

- Install the workflow component in the consumer project. It provides this
  skill and the adapter; the adapter uses only the Python standard library.
- Provide a Godot **4.x** executable that can run headlessly. The adapter runs
  `<godot> --version` and rejects Godot 3.x, another major version, or an
  unparsable version as `tool-error`.
- Executable discovery is, in order: non-empty `GODOT_BIN`, `godot_bin` in
  `.pi/local/godot.json`, then platform candidates (`godot4`, `godot`, and
  standard Windows/Linux locations).
- Export also requires the configured preset to exist in the project and the
  matching Godot export templates to be available. The harness does not install
  Godot, templates, or export tools.

## Configuration

`.pi/local/godot.json` is optional and must be a JSON object. Unknown keys,
malformed JSON, and wrong types are `config-error`. Only these keys are allowed:

| Key | Type | Default | Meaning and requirement |
| --- | --- | --- | --- |
| `godot_bin` | string | unset (discovery) | Executable path or PATH-resolvable executable name. |
| `test_scene` | string | unset | Relative scene below the project root; required by `test` and `gate`. |
| `export_preset` | string | unset | Godot export preset name; required by `export` and `gate`. |
| `export_output` | string | unset | Export destination below the canonical project root; required by `export` and `gate`. |
| `timeout_seconds` | number (not boolean) | `60.0` | Per-process timeout; must be greater than 0 and at most `3600`. |
| `fail_on_warning` | boolean | `false` | Turn warning diagnostics into a failure when true. |
| `overwrite_export` | boolean | `false` | Allow replacing an existing regular export file when true. |

Scene and export paths cannot escape the project root or cross a symlink
boundary. Absolute export paths are accepted only when their canonical location
is still below the project root. Existing export files are rejected by default;
when `overwrite_export` is true, symlinks and non-regular files remain rejected.
No key selects a working directory, `--path`, shell command, executable command,
or arbitrary test arguments.

A complete valid example (all keys are optional in the file, but this example
uses only the allowed keys) is:

```json
{
  "godot_bin": "godot4",
  "test_scene": "tests/test_scene.tscn",
  "export_preset": "Linux",
  "export_output": "build/game.pck",
  "timeout_seconds": 60.0,
  "fail_on_warning": false,
  "overwrite_export": false
}
```

## Commands and fixed gate

For a detected Godot project, harness commands map to the adapter as follows:

| Harness command | Adapter action | Behavior |
| --- | --- | --- |
| `project-test` | `test` | Run the configured test scene. |
| `project-build` | `export` | Validate and run the configured export; this is export, not compilation. |
| `code-quality` | `gate` | Run the complete quality gate. |

The direct form is `python .pi/skills/godot-development/tools/godot_quality.py
<action> [project-root]`, where `<action>` is `quality`, `test`, `export`, or
`gate`. Subprocesses use fixed array argv, `shell=false`, bounded output,
timeouts, and process-group termination. A configured test command, executable,
working directory, `--path`, or arbitrary argv is never executed.

`quality` always runs these two steps in order:

1. `--headless --path <root> --editor --quit` (editor/import validation)
2. `--headless --path <root> --editor --check-only --quit` (script parse/check)

`test` uses the fixed headless scene command and the configured `test_scene`.
`export` uses the fixed `--export-release <export_preset> <export_output>`
command after canonical-path and overwrite checks. `gate` always reports and
runs the steps in this exact order, even when an earlier step fails:

**quality → test → export**

A gate failure retains diagnostics from all steps. Project validation includes
the main scene (either `.tscn` or `.scn`), external `res://` references in
`project.godot`, `.tscn`, and `.scn` files, and discovered scripts before CLI
steps run.

## Results and exit codes

Each JSON result (including each gate step) contains `status`, `steps`,
`command`, `exit_code`, `elapsed_ms`, `errors`, `warnings`, and
`checked_files`. The only statuses are:

- `pass`: checks succeeded without warnings.
- `warning`: checks succeeded with warnings; exit code is `0`.
- `fail`: project, script, test, export, or warning-policy failure.
- `config-error`: malformed/unknown configuration, missing required settings,
  invalid paths, or rejected overwrite.
- `tool-error`: executable missing or not a valid Godot 4.x tool.
- `timeout`: a bounded process exceeded `timeout_seconds`.

`pass` and `warning` return process exit code `0`. Every other status returns
process exit code `1`; an aggregate gate returns `1` if any step is fatal. A
warning-only gate is aggregate `status: "pass"`, with non-empty `warnings` and
empty `errors`, under the default policy. With `fail_on_warning: true`, the
warning becomes `fail` and blocks the gate. A Godot subprocess's non-zero code
is retained on its step, while the adapter's failing process exit is `1`.

## Recovery

- `godot-executable-not-found` or `invalid-godot-version`: install/provide a
  Godot 4.x CLI, then set `GODOT_BIN` or `godot_bin` and rerun.
- `malformed-godot-config`, `unknown-godot-config-key`, or
  `invalid-godot-config-value`: correct the JSON and use only the seven keys.
- `invalid-project-godot`, `missing-main-scene`, `missing-resource`, or an
  invalid/symlink-escaping scene path: repair the project or resource reference
  and rerun.
- `script-parse`/editor validation failure: fix the reported Godot script or
  project error, then rerun `quality` or `gate`.
- `missing-test-scene`, `test-failure`: configure an in-root test scene and fix
  its failure; arbitrary test argv is not a recovery mechanism.
- `missing-export-preset`, `missing-export-output`, `export-failure`: configure
  a real preset/output, install matching templates, and fix the export error.
- `export-overwrite-rejected` or a path/symlink escape: choose a new in-root
  output, or explicitly set `overwrite_export: true` for an existing regular
  file. Symlink escapes cannot be enabled.
- `process-timeout`: fix the hanging check or raise `timeout_seconds` within
  the permitted maximum, then rerun.

## Supported and excluded scope

Supported: Godot 4.x project detection, CLI version validation, headless editor
and import validation, external resource checks, built-in script parse/check,
configured test-scene execution, configured export validation, safe Windows/Linux
argv execution, and JSON diagnostics for quality/test/export/gate actions.

Explicitly excluded: Godot 3.x; Godot editor UI automation; gameplay semantics
or art-quality judgment; installing or distributing the Godot engine/templates;
forced overwrite of consumer `.pi/local/` configuration; shell-string execution;
and arbitrary test argv.
