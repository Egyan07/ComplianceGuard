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
color 0A
echo  ============================================
echo    Installation Complete!
echo  ============================================
echo.
echo  Run start.bat to launch ComplianceGuard.
echo.
pause
