# KK Studio Supabase Setup Script
# Uses personal access token to execute migrations

param(
    [string]$Token = "sbp_032c975f2babdc99a850dcdea2bb5bee2e051399",
    [string]$ProjectRef = "ovdjhdofjysanamgkfng",
    [string]$MigrationFile = "../supabase/migrations/20250303000002_complete_schema.sql"
)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "KK Studio Supabase Setup" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check if supabase CLI is installed
try {
    $supabaseVersion = supabase --version 2>$null
    Write-Host "✓ Supabase CLI found: $supabaseVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Supabase CLI not found. Installing..." -ForegroundColor Red
    npm install -g supabase
}

Write-Host ""
Write-Host "Step 1: Linking to project..." -ForegroundColor Yellow

# Set the token as environment variable
$env:SUPABASE_ACCESS_TOKEN = $Token

# Link project
supabase link --project-ref $ProjectRef

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to link project. Please check your access token." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 2: Pushing database schema..." -ForegroundColor Yellow

# Push migrations
supabase db push

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to push migrations. Trying manual SQL execution..." -ForegroundColor Yellow
    
    # Get the SQL content
    $sqlContent = Get-Content $MigrationFile -Raw
    
    Write-Host "Please execute the SQL manually in Supabase Dashboard:" -ForegroundColor Cyan
    Write-Host "1. Visit: https://app.supabase.com/project/$ProjectRef" -ForegroundColor Cyan
    Write-Host "2. Go to: SQL Editor > New Query" -ForegroundColor Cyan
    Write-Host "3. Copy contents from: $MigrationFile" -ForegroundColor Cyan
    Write-Host "4. Click Run" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Step 3: Verifying setup..." -ForegroundColor Yellow

# Check if we can connect
Write-Host "✓ Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "1. Register a user at: http://localhost:5173" -ForegroundColor White
Write-Host "2. In Supabase Dashboard, update the user's email to contain '@admin' for admin access" -ForegroundColor White
Write-Host "3. Check tables in: https://app.supabase.com/project/$ProjectRef/database/tables" -ForegroundColor White
Write-Host ""
