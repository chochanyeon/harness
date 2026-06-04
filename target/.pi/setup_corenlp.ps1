# setup_corenlp.ps1 — Start shared Stanford CoreNLP Docker container (Windows)
#
# Builds a local Docker image on first run (~500 MB, cached by Docker).
# All subsequent runs and other projects reuse the cached image.
# Safe to run multiple times — exits early if already running.

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ContainerName = "corenlp"
$ImageName     = "corenlp-local"
$Port          = if ($env:CORENLP_PORT)   { $env:CORENLP_PORT }   else { "9000" }
$Memory        = if ($env:CORENLP_MEMORY) { $env:CORENLP_MEMORY } else { "6g" }
$ScriptDir     = $PSScriptRoot
$DockerfileDir = Join-Path $ScriptDir "corenlp"

Write-Host "Stanford CoreNLP Shared Server"
Write-Host "  Container : $ContainerName"
Write-Host "  Port      : $Port"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "docker not found. Install Docker Desktop and retry."
}

# Build local image if not yet built (one-time, ~500 MB)
$imageInfo = docker image inspect $ImageName 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Building CoreNLP Docker image (one-time ~500 MB download)..."
    docker build -t $ImageName $DockerfileDir
    if ($LASTEXITCODE -ne 0) { throw "docker build failed." }
}

# Already running?
$running = docker ps --filter "name=^${ContainerName}$" --format "{{.Names}}" 2>$null
if ($running -match "^${ContainerName}$") {
    Write-Host "CoreNLP already running at http://localhost:$Port"
    exit 0
}

# Container exists but stopped -> start it
$exists = docker ps -a --filter "name=^${ContainerName}$" --format "{{.Names}}" 2>$null
if ($exists -match "^${ContainerName}$") {
    Write-Host "Starting existing container $ContainerName..."
    docker start $ContainerName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "docker start failed." }
} else {
    Write-Host "Creating CoreNLP container..."
    docker run -d `
        --name $ContainerName `
        -p "${Port}:9000" `
        -m $Memory `
        --restart unless-stopped `
        $ImageName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "docker run failed." }
}

Write-Host "CoreNLP server started at http://localhost:$Port"
Write-Host ""
Write-Host "Connect from projects via: CORENLP_URL=http://localhost:$Port"
