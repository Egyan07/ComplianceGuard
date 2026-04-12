@echo off
title ComplianceGuard
color 0B

:menu
cls
echo.
echo  ============================================
echo    ComplianceGuard - Collect. Evaluate. Comply.
echo  ============================================
echo.
echo    [1] Desktop App   (Electron - offline, no server needed)
echo    [2] Web App        (Backend + Frontend in browser)
echo    [3] Exit
echo.
set /p choice="  Select mode: "

if "%choice%"=="1" goto desktop
if "%choice%"=="2" goto web
if "%choice%"=="3" goto quit
echo.
echo  Invalid choice. Try again.
timeout /t 2 >nul
goto menu

:: -------------------------------------------
:: Desktop Mode (Electron)
:: -------------------------------------------
:desktop
cls
echo.
echo  ============================================
echo    Starting Desktop Mode (Electron)
echo  ============================================
echo.
echo  Starting frontend dev server + Electron...
echo  The app window will open automatically.
echo.
echo  Press Ctrl+C in this window to stop.
echo.
call npm run dev
goto quit

:: -------------------------------------------
:: Web Mode (Backend + Frontend)
:: -------------------------------------------
:web
cls
echo.
echo  ============================================
echo    Starting Web Mode
echo  ============================================
echo.
echo  Starting backend API and frontend server...
echo.

:: Start backend in a new window
start "ComplianceGuard - Backend" cmd /k "cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

:: Wait for backend to be ready
echo  Waiting for backend to start...
timeout /t 3 >nul

:: Start frontend in a new window
start "ComplianceGuard - Frontend" cmd /k "cd frontend && npm run dev"

:: Wait for frontend to be ready
echo  Waiting for frontend to start...
timeout /t 5 >nul

:: Open browser
start http://localhost:5173

echo.
color 0A
echo  ============================================
echo    ComplianceGuard is running!
echo  ============================================
echo.
echo    Frontend:  http://localhost:5173
echo    Backend:   http://localhost:8000
echo    API Docs:  http://localhost:8000/docs
echo.
echo    Two terminal windows opened for backend and frontend.
echo    Close them to stop the servers.
echo.
pause
goto quit

:quit
exit /b 0
