[CmdletBinding()]
param(
    [string]$Root = (Get-Location).Path
)

$ErrorActionPreference = "Stop"
$rootPath = [System.IO.Path]::GetFullPath($Root)
$checks = @()

function Add-Check($Name, $Ok, $Detail = "") {
    $status = if ($Ok) { "OK" } else { "FAIL" }
    $script:checks += [pscustomobject]@{ Check = $Name; Status = $status; Detail = $Detail }
}

function Test-Python($Command) {
    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) { return $false }
    & $Command -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" *> $null
    return $LASTEXITCODE -eq 0
}

Add-Check "AGENTS.md" (Test-Path -LiteralPath (Join-Path $rootPath "AGENTS.md"))
Add-Check ".pi" (Test-Path -LiteralPath (Join-Path $rootPath ".pi") -PathType Container)
foreach ($p in @(".pi/WORKFLOW.md", ".pi/extensions/workflow.ts", ".pi/extensions/workflow", ".pi/skills", ".pi/personas", ".pi/workflows", ".pi/dpaa", ".pi/pyproject.toml", ".pi/schemas/harness-field-log-event.schema.json")) {
    Add-Check $p (Test-Path -LiteralPath (Join-Path $rootPath $p))
}
Add-Check "git" ([bool](Get-Command git -ErrorAction SilentlyContinue))
Add-Check "python >= 3.10" ((Test-Python "python") -or (Test-Python "python3"))

$venv = if ($IsWindows -or $env:OS -eq "Windows_NT") { ".pi/.venv/Scripts/python.exe" } else { ".pi/.venv/bin/python" }
Add-Check "DPAA venv" (Test-Path -LiteralPath (Join-Path $rootPath $venv)) "missing is OK before first DPAA gate"

$checks | Format-Table -AutoSize
if ($checks.Status -contains "FAIL") { exit 1 }
