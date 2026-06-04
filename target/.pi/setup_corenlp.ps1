# setup_corenlp.ps1 — Start shared Stanford CoreNLP Docker container (Windows)
#
# Runs a single shared CoreNLP server on localhost:9000.
# All projects connect via CORENLP_URL (default: http://localhost:9000).
# Safe to run multiple times — exits early if already running.

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ContainerName = "corenlp"
$Port          = if ($env:CORENLP_PORT)   { $env:CORENLP_PORT }   else { "9000" }
$Image         = "nlptown/corenlp-server:latest"
$Memory        = if ($env:CORENLP_MEMORY) { $env:CORENLP_MEMORY } else { "6g" }

Write-Host "── Stanford CoreNLP Shared Server ────────────────────────"
Write-Host "  Container : $ContainerName"
Write-Host "  Port      : $Port"
Write-Host "─────────────────────────────────────────────────────────"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "docker not found. Install Docker Desktop and retry."
}

# Already running?
$running = docker ps --filter "name=^${ContainerName}$" --format "{{.Names}}" 2>$null
if ($running -match "^${ContainerName}$") {
    Write-Host "✅ CoreNLP already running at http://localhost:$Port"
    exit 0
}

# Container exists but stopped → start it
$exists = docker ps -a --filter "name=^${ContainerName}$" --format "{{.Names}}" 2>$null
if ($exists -match "^${ContainerName}$") {
    Write-Host "Starting existing container $ContainerName..."
    docker start $ContainerName | Out-Null
} else {
    Write-Host "Creating CoreNLP container..."
    docker run -d `
        --name $ContainerName `
        -p "${Port}:9000" `
        -m $Memory `
        --restart unless-stopped `
        $Image | Out-Null
}

Write-Host "✅ CoreNLP server started at http://localhost:$Port"
Write-Host ""
Write-Host "Connect from projects via: CORENLP_URL=http://localhost:$Port"
