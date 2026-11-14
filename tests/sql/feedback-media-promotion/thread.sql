-- Disposable projection only. Source-bound to migration 20260829110009 function below.
-- Synthetic prerequisite columns mirror product response shape; not full migrated-schema proof.
CREATE TABLE IF NOT EXISTS public.feedback_messages(id uuid PRIMARY KEY,issue_id uuid NOT NULL REFERENCES public.feedback_issues(id),author_id uuid,author_role text NOT NULL,body text NOT NULL,is_internal boolean NOT NULL,attachments jsonb NOT NULL DEFAULT '[]');
ALTER TABLE public.feedback_messages ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.feedback_issues
 ADD COLUMN IF NOT EXISTS device_id text,
 ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'bug',
 ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'Synthetic thread',
 ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT 'Synthetic fixture',
 ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new',
 ADD COLUMN IF NOT EXISTS context jsonb NOT NULL DEFAULT '{}',
 ADD COLUMN IF NOT EXISTS assigned_to uuid,
 ADD COLUMN IF NOT EXISTS last_reply_at timestamptz,
 ADD COLUMN IF NOT EXISTS last_reply_by text,
 ADD COLUMN IF NOT EXISTS player_unread boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS admin_unread boolean NOT NULL DEFAULT true,
 ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN IF NOT EXISTS player_rating integer,
 ADD COLUMN IF NOT EXISTS player_rating_at timestamptz;

CREATE OR REPLACE FUNCTION public.get_feedback_issue_thread(p_issue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  is_admin boolean := public.is_feedback_staff(auth.uid());
  v_issue public.feedback_issues;
  v_msgs jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_issue FROM public.feedback_issues WHERE id = p_issue_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
  IF is_admin IS NOT TRUE AND v_issue.reporter_id IS DISTINCT FROM uid THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(m.*) || jsonb_build_object('canonical_attachments_v1',CASE WHEN public.fixture_canonical_descriptor(m.id) IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(public.fixture_canonical_descriptor(m.id)) END) ORDER BY m.created_at,m.id), '[]'::jsonb) INTO v_msgs
  FROM public.feedback_messages m
  WHERE m.issue_id = p_issue_id
    AND (is_admin IS TRUE OR NOT m.is_internal);

  RETURN jsonb_build_object('issue', to_jsonb(v_issue), 'messages', v_msgs);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_feedback_issue_thread(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_feedback_issue_thread(uuid) TO authenticated;
CREATE FUNCTION promotion_model.mirror_client_message() RETURNS trigger LANGUAGE plpgsql SET search_path=promotion_model,pg_temp AS $$
DECLARE q client_request;
BEGIN
 SELECT * INTO q FROM client_request WHERE image_id=NEW.attempt_id;
 IF NOT FOUND THEN RETURN NEW;END IF;
 IF NEW.id IS DISTINCT FROM q.mid OR NEW.author_id IS DISTINCT FROM q.uploader_id OR NEW.body IS DISTINCT FROM q.body OR NEW.internal IS DISTINCT FROM q.internal THEN RAISE EXCEPTION 'message_binding' USING ERRCODE='42501';END IF;
 INSERT INTO public.feedback_messages(id,issue_id,author_id,author_role,body,is_internal,attachments) VALUES(NEW.id,q.issue_id,q.uploader_id,CASE WHEN public.is_feedback_staff(q.uploader_id) IS TRUE THEN 'admin' ELSE 'player' END,q.body,q.internal,'[]');
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION promotion_model.mirror_client_message() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER mirror_client_message AFTER INSERT ON promotion_model.publication FOR EACH ROW EXECUTE FUNCTION promotion_model.mirror_client_message();
