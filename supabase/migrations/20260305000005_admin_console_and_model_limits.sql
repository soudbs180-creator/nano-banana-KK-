-- Admin console RPCs + model call limit controls
-- 1) Add model display/control fields
-- 2) Add admin-only RPCs for password change, recharge by identity, role assignment
-- 3) Auto-increment model call_count and auto-pause when max_calls_limit reached

BEGIN;

ALTER TABLE public.admin_credit_models
  ADD COLUMN IF NOT EXISTS color_secondary TEXT,
  ADD COLUMN IF NOT EXISTS text_color TEXT DEFAULT 'white',
  ADD COLUMN IF NOT EXISTS max_calls_limit INTEGER,
  ADD COLUMN IF NOT EXISTS auto_pause_on_limit BOOLEAN DEFAULT TRUE;

-- Ensure text color is constrained
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'admin_credit_models_text_color_check'
  ) THEN
    ALTER TABLE public.admin_credit_models
      ADD CONSTRAINT admin_credit_models_text_color_check
      CHECK (text_color IN ('white', 'black'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_change_password_secure(
  p_old_password TEXT,
  p_new_password TEXT
) RETURNS BOOLEAN
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
    RAISE EXCEPTION 'Only admins can change admin password';
  END IF;

  IF COALESCE(length(trim(p_new_password)), 0) < 8 THEN
    RAISE EXCEPTION 'New password must be at least 8 characters';
  END IF;

  IF NOT public.verify_admin_password(p_old_password) THEN
    RAISE EXCEPTION 'Old password is incorrect';
  END IF;

  RETURN public.update_admin_password(p_new_password);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_role_by_identity(
  p_identity TEXT,
  p_role TEXT DEFAULT 'admin'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_id UUID;
  v_identity TEXT := trim(COALESCE(p_identity, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can set roles';
  END IF;

  IF v_identity = '' THEN
    RAISE EXCEPTION 'Identity is required';
  END IF;

  IF p_role NOT IN ('admin', 'user') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  SELECT p.id
  INTO v_target_id
  FROM public.profiles p
  WHERE p.id::TEXT = v_identity
     OR lower(p.email) = lower(v_identity)
  LIMIT 1;

  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  UPDATE public.profiles
  SET role = p_role,
      updated_at = NOW()
  WHERE id = v_target_id;

  RETURN v_target_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recharge_credits_by_identity(
  p_identity TEXT,
  p_amount INTEGER,
  p_description TEXT DEFAULT NULL
) RETURNS TABLE(success BOOLEAN, new_balance INTEGER, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_id UUID;
  v_identity TEXT := trim(COALESCE(p_identity, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can recharge credits';
  END IF;

  IF v_identity = '' THEN
    RAISE EXCEPTION 'Identity is required';
  END IF;

  IF p_amount < 1 OR p_amount > 1000 THEN
    RAISE EXCEPTION 'Amount must be between 1 and 1000';
  END IF;

  SELECT p.id
  INTO v_target_id
  FROM public.profiles p
  WHERE p.id::TEXT = v_identity
     OR lower(p.email) = lower(v_identity)
  LIMIT 1;

  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.admin_recharge_credits(
    p_target_user_id := v_target_id,
    p_amount := p_amount,
    p_description := COALESCE(p_description, '管理员充值')
  );
END;
$$;

-- Extend save_credit_provider payload support for new style fields
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
      p_models->i->>'model_id',
      p_models->i->>'display_name',
      p_models->i->>'description',
      COALESCE(p_models->i->>'color', '#3B82F6'),
      NULLIF(p_models->i->>'color_secondary', ''),
      COALESCE(NULLIF(p_models->i->>'text_color', ''), 'white'),
      COALESCE(p_models->i->>'gradient', 'from-blue-500 to-indigo-600'),
      COALESCE(NULLIF(p_models->i->>'endpoint_type', ''), 'gemini'),
      COALESCE((p_models->i->>'credit_cost')::INTEGER, 1),
      NULLIF((p_models->i->>'max_calls_limit')::INTEGER, 0),
      COALESCE((p_models->i->>'auto_pause_on_limit')::BOOLEAN, TRUE),
      COALESCE((p_models->i->>'priority')::INTEGER, 10),
      COALESCE((p_models->i->>'weight')::INTEGER, 1),
      COALESCE((p_models->i->>'is_active')::BOOLEAN, TRUE)
    );
  END LOOP;
END;
$$;

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

DROP TRIGGER IF EXISTS trg_bump_credit_model_usage ON public.credit_transactions;
CREATE TRIGGER trg_bump_credit_model_usage
AFTER INSERT ON public.credit_transactions
FOR EACH ROW
EXECUTE FUNCTION public.bump_credit_model_usage();

REVOKE EXECUTE ON FUNCTION public.admin_change_password_secure(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_change_password_secure(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_change_password_secure(TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_role_by_identity(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_role_by_identity(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role_by_identity(TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_recharge_credits_by_identity(TEXT, INTEGER, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_recharge_credits_by_identity(TEXT, INTEGER, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_recharge_credits_by_identity(TEXT, INTEGER, TEXT) TO authenticated;

COMMIT;
