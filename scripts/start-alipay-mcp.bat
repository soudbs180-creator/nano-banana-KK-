@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
set "ENV_FILE=%SCRIPT_DIR%alipay-mcp.env"

if not exist "%ENV_FILE%" (
  echo [ERROR] Config file not found: %ENV_FILE%
  echo [ACTION] Please create scripts\alipay-mcp.env first.
  exit /b 1
)

for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
  echo(%%A| findstr /b /c:"#" >nul
  if errorlevel 1 if not "%%A"=="" set "%%A=%%B"
)

if "%AP_APP_ID%"=="" (
  echo [ERROR] AP_APP_ID is missing.
  exit /b 1
)

if "%AP_APP_KEY%"=="" (
  echo [ERROR] AP_APP_KEY is missing.
  echo [TIP] AP_APP_KEY must be APP PRIVATE KEY.
  exit /b 1
)

if /i "%AP_APP_KEY%"=="__REPLACE_WITH_APP_PRIVATE_KEY__" (
  echo [ERROR] AP_APP_KEY still uses placeholder.
  echo [ACTION] Fill real private key in scripts\alipay-mcp.env.
  exit /b 1
)

if "%AP_PUB_KEY%"=="" (
  echo [ERROR] AP_PUB_KEY is missing.
  exit /b 1
)

if "%AP_RETURN_URL%"=="" (
  echo [ERROR] AP_RETURN_URL is missing.
  exit /b 1
)

if "%AP_NOTIFY_URL%"=="" (
  echo [ERROR] AP_NOTIFY_URL is missing.
  exit /b 1
)

echo [INFO] Starting Alipay MCP server...
cmd /c npx -y @alipay/mcp-server-alipay
