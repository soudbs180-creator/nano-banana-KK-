-- =====================================================
-- 数据库清理脚本
-- 查看并清理重复/不需要的表和视图
-- =====================================================

-- 1. 首先查看所有表和视图
SELECT 
    table_type,
    table_name,
    table_schema
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_type, table_name;

-- 2. 查看所有策略
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE schemaname = 'public';

-- 3. 清理命令（根据上面的查询结果，取消注释需要的命令）

-- 删除重复的视图（保留 available_models_for_users）
-- DROP VIEW IF EXISTS public.public_credit_models CASCADE;
-- DROP VIEW IF EXISTS public.admin_credit_model_directory CASCADE;

-- 如果需要删除表（谨慎操作！）
-- DROP TABLE IF EXISTS public.duplicate_table CASCADE;

-- 4. 确认最终保留的结构
-- 表：
--   - admin_auth (管理员认证)
--   - admin_credit_models (管理员模型配置)
--   - credit_transactions (积分交易记录)
--   - profiles (用户资料)
--   - provider_pricing_cache (供应商价格缓存)
--   - temp_users (临时用户)
--   - usage_records (使用记录)
--   - user_credits (用户积分)
--   - user_api_keys (用户API密钥 - 如果有)

-- 视图：
--   - available_models_for_users (用户可查看的模型)

-- 5. 修复权限
-- 重新应用RLS策略
