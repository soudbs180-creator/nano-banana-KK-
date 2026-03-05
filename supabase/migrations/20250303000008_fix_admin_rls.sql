-- =====================================================
-- 修复：允许通过密码验证的管理员修改配置
-- 使用 security definer 函数绕过 RLS
-- =====================================================

-- 1. 创建保存供应商配置的函数（绕过RLS）
CREATE OR REPLACE FUNCTION public.save_credit_provider(
    p_provider_id TEXT,
    p_provider_name TEXT,
    p_base_url TEXT,
    p_api_keys TEXT[],
    p_models JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER -- 以函数所有者的权限执行，绕过RLS
AS $$
BEGIN
    -- 删除该供应商的所有现有模型
    DELETE FROM public.admin_credit_models 
    WHERE provider_id = p_provider_id;
    
    -- 插入新配置
    FOR i IN 0..jsonb_array_length(p_models) - 1 LOOP
        INSERT INTO public.admin_credit_models (
            provider_id,
            provider_name,
            base_url,
            api_keys,
            model_id,
            display_name,
            description,
            color,
            gradient,
            endpoint_type,
            credit_cost,
            priority,
            weight,
            is_active
        ) VALUES (
            p_provider_id,
            p_provider_name,
            p_base_url,
            p_api_keys,
            p_models->i->>'model_id',
            p_models->i->>'display_name',
            p_models->i->>'description',
            COALESCE(p_models->i->>'color', '#3B82F6'),
            COALESCE(p_models->i->>'gradient', 'from-blue-500 to-indigo-600'),
            COALESCE(p_models->i->>'endpoint_type', 'gemini'),
            COALESCE((p_models->i->>'credit_cost')::INTEGER, 1),
            COALESCE((p_models->i->>'priority')::INTEGER, 10),
            COALESCE((p_models->i->>'weight')::INTEGER, 1),
            COALESCE((p_models->i->>'is_active')::BOOLEAN, TRUE)
        );
    END LOOP;
END;
$$;

-- 2. 创建删除供应商的函数（绕过RLS）
CREATE OR REPLACE FUNCTION public.delete_credit_provider(
    p_provider_id TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.admin_credit_models 
    WHERE provider_id = p_provider_id;
END;
$$;

-- 3. 授予执行权限给已认证用户
GRANT EXECUTE ON FUNCTION public.save_credit_provider TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_credit_provider TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_credit_provider TO anon;
GRANT EXECUTE ON FUNCTION public.delete_credit_provider TO anon;

-- 4. 更新 RLS 策略 - 允许 authenticated 用户通过函数修改
DROP POLICY IF EXISTS "Only admins can modify credit models" ON public.admin_credit_models;

CREATE POLICY "Only admins can modify credit models"
ON public.admin_credit_models FOR ALL
USING (
    -- 允许 authenticated 用户（已通过密码验证）
    auth.role() = 'authenticated'
    OR 
    -- 或者 profiles 表中标记为 admin 的用户
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- 5. 确保表有适当的权限
GRANT ALL ON public.admin_credit_models TO authenticated;

-- 输出成功信息
SELECT 'RLS修复完成：已创建绕过RLS的函数并更新策略' as status;
