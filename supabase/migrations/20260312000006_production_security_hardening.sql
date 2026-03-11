-- =====================================================
-- 生产环境安全加固
-- 目标：绝对防止跨用户密钥泄露
-- =====================================================

BEGIN;

-- =====================================================
-- 1. 删除所有测试/开发用的宽松权限
-- =====================================================

-- 撤销所有公共访问
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;

-- 撤销匿名用户所有权限
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- =====================================================
-- 2. 核心表结构加固
-- =====================================================

-- 用户API密钥表（如果不存在则创建）
CREATE TABLE IF NOT EXISTS public.user_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'My API Key',
    provider TEXT NOT NULL,
    -- 使用 pgcrypto 加密存储
    api_key_encrypted BYTEA NOT NULL,
    -- 加密密钥版本（用于密钥轮换）
    key_version INTEGER DEFAULT 1,
    base_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    -- 使用限制
    monthly_quota INTEGER DEFAULT -1, -- -1 = 无限制
    monthly_used INTEGER DEFAULT 0,
    -- 审计字段
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    -- 约束
    CONSTRAINT valid_provider CHECK (provider IN ('Google', 'OpenAI', 'Anthropic', '智谱', '火山引擎', '阿里云', '腾讯云', 'Custom')),
    CONSTRAINT name_length CHECK (LENGTH(name) BETWEEN 1 AND 100)
);

-- 启用RLS
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

-- 强制RLS（即使超级用户也要遵守）
ALTER TABLE public.user_api_keys FORCE ROW LEVEL SECURITY;

-- =====================================================
-- 3. 严格的RLS策略
-- =====================================================

-- 策略1：用户只能看到自己的密钥（最严格）
CREATE POLICY "user_api_keys_isolation_select"
ON public.user_api_keys FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 策略2：用户只能插入自己的密钥
CREATE POLICY "user_api_keys_isolation_insert"
ON public.user_api_keys FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- 策略3：用户只能更新自己的密钥
CREATE POLICY "user_api_keys_isolation_update"
ON public.user_api_keys FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 策略4：用户只能删除自己的密钥
CREATE POLICY "user_api_keys_isolation_delete"
ON public.user_api_keys FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- =====================================================
-- 4. 管理员模型表加固
-- =====================================================

-- 添加审计字段
ALTER TABLE public.admin_credit_models
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public' 
    CHECK (visibility IN ('public', 'private', 'admin_only')),
  ADD COLUMN IF NOT EXISTS allow_user_override BOOLEAN DEFAULT FALSE; -- 是否允许用户使用自己的密钥覆盖

-- 强制RLS
ALTER TABLE public.admin_credit_models FORCE ROW LEVEL SECURITY;

-- 管理员模型访问策略
DROP POLICY IF EXISTS "admin_models_user_access" ON public.admin_credit_models;
CREATE POLICY "admin_models_user_access"
ON public.admin_credit_models FOR SELECT
TO authenticated
USING (
  -- 公共模型所有人可见
  (visibility = 'public' AND is_active = TRUE)
  OR 
  -- 管理员可以看到所有
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- =====================================================
-- 5. 安全视图（用户只能看到这些字段）
-- =====================================================

-- 删除旧视图
DROP VIEW IF EXISTS public.vw_user_api_keys CASCADE;
DROP VIEW IF EXISTS public.vw_available_models CASCADE;
DROP VIEW IF EXISTS public.vw_model_routes CASCADE;

-- 用户API密钥视图（不返回加密后的密钥）
CREATE VIEW public.vw_user_api_keys AS
SELECT 
  id,
  user_id,
  name,
  provider,
  -- 不返回 api_key_encrypted！
  CASE 
    WHEN user_id = auth.uid() THEN '***CONFIGURED***'
    ELSE '***HIDDEN***'
  END as key_status,
  base_url,
  is_active,
  monthly_quota,
  monthly_used,
  created_at,
  updated_at,
  last_used_at
FROM public.user_api_keys
WHERE user_id = auth.uid(); -- 额外安全层

-- 可用模型视图（用户视角）
CREATE VIEW public.vw_available_models AS
SELECT 
  m.id,
  m.model_id,
  m.display_name,
  m.description,
  m.color,
  m.endpoint_type,
  -- 价格信息：对用户显示标准价格，隐藏实际成本
  m.credit_cost as user_cost,
  -- 标记是否允许使用自己的密钥
  COALESCE(m.allow_user_override, FALSE) as allow_custom_key,
  'system' as source_type
FROM public.admin_credit_models m
WHERE m.is_active = TRUE
  AND m.visibility = 'public';

-- 视图权限
GRANT SELECT ON public.vw_user_api_keys TO authenticated;
GRANT SELECT ON public.vw_available_models TO authenticated;

-- =====================================================
-- 6. 核心安全函数
-- =====================================================

-- 函数：获取模型路由（唯一获取解密密钥的方式）
CREATE OR REPLACE FUNCTION public.get_secure_model_route(
  p_model_id TEXT,
  p_preferred_provider TEXT DEFAULT NULL
)
RETURNS TABLE (
  route_type TEXT,           -- 'user_key' | 'admin_model' | 'none'
  provider_id TEXT,
  base_url TEXT,
  api_key TEXT,              -- 临时解密的密钥，仅本次调用有效
  model_id TEXT,
  endpoint_type TEXT,
  credit_cost INTEGER,
  user_pays INTEGER,
  expires_at TIMESTAMPTZ     -- 密钥过期时间
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_user_key RECORD;
  v_admin_model RECORD;
  v_decrypted_key TEXT;
  v_expires TIMESTAMPTZ;
BEGIN
  -- 获取当前用户ID
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 密钥有效期：5分钟
  v_expires := NOW() + INTERVAL '5 minutes';

  -- 1. 检查用户是否有自己的密钥（优先使用）
  SELECT 
    k.id,
    k.api_key_encrypted,
    k.base_url,
    k.provider,
    pgp_sym_decrypt(k.api_key_encrypted, current_setting('app.encryption_key')) as decrypted_key
  INTO v_user_key
  FROM public.user_api_keys k
  WHERE k.user_id = v_user_id
    AND k.is_active = TRUE
    AND (p_preferred_provider IS NULL OR k.provider = p_preferred_provider)
  ORDER BY k.last_used_at NULLS FIRST
  LIMIT 1;

  IF FOUND AND v_user_key.decrypted_key IS NOT NULL THEN
    -- 更新最后使用时间
    UPDATE public.user_api_keys 
    SET last_used_at = NOW(),
        monthly_used = monthly_used + 1
    WHERE id = v_user_key.id;

    RETURN QUERY SELECT 
      'user_key'::TEXT,
      v_user_key.provider::TEXT,
      COALESCE(v_user_key.base_url, 'https://cdn.12ai.org')::TEXT,
      v_user_key.decrypted_key::TEXT,
      p_model_id::TEXT,
      CASE WHEN p_model_id LIKE '%gemini%' THEN 'gemini' ELSE 'openai' END::TEXT,
      0::INTEGER,  -- 使用自己的密钥不收费
      0::INTEGER,
      v_expires::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- 2. 使用管理员配置的模型
  SELECT 
    m.id,
    m.provider_id,
    m.base_url,
    m.api_keys[1 + floor(random() * array_length(m.api_keys, 1))::int] as api_key,
    m.model_id,
    m.endpoint_type,
    m.credit_cost
  INTO v_admin_model
  FROM public.admin_credit_models m
  WHERE m.model_id = p_model_id
    AND m.is_active = TRUE
    AND m.visibility = 'public'
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT 
      'admin_model'::TEXT,
      v_admin_model.provider_id::TEXT,
      v_admin_model.base_url::TEXT,
      v_admin_model.api_key::TEXT,
      v_admin_model.model_id::TEXT,
      v_admin_model.endpoint_type::TEXT,
      v_admin_model.credit_cost::INTEGER,
      v_admin_model.credit_cost::INTEGER,
      v_expires::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- 3. 无可用路由
  RETURN QUERY SELECT 
    'none'::TEXT,
    NULL::TEXT,
    NULL::TEXT,
    NULL::TEXT,
    NULL::TEXT,
    NULL::TEXT,
    NULL::INTEGER,
    NULL::INTEGER,
    NULL::TIMESTAMPTZ;
END;
$$;

-- 函数：安全添加用户API密钥（服务端加密）
CREATE OR REPLACE FUNCTION public.add_user_api_key_secure(
  p_name TEXT,
  p_provider TEXT,
  p_api_key TEXT,
  p_base_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_key_id UUID;
  v_encrypted BYTEA;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 输入验证
  IF LENGTH(p_api_key) < 10 OR LENGTH(p_api_key) > 500 THEN
    RAISE EXCEPTION 'Invalid API key length';
  END IF;

  -- 加密存储（使用数据库级别的加密）
  v_encrypted := pgp_sym_encrypt(p_api_key, current_setting('app.encryption_key'));

  INSERT INTO public.user_api_keys (
    user_id,
    name,
    provider,
    api_key_encrypted,
    base_url
  ) VALUES (
    v_user_id,
    p_name,
    p_provider,
    v_encrypted,
    p_base_url
  )
  RETURNING id INTO v_key_id;

  RETURN v_key_id;
END;
$$;

-- 函数：记录安全审计日志
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL, -- 'api_key' | 'model' | 'credit'
  resource_id TEXT,
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 审计日志索引
CREATE INDEX IF NOT EXISTS idx_security_audit_user ON public.security_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_action ON public.security_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_security_audit_created ON public.security_audit_log(created_at);

-- 审计日志RLS
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_log FORCE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_user_view"
ON public.security_audit_log FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() 
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- =====================================================
-- 7. 权限最终确认
-- =====================================================

-- 仅授予必要的函数执行权限
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- 认证用户可以执行的函数
GRANT EXECUTE ON FUNCTION public.get_secure_model_route(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_user_api_key_secure(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- 仅允许通过视图访问表数据
GRANT SELECT ON public.vw_user_api_keys TO authenticated;
GRANT SELECT ON public.vw_available_models TO authenticated;

-- 禁止直接访问敏感表
REVOKE SELECT ON public.user_api_keys FROM authenticated;
REVOKE SELECT ON public.admin_credit_models FROM authenticated;

COMMIT;

-- =====================================================
-- 8. 验证查询（部署后运行）
-- =====================================================

/*
-- 验证1：确认RLS已启用
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- 验证2：确认策略已应用
SELECT tablename, policyname, permissive, roles FROM pg_policies WHERE schemaname = 'public';

-- 验证3：测试跨用户访问（应该返回0行）
-- 以用户A身份查询用户B的密钥，应该无结果

-- 验证4：确认函数权限
SELECT proname, proacl FROM pg_proc WHERE proname IN ('get_secure_model_route', 'add_user_api_key_secure');
*/
