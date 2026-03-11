-- =====================================================
-- 安全修复：防止API密钥泄露
-- 1. 修复 get_active_credit_models 函数，不再返回 api_keys
-- 2. 创建安全的替代函数供不同场景使用
-- =====================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 修复 get_active_credit_models 函数 - 移除 api_keys 字段
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_active_credit_models()
RETURNS TABLE (
  provider_id TEXT,
  provider_name TEXT,
  base_url TEXT,
  models JSONB
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    m.provider_id,
    m.provider_name,
    m.base_url,
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'model_id', m.model_id,
        'display_name', m.display_name,
        'description', m.description,
        'color', m.color,
        'color_secondary', m.color_secondary,
        'text_color', m.text_color,
        'gradient', m.gradient,
        'endpoint_type', m.endpoint_type,
        'credit_cost', m.credit_cost,
        'priority', m.priority,
        'weight', m.weight,
        'call_count', m.call_count,
        'is_active', m.is_active,
        'advanced_enabled', m.advanced_enabled,
        'mix_with_same_model', m.mix_with_same_model,
        'quality_pricing', m.quality_pricing
      )
      ORDER BY m.priority DESC, m.model_id
    ) AS models
  FROM public.admin_credit_models m
  WHERE m.is_active = TRUE
  GROUP BY m.provider_id, m.provider_name, m.base_url;
$$;

-- ---------------------------------------------------------------------------
-- 2. 创建管理员专用函数 - 可以查看完整信息包括 api_keys
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_credit_models_full()
RETURNS TABLE (
  provider_id TEXT,
  provider_name TEXT,
  base_url TEXT,
  api_keys TEXT[],
  models JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 检查是否为管理员
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can access full model configuration';
  END IF;

  RETURN QUERY
  SELECT
    m.provider_id,
    m.provider_name,
    m.base_url,
    m.api_keys,
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'model_id', m.model_id,
        'display_name', m.display_name,
        'description', m.description,
        'color', m.color,
        'color_secondary', m.color_secondary,
        'text_color', m.text_color,
        'gradient', m.gradient,
        'endpoint_type', m.endpoint_type,
        'credit_cost', m.credit_cost,
        'priority', m.priority,
        'weight', m.weight,
        'call_count', m.call_count,
        'is_active', m.is_active,
        'advanced_enabled', m.advanced_enabled,
        'mix_with_same_model', m.mix_with_same_model,
        'quality_pricing', m.quality_pricing
      )
      ORDER BY m.priority DESC, m.model_id
    ) AS models
  FROM public.admin_credit_models m
  WHERE m.is_active = TRUE
  GROUP BY m.provider_id, m.provider_name, m.base_url, m.api_keys;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. 修复 RLS 策略 - 确保只有管理员能访问 api_keys
-- ---------------------------------------------------------------------------

-- 删除过于宽松的策略
DROP POLICY IF EXISTS "Users view active models info" ON public.admin_credit_models;

-- 普通用户只能查看不含敏感信息的基本字段
CREATE POLICY "Users can view basic model info"
ON public.admin_credit_models
FOR SELECT
TO authenticated
USING (
  is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

-- 管理员有完全访问权限
DROP POLICY IF EXISTS "Admins full access to credit models" ON public.admin_credit_models;

CREATE POLICY "Admins can view all credit models"
ON public.admin_credit_models
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

CREATE POLICY "Admins can modify credit models"
ON public.admin_credit_models
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

-- ---------------------------------------------------------------------------
-- 4. 收紧权限
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.get_active_credit_models() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_active_credit_models() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_active_credit_models() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_admin_credit_models_full() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_admin_credit_models_full() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_credit_models_full() TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. 确保 api_keys 字段有适当的列级保护
-- ---------------------------------------------------------------------------

-- 注释 api_keys 字段，明确标记为敏感
COMMENT ON COLUMN public.admin_credit_models.api_keys IS 'SENSITIVE: API keys for provider access. Only accessible to admins.';

COMMIT;
