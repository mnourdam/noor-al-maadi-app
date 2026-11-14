-- Dormant recipient/uploader-separated client contract. Disposable fixture only, never a migration.
CREATE TABLE promotion_model.client_config(singleton boolean PRIMARY KEY CHECK(singleton),revision text NOT NULL);
CREATE TABLE promotion_model.client_request(mid uuid PRIMARY KEY,owner_id uuid NOT NULL,uploader_id uuid NOT NULL,internal boolean NOT NULL,issue_id uuid NOT NULL,body text NOT NULL,image_id uuid UNIQUE NOT NULL,digest text NOT NULL,bytes integer NOT NULL);
REVOKE ALL ON promotion_model.client_config,promotion_model.client_request FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.reserve_canonical_feedback_image_v1(p_message_id uuid,p_issue_id uuid,p_body text,p_image_id uuid,p_digest text,p_bytes integer,p_internal boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=promotion_model,pg_temp AS $$
DECLARE u uuid:=auth.uid();recipient uuid;staff boolean;q client_request;r reservation;a attempt;rev text;tok uuid;source text;
BEGIN
 SELECT reporter_id INTO recipient FROM public.feedback_issues WHERE id=p_issue_id;staff:=public.is_feedback_staff(u);
 IF auth.role() IS DISTINCT FROM 'authenticated' OR u IS NULL OR recipient IS NULL OR p_internal IS NULL OR (NOT staff AND (u<>recipient OR p_internal)) OR p_message_id IS NULL OR p_image_id IS NULL OR p_body IS NULL OR length(p_body)>5000 OR p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' OR p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 2097152 THEN RAISE EXCEPTION 'sender_forbidden' USING ERRCODE='42501'; END IF;
 INSERT INTO client_request VALUES(p_message_id,recipient,u,p_internal,p_issue_id,p_body,p_image_id,p_digest,p_bytes) ON CONFLICT(mid) DO NOTHING;
 SELECT * INTO q FROM client_request WHERE mid=p_message_id FOR UPDATE;
 IF q.owner_id IS DISTINCT FROM recipient OR q.uploader_id IS DISTINCT FROM u OR q.internal IS DISTINCT FROM p_internal OR q.issue_id IS DISTINCT FROM p_issue_id OR q.body IS DISTINCT FROM p_body OR q.image_id IS DISTINCT FROM p_image_id OR q.digest IS DISTINCT FROM p_digest OR q.bytes IS DISTINCT FROM p_bytes THEN RAISE EXCEPTION 'immutable_request_conflict' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM reservation WHERE id=p_message_id FOR UPDATE;
 IF r.id IS NULL THEN
  SELECT revision INTO rev FROM client_config WHERE singleton;IF rev IS NULL THEN RAISE EXCEPTION 'worker_config_unavailable';END IF;
  INSERT INTO reservation(id,owner_id,uploader_id,thread_id,internal) VALUES(p_message_id,recipient,u,p_issue_id,p_internal);
  tok:=gen_random_uuid();PERFORM promotion_model.claim(p_message_id,p_image_id,tok,p_digest,rev);source:=u::text||'/'||p_image_id::text;
  IF NOT promotion_model.input_control('input_begin',jsonb_build_object('aid',p_image_id,'token',tok,'owner',recipient,'uploader',u,'issue',p_issue_id,'internal',p_internal,'input',p_digest,'revision',rev,'source',source,'source_id',p_image_id)) THEN RAISE EXCEPTION 'input_intent_failed';END IF;
 ELSE
  SELECT * INTO a FROM attempt WHERE id=p_image_id FOR UPDATE;
  IF NOT r.active OR a.id IS NULL OR a.reservation_id IS DISTINCT FROM r.id OR a.generation<>r.generation OR a.cleaning OR r.owner_id IS DISTINCT FROM recipient OR r.uploader_id IS DISTINCT FROM u OR r.thread_id IS DISTINCT FROM p_issue_id OR r.internal IS DISTINCT FROM p_internal OR a.owner_id IS DISTINCT FROM recipient OR a.uploader_id IS DISTINCT FROM u OR a.thread_id IS DISTINCT FROM p_issue_id OR a.internal IS DISTINCT FROM p_internal OR a.input_digest IS DISTINCT FROM p_digest THEN RAISE EXCEPTION 'request_retired';END IF;
 END IF;
 RETURN jsonb_build_object('version',1,'image_id',p_image_id,'path',u::text||'/'||p_image_id::text,'status',CASE WHEN EXISTS(SELECT 1 FROM promotion_model.readable WHERE id=p_image_id) THEN 'ready' ELSE 'upload' END);
END $$;
CREATE FUNCTION public.finalize_canonical_feedback_image_v1(p_message_id uuid,p_issue_id uuid,p_body text,p_image_id uuid,p_digest text,p_bytes integer,p_internal boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=promotion_model,pg_temp AS $$
DECLARE u uuid:=auth.uid();recipient uuid;staff boolean;q client_request;r reservation;a attempt;published uuid;
BEGIN
 SELECT reporter_id INTO recipient FROM public.feedback_issues WHERE id=p_issue_id;staff:=public.is_feedback_staff(u);
 IF auth.role() IS DISTINCT FROM 'authenticated' OR u IS NULL OR recipient IS NULL OR p_internal IS NULL OR (NOT staff AND (u<>recipient OR p_internal)) THEN RAISE EXCEPTION 'sender_forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO q FROM client_request WHERE mid=p_message_id FOR UPDATE;
 IF q.mid IS NULL OR q.owner_id IS DISTINCT FROM recipient OR q.uploader_id IS DISTINCT FROM u OR q.internal IS DISTINCT FROM p_internal OR q.issue_id IS DISTINCT FROM p_issue_id OR q.body IS DISTINCT FROM p_body OR q.image_id IS DISTINCT FROM p_image_id OR q.digest IS DISTINCT FROM p_digest OR q.bytes IS DISTINCT FROM p_bytes THEN RAISE EXCEPTION 'immutable_request_conflict' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM reservation WHERE id=p_message_id FOR UPDATE;SELECT * INTO a FROM attempt WHERE id=p_image_id FOR UPDATE;
 IF r.id IS NULL OR NOT r.active OR a.id IS NULL OR a.reservation_id IS DISTINCT FROM r.id OR a.generation<>r.generation OR a.cleaning OR r.owner_id IS DISTINCT FROM recipient OR r.uploader_id IS DISTINCT FROM u OR r.thread_id IS DISTINCT FROM p_issue_id OR r.internal IS DISTINCT FROM p_internal OR a.owner_id IS DISTINCT FROM recipient OR a.uploader_id IS DISTINCT FROM u OR a.thread_id IS DISTINCT FROM p_issue_id OR a.internal IS DISTINCT FROM p_internal OR a.input_digest IS DISTINCT FROM p_digest THEN RAISE EXCEPTION 'request_retired';END IF;
 IF NOT EXISTS(SELECT 1 FROM promotion_model.readable WHERE id=p_image_id) THEN RETURN jsonb_build_object('status','pending','message_id',p_message_id);END IF;
 published:=public.fixture_finalize(p_message_id,p_image_id,p_body,p_internal);
 RETURN jsonb_build_object('status','published','message_id',published);
END $$;
REVOKE ALL ON FUNCTION public.reserve_canonical_feedback_image_v1(uuid,uuid,text,uuid,text,integer,boolean),public.finalize_canonical_feedback_image_v1(uuid,uuid,text,uuid,text,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reserve_canonical_feedback_image_v1(uuid,uuid,text,uuid,text,integer,boolean),public.finalize_canonical_feedback_image_v1(uuid,uuid,text,uuid,text,integer,boolean) TO authenticated;
CREATE FUNCTION public.fixture_canonical_messages(p_issue_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=promotion_model,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'body',p.body,'attachments','[]'::jsonb,'canonical_attachments_v1',jsonb_build_array(public.fixture_canonical_descriptor(p.id))) ORDER BY p.id),'[]'::jsonb)
 FROM promotion_model.publication p JOIN promotion_model.attempt a ON a.id=p.attempt_id
 WHERE a.thread_id=p_issue_id AND auth.uid() IS NOT NULL AND (a.owner_id=auth.uid() OR public.is_feedback_staff(auth.uid())) AND (NOT a.internal OR public.is_feedback_staff(auth.uid())) AND public.fixture_canonical_descriptor(p.id) IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.fixture_canonical_messages(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fixture_canonical_messages(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION promotion_model.client_publication_allowed(mid uuid,aid uuid,body text,inside boolean) RETURNS boolean LANGUAGE sql STABLE SET search_path=promotion_model,pg_temp AS $$
 SELECT NOT EXISTS(SELECT 1 FROM client_request WHERE image_id=$2) OR EXISTS(
 SELECT 1 FROM client_request q JOIN public.feedback_issues i ON i.id=q.issue_id AND i.reporter_id=q.owner_id
 WHERE q.image_id=$2 AND q.mid=$1 AND q.uploader_id=auth.uid() AND q.body=$3 AND q.internal=$4
 AND (q.uploader_id=q.owner_id OR public.is_feedback_staff(auth.uid())) AND (NOT $4 OR public.is_feedback_staff(auth.uid())))
$$;
REVOKE ALL ON FUNCTION promotion_model.client_publication_allowed(uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
