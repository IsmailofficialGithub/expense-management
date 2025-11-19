# PowerShell script to set up and deploy email function
# Run this script to automatically configure everything

Write-Host "🚀 Setting up Email Function..." -ForegroundColor Green

# Step 1: Check if Supabase CLI is installed
Write-Host "`n📦 Checking Supabase CLI..." -ForegroundColor Yellow
if (!(Get-Command supabase -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Supabase CLI..." -ForegroundColor Yellow
    npm install -g supabase
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to install Supabase CLI. Please install manually: npm install -g supabase" -ForegroundColor Red
        exit 1
    }
}

# Step 2: Login to Supabase
Write-Host "`n🔐 Logging in to Supabase..." -ForegroundColor Yellow
Write-Host "This will open your browser. Please login there." -ForegroundColor Cyan
supabase login
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Login failed. Please try again." -ForegroundColor Red
    exit 1
}

# Step 3: Get project ref
Write-Host "`n📋 Please provide your Supabase Project Reference ID:" -ForegroundColor Yellow
Write-Host "Find it at: https://supabase.com/dashboard → Settings → API → Reference ID" -ForegroundColor Cyan
$projectRef = Read-Host "Enter Project Reference ID"

if ([string]::IsNullOrWhiteSpace($projectRef)) {
    Write-Host "❌ Project Reference ID is required!" -ForegroundColor Red
    exit 1
}

# Step 4: Link project
Write-Host "`n🔗 Linking project..." -ForegroundColor Yellow
supabase link --project-ref $projectRef
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to link project. Check your project reference ID." -ForegroundColor Red
    exit 1
}

# Step 5: Get SMTP credentials
Write-Host "`n📧 Setting up SMTP credentials..." -ForegroundColor Yellow
Write-Host "Please provide your SMTP settings:" -ForegroundColor Cyan

$smtpHost = Read-Host "SMTP Host (e.g., smtp.gmail.com)"
$smtpPort = Read-Host "SMTP Port (e.g., 587)"
$smtpUser = Read-Host "SMTP User (your email)"
$smtpPassword = Read-Host "SMTP Password (app password)" -AsSecureString
$smtpFromEmail = Read-Host "From Email"
$smtpFromName = Read-Host "From Name (default: Flatmates Expense Tracker)"

# Convert secure string to plain text
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($smtpPassword)
$plainPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

if ([string]::IsNullOrWhiteSpace($smtpFromName)) {
    $smtpFromName = "Flatmates Expense Tracker"
}

# Step 6: Set secrets
Write-Host "`n🔐 Setting Supabase secrets..." -ForegroundColor Yellow
supabase secrets set SMTP_HOST=$smtpHost
supabase secrets set SMTP_PORT=$smtpPort
supabase secrets set SMTP_USER=$smtpUser
supabase secrets set SMTP_PASSWORD=$plainPassword
supabase secrets set SMTP_FROM_EMAIL=$smtpFromEmail
supabase secrets set SMTP_FROM_NAME="$smtpFromName"

# Step 7: Temporarily rename .env to avoid parsing errors
Write-Host "`n📝 Handling .env file..." -ForegroundColor Yellow
if (Test-Path .env) {
    Write-Host "Renaming .env to .env.backup to avoid parsing errors..." -ForegroundColor Cyan
    Rename-Item .env .env.backup -ErrorAction SilentlyContinue
}

# Step 8: Deploy function
Write-Host "`n🚀 Deploying Edge Function..." -ForegroundColor Yellow
supabase functions deploy send-invitation-email

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Deployment successful!" -ForegroundColor Green
    Write-Host "`n📧 Email function is now ready!" -ForegroundColor Green
    Write-Host "`nTest it by inviting a user in your app." -ForegroundColor Cyan
} else {
    Write-Host "`n❌ Deployment failed. Check the error above." -ForegroundColor Red
}

# Step 9: Restore .env if it was renamed
if (Test-Path .env.backup) {
    Write-Host "`n📝 Restoring .env file..." -ForegroundColor Yellow
    if (!(Test-Path .env)) {
        Rename-Item .env.backup .env
    }
}

Write-Host "`n✨ Done! Your email function should now be working." -ForegroundColor Green

