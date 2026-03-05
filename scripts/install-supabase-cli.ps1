# Supabase CLI Windows Installer
# Run in PowerShell: .\scripts\install-supabase-cli.ps1

Write-Host "Installing Supabase CLI for Windows..." -ForegroundColor Green

# Create directory
$installDir = "$env:USERPROFILE\.supabase\bin"
New-Item -ItemType Directory -Force -Path $installDir | Out-Null

# Download latest release
$releaseUrl = "https://github.com/supabase/cli/releases/latest/download/supabase_windows_amd64.tar.gz"
$downloadPath = "$env:TEMP\supabase.tar.gz"

Write-Host "Downloading Supabase CLI..." -ForegroundColor Yellow
try {
    Invoke-WebRequest -Uri $releaseUrl -OutFile $downloadPath -UseBasicParsing
    Write-Host "Download complete!" -ForegroundColor Green
} catch {
    Write-Error "Failed to download: $_"
    exit 1
}

# Extract (requires tar which is available in Windows 10+)
Write-Host "Extracting..." -ForegroundColor Yellow
try {
    tar -xzf $downloadPath -C $installDir
    Write-Host "Extraction complete!" -ForegroundColor Green
} catch {
    Write-Error "Failed to extract. Make sure you have tar installed (Windows 10+ or Git Bash)"
    exit 1
}

# Add to PATH
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($currentPath -notlike "*$installDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$currentPath;$installDir", "User")
    Write-Host "Added to PATH. Please restart your terminal." -ForegroundColor Yellow
}

# Verify
$supabasePath = "$installDir\supabase.exe"
if (Test-Path $supabasePath) {
    Write-Host "✅ Supabase CLI installed successfully!" -ForegroundColor Green
    Write-Host "Location: $supabasePath" -ForegroundColor Cyan
    
    # Test version
    & $supabasePath --version
} else {
    Write-Error "Installation failed - executable not found"
}

# Cleanup
Remove-Item $downloadPath -ErrorAction SilentlyContinue
