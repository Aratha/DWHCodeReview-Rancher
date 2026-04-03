@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title DWH Code Review
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
set EXITCODE=%ERRORLEVEL%
if not "%EXITCODE%"=="0" (
    echo.
    echo Hata kodu: %EXITCODE%
    pause
)
exit /b %EXITCODE%
