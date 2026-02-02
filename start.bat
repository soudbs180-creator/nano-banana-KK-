@echo off
chcp 65001 >nul
cls

echo ================================================
echo    KK Studio - Dev Server
echo ================================================
echo.

REM Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found
    echo Please install: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Show Node version
for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo [INFO] Node.js: %NODE_VERSION%

REM Check dependencies
if not exist "node_modules" (
    echo [INSTALL] Installing dependencies...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Install failed
        pause
        exit /b 1
    )
)

REM Start server
echo.
echo [START] Starting dev server...
echo.
echo ----------------------------------------
echo  URL: http://localhost:3000
echo  Press Ctrl+C to stop
echo ----------------------------------------
echo.

npm run dev

REM Handle errors
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Server failed
    echo Possible reasons:
    echo   1. Port 3000 is in use
    echo   2. Config error
    echo.
    pause
)
