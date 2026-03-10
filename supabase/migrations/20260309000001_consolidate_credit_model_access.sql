-- Consolidate credit model access into a single secure path.
-- 1) Drop legacy public view to avoid duplicate data sources in dashboard.
-- 2) Expose only sanitized model metadata through get_active_credit_models().
-- 3) Revoke client access to get_credit_model_for_call(), keep service_role only.

BEGIN;

DROP VIEW IF EXISTS public.public_credit_models;

CREATE OR REPLACE FUNCTION public.get_active_credit_models()
RETURNS TABLE (
  provider_id TEXT,
  provider_name TEXT,
  models JSONB
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    m.provider_id,
    COALESCE(MAX(m.provider_name), m.provider_id) AS provider_name,
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'model_id', m.model_id,
        'display_name', m.display_name,
        'description', m.description,
        'color', m.color,
        'color_secondary', m.color_secondary,
        'text_color', m.text_color,
        'endpoint_type', m.endpoint_type,
        'credit_cost', m.credit_cost,
        'priority', m.priority,
        'weight', m.weight,
        'is_active', m.is_active
      )
      ORDER BY m.priority DESC, m.model_id
    ) AS models
  FROM public.admin_credit_models m
  WHERE m.is_active = TRUE
  GROUP BY m.provider_id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_active_credit_models() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_active_credit_models() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_active_credit_models() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_credit_models() TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_credit_model_for_call(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_credit_model_for_call(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_credit_model_for_call(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_credit_model_for_call(TEXT) TO service_role;

COMMIT;
