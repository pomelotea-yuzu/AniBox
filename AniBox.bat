@echo off
chcp 65001 >nul
title AniBox
cd /d "%~dp0"

REM 清除 ELECTRON_RUN_AS_NODE（修复 Electron-in-Electron 嵌套问题）
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
echo Starting...
echo.
npm run dev
pause