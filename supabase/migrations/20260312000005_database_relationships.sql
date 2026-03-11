-- =====================================================
-- 数据库关系梳理和优化
-- 1. 保留核心表
-- 2. 建立必要的外键关联
-- 3. 删除孤立/无用的表
-- =====================================================

BEGIN;

-- =====================================================
-- 第一部分：核心表清单（保留这些）
-- =====================================================

/*
✅ 保留的表及用途：

1. profiles (用户资料)
   - 主表，存储用户基本信息
   - 关联: auth.users(id)

2. user_credits (用户积分余额)
   - 存储用户当前积分余额
   - 关联: profiles(id) 或 auth.users(id)

3. credit_transactions (积分交易记录)
   - 积分变动历史
   - 关联: user_credits(user_id), profiles(id)

4. admin_credit_models (管理员模型配置)
   - 系统模型配置，包含敏感API密钥
   - 独立表，不直接关联用户表

5. admin_auth (管理员认证)
   - 管理员密码等认证信息
   - 独立表

6. user_api_keys (用户个人API密钥) - 如果已创建
   - 用户自己的API密钥（加密存储）
   - 关联: auth.users(id)

7. temp_users (临时用户)
   - 临时访客账号
   - 可删除（如不需要）

8. usage_records (使用记录)
   - 模型调用记录
   - 关联: profiles(id)

9. provider_pricing_cache (供应商价格缓存)
   - 第三方供应商价格缓存
   - 独立表
*/

-- =====================================================
-- 第二部分：删除无用的表/视图
-- =====================================================

-- 删除重复/无用的视图
DROP VIEW IF EXISTS public.public_credit_models CASCADE;
DROP VIEW IF EXISTS public.admin_credit_model_directory CASCADE;

-- =====================================================
-- 第三部分：建立外键关联
-- =====================================================

-- 1. user_credits 关联到 profiles
ALTER TABLE public.user_credits
  DROP CONSTRAINT IF EXISTS user_credits_user_id_fkey,
  ADD CONSTRAINT user_credits_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2. credit_transactions 关联到 profiles
ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_user_id_fkey,
  ADD CONSTRAINT credit_transactions_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 3. credit_transactions 关联到 user_credits（用于余额检查）
-- 注意：这个是通过 user_id 关联，不是外键约束

-- 4. user_api_keys 关联到 auth.users（如果表存在）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_api_keys') THEN
    ALTER TABLE public.user_api_keys
      DROP CONSTRAINT IF EXISTS user_api_keys_user_id_fkey,
      ADD CONSTRAINT user_api_keys_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 5. usage_records 关联到 profiles（如果表结构允许）
DO $$
BEGIN
  -- 检查 usage_records 是否有 user_id 列
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'usage_records' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.usage_records
      DROP CONSTRAINT IF EXISTS usage_records_user_id_fkey,
      ADD CONSTRAINT usage_records_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 6. temp_users - 如果没有使用可以删除
-- DROP TABLE IF EXISTS public.temp_users CASCADE;

-- =====================================================
-- 第四部分：创建必要的索引
-- =====================================================

-- 用户相关索引
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- 积分相关索引
CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON public.user_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON public.credit_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON public.credit_transactions(type);

-- 模型相关索引
CREATE INDEX IF NOT EXISTS idx_admin_credit_models_model_id ON public.admin_credit_models(model_id);
CREATE INDEX IF NOT EXISTS idx_admin_credit_models_provider ON public.admin_credit_models(provider_id);
CREATE INDEX IF NOT EXISTS idx_admin_credit_models_active ON public.admin_credit_models(is_active);

-- 用户API密钥索引（如果表存在）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_api_keys') THEN
    CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON public.user_api_keys(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_api_keys_active ON public.user_api_keys(user_id, is_active);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- =====================================================
-- 第五部分：创建统一视图
-- =====================================================

-- 用户可用模型视图（隐藏敏感信息）
DROP VIEW IF EXISTS public.vw_available_models CASCADE;
CREATE VIEW public.vw_available_models AS
SELECT
  m.id,
  m.model_id,
  m.display_name,
  m.description,
  m.color,
  m.color_secondary,
  m.text_color,
  m.gradient,
  m.endpoint_type,
  m.credit_cost,
  m.provider_id,
  'system' as source_type,
  true as is_available
FROM public.admin_credit_models m
WHERE m.is_active = TRUE
  AND m.visibility = 'public';

-- 用户积分概况视图
DROP VIEW IF EXISTS public.vw_user_credit_summary CASCADE;
CREATE VIEW public.vw_user_credit_summary AS
SELECT
  p.id as user_id,
  p.email,
  p.role,
  COALESCE(uc.balance, 0) as balance,
  COALESCE(uc.total_earned, 0) as total_earned,
  COALESCE(uc.total_spent, 0) as total_spent,
  uc.updated_at
FROM public.profiles p
LEFT JOIN public.user_credits uc ON uc.user_id = p.id;

-- =====================================================
-- 第六部分：权限设置
-- =====================================================

-- 视图权限
GRANT SELECT ON public.vw_available_models TO authenticated;
GRANT SELECT ON public.vw_user_credit_summary TO authenticated;

-- 表权限收紧
REVOKE ALL ON public.admin_credit_models FROM PUBLIC;
REVOKE ALL ON public.admin_auth FROM PUBLIC;

COMMIT;

-- =====================================================
-- 验证查询
-- =====================================================

-- 查看所有表的外键关系
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public';
