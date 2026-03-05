-- Prepare function access for secure server-side proxy.
-- NOTE:
-- 1) service_role is required for edge-function routing.
-- 2) authenticated access is kept temporarily to avoid breaking legacy
--    image/video/audio system routes that still call this RPC directly.
--    Once those routes are migrated to edge proxy, revoke authenticated.

BEGIN;

GRANT EXECUTE ON FUNCTION public.get_credit_model_for_call(TEXT) TO service_role;

COMMIT;
