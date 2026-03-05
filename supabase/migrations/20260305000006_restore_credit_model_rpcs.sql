-- Restore missing credit model RPCs for runtime routing compatibility.
-- This migration is safe to run repeatedly.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_active_credit_models()
RETURNS TABLE (
  provider_id TEXT,
  provider_name TEXT,
  base_url TEXT,
  api_keys TEXT[],
  models JSONB
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    m.provider_id,
    COALESCE(MAX(m.provider_name), m.provider_id) AS provider_name,
    MAX(m.base_url) AS base_url,
    MAX(m.api_keys) AS api_keys,
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'model_id', m.model_id,
        'display_name', m.display_name,
        'description', m.description,
        'color', m.color,
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

CREATE OR REPLACE FUNCTION public.get_credit_model_for_call(
  p_model_id TEXT
)
RETURNS TABLE (
  id UUID,
  provider_id TEXT,
  base_url TEXT,
  api_key TEXT,
  model_id TEXT,
  endpoint_type TEXT,
  credit_cost INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_api_keys TEXT[];
  v_selected_key TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT
    m.id,
    m.provider_id,
    m.base_url,
    m.api_keys,
    m.model_id,
    m.endpoint_type,
    m.credit_cost
  INTO
    id,
    provider_id,
    base_url,
    v_api_keys,
    model_id,
    endpoint_type,
    credit_cost
  FROM public.admin_credit_models m
  WHERE m.is_active = TRUE
    AND (
      m.model_id = p_model_id
      OR m.model_id = p_model_id || '@system'
      OR m.model_id LIKE p_model_id || '@system_%'
      OR split_part(m.model_id, '@', 1) = p_model_id
    )
  ORDER BY m.priority DESC, random()
  LIMIT 1;

  IF FOUND THEN
    IF array_length(v_api_keys, 1) > 0 THEN
      v_selected_key := v_api_keys[1 + floor(random() * array_length(v_api_keys, 1))::int];
    END IF;
    api_key := v_selected_key;
    RETURN NEXT;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_active_credit_models() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_active_credit_models() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_active_credit_models() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_credit_models() TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_credit_model_for_call(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_credit_model_for_call(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_credit_model_for_call(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_credit_model_for_call(TEXT) TO service_role;

COMMIT;
