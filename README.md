# harness

Pi workflow harness source repository.

Pi workflow runtime files are isolated under `target/` so developing the harness from this repository root does not automatically load the harness extension, skills, or context files. In an initialized project, only `AGENTS.md` and `.pi/` are placed at the project root; workflow internals, DPAA, and reference docs live under `.pi/`.

## Initialize in another project

From the target project's directory, run the one-liner for your OS.

Windows PowerShell:

```powershell
$p=Join-Path $env:TEMP 'init-harness.ps1'; Invoke-WebRequest https://raw.githubusercontent.com/cycho21/harness/main/scripts/init-target-harness.ps1 -OutFile $p; powershell -NoProfile -ExecutionPolicy Bypass -File $p
```

macOS/Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/cycho21/harness/main/scripts/init-target-harness.sh | sh
```

Then start Pi from the same project directory:

```powershell
pi
```

The initializer clones `https://github.com/cycho21/harness.git` into a temp directory, copies missing files from `target/`, then removes the temp clone. Existing files are skipped by default.

After initialization, self-check the install:

```text
/workflow doctor
```

DPAA dependencies are installed automatically into `.pi/.venv/` the first time the DPAA gate runs. The generated venv is ignored by `.pi/.gitignore`.

Optional arguments:

Windows PowerShell:

```powershell
# Preview only
$p=Join-Path $env:TEMP 'init-harness.ps1'; Invoke-WebRequest https://raw.githubusercontent.com/cycho21/harness/main/scripts/init-target-harness.ps1 -OutFile $p; powershell -NoProfile -ExecutionPolicy Bypass -File $p -DryRun

# Use a specific branch/tag
$p=Join-Path $env:TEMP 'init-harness.ps1'; Invoke-WebRequest https://raw.githubusercontent.com/cycho21/harness/main/scripts/init-target-harness.ps1 -OutFile $p; powershell -NoProfile -ExecutionPolicy Bypass -File $p -Ref main

# Overwrite existing files intentionally
$p=Join-Path $env:TEMP 'init-harness.ps1'; Invoke-WebRequest https://raw.githubusercontent.com/cycho21/harness/main/scripts/init-target-harness.ps1 -OutFile $p; powershell -NoProfile -ExecutionPolicy Bypass -File $p -Force
```

macOS/Linux:

```bash
# Preview only
curl -fsSL https://raw.githubusercontent.com/cycho21/harness/main/scripts/init-target-harness.sh | sh -s -- --dry-run

# Use a specific branch/tag
curl -fsSL https://raw.githubusercontent.com/cycho21/harness/main/scripts/init-target-harness.sh | sh -s -- --ref main

# Overwrite existing files intentionally
curl -fsSL https://raw.githubusercontent.com/cycho21/harness/main/scripts/init-target-harness.sh | sh -s -- --force
```

## Update an installed harness

Run from the project root.

Windows PowerShell:

```powershell
$p=Join-Path $env:TEMP 'update-harness.ps1'; Invoke-WebRequest https://raw.githubusercontent.com/cycho21/harness/main/scripts/update-harness.ps1 -OutFile $p; powershell -NoProfile -ExecutionPolicy Bypass -File $p
```

macOS/Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/cycho21/harness/main/scripts/update-harness.sh | sh
```

Updates overwrite upstream-managed harness runtime files only. Project-owned files such as `AGENTS.md`, `.pi/config/`, and `.pi/local/` are preserved.

## Customization boundary

- Upstream-managed: `.pi/extensions/`, `.pi/dpaa/`, `.pi/workflows/`, `.pi/skills/`, `.pi/personas/`, `.pi/WORKFLOW.md`, `.pi/GOVERNANCE.md`, `.pi/pyproject.toml`
- Project-owned: `AGENTS.md`, `.pi/config/`, `.pi/local/`, `.pi/LOCAL.md`
- Generated/ignored: `.pi/.venv/`, `.pi/.cache/`, `.pi/dpaa-runs/`

See `.pi/LOCAL.md` after initialization for the same boundary inside the project.

## Preview the bundled target template

`target/` is the template that gets copied into another project. To preview that template locally without initializing another repository:

```powershell
cd target
pi
```

For normal usage, run the initializer from the project you want to equip with the harness, then run `pi` from that project root.

Key runtime entrypoints:

- `target/AGENTS.md`
- `target/.pi/WORKFLOW.md`
- `target/.pi/extensions/workflow.ts`
- `target/.pi/skills/`
- `target/.pi/personas/`
- `target/.pi/GOVERNANCE.md`
- `target/.pi/dpaa/`
- `target/.pi/pyproject.toml`
- `target/.pi/workflows/`
