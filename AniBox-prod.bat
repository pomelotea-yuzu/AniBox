@echo off
chcp 65001 >nul
title AniBox
cd /d "%~dp0"

REM clear ELECTRON_RUN_AS_NODE (fix Electron-in-Electron nesting issue)
set ELECTRON_RUN_AS_NODE=

set PATH=C:\Users\28145\.workbuddy\binaries\node\versions\22.22.2;%PATH%

if not exist "out\main\index.js" (
    echo [ERROR] Build output not found. Run: npm run build
    pause
    exit /b 1
)

echo ====================================
echo   AniBox
echo ====================================
echo Starting...
call npx electron .

if errorlevel 1 (
    echo.
    echo [FAILED] Press any key to exit...
    pause >nul
)
