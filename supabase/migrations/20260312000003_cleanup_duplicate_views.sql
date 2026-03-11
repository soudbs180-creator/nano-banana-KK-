-- =====================================================
-- 清理重复的视图和表
-- 保留：
-- 1. admin_credit_models - 主表（保留）
-- 2. available_models_for_users - 用户视角视图（保留）
-- 删除：
-- 1. admin_credit_model_directory - 重复的管理员视图（删除）
-- =====================================================

BEGIN;

-- 删除重复的管理员视图（我们直接用表查询，不需要这个视图）
DROP VIEW IF EXISTS public.admin_credit_model_directory CASCADE;

-- 删除公共信用模型视图（如果存在重复）
-- 注意：保留 available_models_for_users，这是给用户看的

-- 清理可能重复的函数
-- 只保留一个 get_active_credit_models 函数
DROP FUNCTION IF EXISTS public.get_admin_credit_models_full() CASCADE;

-- 重新创建干净的视图：供用户查看的模型列表（不含敏感信息）
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
  m.credit_cost,
  m.priority,
  m.is_active,
  m.provider_id
FROM public.admin_credit_models m
WHERE m.is_active = TRUE
  AND m.visibility = 'public';

-- 视图权限：所有认证用户可查看
GRANT SELECT ON public.available_models_for_users TO authenticated;

-- 表权限收紧
-- 普通用户只能通过视图或RPC访问，不能直接查询表
REVOKE SELECT ON public.admin_credit_models FROM authenticated;

-- 但允许 authenticated 使用函数
GRANT EXECUTE ON FUNCTION public.get_active_credit_models() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_model_route_for_user(UUID, TEXT, TEXT) TO authenticated;

COMMIT;
