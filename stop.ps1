#Requires -Version 5.1
<#
.SYNOPSIS
  DWH Code Review — API (8000) ve Vite (5173) geliştirme süreçlerini durdurur.
  Run .\stop.ps1 from repo root.
#>

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$Host.UI.RawUI.WindowTitle = "DWH Code Review - stopping"

. "$Root\scripts\dev-stop-common.ps1"
Stop-DwhProjectProcesses -ProjectRoot $Root -PhaseMessage "=== DWH Code Review durduruluyor (8000, 5173) ==="

Write-Host "API ve UI geliştirme sunucuları kapatıldı." -ForegroundColor Green
$Host.UI.RawUI.WindowTitle = "DWH Code Review"
exit 0
