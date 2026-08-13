@echo off
title Flow Visualizer & High-Speed Hand Control
echo ========================================================
echo Starting Flow Visualizer with High-Speed Hand Control...
echo ========================================================
cd /d "%~dp0"
if not exist node_modules (
    echo Installing dependencies...
    call npm install
)
echo Launching Vite Dev Server...
call npm run dev
pause
