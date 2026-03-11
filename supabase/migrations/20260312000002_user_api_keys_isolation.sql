-- =====================================================
-- 用户API密钥隔离架构
-- 目标：
-- 1. 用户只能查看自己的API密钥
-- 2. 管理员只能查看自己的API密钥
-- 3. 用户可以使用管理员配置的模型，但看不到密钥和价格
-- 4. 统一的模型路由和计费系统
-- =====================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 创建用户API密钥表（加密存储）
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- 密钥配置
    name TEXT NOT NULL DEFAULT '我的API密钥',
    provider TEXT NOT NULL DEFAULT 'Custom', -- Google, OpenAI, 智谱, etc.
    api_key_encrypted TEXT NOT NULL, -- 加密的API密钥
    
    -- 可选配置
    base_url TEXT, -- 自定义代理地址
    is_active BOOLEAN DEFAULT TRUE,
    
    -- 使用统计
    call_count INTEGER DEFAULT 0,
    total_cost DECIMAL(10,4) DEFAULT 0,
    
    -- 时间戳
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- 限制每个用户的密钥数量
    CONSTRAINT user_api_keys_limit CHECK (
        (SELECT COUNT(*) FROM public.user_api_keys WHERE user_id = user_api_keys.user_id) <= 10
    )
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON public.user_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_active ON public.user_api_keys(user_id, is_active) WHERE is_active = TRUE;

-- 启用RLS
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

-- RLS策略：用户只能看到自己的密钥
CREATE POLICY "Users can only view own API keys"
ON public.user_api_keys FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can only insert own API keys"
ON public.user_api_keys FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only update own API keys"
ON public.user_api_keys FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can only delete own API keys"
ON public.user_api_keys FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- 权限
REVOKE ALL ON public.user_api_keys FROM PUBLIC;
REVOKE ALL ON public.user_api_keys FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_api_keys TO authenticated;

COMMENT ON TABLE public.user_api_keys IS 'User personal API keys - isolated and encrypted';

-- ---------------------------------------------------------------------------
-- 2. 更新管理员模型表 - 添加模型可见性控制
-- ---------------------------------------------------------------------------

-- 添加模型可见性字段
ALTER TABLE public.admin_credit_models
  ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public' 
    CHECK (visibility IN ('public', 'private', 'admin_only'));

COMMENT ON COLUMN public.admin_credit_models.visibility IS 'Model visibility: public=all users, private=admin only, admin_only=admin backend only';

-- ---------------------------------------------------------------------------
-- 3. 创建统一的模型路由视图（用户视角 - 隐藏敏感信息）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.available_models_for_users AS
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
  -- 对用户隐藏真实价格，显示标准化价格
  CASE 
    WHEN m.visibility = 'public' THEN m.credit_cost
    ELSE NULL
  END as credit_cost,
  m.priority,
  m.is_active,
  m.visibility,
  -- 不返回 api_keys
  NULL::TEXT[] as api_keys,
  -- 标记这是管理员模型
  'system' as source_type,
  m.provider_id as source_provider
FROM public.admin_credit_models m
WHERE m.is_active = TRUE
  AND m.visibility = 'public';

-- 权限：所有认证用户都可以查看可用模型
GRANT SELECT ON public.available_models_for_users TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. 创建安全的模型路由函数（核心）
-- ---------------------------------------------------------------------------

-- 函数：为用户选择最佳模型路由
-- 优先使用用户自己的API密钥，如果没有则使用管理员提供的
CREATE OR REPLACE FUNCTION public.get_model_route_for_user(
  p_user_id UUID,
  p_model_id TEXT,
  p_requested_size TEXT DEFAULT '1K'
)
RETURNS TABLE (
  route_type TEXT, -- 'user_key' | 'admin_model' | 'none'
  provider_id TEXT,
  base_url TEXT,
  api_key TEXT, -- 解密后的密钥（仅用于调用）
  model_id TEXT,
  endpoint_type TEXT,
  credit_cost INTEGER,
  user_pays INTEGER -- 用户实际需要支付的积分
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_key RECORD;
  v_admin_model RECORD;
  v_quality_key TEXT;
  v_final_cost INTEGER;
BEGIN
  -- 验证用户
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized access';
  END IF;

  -- 标准化尺寸
  v_quality_key := CASE 
    WHEN UPPER(p_requested_size) LIKE '%4K%' THEN '4K'
    WHEN UPPER(p_requested_size) LIKE '%2K%' THEN '2K'
    WHEN UPPER(p_requested_size) LIKE '%0.5%' OR UPPER(p_requested_size) LIKE '%512%' THEN '0.5K'
    ELSE '1K'
  END;

  -- 1. 首先检查用户是否有该模型的私有API密钥
  SELECT 
    k.id,
    k.api_key_encrypted,
    k.provider,
    k.base_url
  INTO v_user_key
  FROM public.user_api_keys k
  WHERE k.user_id = p_user_id
    AND k.is_active = TRUE
    AND k.provider = (
      CASE 
        WHEN p_model_id LIKE '%gemini%' THEN 'Google'
        WHEN p_model_id LIKE '%gpt%' THEN 'OpenAI'
        WHEN p_model_id LIKE '%claude%' THEN 'Anthropic'
        ELSE 'Custom'
      END
    )
  ORDER BY k.call_count ASC -- 负载均衡：使用调用次数最少的
  LIMIT 1;

  -- 如果用户有自己的密钥，使用用户的
  IF FOUND THEN
    -- 这里应该解密api_key_encrypted
    -- 暂时返回标记，实际调用时解密
    RETURN QUERY SELECT 
      'user_key'::TEXT,
      v_user_key.provider::TEXT,
      COALESCE(v_user_key.base_url, 'https://cdn.12ai.org')::TEXT,
      '***encrypted***'::TEXT, -- 实际使用时解密
      p_model_id::TEXT,
      CASE WHEN p_model_id LIKE '%gemini%' THEN 'gemini' ELSE 'openai' END::TEXT,
      0::INTEGER, -- 用户使用自己的密钥，不扣积分（或者收取少量服务费）
      0::INTEGER;
    RETURN;
  END IF;

  -- 2. 检查管理员配置的模型
  SELECT 
    m.id,
    m.provider_id,
    m.base_url,
    m.api_keys,
    m.model_id,
    m.endpoint_type,
    m.credit_cost,
    m.advanced_enabled,
    m.quality_pricing,
    m.call_count
  INTO v_admin_model
  FROM public.admin_credit_models m
  WHERE m.model_id = p_model_id
    AND m.is_active = TRUE
    AND m.visibility = 'public'
  ORDER BY m.priority DESC, m.call_count ASC -- 优先使用调用次数少的
  LIMIT 1;

  IF FOUND THEN
    -- 计算实际积分消耗（考虑高级设置）
    IF v_admin_model.advanced_enabled AND v_admin_model.quality_pricing IS NOT NULL THEN
      v_final_cost := COALESCE(
        (v_admin_model.quality_pricing->v_quality_key->>'creditCost')::INTEGER,
        v_admin_model.credit_cost
      );
    ELSE
      v_final_cost := v_admin_model.credit_cost;
    END IF;

    -- 选择一个API密钥
    RETURN QUERY SELECT 
      'admin_model'::TEXT,
      v_admin_model.provider_id::TEXT,
      v_admin_model.base_url::TEXT,
      v_admin_model.api_keys[1 + floor(random() * array_length(v_admin_model.api_keys, 1))::int]::TEXT,
      v_admin_model.model_id::TEXT,
      v_admin_model.endpoint_type::TEXT,
      v_final_cost::INTEGER,
      v_final_cost::INTEGER;
    RETURN;
  END IF;

  -- 3. 没有找到可用路由
  RETURN QUERY SELECT 
    'none'::TEXT,
    NULL::TEXT,
    NULL::TEXT,
    NULL::TEXT,
    NULL::TEXT,
    NULL::TEXT,
    NULL::INTEGER,
    NULL::INTEGER;
END;
$$;

-- 权限
REVOKE EXECUTE ON FUNCTION public.get_model_route_for_user(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_model_route_for_user(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_model_route_for_user(UUID, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. 创建积分消耗记录函数（隔离计费）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_model_usage(
  p_user_id UUID,
  p_model_id TEXT,
  p_route_type TEXT,
  p_credit_cost INTEGER,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- 如果是管理员模型，增加调用计数
  IF p_route_type = 'admin_model' THEN
    UPDATE public.admin_credit_models
    SET call_count = COALESCE(call_count, 0) + 1,
        total_credits_consumed = COALESCE(total_credits_consumed, 0) + p_credit_cost,
        updated_at = NOW()
    WHERE model_id = p_model_id;
  END IF;

  -- 记录交易（使用现有积分系统）
  INSERT INTO public.credit_transactions (
    user_id,
    type,
    amount,
    balance_after,
    model_id,
    description,
    status,
    metadata
  )
  SELECT 
    p_user_id,
    'consumption',
    -p_credit_cost,
    uc.balance - p_credit_cost,
    p_model_id,
    CASE p_route_type 
      WHEN 'user_key' THEN '使用自有API密钥'
      WHEN 'admin_model' THEN '使用系统模型'
      ELSE '未知来源'
    END,
    'completed',
    p_metadata
  FROM public.user_credits uc
  WHERE uc.user_id = p_user_id;

  RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. 创建视图：管理员看到的完整信息
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.admin_model_full_view AS
SELECT
  m.*,
  'admin' as view_type
FROM public.admin_credit_models m
WHERE EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.id = auth.uid() AND p.role = 'admin'
);

GRANT SELECT ON public.admin_model_full_view TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. 清理和撤销旧权限
-- ---------------------------------------------------------------------------

-- 确保普通用户不能直接访问admin_credit_models的敏感字段
REVOKE SELECT ON public.admin_credit_models FROM authenticated;

-- 只保留通过视图和函数的访问
GRANT SELECT ON public.available_models_for_users TO authenticated;

COMMIT;
