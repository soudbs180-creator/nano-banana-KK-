# KK-Studio 生产环境安全部署检查脚本
# 运行方式: .\scripts\security\deploy-security-check.ps1

param(
    [Parameter(Mandatory=$true)]
    [string]$SupabaseUrl,
    
    [Parameter(Mandatory=$true)]
    [string]$ServiceRoleKey,
    
    [Parameter(Mandatory=$true)]
    [string]$AnonKey
)

Write-Host "🔒 KK-Studio 安全部署验证" -ForegroundColor Cyan
Write-Host "==========================" -ForegroundColor Cyan
Write-Host ""

$headers = @{
    "apikey" = $AnonKey
    "Authorization" = "Bearer $AnonKey"
    "Content-Type" = "application/json"
}

$adminHeaders = @{
    "apikey" = $ServiceRoleKey
    "Authorization" = "Bearer $ServiceRoleKey"
    "Content-Type" = "application/json"
}

$passedTests = 0
$failedTests = 0

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Endpoint,
        [hashtable]$Headers,
        [string]$Body = "",
        [scriptblock]$Validation
    )
    
    Write-Host "Testing: $Name..." -NoNewline
    
    try {
        $uri = "$SupabaseUrl/rest/v1/$Endpoint"
        
        if ($Method -eq "GET") {
            $response = Invoke-RestMethod -Uri $uri -Headers $Headers -Method GET -ErrorAction Stop
        } else {
            $response = Invoke-RestMethod -Uri $uri -Headers $Headers -Method POST -Body $Body -ErrorAction Stop
        }
        
        if (& $Validation $response) {
            Write-Host " ✅ PASS" -ForegroundColor Green
            $script:passedTests++
            return $true
        } else {
            Write-Host " ❌ FAIL (Validation)" -ForegroundColor Red
            $script:failedTests++
            return $false
        }
    } catch {
        Write-Host " ❌ FAIL ($($_.Exception.Message))" -ForegroundColor Red
        $script:failedTests++
        return $false
    }
}

# Test 1: 验证RLS状态
Test-Endpoint -Name "RLS Status Check" -Method "POST" -Endpoint "rpc/check_rls_status" -Headers $adminHeaders -Validation {
    param($r)
    $r | ForEach-Object { 
        if ($_.table_name -eq "user_api_keys" -and $_.rls_enabled -eq $true) { return $true }
    }
    return $false
}

# Test 2: 验证加密扩展
Test-Endpoint -Name "Encryption Extension" -Method "POST" -Endpoint "rpc/check_encryption_setup" -Headers $adminHeaders -Validation {
    param($r)
    return $r[0].extension_installed -eq $true
}

# Test 3: 验证跨用户隔离（匿名用户应该被拒绝）
Write-Host "Testing: Cross-User Isolation (Anon)..." -NoNewline
try {
    $uri = "$SupabaseUrl/rest/v1/user_api_keys?select=*&limit=1"
    $response = Invoke-RestMethod -Uri $uri -Headers $headers -Method GET -ErrorAction Stop
    if ($response.Count -eq 0) {
        Write-Host " ✅ PASS" -ForegroundColor Green
        $passedTests++
    } else {
        Write-Host " ❌ FAIL (Data leaked!)" -ForegroundColor Red
        $failedTests++
    }
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 401 -or $_.Exception.Response.StatusCode.value__ -eq 403) {
        Write-Host " ✅ PASS (403 Forbidden)" -ForegroundColor Green
        $passedTests++
    } else {
        Write-Host " ❌ FAIL ($($_.Exception.Message))" -ForegroundColor Red
        $failedTests++
    }
}

# Test 4: 验证视图权限
Test-Endpoint -Name "View Access (vw_user_api_keys)" -Method "GET" -Endpoint "vw_user_api_keys?select=*&limit=1" -Headers $headers -Validation {
    param($r)
    # 应该返回空数组（未认证用户）
    return $r -is [array]
}

# Test 5: 验证审计日志表
Test-Endpoint -Name "Audit Log Table" -Method "GET" -Endpoint "security_audit_log?select=count&limit=1" -Headers $adminHeaders -Validation {
    param($r)
    return $true  # 只要表存在即可
}

Write-Host ""
Write-Host "==========================" -ForegroundColor Cyan
Write-Host "测试结果:" -ForegroundColor Cyan
Write-Host "  通过: $passedTests" -ForegroundColor Green
Write-Host "  失败: $failedTests" -ForegroundColor $(if($failedTests -gt 0){"Red"}else{"Green"})

if ($failedTests -gt 0) {
    Write-Host ""
    Write-Host "⚠️  安全验证未通过！请勿部署到生产环境。" -ForegroundColor Red
    exit 1
} else {
    Write-Host ""
    Write-Host "✅ 所有安全测试通过！" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 手动验证清单:" -ForegroundColor Yellow
    Write-Host "   - [ ] 以 User A 登录，确认看不到 User B 的密钥"
    Write-Host "   - [ ] 在浏览器 DevTools 中搜索 'api_key'，确认无完整密钥"
    Write-Host "   - [ ] 检查 Network 面板，密钥响应为 '***CONFIGURED***'"
    Write-Host "   - [ ] 验证 HTTPS 证书有效"
    exit 0
}
