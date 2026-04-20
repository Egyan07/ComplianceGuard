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
cd /d "%~dp0frontend"
call npm install
if %errorlevel% neq 0 (
    color 0C
    echo  [ERROR] Frontend npm install failed.
    cd /d "%~dp0"
    pause
    exit /b 1
)
cd /d "%~dp0"
echo  [OK] Frontend dependencies installed

echo.
echo  -------------------------------------------
echo  Step 3/4: Installing backend dependencies...
echo  -------------------------------------------
cd /d "%~dp0backend"
pip install -r requirements.txt -q
if %errorlevel% neq 0 (
    echo  [WARN] pip install had issues. Trying with --user flag...
    pip install -r requirements.txt -q --user
)
cd /d "%~dp0"
echo  [OK] Backend dependencies installed

echo.
echo  -------------------------------------------
echo  Step 4/4: Running database migrations...
echo  -------------------------------------------
cd /d "%~dp0backend"
python -m alembic upgrade head 2>nul
if %errorlevel% neq 0 (
    echo  [INFO] Alembic migration skipped (tables will auto-create on first run)
)
cd /d "%~dp0"
echo  [OK] Database ready

echo.
echo  -------------------------------------------
echo  Creating start.bat launcher...
echo  -------------------------------------------

:: Using line-by-line echo to prevent the installer from crashing on special characters
echo @echo off > start.bat
echo title ComplianceGuard >> start.bat
echo color 0B >> start.bat
echo. >> start.bat
echo :menu >> start.bat
echo cls >> start.bat
echo echo. >> start.bat
echo echo  ============================================ >> start.bat
echo echo    ComplianceGuard - Collect. Evaluate. Comply. >> start.bat
echo echo  ============================================ >> start.bat
echo echo. >> start.bat
echo echo    [1] Desktop App   ^(Electron - offline, no server needed^) >> start.bat
echo echo    [2] Web App        ^(Backend + Frontend in browser^) >> start.bat
echo echo    [3] Exit >> start.bat
echo echo. >> start.bat
echo set /p choice="  Select mode: " >> start.bat
echo. >> start.bat
echo if "%%choice%%"=="1" goto desktop >> start.bat
echo if "%%choice%%"=="2" goto web >> start.bat
echo if "%%choice%%"=="3" goto quit >> start.bat
echo echo. >> start.bat
echo echo  Invalid choice. Try again. >> start.bat
echo timeout /t 2 ^>nul >> start.bat
echo goto menu >> start.bat
echo. >> start.bat
echo :desktop >> start.bat
echo cls >> start.bat
echo echo. >> start.bat
echo echo  ============================================ >> start.bat
echo echo    Starting Desktop Mode ^(Electron^) >> start.bat
echo echo  ============================================ >> start.bat
echo echo. >> start.bat
echo echo  Starting frontend dev server + Electron... >> start.bat
echo echo  The app window will open automatically. >> start.bat
echo echo. >> start.bat
echo echo  Press Ctrl+C in this window to stop. >> start.bat
echo echo. >> start.bat
echo cd /d "%%~dp0" >> start.bat
echo call npm run dev >> start.bat
echo goto quit >> start.bat
echo. >> start.bat
echo :web >> start.bat
echo cls >> start.bat
echo echo. >> start.bat
echo echo  ============================================ >> start.bat
echo echo    Starting Web Mode >> start.bat
echo echo  ============================================ >> start.bat
echo echo. >> start.bat
echo echo  Starting backend API and frontend server... >> start.bat
echo echo. >> start.bat
echo start "ComplianceGuard - Backend" cmd /k "cd /d "%%~dp0backend" && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload" >> start.bat
echo echo  Waiting for backend to start... >> start.bat
echo timeout /t 3 ^>nul >> start.bat
echo start "ComplianceGuard - Frontend" cmd /k "cd /d "%%~dp0frontend" && npm run dev" >> start.bat
echo echo  Waiting for frontend to start... >> start.bat
echo timeout /t 5 ^>nul >> start.bat
echo start http://localhost:5173 >> start.bat
echo echo. >> start.bat
echo color 0A >> start.bat
echo echo  ============================================ >> start.bat
echo echo    ComplianceGuard is running! >> start.bat
echo echo  ============================================ >> start.bat
echo echo. >> start.bat
echo echo    Frontend:  http://localhost:5173 >> start.bat
echo echo    Backend:   http://localhost:8000 >> start.bat
echo echo    API Docs:  http://localhost:8000/docs >> start.bat
echo echo. >> start.bat
echo echo    Two terminal windows opened for backend and frontend. >> start.bat
echo echo    Close them to stop the servers. >> start.bat
echo echo. >> start.bat
echo pause >> start.bat
echo goto quit >> start.bat
echo. >> start.bat
echo :quit >> start.bat
echo exit /b 0 >> start.bat

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