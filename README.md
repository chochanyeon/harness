# company-harness

Harness source repository.

Pi workflow runtime files are isolated under `target/` so developing the harness from this repository root does not automatically load the harness extension, skills, or context files. DPAA and workflow reference docs are part of the workflow runtime and stay in `target/`; tests, analysis notes, and reference docs live at the repository root.

To run the harness as an applied PI target:

```bash
cd target
pi
```

Key runtime entrypoints:

- `target/AGENTS.md`
- `target/WORKFLOW.md`
- `target/.pi/extensions/workflow.ts`
- `target/.pi/skills/`
- `target/.pi/personas/`
- `target/.pi/GOVERNANCE.md`
- `target/dpaa/`
- `target/pyproject.toml`
- `target/workflows/`
