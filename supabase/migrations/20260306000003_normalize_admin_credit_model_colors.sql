-- Normalize admin credit model colors so existing cloud data
-- matches the UI contract:
-- - primary color is the outer color
-- - secondary color is the inner color
-- - text color is auto-inferred when missing/invalid

BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_admin_hex_color(
  p_input TEXT,
  p_fallback TEXT DEFAULT '#3B82F6'
) RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_color TEXT := lower(trim(COALESCE(NULLIF(p_input, ''), NULLIF(p_fallback, ''), '#3B82F6')));
BEGIN
  IF v_color = '' THEN
    v_color := '#3b82f6';
  END IF;

  IF v_color !~ '^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$' THEN
    v_color := lower(trim(COALESCE(NULLIF(p_fallback, ''), '#3B82F6')));
  END IF;

  IF left(v_color, 1) <> '#' THEN
    v_color := '#' || v_color;
  END IF;

  IF length(v_color) = 4 THEN
    v_color := '#'
      || substr(v_color, 2, 1) || substr(v_color, 2, 1)
      || substr(v_color, 3, 1) || substr(v_color, 3, 1)
      || substr(v_color, 4, 1) || substr(v_color, 4, 1);
  END IF;

  RETURN upper(v_color);
END;
$$;

CREATE OR REPLACE FUNCTION public.derive_admin_secondary_color(
  p_primary TEXT
) RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_primary TEXT := public.normalize_admin_hex_color(p_primary, '#3B82F6');
  v_bytes BYTEA := decode(replace(v_primary, '#', ''), 'hex');
  v_r INTEGER := get_byte(v_bytes, 0);
  v_g INTEGER := get_byte(v_bytes, 1);
  v_b INTEGER := get_byte(v_bytes, 2);
BEGIN
  v_r := GREATEST(0, LEAST(255, round((v_r * 0.82)::numeric)::INTEGER));
  v_g := GREATEST(0, LEAST(255, round((v_g * 0.82)::numeric)::INTEGER));
  v_b := GREATEST(0, LEAST(255, round((v_b * 0.90)::numeric)::INTEGER));

  RETURN '#'
    || lpad(upper(to_hex(v_r)), 2, '0')
    || lpad(upper(to_hex(v_g)), 2, '0')
    || lpad(upper(to_hex(v_b)), 2, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.infer_admin_text_color(
  p_background TEXT
) RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_color TEXT := public.normalize_admin_hex_color(p_background, '#3B82F6');
  v_bytes BYTEA := decode(substr(replace(v_color, '#', ''), 1, 6), 'hex');
  v_r INTEGER := get_byte(v_bytes, 0);
  v_g INTEGER := get_byte(v_bytes, 1);
  v_b INTEGER := get_byte(v_bytes, 2);
  v_luma NUMERIC := (v_r * 0.299) + (v_g * 0.587) + (v_b * 0.114);
BEGIN
  RETURN CASE WHEN v_luma >= 160 THEN 'black' ELSE 'white' END;
END;
$$;

ALTER TABLE public.admin_credit_models
  ALTER COLUMN color SET DEFAULT '#3B82F6',
  ALTER COLUMN color_secondary SET DEFAULT '#2563EB',
  ALTER COLUMN text_color SET DEFAULT 'white';

UPDATE public.admin_credit_models
SET color = public.normalize_admin_hex_color(color, '#3B82F6');

UPDATE public.admin_credit_models
SET color_secondary = public.normalize_admin_hex_color(
  COALESCE(NULLIF(color_secondary, ''), public.derive_admin_secondary_color(color)),
  public.derive_admin_secondary_color(color)
);

UPDATE public.admin_credit_models
SET text_color = CASE
  WHEN lower(COALESCE(text_color, '')) IN ('white', 'black') THEN lower(text_color)
  ELSE public.infer_admin_text_color(COALESCE(NULLIF(color_secondary, ''), color))
END;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'admin_credit_models_color_hex_check'
  ) THEN
    ALTER TABLE public.admin_credit_models
      ADD CONSTRAINT admin_credit_models_color_hex_check
      CHECK (color ~ '^#([0-9A-F]{6}|[0-9A-F]{8})$');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'admin_credit_models_color_secondary_hex_check'
  ) THEN
    ALTER TABLE public.admin_credit_models
      ADD CONSTRAINT admin_credit_models_color_secondary_hex_check
      CHECK (color_secondary ~ '^#([0-9A-F]{6}|[0-9A-F]{8})$');
  END IF;
END;
$$;

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
      is_active
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
      COALESCE(NULLIF(v_model->>'is_active', '')::BOOLEAN, TRUE)
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
        'is_active', m.is_active
      )
      ORDER BY m.priority DESC, m.model_id
    ) AS models
  FROM public.admin_credit_models m
  WHERE m.is_active = TRUE
  GROUP BY m.provider_id, m.provider_name, m.base_url, m.api_keys;
$$;

COMMIT;
