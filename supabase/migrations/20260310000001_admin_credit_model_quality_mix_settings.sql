BEGIN;

ALTER TABLE public.admin_credit_models
  ADD COLUMN IF NOT EXISTS advanced_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mix_with_same_model BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS quality_pricing JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.admin_credit_models.advanced_enabled IS 'Enable per-quality pricing/availability overrides.';
COMMENT ON COLUMN public.admin_credit_models.mix_with_same_model IS 'Allow routing to mix with other providers for the same model_id.';
COMMENT ON COLUMN public.admin_credit_models.quality_pricing IS 'JSON pricing map like {"1K":{"enabled":true,"creditCost":1},"2K":...}.';

CREATE OR REPLACE FUNCTION public.save_credit_provider(
  p_provider_id TEXT,
  p_provider_name TEXT,
  p_base_url TEXT,
  p_api_keys TEXT[],
  p_models JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  i INTEGER;
  v_model JSONB;
  v_color TEXT;
  v_color_secondary TEXT;
  v_text_color TEXT;
  v_quality_pricing JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can modify credit providers';
  END IF;

  DELETE FROM public.admin_credit_models
  WHERE provider_id = p_provider_id;

  IF p_models IS NULL OR jsonb_typeof(p_models) <> 'array' THEN
    RETURN;
  END IF;

  FOR i IN 0..jsonb_array_length(p_models) - 1 LOOP
    v_model := p_models->i;
    v_color := public.normalize_admin_hex_color(v_model->>'color', '#3B82F6');
    v_color_secondary := public.normalize_admin_hex_color(
      NULLIF(v_model->>'color_secondary', ''),
      public.derive_admin_secondary_color(v_color)
    );
    v_text_color := COALESCE(NULLIF(lower(v_model->>'text_color'), ''), public.infer_admin_text_color(v_color_secondary));
    v_quality_pricing := COALESCE(v_model->'quality_pricing', '{}'::jsonb);

    IF v_text_color NOT IN ('white', 'black') THEN
      v_text_color := public.infer_admin_text_color(v_color_secondary);
    END IF;

    INSERT INTO public.admin_credit_models (
      provider_id,
      provider_name,
      base_url,
      api_keys,
      model_id,
      display_name,
      description,
      color,
      color_secondary,
      text_color,
      gradient,
      endpoint_type,
      credit_cost,
      max_calls_limit,
      auto_pause_on_limit,
      priority,
      weight,
      is_active,
      advanced_enabled,
      mix_with_same_model,
      quality_pricing
    ) VALUES (
      p_provider_id,
      p_provider_name,
      p_base_url,
      COALESCE(p_api_keys, ARRAY[]::TEXT[]),
      v_model->>'model_id',
      v_model->>'display_name',
      v_model->>'description',
      v_color,
      v_color_secondary,
      v_text_color,
      COALESCE(v_model->>'gradient', 'from-blue-500 to-indigo-600'),
      COALESCE(NULLIF(v_model->>'endpoint_type', ''), 'gemini'),
      COALESCE(NULLIF(v_model->>'credit_cost', '')::INTEGER, 1),
      NULLIF(NULLIF(v_model->>'max_calls_limit', '')::INTEGER, 0),
      COALESCE(NULLIF(v_model->>'auto_pause_on_limit', '')::BOOLEAN, TRUE),
      COALESCE(NULLIF(v_model->>'priority', '')::INTEGER, 10),
      COALESCE(NULLIF(v_model->>'weight', '')::INTEGER, 1),
      COALESCE(NULLIF(v_model->>'is_active', '')::BOOLEAN, TRUE),
      COALESCE(NULLIF(v_model->>'advanced_enabled', '')::BOOLEAN, FALSE),
      COALESCE(NULLIF(v_model->>'mix_with_same_model', '')::BOOLEAN, FALSE),
      CASE
        WHEN jsonb_typeof(v_quality_pricing) = 'object' THEN v_quality_pricing
        ELSE '{}'::jsonb
      END
    );
  END LOOP;
END;
$$;

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
$$;

CREATE OR REPLACE VIEW public.admin_credit_model_directory AS
SELECT
  m.id,
  m.provider_id,
  m.provider_name,
  m.base_url,
  m.model_id,
  m.display_name,
  m.description,
  m.endpoint_type,
  m.credit_cost,
  m.priority,
  m.weight,
  m.is_active,
  m.call_count,
  m.total_credits_consumed,
  m.max_calls_limit,
  m.auto_pause_on_limit,
  m.color,
  m.color_secondary,
  m.text_color,
  m.advanced_enabled,
  m.mix_with_same_model,
  m.quality_pricing,
  m.created_at,
  m.updated_at
FROM public.admin_credit_models m;

COMMIT;
