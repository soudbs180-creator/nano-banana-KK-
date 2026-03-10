-- Final schema consolidation after legacy unordered migrations.
-- This file intentionally uses a zz_ prefix so it always runs last.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND COALESCE(p.role, 'user') = 'admin'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin_by_id(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND COALESCE(p.role, 'user') = 'admin'
  );
END;
$$;

CREATE TABLE IF NOT EXISTS public.temp_users (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE public.temp_users
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS nickname TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'temp_users'
      AND column_name = 'id'
      AND data_type IN ('text', 'character varying')
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.temp_users
      WHERE id IS NULL
         OR id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) THEN
      RAISE EXCEPTION 'temp_users.id contains non-UUID values; please normalize data first';
    END IF;

    ALTER TABLE public.temp_users
      ALTER COLUMN id TYPE UUID USING id::uuid;
  END IF;
END;
$$;

UPDATE public.temp_users
SET
  email = COALESCE(NULLIF(email, ''), id::TEXT || '@temp.local'),
  nickname = COALESCE(NULLIF(nickname, ''), '临时用户_' || substring(replace(id::TEXT, '-', '') FROM 1 FOR 8)),
  last_seen_at = COALESCE(last_seen_at, created_at),
  updated_at = COALESCE(updated_at, created_at),
  metadata = COALESCE(metadata, '{}'::jsonb);

CREATE UNIQUE INDEX IF NOT EXISTS idx_temp_users_email_lower
  ON public.temp_users ((lower(email)));

ALTER TABLE public.temp_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public to create temp users" ON public.temp_users;
DROP POLICY IF EXISTS "Allow public to read own temp user" ON public.temp_users;
DROP POLICY IF EXISTS "Allow public to update own temp user" ON public.temp_users;
DROP POLICY IF EXISTS "Admins can view temp users" ON public.temp_users;
DROP POLICY IF EXISTS "Admins can update temp users" ON public.temp_users;

CREATE POLICY "Allow public to create temp users"
ON public.temp_users
FOR INSERT
TO anon, authenticated
WITH CHECK (
  is_active = TRUE
  AND expires_at > NOW()
  AND expires_at <= NOW() + INTERVAL '24 hours'
);

CREATE POLICY "Admins can view temp users"
ON public.temp_users
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins can update temp users"
ON public.temp_users
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.temp_users FROM PUBLIC;
REVOKE ALL ON TABLE public.temp_users FROM anon;
REVOKE ALL ON TABLE public.temp_users FROM authenticated;
GRANT INSERT ON TABLE public.temp_users TO anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.temp_users TO authenticated;
GRANT ALL ON TABLE public.temp_users TO service_role;

ALTER TABLE public.user_credits DROP CONSTRAINT IF EXISTS user_credits_user_id_fkey;
ALTER TABLE public.credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_user_id_fkey;

ALTER TABLE public.user_credits
  ADD COLUMN IF NOT EXISTS subject_type TEXT DEFAULT 'registered';

ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS subject_type TEXT DEFAULT 'registered';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_credits_subject_type_check'
  ) THEN
    ALTER TABLE public.user_credits
      ADD CONSTRAINT user_credits_subject_type_check
      CHECK (subject_type IN ('registered', 'temporary'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'credit_transactions_subject_type_check'
  ) THEN
    ALTER TABLE public.credit_transactions
      ADD CONSTRAINT credit_transactions_subject_type_check
      CHECK (subject_type IN ('registered', 'temporary'));
  END IF;
END;
$$;

UPDATE public.user_credits uc
SET subject_type = CASE
  WHEN EXISTS (SELECT 1 FROM public.temp_users tu WHERE tu.id = uc.user_id) THEN 'temporary'
  ELSE 'registered'
END;

UPDATE public.credit_transactions ct
SET subject_type = CASE
  WHEN EXISTS (SELECT 1 FROM public.temp_users tu WHERE tu.id = ct.user_id) THEN 'temporary'
  ELSE 'registered'
END;

UPDATE public.user_credits uc
SET email = COALESCE(
  NULLIF(uc.email, ''),
  (SELECT p.email FROM public.profiles p WHERE p.id = uc.user_id),
  (SELECT tu.email FROM public.temp_users tu WHERE tu.id = uc.user_id)
)
WHERE uc.email IS NULL OR btrim(uc.email) = '';

UPDATE public.credit_transactions ct
SET email = COALESCE(
  NULLIF(ct.email, ''),
  (SELECT p.email FROM public.profiles p WHERE p.id = ct.user_id),
  (SELECT tu.email FROM public.temp_users tu WHERE tu.id = ct.user_id)
)
WHERE ct.email IS NULL OR btrim(ct.email) = '';

CREATE INDEX IF NOT EXISTS idx_user_credits_subject_type
  ON public.user_credits(subject_type);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_subject_type
  ON public.credit_transactions(subject_type);

CREATE OR REPLACE FUNCTION public.resolve_credit_subject(
  p_identity TEXT
)
RETURNS TABLE (
  subject_id UUID,
  subject_type TEXT,
  email TEXT,
  nickname TEXT,
  is_active BOOLEAN,
  expires_at TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    resolved.subject_id,
    resolved.subject_type,
    resolved.email,
    resolved.nickname,
    resolved.is_active,
    resolved.expires_at
  FROM (
    SELECT
      0 AS priority,
      p.id AS subject_id,
      'registered'::TEXT AS subject_type,
      p.email,
      COALESCE(NULLIF(p.nickname, ''), split_part(COALESCE(p.email, ''), '@', 1), '用户') AS nickname,
      TRUE AS is_active,
      NULL::TIMESTAMPTZ AS expires_at
    FROM public.profiles p
    WHERE trim(COALESCE(p_identity, '')) <> ''
      AND (
        p.id::TEXT = trim(p_identity)
        OR lower(COALESCE(p.email, '')) = lower(trim(p_identity))
      )

    UNION ALL

    SELECT
      1 AS priority,
      tu.id AS subject_id,
      'temporary'::TEXT AS subject_type,
      COALESCE(tu.email, tu.id::TEXT || '@temp.local') AS email,
      COALESCE(NULLIF(tu.nickname, ''), '临时用户_' || substring(replace(tu.id::TEXT, '-', '') FROM 1 FOR 8)) AS nickname,
      COALESCE(tu.is_active, TRUE) AS is_active,
      tu.expires_at
    FROM public.temp_users tu
    WHERE trim(COALESCE(p_identity, '')) <> ''
      AND (
        tu.id::TEXT = trim(p_identity)
        OR lower(COALESCE(tu.email, tu.id::TEXT || '@temp.local')) = lower(trim(p_identity))
      )
  ) AS resolved
  ORDER BY resolved.priority
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_credit_subject(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_credit_subject(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_credit_subject(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_credit_subject(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.get_or_create_user_credits(
  p_user_id UUID,
  p_email TEXT DEFAULT NULL
)
RETURNS public.user_credits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_credits public.user_credits;
  v_existing BOOLEAN := FALSE;
  v_subject_type TEXT := 'registered';
  v_resolved_email TEXT;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Authentication required';
    END IF;

    IF auth.uid() <> p_user_id AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Cannot access credits of another user';
    END IF;
  END IF;

  SELECT * INTO v_credits
  FROM public.user_credits
  WHERE user_id = p_user_id;
  v_existing := FOUND;

  SELECT 'registered', p.email
  INTO v_subject_type, v_resolved_email
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    SELECT 'temporary', tu.email
    INTO v_subject_type, v_resolved_email
    FROM public.temp_users tu
    WHERE tu.id = p_user_id;
  END IF;

  v_resolved_email := COALESCE(NULLIF(p_email, ''), v_resolved_email, p_user_id::TEXT || '@temp.local');

  IF v_existing THEN
    IF v_credits.email IS DISTINCT FROM v_resolved_email OR v_credits.subject_type IS DISTINCT FROM v_subject_type THEN
      UPDATE public.user_credits
      SET
        email = v_resolved_email,
        subject_type = v_subject_type,
        updated_at = NOW()
      WHERE id = v_credits.id
      RETURNING * INTO v_credits;
    END IF;

    RETURN v_credits;
  END IF;

  INSERT INTO public.user_credits (user_id, email, balance, subject_type)
  VALUES (p_user_id, v_resolved_email, 0, v_subject_type)
  RETURNING * INTO v_credits;

  RETURN v_credits;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_user_credits(
  user_id UUID,
  required_credits INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_user_id UUID := user_id;
  current_balance INTEGER := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RETURN FALSE;
    END IF;

    IF auth.uid() <> v_target_user_id AND NOT public.is_admin() THEN
      RETURN FALSE;
    END IF;
  END IF;

  SELECT COALESCE(uc.balance, 0)
  INTO current_balance
  FROM public.user_credits uc
  WHERE uc.user_id = v_target_user_id;

  RETURN current_balance >= GREATEST(required_credits, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_model_credit_cost(model_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  normalized_id TEXT := split_part(COALESCE(model_id, ''), '@', 1);
  resolved_cost INTEGER;
BEGIN
  SELECT m.credit_cost
  INTO resolved_cost
  FROM public.admin_credit_models m
  WHERE m.is_active = TRUE
    AND (
      m.model_id = model_id
      OR split_part(m.model_id, '@', 1) = normalized_id
      OR m.model_id = normalized_id || '@system'
      OR m.model_id LIKE normalized_id || '@system_%'
    )
  ORDER BY m.priority DESC, m.weight DESC, m.updated_at DESC
  LIMIT 1;

  RETURN COALESCE(resolved_cost, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recharge_credits(
  p_target_user_id UUID,
  p_amount INTEGER,
  p_description TEXT DEFAULT '管理员充值'
)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_credits public.user_credits;
  v_new_balance INTEGER;
  v_subject_type TEXT := 'registered';
  v_email TEXT;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can recharge credits';
  END IF;

  IF p_amount < 1 THEN
    RAISE EXCEPTION 'Recharge amount must be greater than 0';
  END IF;

  SELECT 'registered', p.email
  INTO v_subject_type, v_email
  FROM public.profiles p
  WHERE p.id = p_target_user_id;

  IF NOT FOUND THEN
    SELECT 'temporary', tu.email
    INTO v_subject_type, v_email
    FROM public.temp_users tu
    WHERE tu.id = p_target_user_id;
  END IF;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  SELECT *
  INTO v_credits
  FROM public.get_or_create_user_credits(p_target_user_id, v_email);

  UPDATE public.user_credits
  SET
    balance = balance + p_amount,
    total_earned = total_earned + p_amount,
    version = version + 1,
    last_transaction_at = NOW(),
    updated_at = NOW(),
    email = v_email,
    subject_type = v_subject_type
  WHERE id = v_credits.id
  RETURNING balance INTO v_new_balance;

  INSERT INTO public.credit_transactions (
    user_id,
    email,
    subject_type,
    type,
    amount,
    balance_after,
    description,
    status,
    completed_at
  ) VALUES (
    p_target_user_id,
    v_email,
    v_subject_type,
    'recharge',
    p_amount,
    v_new_balance,
    COALESCE(NULLIF(p_description, ''), '管理员充值'),
    'completed',
    NOW()
  );

  RETURN QUERY SELECT TRUE, v_new_balance, '充值成功'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recharge_credits_by_identity(
  p_identity TEXT,
  p_amount INTEGER,
  p_description TEXT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_subject RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can recharge credits';
  END IF;

  SELECT *
  INTO v_subject
  FROM public.resolve_credit_subject(p_identity);

  IF v_subject.subject_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.admin_recharge_credits(
    p_target_user_id := v_subject.subject_id,
    p_amount := p_amount,
    p_description := COALESCE(NULLIF(p_description, ''), '管理员充值')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_model_id TEXT,
  p_model_name TEXT,
  p_provider_id TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER, transaction_id UUID, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_credits public.user_credits;
  v_new_balance INTEGER;
  v_transaction_id UUID;
  v_subject_type TEXT := 'registered';
  v_email TEXT;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Authentication required';
    END IF;

    IF auth.uid() <> p_user_id AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Cannot consume credits for another user';
    END IF;
  END IF;

  IF p_amount < 1 THEN
    RETURN QUERY SELECT FALSE, 0, NULL::UUID, '扣减积分必须大于 0'::TEXT;
    RETURN;
  END IF;

  SELECT 'registered', p.email
  INTO v_subject_type, v_email
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    SELECT 'temporary', tu.email
    INTO v_subject_type, v_email
    FROM public.temp_users tu
    WHERE tu.id = p_user_id;
  END IF;

  SELECT *
  INTO v_credits
  FROM public.get_or_create_user_credits(p_user_id, v_email);

  IF v_credits.balance < p_amount THEN
    RETURN QUERY SELECT FALSE, COALESCE(v_credits.balance, 0), NULL::UUID, '积分不足'::TEXT;
    RETURN;
  END IF;

  UPDATE public.user_credits
  SET
    balance = balance - p_amount,
    total_spent = total_spent + p_amount,
    version = version + 1,
    last_transaction_at = NOW(),
    updated_at = NOW(),
    email = COALESCE(v_email, email),
    subject_type = v_subject_type
  WHERE id = v_credits.id
  RETURNING balance INTO v_new_balance;

  INSERT INTO public.credit_transactions (
    user_id,
    email,
    subject_type,
    type,
    amount,
    balance_after,
    model_id,
    model_name,
    provider_id,
    description,
    status,
    completed_at
  ) VALUES (
    p_user_id,
    COALESCE(v_email, v_credits.email),
    v_subject_type,
    'consumption',
    -p_amount,
    v_new_balance,
    p_model_id,
    p_model_name,
    p_provider_id,
    p_description,
    'completed',
    NOW()
  )
  RETURNING id INTO v_transaction_id;

  RETURN QUERY SELECT TRUE, v_new_balance, v_transaction_id, '扣减成功'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_user_credits(
  user_id UUID,
  credits INTEGER,
  model_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  consume_result RECORD;
BEGIN
  SELECT *
  INTO consume_result
  FROM public.consume_credits(
    p_user_id := user_id,
    p_amount := credits,
    p_model_id := model_id,
    p_model_name := COALESCE(model_id, 'legacy_deduction'),
    p_provider_id := 'legacy',
    p_description := 'Legacy direct deduction'
  );

  RETURN COALESCE(consume_result.success, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_credits(
  p_transaction_id UUID,
  p_reason TEXT DEFAULT '调用失败退款'
)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_transaction public.credit_transactions;
  v_credits public.user_credits;
  v_new_balance INTEGER;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only service role or admins can refund credits';
  END IF;

  SELECT *
  INTO v_transaction
  FROM public.credit_transactions
  WHERE id = p_transaction_id
    AND type = 'consumption'
    AND status = 'completed';

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0, '交易记录不存在或当前不可退款'::TEXT;
    RETURN;
  END IF;

  SELECT *
  INTO v_credits
  FROM public.user_credits
  WHERE user_id = v_transaction.user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0, '用户积分账户不存在'::TEXT;
    RETURN;
  END IF;

  UPDATE public.user_credits
  SET
    balance = balance + ABS(v_transaction.amount),
    total_spent = GREATEST(total_spent - ABS(v_transaction.amount), 0),
    version = version + 1,
    last_transaction_at = NOW(),
    updated_at = NOW()
  WHERE id = v_credits.id
  RETURNING balance INTO v_new_balance;

  UPDATE public.credit_transactions
  SET status = 'refunded'
  WHERE id = p_transaction_id;

  INSERT INTO public.credit_transactions (
    user_id,
    email,
    subject_type,
    type,
    amount,
    balance_after,
    model_id,
    model_name,
    provider_id,
    description,
    status,
    completed_at
  ) VALUES (
    v_transaction.user_id,
    v_transaction.email,
    COALESCE(v_transaction.subject_type, 'registered'),
    'refund',
    ABS(v_transaction.amount),
    v_new_balance,
    v_transaction.model_id,
    v_transaction.model_name,
    v_transaction.provider_id,
    COALESCE(NULLIF(p_reason, ''), '调用失败退款'),
    'completed',
    NOW()
  );

  RETURN QUERY SELECT TRUE, v_new_balance, '退款成功'::TEXT;
END;
$$;

ALTER TABLE public.admin_credit_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin credit models are viewable by everyone" ON public.admin_credit_models;
DROP POLICY IF EXISTS "Everyone can view credit models" ON public.admin_credit_models;
DROP POLICY IF EXISTS "Users view active models info" ON public.admin_credit_models;
DROP POLICY IF EXISTS "Only admins can modify admin credit models" ON public.admin_credit_models;
DROP POLICY IF EXISTS "Only admins can modify credit models" ON public.admin_credit_models;
DROP POLICY IF EXISTS "Admins can modify credit models" ON public.admin_credit_models;
DROP POLICY IF EXISTS "Admins full access to credit models" ON public.admin_credit_models;

CREATE POLICY "Admins full access to credit models"
ON public.admin_credit_models
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.admin_credit_models FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_credit_models FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_credit_models TO authenticated;
GRANT ALL ON TABLE public.admin_credit_models TO service_role;

CREATE OR REPLACE VIEW public.admin_account_directory AS
WITH transaction_stats AS (
  SELECT
    ct.user_id AS subject_id,
    COUNT(*) FILTER (WHERE ct.type = 'recharge') AS recharge_count,
    COUNT(*) FILTER (WHERE ct.type = 'consumption') AS consumption_count,
    COUNT(*) FILTER (WHERE ct.type = 'refund') AS refund_count,
    MAX(ct.created_at) AS last_credit_activity_at
  FROM public.credit_transactions ct
  GROUP BY ct.user_id
)
SELECT
  p.id::TEXT AS subject_id,
  'registered'::TEXT AS subject_type,
  p.id AS auth_user_id,
  NULL::UUID AS temp_user_id,
  p.email,
  COALESCE(NULLIF(p.nickname, ''), split_part(COALESCE(p.email, ''), '@', 1), '用户') AS display_name,
  COALESCE(p.role, 'user') AS role,
  'active'::TEXT AS account_status,
  COALESCE(uc.balance, 0) AS credit_balance,
  COALESCE(uc.total_earned, 0) AS total_earned,
  COALESCE(uc.total_spent, 0) AS total_spent,
  COALESCE(ts.recharge_count, 0) AS recharge_count,
  COALESCE(ts.consumption_count, 0) AS consumption_count,
  COALESCE(ts.refund_count, 0) AS refund_count,
  ts.last_credit_activity_at,
  p.created_at,
  COALESCE(uc.updated_at, p.last_updated, p.created_at) AS updated_at,
  NULL::TIMESTAMPTZ AS expires_at,
  COALESCE(p.user_apis, '[]'::jsonb) AS extra_metadata
FROM public.profiles p
LEFT JOIN public.user_credits uc
  ON uc.user_id = p.id
LEFT JOIN transaction_stats ts
  ON ts.subject_id = p.id

UNION ALL

SELECT
  tu.id::TEXT AS subject_id,
  'temporary'::TEXT AS subject_type,
  NULL::UUID AS auth_user_id,
  tu.id AS temp_user_id,
  COALESCE(tu.email, tu.id::TEXT || '@temp.local') AS email,
  COALESCE(NULLIF(tu.nickname, ''), '临时用户_' || substring(replace(tu.id::TEXT, '-', '') FROM 1 FOR 8)) AS display_name,
  'temp_user'::TEXT AS role,
  CASE
    WHEN COALESCE(tu.is_active, TRUE) = FALSE THEN 'disabled'
    WHEN tu.expires_at <= NOW() THEN 'expired'
    ELSE 'active'
  END AS account_status,
  COALESCE(uc.balance, 0) AS credit_balance,
  COALESCE(uc.total_earned, 0) AS total_earned,
  COALESCE(uc.total_spent, 0) AS total_spent,
  COALESCE(ts.recharge_count, 0) AS recharge_count,
  COALESCE(ts.consumption_count, 0) AS consumption_count,
  COALESCE(ts.refund_count, 0) AS refund_count,
  ts.last_credit_activity_at,
  tu.created_at,
  COALESCE(uc.updated_at, tu.updated_at, tu.created_at) AS updated_at,
  tu.expires_at,
  COALESCE(tu.metadata, '{}'::jsonb) AS extra_metadata
FROM public.temp_users tu
LEFT JOIN public.user_credits uc
  ON uc.user_id = tu.id
LEFT JOIN transaction_stats ts
  ON ts.subject_id = tu.id;

CREATE OR REPLACE VIEW public.admin_credit_activity AS
SELECT
  ct.id,
  ct.user_id::TEXT AS subject_id,
  COALESCE(ct.subject_type, 'registered') AS subject_type,
  aad.email,
  aad.display_name,
  aad.role,
  ct.type,
  ct.amount,
  ct.balance_after,
  ct.model_id,
  ct.model_name,
  ct.provider_id,
  ct.description,
  ct.status,
  ct.error_message,
  ct.metadata,
  ct.created_at,
  ct.completed_at
FROM public.credit_transactions ct
LEFT JOIN public.admin_account_directory aad
  ON aad.subject_id = ct.user_id::TEXT;

CREATE OR REPLACE VIEW public.admin_identity_directory AS
SELECT
  p.id::TEXT AS user_id,
  p.email,
  COALESCE(NULLIF(p.nickname, ''), split_part(COALESCE(p.email, ''), '@', 1), '管理员') AS display_name,
  p.created_at,
  p.last_updated,
  p.role,
  (p.role = 'admin') AS is_admin,
  (SELECT s.updated_at FROM public.admin_settings s WHERE s.id = 1) AS admin_secret_updated_at
FROM public.profiles p
WHERE COALESCE(p.role, 'user') = 'admin';

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
  m.created_at,
  m.updated_at
FROM public.admin_credit_models m;

REVOKE ALL ON TABLE public.admin_account_directory FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_account_directory FROM anon;
REVOKE ALL ON TABLE public.admin_account_directory FROM authenticated;
GRANT SELECT ON TABLE public.admin_account_directory TO service_role;

REVOKE ALL ON TABLE public.admin_credit_activity FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_credit_activity FROM anon;
REVOKE ALL ON TABLE public.admin_credit_activity FROM authenticated;
GRANT SELECT ON TABLE public.admin_credit_activity TO service_role;

REVOKE ALL ON TABLE public.admin_identity_directory FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_identity_directory FROM anon;
REVOKE ALL ON TABLE public.admin_identity_directory FROM authenticated;
GRANT SELECT ON TABLE public.admin_identity_directory TO service_role;

REVOKE ALL ON TABLE public.admin_credit_model_directory FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_credit_model_directory FROM anon;
REVOKE ALL ON TABLE public.admin_credit_model_directory FROM authenticated;
GRANT SELECT ON TABLE public.admin_credit_model_directory TO service_role;

COMMENT ON VIEW public.admin_account_directory IS 'Canonical account directory. Combines registered users, temporary users and credit balances.';
COMMENT ON VIEW public.admin_credit_activity IS 'Canonical ledger for all credit changes.';
COMMENT ON VIEW public.admin_identity_directory IS 'Canonical admin identity list based on profiles.role = admin.';
COMMENT ON VIEW public.admin_credit_model_directory IS 'Admin-only model registry without exposing API keys to client-side queries.';

DO $$
BEGIN
  IF to_regclass('public.admin_auth') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.admin_auth FROM PUBLIC, anon, authenticated';
    EXECUTE $cmd$COMMENT ON TABLE public.admin_auth IS 'LEGACY table. Do not use for new code. Admin identity comes from profiles.role; admin console secret remains in admin_settings.'$cmd$;
  END IF;

  IF to_regclass('public.admin_users') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.admin_users FROM PUBLIC, anon, authenticated';
    EXECUTE $cmd$COMMENT ON TABLE public.admin_users IS 'LEGACY duplicate table. Use profiles.role = admin as the canonical admin identity source.'$cmd$;
  END IF;

  IF to_regclass('public.admin_sessions') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.admin_sessions FROM PUBLIC, anon, authenticated';
    EXECUTE $cmd$COMMENT ON TABLE public.admin_sessions IS 'LEGACY session table. Kept only for backward compatibility.'$cmd$;
  END IF;

  IF to_regclass('public.admin_models') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.admin_models FROM PUBLIC, anon, authenticated';
    EXECUTE $cmd$COMMENT ON TABLE public.admin_models IS 'LEGACY model table. Use admin_credit_models instead.'$cmd$;
  END IF;

  IF to_regclass('public.admin_settings') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.admin_settings FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT ALL ON TABLE public.admin_settings TO service_role';
    EXECUTE $cmd$COMMENT ON TABLE public.admin_settings IS 'Canonical admin console secret table. Access it only through SECURITY DEFINER RPCs.'$cmd$;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_or_create_user_credits(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_or_create_user_credits(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_user_credits(UUID, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.check_user_credits(UUID, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_user_credits(UUID, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_user_credits(UUID, INTEGER) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_model_credit_cost(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_model_credit_cost(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_model_credit_cost(TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_recharge_credits(UUID, INTEGER, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_recharge_credits(UUID, INTEGER, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_recharge_credits(UUID, INTEGER, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_recharge_credits_by_identity(TEXT, INTEGER, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_recharge_credits_by_identity(TEXT, INTEGER, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_recharge_credits_by_identity(TEXT, INTEGER, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.consume_credits(UUID, INTEGER, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_credits(UUID, INTEGER, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.consume_credits(UUID, INTEGER, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.deduct_user_credits(UUID, INTEGER, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.deduct_user_credits(UUID, INTEGER, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.deduct_user_credits(UUID, INTEGER, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.refund_credits(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refund_credits(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.refund_credits(UUID, TEXT) TO authenticated, service_role;

COMMIT;
