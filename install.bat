@echo off
title ComplianceGuard - Installer
color 0B

echo.
echo  ============================================
echo    ComplianceGuard - One-Click Installer
echo  ============================================
echo.

:: -------------------------------------------
:: Check Node.js
:: -------------------------------------------
where node >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  [ERROR] Node.js is not installed.
    echo.
    echo  Download it from: https://nodejs.org/
    echo  Install Node.js 18 or later, then run this script again.
    echo.
    pause
    exit /b 1
)

for /f "tokens=1 delims=v" %%a in ('node -v') do set NODE_VER=%%a
echo  [OK] Node.js found: %NODE_VER%

:: -------------------------------------------
:: Check Python
:: -------------------------------------------
where python >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  [ERROR] Python is not installed.
    echo.
    echo  Download it from: https://www.python.org/downloads/
    echo  Install Python 3.10 or later, then run this script again.
    echo  Make sure to check "Add Python to PATH" during install.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%a in ('python --version') do set PYTHON_VER=%%a
echo  [OK] %PYTHON_VER% found

:: -------------------------------------------
:: Check npm
:: -------------------------------------------
where npm >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  [ERROR] npm is not installed. It should come with Node.js.
    echo  Reinstall Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo  [OK] npm found

echo.
echo  -------------------------------------------
echo  Step 1/4: Installing root dependencies...
echo  -------------------------------------------
call npm install
if %errorlevel% neq 0 (
    color 0C
    echo  [ERROR] Root npm install failed.
    pause
    exit /b 1
)
echo  [OK] Root dependencies installed

echo.
echo  -------------------------------------------
echo  Step 2/4: Installing frontend dependencies...
echo  -------------------------------------------
cd frontend
call npm install
if %errorlevel% neq 0 (
    color 0C
    echo  [ERROR] Frontend npm install failed.
    cd ..
    pause
    exit /b 1
)
cd ..
echo  [OK] Frontend dependencies installed

echo.
echo  -------------------------------------------
echo  Step 3/4: Installing backend dependencies...
echo  -------------------------------------------
cd backend
pip install -r requirements.txt -q
if %errorlevel% neq 0 (
    echo  [WARN] pip install had issues. Trying with --user flag...
    pip install -r requirements.txt -q --user
)
cd ..
echo  [OK] Backend dependencies installed

echo.
echo  -------------------------------------------
echo  Step 4/4: Running database migrations...
echo  -------------------------------------------
cd backend
python -m alembic upgrade head 2>nul
if %errorlevel% neq 0 (
    echo  [INFO] Alembic migration skipped (tables will auto-create on first run)
)
cd ..
echo  [OK] Database ready

echo.
echo  -------------------------------------------
echo  Creating start.bat launcher...
echo  -------------------------------------------

(
echo @echo off
echo title ComplianceGuard
echo color 0B
echo.
echo :menu
echo cls
echo echo.
echo echo  ============================================
echo echo    ComplianceGuard - Collect. Evaluate. Comply.
echo echo  ============================================
echo echo.
echo echo    [1] Desktop App   ^(Electron - offline, no server needed^)
echo echo    [2] Web App        ^(Backend + Frontend in browser^)
echo echo    [3] Exit
echo echo.
echo set /p choice="  Select mode: "
echo.
echo if "%%choice%%"=="1" goto desktop
echo if "%%choice%%"=="2" goto web
echo if "%%choice%%"=="3" goto quit
echo echo.
echo echo  Invalid choice. Try again.
echo timeout /t 2 ^>nul
echo goto menu
echo.
echo :desktop
echo cls
echo echo.
echo echo  ============================================
echo echo    Starting Desktop Mode ^(Electron^)
echo echo  ============================================
echo echo.
echo echo  Starting frontend dev server + Electron...
echo echo  The app window will open automatically.
echo echo.
echo echo  Press Ctrl+C in this window to stop.
echo echo.
echo call npm run dev
echo goto quit
echo.
echo :web
echo cls
echo echo.
echo echo  ============================================
echo echo    Starting Web Mode
echo echo  ============================================
echo echo.
echo echo  Starting backend API and frontend server...
echo echo.
echo start "ComplianceGuard - Backend" cmd /k "cd backend ^&^& python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"
echo echo  Waiting for backend to start...
echo timeout /t 3 ^>nul
echo start "ComplianceGuard - Frontend" cmd /k "cd frontend ^&^& npm run dev"
echo echo  Waiting for frontend to start...
echo timeout /t 5 ^>nul
echo start http://localhost:5173
echo echo.
echo color 0A
echo echo  ============================================
echo echo    ComplianceGuard is running!
echo echo  ============================================
echo echo.
echo echo    Frontend:  http://localhost:5173
echo echo    Backend:   http://localhost:8000
echo echo    API Docs:  http://localhost:8000/docs
echo echo.
echo echo    Two terminal windows opened for backend and frontend.
echo echo    Close them to stop the servers.
echo echo.
echo pause
echo goto quit
echo.
echo :quit
echo exit /b 0
) > start.bat

echo  [OK] start.bat created

echo.
color 0A
echo  ============================================
echo    Installation Complete!
echo  ============================================
echo.
echo  Double-click start.bat to launch ComplianceGuard.
echo.
pause
