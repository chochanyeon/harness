# Harness Local Customization Boundary

This project keeps harness runtime internals under `.pi/`.

## Upstream-managed

These paths are managed by the harness repository and may be overwritten by harness update scripts:

- `.pi/extensions/`
- `.pi/dpaa/`
- `.pi/workflows/`
- `.pi/skills/`
- `.pi/personas/`
- `.pi/WORKFLOW.md`
- `.pi/GOVERNANCE.md`
- `.pi/pyproject.toml`

## Project-owned

These paths are safe for project-specific customization and are not overwritten by update scripts:

- `AGENTS.md`
- `.pi/config/`
- `.pi/local/`
- `.pi/LOCAL.md`

## Generated

These paths are generated locally and should not be committed:

- `.pi/.venv/`
- `.pi/.cache/`
- `.pi/dpaa-runs/`
