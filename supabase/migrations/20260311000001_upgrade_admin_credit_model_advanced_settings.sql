-- Upgrade: Admin Credit Model Advanced Settings
-- 1) Add missing columns for advanced settings, quality pricing, mix mode
-- 2) Update functions to support new fields
-- 3) Add call_count and total_credits_consumed tracking

BEGIN;

-- ============================================
-- 1. Add missing columns to admin_credit_models
-- ============================================

-- Add call tracking columns
ALTER TABLE public.admin_credit_models
  ADD COLUMN IF NOT EXISTS call_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_credits_consumed INTEGER DEFAULT 0;

-- Add advanced settings columns
ALTER TABLE public.admin_credit_models
  ADD COLUMN IF NOT EXISTS advanced_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mix_with_same_model BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS quality_pricing JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Add color/appearance columns (if not exists from previous migrations)
ALTER TABLE public.admin_credit_models
  ADD COLUMN IF NOT EXISTS color_secondary TEXT,
  ADD COLUMN IF NOT EXISTS text_color TEXT DEFAULT 'white';

-- Add limit control columns (if not exists from previous migrations)
ALTER TABLE public.admin_credit_models
  ADD COLUMN IF NOT EXISTS max_calls_limit INTEGER,
  ADD COLUMN IF NOT EXISTS auto_pause_on_limit BOOLEAN DEFAULT TRUE;

-- Ensure text color constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_credit_models_text_color_check'
  ) THEN
    ALTER TABLE public.admin_credit_models
      ADD CONSTRAINT admin_credit_models_text_color_check
      CHECK (text_color IN ('white', 'black'));
  END IF;
END $$;

-- Add comments for new columns
COMMENT ON COLUMN public.admin_credit_models.call_count IS 'Total number of API calls made to this model';
COMMENT ON COLUMN public.admin_credit_models.total_credits_consumed IS 'Total credits consumed by this model';
COMMENT ON COLUMN public.admin_credit_models.advanced_enabled IS 'Enable per-quality pricing/availability overrides';
COMMENT ON COLUMN public.admin_credit_models.mix_with_same_model IS 'Allow routing to mix with other providers for the same model_id';
COMMENT ON COLUMN public.admin_credit_models.quality_pricing IS 'JSON pricing map like {"0.5K":{"enabled":true,"creditCost":1},"1K":...,"2K":...,"4K":...}';

-- ============================================
-- 2. Update helper functions
-- ============================================

-- Normalize hex color
CREATE OR REPLACE FUNCTION public.normalize_admin_hex_color(
  p_color TEXT,
  p_fallback TEXT DEFAULT '#3B82F6'
) RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_color TEXT := COALESCE(NULLIF(trim(p_color), ''), p_fallback);
BEGIN
  -- Add # prefix if missing
  IF v_color !~ '^#' AND v_color ~ '^[A-Fa-f0-9]{3,8}$' THEN
    v_color := '#' || v_color;
  END IF;
  RETURN UPPER(v_color);
END;
$$;

-- Derive secondary color
CREATE OR REPLACE FUNCTION public.derive_admin_secondary_color(
  p_primary TEXT
) RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_hex TEXT;
  v_r INTEGER;
  v_g INTEGER;
  v_b INTEGER;
BEGIN
  v_hex := REPLACE(COALESCE(p_primary, '#3B82F6'), '#', '');
  IF LENGTH(v_hex) = 3 THEN
    v_hex := SUBSTRING(v_hex, 1, 1) || SUBSTRING(v_hex, 1, 1) ||
             SUBSTRING(v_hex, 2, 1) || SUBSTRING(v_hex, 2, 1) ||
             SUBSTRING(v_hex, 3, 1) || SUBSTRING(v_hex, 3, 1);
  END IF;
  IF LENGTH(v_hex) >= 6 THEN
    v_r := GREATEST(0, (to_number(SUBSTRING(v_hex, 1, 2), 'XX') * 0.8)::INTEGER);
    v_g := GREATEST(0, (to_number(SUBSTRING(v_hex, 3, 2), 'XX') * 0.8)::INTEGER);
    v_b := GREATEST(0, (to_number(SUBSTRING(v_hex, 5, 2), 'XX') * 0.8)::INTEGER);
    RETURN UPPER('#' || 
      TO_CHAR(v_r, 'FMXX') || 
      TO_CHAR(v_g, 'FMXX') || 
      TO_CHAR(v_b, 'FMXX'));
  END IF;
  RETURN '#1E40AF';
END;
$$;

-- Infer text color from background
CREATE OR REPLACE FUNCTION public.infer_admin_text_color(
  p_background TEXT
) RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_hex TEXT;
  v_r INTEGER;
  v_g INTEGER;
  v_b INTEGER;
  v_brightness FLOAT;
BEGIN
  v_hex := REPLACE(COALESCE(p_background, '#3B82F6'), '#', '');
  IF LENGTH(v_hex) = 3 THEN
    v_hex := SUBSTRING(v_hex, 1, 1) || SUBSTRING(v_hex, 1, 1) ||
             SUBSTRING(v_hex, 2, 1) || SUBSTRING(v_hex, 2, 1) ||
             SUBSTRING(v_hex, 3, 1) || SUBSTRING(v_hex, 3, 1);
  END IF;
  IF LENGTH(v_hex) >= 6 THEN
    v_r := to_number(SUBSTRING(v_hex, 1, 2), 'XX');
    v_g := to_number(SUBSTRING(v_hex, 3, 2), 'XX');
    v_b := to_number(SUBSTRING(v_hex, 5, 2), 'XX');
    v_brightness := (v_r * 299 + v_g * 587 + v_b * 114) / 1000.0;
    RETURN CASE WHEN v_brightness > 128 THEN 'black' ELSE 'white' END;
  END IF;
  RETURN 'white';
END;
$$;

-- ============================================
-- 3. Update save_credit_provider function
-- ============================================

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
      call_count,
      total_credits_consumed,
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
      COALESCE(NULLIF(v_model->>'call_count', '')::INTEGER, 0),
      COALESCE(NULLIF(v_model->>'total_credits_consumed', '')::INTEGER, 0),
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

-- ============================================
-- 4. Update get_active_credit_models function
-- ============================================

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

-- ============================================
-- 5. Update bump_credit_model_usage trigger function
-- ============================================

CREATE OR REPLACE FUNCTION public.bump_credit_model_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.type = 'consumption'
     AND NEW.status = 'completed'
     AND NEW.amount < 0
     AND COALESCE(NEW.model_id, '') <> '' THEN
    UPDATE public.admin_credit_models m
    SET
      call_count = COALESCE(m.call_count, 0) + 1,
      total_credits_consumed = COALESCE(m.total_credits_consumed, 0) + ABS(COALESCE(NEW.amount, 0)),
      is_active = CASE
        WHEN m.auto_pause_on_limit = TRUE
             AND m.max_calls_limit IS NOT NULL
             AND (COALESCE(m.call_count, 0) + 1) >= m.max_calls_limit
        THEN FALSE
        ELSE m.is_active
      END,
      updated_at = NOW()
    WHERE m.model_id = NEW.model_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trg_bump_credit_model_usage ON public.credit_transactions;
CREATE TRIGGER trg_bump_credit_model_usage
AFTER INSERT ON public.credit_transactions
FOR EACH ROW
EXECUTE FUNCTION public.bump_credit_model_usage();

-- ============================================
-- 6. Update view
-- ============================================

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

-- ============================================
-- 7. Grant permissions
-- ============================================

GRANT EXECUTE ON FUNCTION public.normalize_admin_hex_color(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.derive_admin_secondary_color(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.infer_admin_text_color(TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.save_credit_provider(TEXT, TEXT, TEXT, TEXT[], JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_credit_provider(TEXT, TEXT, TEXT, TEXT[], JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_credit_provider(TEXT, TEXT, TEXT, TEXT[], JSONB) TO authenticated;

COMMIT;
