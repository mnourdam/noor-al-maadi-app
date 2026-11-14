-- Dormant owner-only client contract. Disposable fixture only, never a migration.
CREATE TABLE promotion_model.client_config(singleton boolean PRIMARY KEY CHECK(singleton),revision text NOT NULL);
CREATE TABLE promotion_model.client_request(mid uuid PRIMARY KEY,owner_id uuid NOT NULL,issue_id uuid NOT NULL,body text NOT NULL,image_id uuid UNIQUE NOT NULL,digest text NOT NULL,bytes integer NOT NULL);
REVOKE ALL ON promotion_model.client_config,promotion_model.client_request FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.reserve_canonical_feedback_image_v1(p_message_id uuid,p_issue_id uuid,p_body text,p_image_id uuid,p_digest text,p_bytes integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=promotion_model,pg_temp AS $$
DECLARE u uuid:=auth.uid();q client_request;r reservation;a attempt;rev text;tok uuid;source text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR u IS NULL OR public.is_feedback_staff(u) OR p_message_id IS NULL OR p_image_id IS NULL OR p_body IS NULL OR length(p_body)>5000 OR p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' OR p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 2097152 OR NOT EXISTS(SELECT 1 FROM public.feedback_issues WHERE id=p_issue_id AND reporter_id=u) THEN RAISE EXCEPTION 'sender_forbidden' USING ERRCODE='42501'; END IF;
 INSERT INTO client_request VALUES(p_message_id,u,p_issue_id,p_body,p_image_id,p_digest,p_bytes) ON CONFLICT(mid) DO NOTHING;
 SELECT * INTO q FROM client_request WHERE mid=p_message_id FOR UPDATE;
 IF q.owner_id IS DISTINCT FROM u OR q.issue_id IS DISTINCT FROM p_issue_id OR q.body IS DISTINCT FROM p_body OR q.image_id IS DISTINCT FROM p_image_id OR q.digest IS DISTINCT FROM p_digest OR q.bytes IS DISTINCT FROM p_bytes THEN RAISE EXCEPTION 'immutable_request_conflict'; END IF;
 SELECT * INTO r FROM reservation WHERE id=p_message_id FOR UPDATE;
 IF r.id IS NULL THEN
  SELECT revision INTO rev FROM client_config WHERE singleton;IF rev IS NULL THEN RAISE EXCEPTION 'worker_config_unavailable';END IF;
  INSERT INTO reservation(id,owner_id,thread_id,internal) VALUES(p_message_id,u,p_issue_id,false);
  tok:=gen_random_uuid();PERFORM promotion_model.claim(p_message_id,p_image_id,tok,p_digest,rev);source:=u::text||'/'||p_image_id::text;
  IF NOT promotion_model.input_control('input_begin',jsonb_build_object('aid',p_image_id,'token',tok,'owner',u,'issue',p_issue_id,'internal',false,'input',p_digest,'revision',rev,'source',source,'source_id',p_image_id)) THEN RAISE EXCEPTION 'input_intent_failed';END IF;
 ELSE
  SELECT * INTO a FROM attempt WHERE id=p_image_id FOR UPDATE;
  IF NOT r.active OR a.id IS NULL OR a.reservation_id IS DISTINCT FROM r.id OR a.generation<>r.generation OR a.cleaning OR r.owner_id IS DISTINCT FROM u OR r.thread_id IS DISTINCT FROM p_issue_id OR r.internal OR a.owner_id IS DISTINCT FROM u OR a.thread_id IS DISTINCT FROM p_issue_id OR a.internal OR a.input_digest IS DISTINCT FROM p_digest THEN RAISE EXCEPTION 'request_retired';END IF;
 END IF;
 RETURN jsonb_build_object('version',1,'image_id',p_image_id,'path',u::text||'/'||p_image_id::text,'status',CASE WHEN EXISTS(SELECT 1 FROM promotion_model.readable WHERE id=p_image_id) THEN 'ready' ELSE 'upload' END);
END $$;
CREATE FUNCTION public.finalize_canonical_feedback_image_v1(p_message_id uuid,p_issue_id uuid,p_body text,p_image_id uuid,p_digest text,p_bytes integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=promotion_model,pg_temp AS $$
DECLARE u uuid:=auth.uid();q client_request;r reservation;a attempt;published uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR u IS NULL OR public.is_feedback_staff(u) OR NOT EXISTS(SELECT 1 FROM public.feedback_issues WHERE id=p_issue_id AND reporter_id=u) THEN RAISE EXCEPTION 'sender_forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO q FROM client_request WHERE mid=p_message_id FOR UPDATE;
 IF q.mid IS NULL OR q.owner_id IS DISTINCT FROM u OR q.issue_id IS DISTINCT FROM p_issue_id OR q.body IS DISTINCT FROM p_body OR q.image_id IS DISTINCT FROM p_image_id OR q.digest IS DISTINCT FROM p_digest OR q.bytes IS DISTINCT FROM p_bytes THEN RAISE EXCEPTION 'immutable_request_conflict';END IF;
 SELECT * INTO r FROM reservation WHERE id=p_message_id FOR UPDATE;SELECT * INTO a FROM attempt WHERE id=p_image_id FOR UPDATE;
 IF r.id IS NULL OR NOT r.active OR a.id IS NULL OR a.reservation_id IS DISTINCT FROM r.id OR a.generation<>r.generation OR a.cleaning OR r.owner_id IS DISTINCT FROM u OR r.thread_id IS DISTINCT FROM p_issue_id OR r.internal OR a.owner_id IS DISTINCT FROM u OR a.thread_id IS DISTINCT FROM p_issue_id OR a.internal OR a.input_digest IS DISTINCT FROM p_digest THEN RAISE EXCEPTION 'request_retired';END IF;
 IF NOT EXISTS(SELECT 1 FROM promotion_model.readable WHERE id=p_image_id) THEN RETURN jsonb_build_object('status','pending','message_id',p_message_id);END IF;
 published:=public.fixture_finalize(p_message_id,p_image_id,p_body,false);
 RETURN jsonb_build_object('status','published','message_id',published);
END $$;
REVOKE ALL ON FUNCTION public.reserve_canonical_feedback_image_v1(uuid,uuid,text,uuid,text,integer),public.finalize_canonical_feedback_image_v1(uuid,uuid,text,uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reserve_canonical_feedback_image_v1(uuid,uuid,text,uuid,text,integer),public.finalize_canonical_feedback_image_v1(uuid,uuid,text,uuid,text,integer) TO authenticated;
CREATE FUNCTION public.fixture_canonical_messages(p_issue_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=promotion_model,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'body',p.body,'attachment',public.fixture_canonical_descriptor(p.id)) ORDER BY p.id),'[]'::jsonb)
 FROM promotion_model.publication p JOIN promotion_model.attempt a ON a.id=p.attempt_id
 WHERE a.thread_id=p_issue_id AND auth.uid() IS NOT NULL AND a.owner_id=auth.uid() AND NOT a.internal AND public.fixture_canonical_descriptor(p.id) IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.fixture_canonical_messages(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fixture_canonical_messages(uuid) TO authenticated;
