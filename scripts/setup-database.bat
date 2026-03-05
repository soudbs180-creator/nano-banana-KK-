@echo off
setlocal

echo ========================================
echo KK Studio Database Setup (Supabase CLI)
echo ========================================
echo.

if "%SUPABASE_PROJECT_REF%"=="" (
  set "SUPABASE_PROJECT_REF=YOUR_PROJECT_REF"
)

echo [1/4] Checking Supabase login...
npx supabase projects list >nul 2>&1
if %errorlevel% neq 0 (
  echo Supabase CLI is not logged in.
  echo Run: npx supabase login
  exit /b 1
)

echo [2/4] Linking project...
npx supabase link --project-ref %SUPABASE_PROJECT_REF%
if %errorlevel% neq 0 (
  echo Failed to link project. Check SUPABASE_PROJECT_REF.
  exit /b 1
)

echo [3/4] Pushing migrations...
npx supabase db push
if %errorlevel% neq 0 (
  echo Failed to push migrations.
  exit /b 1
)

echo [4/4] Checking status...
npx supabase status

echo.
echo Done.
echo Dashboard: https://app.supabase.com/project/%SUPABASE_PROJECT_REF%/editor
endlocal
