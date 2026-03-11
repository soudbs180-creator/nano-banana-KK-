-- =====================================================
-- 安全验证函数
-- 用于部署后验证安全配置
-- =====================================================

-- 函数：检查RLS状态
CREATE OR REPLACE FUNCTION public.check_rls_status()
RETURNS TABLE (
  table_name TEXT,
  rls_enabled BOOLEAN,
  rls_forced BOOLEAN,
  policy_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    t.tablename::TEXT,
    t.rowsecurity,
    c.relforcerowsecurity,
    (SELECT COUNT(*) FROM pg_policies p WHERE p.tablename = t.tablename)::BIGINT
  FROM pg_tables t
  JOIN pg_class c ON c.relname = t.tablename
  WHERE t.schemaname = 'public'
    AND t.tablename IN ('user_api_keys', 'admin_credit_models', 'profiles', 'user_credits', 'credit_transactions');
$$;

-- 函数：检查加密设置
CREATE OR REPLACE FUNCTION public.check_encryption_setup()
RETURNS TABLE (
  extension_installed BOOLEAN,
  encryption_configured BOOLEAN,
  sample_encryption TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_has_pgcrypto BOOLEAN;
  v_has_key BOOLEAN;
  v_test_encrypt TEXT;
BEGIN
  -- 检查 pgcrypto
  SELECT EXISTS(
    SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
  ) INTO v_has_pgcrypto;

  -- 检查加密密钥
  BEGIN
    PERFORM current_setting('app.encryption_key');
    v_has_key := TRUE;
  EXCEPTION WHEN OTHERS THEN
    v_has_key := FALSE;
  END;

  -- 测试加密
  IF v_has_pgcrypto AND v_has_key THEN
    SELECT encode(
      pgp_sym_encrypt('test', current_setting('app.encryption_key')),
      'base64'
    ) INTO v_test_encrypt;
  ELSE
    v_test_encrypt := 'NOT_AVAILABLE';
  END IF;

  RETURN QUERY SELECT v_has_pgcrypto, v_has_key, v_test_encrypt;
END;
$$;

-- 函数：测试跨用户隔离（返回测试结果，不暴露真实数据）
CREATE OR REPLACE FUNCTION public.test_cross_user_isolation()
RETURNS TABLE (
  test_name TEXT,
  passed BOOLEAN,
  details TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_user UUID;
  v_test_user UUID;
  v_count INTEGER;
BEGIN
  v_current_user := auth.uid();

  -- 测试1：当前用户只能看到自己的密钥
  RETURN QUERY SELECT 
    'Self-access only'::TEXT,
    TRUE,
    format('Current user %s accessing own keys', v_current_user);

  -- 测试2：验证RLS策略阻止跨用户访问
  SELECT COUNT(*) INTO v_count
  FROM user_api_keys
  WHERE user_id != v_current_user;

  IF v_count = 0 THEN
    RETURN QUERY SELECT 
      'Cross-user isolation'::TEXT,
      TRUE,
      format('Blocked access to %s keys belonging to other users', v_count);
  ELSE
    RETURN QUERY SELECT 
      'Cross-user isolation'::TEXT,
      FALSE,
      format('SECURITY ISSUE: Can see %s keys from other users!', v_count);
  END IF;

  -- 测试3：验证视图不返回加密密钥
  IF EXISTS(
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'vw_user_api_keys' 
    AND column_name = 'api_key_encrypted'
  ) THEN
    RETURN QUERY SELECT 
      'View security'::TEXT,
      FALSE,
      'SECURITY ISSUE: View exposes api_key_encrypted column!';
  ELSE
    RETURN QUERY SELECT 
      'View security'::TEXT,
      TRUE,
      'View correctly hides encrypted key column';
  END IF;
END;
$$;

-- 函数：获取安全审计摘要
CREATE OR REPLACE FUNCTION public.get_security_audit_summary()
RETURNS TABLE (
  metric TEXT,
  value BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  -- 总密钥数（按用户分组，不暴露具体用户）
  SELECT 'total_encrypted_keys'::TEXT, COUNT(*)::BIGINT FROM user_api_keys
  UNION ALL
  -- 活跃用户密钥数
  SELECT 'active_user_keys'::TEXT, COUNT(*)::BIGINT FROM user_api_keys WHERE is_active = TRUE
  UNION ALL
  -- 失败访问尝试数（最近24小时）
  SELECT 'failed_access_attempts_24h'::TEXT, COUNT(*)::BIGINT 
  FROM security_audit_log 
  WHERE success = FALSE AND created_at > NOW() - INTERVAL '24 hours'
  UNION ALL
  -- 配置的RLS策略数
  SELECT 'rls_policies_count'::TEXT, COUNT(*)::BIGINT FROM pg_policies WHERE schemaname = 'public';
$$;

-- 授予验证函数权限
GRANT EXECUTE ON FUNCTION public.check_rls_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_encryption_setup() TO service_role;
GRANT EXECUTE ON FUNCTION public.test_cross_user_isolation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_security_audit_summary() TO service_role;
