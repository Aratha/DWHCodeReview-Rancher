#Requires -Version 5.1
<#
.SYNOPSIS
  DWH Code Review - restarts API + Vite (run .\start.ps1 from repo root).

.DESCRIPTION
  Stops listeners on 8000/5173 and project uvicorn/vite processes, then starts backend + frontend.
  Ctrl+C stops npm and the script kills the backend process.
#>

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$Host.UI.RawUI.WindowTitle = "DWH Code Review - starting"

. "$Root\scripts\dev-stop-common.ps1"
Stop-DwhProjectProcesses -ProjectRoot $Root -PhaseMessage "=== Başlatmadan önce eski süreçler (8000, 5173) temizleniyor ==="

Write-Host "=== SQL Code Review starting ===" -ForegroundColor Cyan

if (-not (Test-Path "$Root\backend\.env")) {
    if (Test-Path "$Root\backend\.env.example") {
        Copy-Item "$Root\backend\.env.example" "$Root\backend\.env" -Force
        Write-Host "Created backend\.env from backend\.env.example" -ForegroundColor Yellow
    } else {
        Write-Host "Warning: backend\.env missing. Example: copy backend\.env.example backend\.env" -ForegroundColor Yellow
    }
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "Node.js / npm not found. Install LTS from https://nodejs.org and check PATH."
}

$py = "$Root\backend\.venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
    Write-Host "Creating backend\.venv..." -ForegroundColor Yellow
    if (Get-Command python -ErrorAction SilentlyContinue) {
        python -m venv "$Root\backend\.venv"
    } elseif (Get-Command py -ErrorAction SilentlyContinue) {
        py -3 -m venv "$Root\backend\.venv"
    } else {
        throw "Python not found. Install from python.org or add to PATH."
    }
    if (-not (Test-Path $py)) {
        throw "Could not create venv: $Root\backend\.venv"
    }
}

$req = "$Root\backend\requirements.txt"
$marker = "$Root\backend\.venv\.deps_installed"
if (-not (Test-Path $marker) -or ((Get-Item $req).LastWriteTime -gt (Get-Item $marker).LastWriteTime)) {
    Write-Host "Installing or updating Python dependencies..." -ForegroundColor Yellow
    & $py -m pip install --upgrade pip -q
    & $py -m pip install -r $req
    New-Item -ItemType File -Path $marker -Force | Out-Null
}

$backendArgs = @(
    "-m", "uvicorn", "main:app",
    "--app-dir", "$Root\backend",
    "--reload",
    "--reload-dir", "$Root\backend",
    "--host", "127.0.0.1", "--port", "8000"
)

$backendProc = Start-Process -FilePath $py `
    -ArgumentList $backendArgs `
    -WorkingDirectory $Root `
    -PassThru `
    -WindowStyle Hidden

function Wait-BackendHealth {
    param(
        [string]$Url = "http://127.0.0.1:8000/api/health",
        [int]$MaxSeconds = 25
    )
    $deadline = (Get-Date).AddSeconds($MaxSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($resp.StatusCode -eq 200) { return $true }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    return $false
}

if (-not (Wait-BackendHealth)) {
    throw "Backend health check failed: http://127.0.0.1:8000/api/health"
}

try {
    Set-Location "$Root\frontend"
    if (-not (Test-Path "node_modules")) {
        Write-Host "node_modules missing; running npm install..." -ForegroundColor Yellow
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed (exit $LASTEXITCODE)." }
    }

    $Host.UI.RawUI.WindowTitle = "DWH Code Review - http://localhost:5173"

    Write-Host ""
    Write-Host "  API:    http://127.0.0.1:8000  (reload on code change)"
    Write-Host "  UI:     http://localhost:5173  (Vite HMR)"
    Write-Host "  Stop:   press Ctrl+C in this window"
    Write-Host "  Health: http://127.0.0.1:8000/api/health"
    Write-Host ""

    npm run dev
}
finally {
    if ($backendProc -and -not $backendProc.HasExited) {
        Write-Host "`nStopping backend..." -ForegroundColor Gray
        Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
    }
    $Host.UI.RawUI.WindowTitle = "DWH Code Review"
}
