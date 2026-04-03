#Requires -Version 5.1
<#
.SYNOPSIS
  DWH Code Review - restarts API + Vite (double-click start.bat or run .\start.ps1).

.DESCRIPTION
  Stops listeners on 8000/5173 and project uvicorn/vite processes, then starts backend + frontend.
  Ctrl+C stops npm and the script kills the backend process.
#>

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$Host.UI.RawUI.WindowTitle = "DWH Code Review - starting"

function Stop-ProcessTree {
    param([int]$ProcessId)
    if ($ProcessId -le 0) { return }
    & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null
}

function Stop-ListenersOnPort {
    param([int]$Port)
    try {
        Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            ForEach-Object {
                $id = [int]$_.OwningProcess
                if ($id -gt 0) { Stop-ProcessTree -ProcessId $id }
            }
    } catch {
        $raw = netstat -ano 2>$null
        if (-not $raw) { return }
        $lines = if ($raw -is [string]) { $raw -split "`r?`n" } else { @($raw) }
        foreach ($line in $lines) {
            if ($line -notmatch 'LISTENING') { continue }
            if ($line -notmatch ":$Port\s") { continue }
            if ($line -match '\s+(\d+)\s*$') {
                $pidNum = [int]$Matches[1]
                if ($pidNum -gt 0) { Stop-ProcessTree -ProcessId $pidNum }
            }
        }
    }
}

function Stop-DwhProjectProcesses {
    param([string]$ProjectRoot)

    if (-not (Test-Path -LiteralPath $ProjectRoot)) { return }
    $resolved = (Resolve-Path -LiteralPath $ProjectRoot).Path
    $folderName = Split-Path -Leaf $resolved
    if (-not $folderName) { return }

    $escapedRoot = [regex]::Escape($resolved)
    $escapedLeaf = [regex]::Escape($folderName)

    Write-Host ""
    Write-Host "=== Restart: cleaning old processes (ports 8000, 5173) ===" -ForegroundColor Cyan

    foreach ($port in @(8000, 5173)) {
        Stop-ListenersOnPort -Port $port
    }

    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $cmd = $_.CommandLine
            if (-not $cmd) { return $false }
            $n = $_.Name
            $inProject = $cmd -match $escapedRoot
            if (-not $inProject) {
                $inProject = ($cmd -match $escapedLeaf) -and (
                    ($cmd -match 'uvicorn|main:app') -or ($cmd -match 'vite|run\s+dev')
                )
            }
            if (-not $inProject) { return $false }
            if ($n -eq 'python.exe' -or $n -eq 'pythonw.exe') {
                return $cmd -match 'uvicorn|main:app'
            }
            if ($n -eq 'node.exe') {
                return $cmd -match 'vite|\\vite\.|run\s+dev'
            }
            return $false
        } |
        ForEach-Object { Stop-ProcessTree -ProcessId $_.ProcessId }

    Start-Sleep -Milliseconds 600

    foreach ($port in @(8000, 5173)) {
        $still = $false
        try {
            $still = [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
        } catch { }
        if ($still) {
            Write-Host "Warning: port $port still in use; retrying kill..." -ForegroundColor Yellow
            Stop-ListenersOnPort -Port $port
            Start-Sleep -Milliseconds 400
        }
    }

    Write-Host "Cleanup done." -ForegroundColor DarkGray
    Write-Host ""
}

Stop-DwhProjectProcesses -ProjectRoot $Root

Write-Host "=== SQL Code Review starting ===" -ForegroundColor Cyan

if (-not (Test-Path "$Root\backend\.env")) {
    Write-Host "Warning: backend\.env missing. Example: copy backend\.env.example backend\.env" -ForegroundColor Yellow
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
