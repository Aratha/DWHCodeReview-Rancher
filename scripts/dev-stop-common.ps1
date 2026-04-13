# Ortak: 8000/5173 ve bu projeye ait uvicorn + Vite süreçlerini sonlandırır.
# start.ps1 ve stop.ps1 tarafından dot-source edilir.

function Stop-ProcessTree {
    param([int]$ProcessId)
    if ($ProcessId -le 0) { return }
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    try {
        & taskkill.exe /PID $ProcessId /T /F 2>&1 | Out-Null
    } finally {
        $ErrorActionPreference = $prev
    }
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
    param(
        [Parameter(Mandatory = $true)]
        [string]$ProjectRoot,
        [string]$PhaseMessage = "=== 8000/5173 ve proje uvicorn/vite süreçleri temizleniyor ==="
    )

    if (-not (Test-Path -LiteralPath $ProjectRoot)) { return }
    $resolved = (Resolve-Path -LiteralPath $ProjectRoot).Path
    $folderName = Split-Path -Leaf $resolved
    if (-not $folderName) { return }

    $escapedRoot = [regex]::Escape($resolved)
    $escapedLeaf = [regex]::Escape($folderName)

    Write-Host ""
    Write-Host $PhaseMessage -ForegroundColor Cyan

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
            Write-Host "Uyarı: $port hâlâ dinleniyor; yeniden sonlandırılıyor..." -ForegroundColor Yellow
            Stop-ListenersOnPort -Port $port
            Start-Sleep -Milliseconds 400
        }
    }

    Write-Host "Temizlik tamam." -ForegroundColor DarkGray
    Write-Host ""
}
