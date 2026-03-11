#!/bin/bash
# KK-Studio 生产环境安全验证脚本
# 在部署后运行此脚本验证安全配置

set -e

echo "🔒 KK-Studio 安全部署验证"
echo "=========================="

# 检查环境变量
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_KEY" ]; then
    echo "❌ 错误: 请设置 SUPABASE_URL 和 SUPABASE_SERVICE_KEY 环境变量"
    exit 1
fi

echo ""
echo "📋 检查项目: $SUPABASE_URL"

# 使用 supabase CLI 或 psql 连接
# 这里使用 HTTP API 方式

echo ""
echo "1️⃣ 验证 RLS 状态..."
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/check_rls_status" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" | jq .

echo ""
echo "2️⃣ 验证加密扩展..."
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/check_encryption_setup" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" | jq .

echo ""
echo "3️⃣ 验证跨用户隔离..."
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/test_cross_user_isolation" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" | jq .

echo ""
echo "4️⃣ 验证视图权限..."
curl -s -X GET "$SUPABASE_URL/rest/v1/vw_user_api_keys?select=*&limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" | jq .

echo ""
echo "✅ 基础安全验证完成"
echo ""
echo "⚠️  手动验证清单:"
echo "   - [ ] 以 User A 登录，确认看不到 User B 的密钥"
echo "   - [ ] 在浏览器 DevTools 中搜索 'api_key'，确认无完整密钥"
echo "   - [ ] 检查 Network 面板，密钥响应为 '***CONFIGURED***'"
echo "   - [ ] 验证 HTTPS 证书有效"
echo ""
