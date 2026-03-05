-- Security hardening for admin credit model routing.
-- Goal:
-- 1) Prevent anonymous users from invoking admin mutation functions.
-- 2) Restrict admin_credit_models visibility/modification to admins only.
-- 3) Expose model call config through SECURITY DEFINER RPC instead of direct table reads.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Tighten table grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.admin_credit_models FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_credit_models TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Tighten RLS policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Everyone can view credit models" ON public.admin_credit_models;
DROP POLICY IF EXISTS "Only admins can modify credit models" ON public.admin_credit_models;
DROP POLICY IF EXISTS "Admins can view credit models" ON public.admin_credit_models;
DROP POLICY IF EXISTS "Admins can modify credit models" ON public.admin_credit_models;

CREATE POLICY "Admins can view credit models"
ON public.admin_credit_models
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
);

CREATE POLICY "Admins can modify credit models"
ON public.admin_credit_models
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
);

-- ---------------------------------------------------------------------------
-- 3) Re-create admin mutation RPCs with explicit admin guard
-- ---------------------------------------------------------------------------
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
      COALESCE(p_api_keys, ARRAY[]::TEXT[]),
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

CREATE OR REPLACE FUNCTION public.delete_credit_provider(
  p_provider_id TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can delete credit providers';
  END IF;

  DELETE FROM public.admin_credit_models
  WHERE provider_id = p_provider_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Secure model-call config RPC (single call route, no bulk key exposure)
-- ---------------------------------------------------------------------------
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

  SELECT m.id, m.provider_id, m.base_url, m.api_keys, m.model_id, m.endpoint_type, m.credit_cost
  INTO id, provider_id, base_url, v_api_keys, model_id, endpoint_type, credit_cost
  FROM public.admin_credit_models m
  WHERE m.model_id = p_model_id
    AND m.is_active = TRUE
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

-- ---------------------------------------------------------------------------
-- 5) Function execute permissions
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.save_credit_provider(TEXT, TEXT, TEXT, TEXT[], JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_credit_provider(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_credit_model_for_call(TEXT) FROM anon;

GRANT EXECUTE ON FUNCTION public.save_credit_provider(TEXT, TEXT, TEXT, TEXT[], JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_credit_provider(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_credit_model_for_call(TEXT) TO authenticated;

COMMIT;
