ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hearts_at timestamptz,
  ADD COLUMN IF NOT EXISTS hearts_full_notified_at timestamptz;

UPDATE public.profiles
   SET hearts_at = COALESCE(hearts_at, updated_at, now())
 WHERE hearts_at IS NULL;

-- Suppress any historical backlog: everyone currently full is considered
-- already announced, so the fix cannot replay old notifications.
UPDATE public.profiles
   SET hearts_full_notified_at = now()
 WHERE COALESCE(hearts, 5) >= 5
   AND hearts_full_notified_at IS NULL;

CREATE OR REPLACE FUNCTION public.profiles_hearts_anchor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.hearts_at := COALESCE(NEW.hearts_at, now());
    IF COALESCE(NEW.hearts, 5) >= 5 THEN
      NEW.hearts_full_notified_at := COALESCE(NEW.hearts_full_notified_at, now());
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.hearts IS DISTINCT FROM OLD.hearts THEN
    -- Any committed heart change re-anchors the regeneration timer.
    NEW.hearts_at := now();
    IF COALESCE(NEW.hearts, 5) >= 5 THEN
      -- Became full through an explicit write (purchase, activity heal,
      -- client sync). The player already knows: never notify for it.
      NEW.hearts_full_notified_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_hearts_anchor ON public.profiles;
CREATE TRIGGER trg_profiles_hearts_anchor
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_hearts_anchor();

-- Service-role only bookkeeping used by the notification job.
CREATE OR REPLACE FUNCTION public.mark_hearts_full_notified(_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.profiles SET hearts_full_notified_at = now() WHERE id = _user_id;
$$;

REVOKE ALL ON FUNCTION public.mark_hearts_full_notified(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_hearts_full_notified(uuid) TO service_role;