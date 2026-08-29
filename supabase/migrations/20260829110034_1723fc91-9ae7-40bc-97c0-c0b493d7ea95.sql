-- Internal dispatch helper must never be callable from the API.
REVOKE ALL ON FUNCTION public._feedback_dispatch_push(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._feedback_dispatch_push(uuid, text, text, text, text) TO service_role;

-- Role predicate: signed-in callers only.
REVOKE ALL ON FUNCTION public.is_feedback_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_feedback_staff(uuid) TO authenticated, service_role;