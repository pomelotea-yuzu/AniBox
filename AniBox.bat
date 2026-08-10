@echo off
chcp 65001 >nul
title AniBox
cd /d "%~dp0"

REM clear ELECTRON_RUN_AS_NODE (fix Electron-in-Electron nesting issue)
set ELECTRON_RUN_AS_NODE=

set PATH=C:\Users\28145\.workbuddy\binaries\node\versions\22.22.2;%PATH%

if not exist "node_modules\" (
    echo [ERROR] node_modules not found in current folder.
    echo Please run: npm install
    pause
    exit /b 1
)

echo ====================================
echo   AniBox v0.1.0
echo ====================================
echo Starting... (full log: anibox-dev.log)
echo.

REM redirect output to log file so errors survive window close
call npm run dev > anibox-dev.log 2>&1
set EXITCODE=%errorlevel%

echo.
echo [EXIT] npm run dev exit code: %EXITCODE%
if not "%EXITCODE%"=="0" (
    echo [FAILED] Startup failed. Full log:
    echo ----------------------------------------
    type anibox-dev.log
    echo ----------------------------------------
)
pause
