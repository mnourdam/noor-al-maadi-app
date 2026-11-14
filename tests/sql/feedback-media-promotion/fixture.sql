-- Disposable transaction model ONLY. Not a migration, production API or ACL design.
CREATE SCHEMA promotion_model;
SET search_path=promotion_model;
CREATE TABLE reservation(id uuid PRIMARY KEY, owner_id uuid NOT NULL, uploader_id uuid, thread_id uuid NOT NULL, internal boolean NOT NULL, generation bigint NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, accepted uuid);
CREATE TABLE attempt(id uuid PRIMARY KEY, reservation_id uuid NOT NULL REFERENCES reservation, generation bigint NOT NULL, token uuid UNIQUE NOT NULL, owner_id uuid NOT NULL, uploader_id uuid, thread_id uuid NOT NULL, internal boolean NOT NULL, object_key text UNIQUE NOT NULL, input_digest text NOT NULL CHECK(length(input_digest)=64), validator text NOT NULL, state text NOT NULL CHECK(state IN('PREPARED','WRITING','TERMINAL')), put_success boolean, output_digest text, cleanup_due boolean NOT NULL DEFAULT true, cleaning boolean NOT NULL DEFAULT false, removal_observed boolean NOT NULL DEFAULT false);
CREATE FUNCTION claim(rid uuid,aid uuid,tok uuid,digest text,revision text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r reservation; path text;
BEGIN
 SELECT * INTO r FROM reservation WHERE id=rid FOR UPDATE;
 IF NOT FOUND OR NOT r.active OR r.accepted IS NOT NULL THEN RAISE EXCEPTION 'claim_denied'; END IF;
 path:=r.owner_id::text||'/'||aid::text;
 UPDATE reservation SET generation=generation+1 WHERE id=rid;
 INSERT INTO attempt(id,reservation_id,generation,token,owner_id,uploader_id,thread_id,internal,object_key,input_digest,validator,state,put_success,output_digest,cleanup_due,cleaning,removal_observed) VALUES(aid,rid,r.generation+1,tok,r.owner_id,coalesce(r.uploader_id,r.owner_id),r.thread_id,r.internal,path,digest,revision,'PREPARED',NULL,NULL,true,false,false);
 RETURN path;
END $$;
CREATE FUNCTION start_write(aid uuid,tok uuid) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE a attempt; r reservation;
BEGIN
 SELECT * INTO a FROM attempt WHERE id=aid;
 SELECT * INTO r FROM reservation WHERE id=a.reservation_id FOR UPDATE;
 IF NOT FOUND OR NOT r.active OR r.accepted IS NOT NULL OR r.generation<>a.generation OR a.token IS DISTINCT FROM tok THEN RETURN false; END IF;
 UPDATE attempt SET state='WRITING' WHERE id=aid AND state='PREPARED';
 RETURN FOUND;
END $$;
-- Terminal observation may arrive from a retired worker. It never grants publication.
CREATE FUNCTION terminal(aid uuid,tok uuid,success boolean,digest text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
 IF success IS NULL OR (success AND (digest IS NULL OR length(digest)<>64)) THEN RETURN false; END IF;
 UPDATE attempt SET state='TERMINAL',put_success=success,output_digest=CASE WHEN success THEN digest ELSE NULL END WHERE id=aid AND token=tok AND state='WRITING';
 RETURN FOUND;
END $$;
CREATE FUNCTION publish(aid uuid,tok uuid,input_hash text,output_hash text,revision text,owner uuid,thread uuid,inside boolean) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE a attempt; r reservation;
BEGIN
 SELECT * INTO a FROM attempt WHERE id=aid;
 SELECT * INTO r FROM reservation WHERE id=a.reservation_id FOR UPDATE;
 SELECT * INTO a FROM attempt WHERE id=aid FOR UPDATE;
 IF r.id IS NULL OR NOT r.active OR r.accepted IS NOT NULL OR r.generation<>a.generation OR a.token IS DISTINCT FROM tok OR a.state<>'TERMINAL' OR a.cleaning OR a.put_success IS DISTINCT FROM true OR a.input_digest IS DISTINCT FROM input_hash OR a.output_digest IS DISTINCT FROM output_hash OR a.validator IS DISTINCT FROM revision OR a.owner_id IS DISTINCT FROM owner OR a.thread_id IS DISTINCT FROM thread OR a.internal IS DISTINCT FROM inside THEN RETURN false; END IF;
 UPDATE reservation SET accepted=aid WHERE id=r.id;
 UPDATE attempt SET cleanup_due=false WHERE id=aid;
 RETURN true;
END $$;
CREATE FUNCTION retire(rid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM reservation WHERE id=rid FOR UPDATE;
 UPDATE reservation SET active=false,generation=generation+1,accepted=NULL WHERE id=rid;
 UPDATE attempt SET cleanup_due=true WHERE reservation_id=rid;
END $$;
CREATE VIEW readable AS SELECT a.id,a.object_key,a.output_digest,a.validator,a.owner_id,a.thread_id,a.internal FROM reservation r JOIN attempt a ON a.id=r.accepted AND a.reservation_id=r.id AND a.generation=r.generation WHERE r.active AND a.state='TERMINAL' AND a.put_success AND NOT a.cleanup_due;
-- Irreversible cleanup claim serializes with publication on reservation first.
-- Durable obligation alone is NOT permission to remove a publishable candidate.
CREATE FUNCTION claim_cleanup(aid uuid,expected_key text,abandon boolean DEFAULT false) RETURNS text LANGUAGE plpgsql AS $$
DECLARE a attempt; r reservation;
BEGIN
 SELECT * INTO a FROM attempt WHERE id=aid;
 SELECT * INTO r FROM reservation WHERE id=a.reservation_id FOR UPDATE;
 SELECT * INTO a FROM attempt WHERE id=aid FOR UPDATE;
 IF a.id IS NULL OR a.object_key IS DISTINCT FROM expected_key OR NOT a.cleanup_due OR a.state<>'TERMINAL' THEN RETURN NULL; END IF;
 IF r.active AND r.generation=a.generation AND a.put_success AND NOT a.cleaning THEN
  IF abandon IS DISTINCT FROM true OR r.accepted IS NOT NULL THEN RETURN NULL; END IF;
  -- Explicitly abandon current authority before allowing any external removal.
  UPDATE reservation SET generation=generation+1 WHERE id=r.id;
 END IF;
 UPDATE attempt SET cleaning=true WHERE id=aid;
 RETURN a.object_key;
END $$;
-- Never deletes obligations. Removal observation is not physical erasure proof.
CREATE FUNCTION observe_removal(aid uuid,expected_key text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
 UPDATE attempt SET removal_observed=true WHERE id=aid AND object_key=expected_key AND cleanup_due AND cleaning AND state='TERMINAL';
 RETURN FOUND;
END $$;

RESET search_path;
ALTER TABLE promotion_model.attempt ADD COLUMN output_size integer CHECK(output_size BETWEEN 1 AND 2097152);
CREATE TABLE promotion_model.publication(id uuid PRIMARY KEY, attempt_id uuid UNIQUE NOT NULL REFERENCES promotion_model.attempt, author_id uuid NOT NULL, body text NOT NULL, internal boolean NOT NULL);
-- Public denial surface exposes no rows and grants no mutations.
CREATE VIEW public.fixture_promotion_receipts AS SELECT id,output_digest FROM promotion_model.attempt;
REVOKE ALL ON public.fixture_promotion_receipts FROM PUBLIC,anon,authenticated;
CREATE TABLE promotion_model.input_intent(aid uuid PRIMARY KEY REFERENCES promotion_model.attempt, reservation_id uuid NOT NULL, generation bigint NOT NULL, owner_id uuid NOT NULL, uploader_id uuid NOT NULL, source_key text UNIQUE NOT NULL, digest text NOT NULL, writer_state text NOT NULL CHECK(writer_state IN('WRITING','TERMINAL')), cleaning boolean NOT NULL DEFAULT false, positive_seen boolean NOT NULL DEFAULT false, removal_observed boolean NOT NULL DEFAULT false, decode_rejected boolean NOT NULL DEFAULT false);
CREATE FUNCTION promotion_model.input_control(op text,p jsonb) RETURNS boolean LANGUAGE plpgsql SET search_path=promotion_model,pg_temp AS $$
DECLARE a promotion_model.attempt;r promotion_model.reservation;i promotion_model.input_intent;
BEGIN
 SELECT * INTO a FROM promotion_model.attempt WHERE id=(p->>'aid')::uuid;
 SELECT * INTO r FROM promotion_model.reservation WHERE id=a.reservation_id FOR UPDATE;
 SELECT * INTO a FROM promotion_model.attempt WHERE id=(p->>'aid')::uuid FOR UPDATE;
 IF a.id IS NULL OR a.uploader_id IS DISTINCT FROM coalesce(r.uploader_id,r.owner_id) OR a.uploader_id IS DISTINCT FROM coalesce((p->>'uploader')::uuid,a.owner_id) OR a.token IS DISTINCT FROM (p->>'token')::uuid OR a.owner_id IS DISTINCT FROM (p->>'owner')::uuid OR a.thread_id IS DISTINCT FROM (p->>'issue')::uuid OR a.internal IS DISTINCT FROM (p->>'internal')::boolean OR a.input_digest IS DISTINCT FROM p->>'input' OR a.validator IS DISTINCT FROM p->>'revision' THEN RETURN false; END IF;
 SELECT * INTO i FROM promotion_model.input_intent WHERE aid=a.id FOR UPDATE;
 IF op='input_begin' THEN
  IF i.aid IS NOT NULL OR NOT r.active OR r.generation<>a.generation OR r.accepted IS NOT NULL OR p->>'source' IS DISTINCT FROM a.uploader_id::text||'/'||(p->>'source_id')::uuid::text THEN RETURN false; END IF;
  INSERT INTO promotion_model.input_intent(aid,reservation_id,generation,owner_id,uploader_id,source_key,digest,writer_state) VALUES(a.id,r.id,a.generation,a.owner_id,a.uploader_id,p->>'source',a.input_digest,'WRITING'); RETURN true;
 END IF;
 IF i.aid IS NULL OR i.owner_id IS DISTINCT FROM a.owner_id OR i.uploader_id IS DISTINCT FROM a.uploader_id OR i.source_key IS DISTINCT FROM p->>'source' OR i.digest IS DISTINCT FROM p->>'input' THEN RETURN false; END IF;
 CASE op
 WHEN 'input_terminal' THEN
  IF i.cleaning OR i.writer_state<>'WRITING' THEN RETURN false; END IF;
  UPDATE promotion_model.input_intent SET writer_state='TERMINAL' WHERE aid=a.id; RETURN true;
 WHEN 'input_admit' THEN RETURN r.active AND r.generation=a.generation AND NOT i.cleaning AND i.writer_state='TERMINAL';
 WHEN 'reject_input' THEN
  IF i.cleaning OR i.writer_state<>'TERMINAL' OR NOT r.active OR r.generation<>a.generation OR r.accepted IS NOT NULL THEN RETURN false; END IF;
  UPDATE promotion_model.input_intent SET decode_rejected=true WHERE aid=a.id;
  PERFORM promotion_model.retire(r.id);RETURN true;
 WHEN 'input_cleanup' THEN
  IF i.writer_state<>'TERMINAL' OR (r.active AND NOT EXISTS(SELECT 1 FROM promotion_model.readable v JOIN promotion_model.publication pub ON pub.attempt_id=v.id WHERE v.id=a.id)) THEN RETURN false; END IF;
  UPDATE promotion_model.input_intent SET cleaning=true WHERE aid=a.id;RETURN true;
 WHEN 'input_positive' THEN
  IF NOT i.cleaning OR i.writer_state<>'TERMINAL' THEN RETURN false; END IF;
  UPDATE promotion_model.input_intent SET positive_seen=true WHERE aid=a.id; RETURN true;
 WHEN 'input_removed' THEN
  IF NOT i.cleaning OR NOT i.positive_seen OR i.writer_state<>'TERMINAL' THEN RETURN false; END IF;
  UPDATE promotion_model.input_intent SET removal_observed=true WHERE aid=a.id; RETURN true;
 WHEN 'input_retry_absence' THEN RETURN i.cleaning AND i.positive_seen AND i.writer_state='TERMINAL';
 ELSE RETURN false;
 END CASE;
END $$;
CREATE FUNCTION public.fixture_quarantine_insert(key text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=promotion_model,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM promotion_model.input_intent i JOIN promotion_model.attempt a ON a.id=i.aid JOIN promotion_model.reservation r ON r.id=i.reservation_id WHERE i.source_key=key AND i.uploader_id=auth.uid() AND (i.owner_id=auth.uid() OR public.is_feedback_staff(auth.uid())) AND (NOT a.internal OR public.is_feedback_staff(auth.uid())) AND a.uploader_id=i.uploader_id AND a.owner_id=i.owner_id AND r.active AND r.generation=i.generation AND a.generation=i.generation AND NOT i.cleaning AND i.writer_state='WRITING')
$$;
DROP POLICY fixture_decode_insert ON storage.objects;
CREATE POLICY fixture_bound_quarantine_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='feedback-images-quarantine' AND public.fixture_quarantine_insert(name));
CREATE FUNCTION public.fixture_worker(op text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=promotion_model,pg_temp AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_only' USING ERRCODE='42501'; END IF;
 IF op IN('input_begin','input_terminal','input_admit','reject_input','input_cleanup','input_positive','input_removed','input_retry_absence') THEN RETURN to_jsonb(promotion_model.input_control(op,p)); END IF;
 CASE op
 WHEN 'reserve' THEN INSERT INTO promotion_model.reservation(id,owner_id,uploader_id,thread_id,internal) VALUES((p->>'rid')::uuid,(p->>'owner')::uuid,coalesce((p->>'uploader')::uuid,(p->>'owner')::uuid),(p->>'issue')::uuid,(p->>'internal')::boolean); RETURN 'true';
 WHEN 'claim' THEN RETURN to_jsonb(promotion_model.claim((p->>'rid')::uuid,(p->>'aid')::uuid,(p->>'token')::uuid,p->>'input',p->>'revision'));
 WHEN 'start' THEN IF NOT promotion_model.input_control('input_admit',p) THEN RETURN 'false'; END IF; RETURN to_jsonb(promotion_model.start_write((p->>'aid')::uuid,(p->>'token')::uuid));
 WHEN 'terminal' THEN IF (p->>'bytes')::integer NOT BETWEEN 1 AND 2097152 OR p->>'bytes' IS NULL THEN RETURN 'false'; END IF; IF NOT promotion_model.terminal((p->>'aid')::uuid,(p->>'token')::uuid,(p->>'success')::boolean,p->>'output') THEN RETURN 'false'; END IF; UPDATE promotion_model.attempt SET output_size=(p->>'bytes')::integer WHERE id=(p->>'aid')::uuid; RETURN 'true';
 WHEN 'attest' THEN IF NOT promotion_model.input_control('input_admit',p) THEN RETURN 'false'; END IF; IF NOT EXISTS(SELECT 1 FROM promotion_model.attempt WHERE id=(p->>'aid')::uuid AND output_size=(p->>'bytes')::integer) THEN RETURN 'false'; END IF; RETURN to_jsonb(promotion_model.publish((p->>'aid')::uuid,(p->>'token')::uuid,p->>'input',p->>'output',p->>'revision',(p->>'owner')::uuid,(p->>'issue')::uuid,(p->>'internal')::boolean));
 WHEN 'retire' THEN PERFORM promotion_model.retire((p->>'rid')::uuid); RETURN 'true';
 WHEN 'cleanup' THEN RETURN to_jsonb(promotion_model.claim_cleanup((p->>'aid')::uuid,p->>'key',COALESCE((p->>'abandon')::boolean,false)));
 WHEN 'removed' THEN RETURN to_jsonb(promotion_model.observe_removal((p->>'aid')::uuid,p->>'key'));
 ELSE RAISE EXCEPTION 'unknown_operation';
 END CASE;
END $$;
-- Sender extension replaces this private guard; checked before both replay and insert.
CREATE FUNCTION promotion_model.client_publication_allowed(mid uuid,aid uuid,body text,inside boolean) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION public.fixture_finalize(mid uuid,aid uuid,body text,inside boolean) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=promotion_model,pg_temp AS $$
DECLARE a promotion_model.attempt; r promotion_model.reservation; previous promotion_model.publication; u uuid:=auth.uid();
BEGIN
 IF NOT promotion_model.client_publication_allowed(mid,aid,body,inside) THEN RAISE EXCEPTION 'client_publication_binding' USING ERRCODE='42501';END IF;
 IF u IS NULL OR body IS NULL OR length(body)>5000 OR inside IS NULL THEN RAISE EXCEPTION 'invalid'; END IF;
 SELECT * INTO a FROM promotion_model.attempt WHERE id=aid;
 SELECT * INTO r FROM promotion_model.reservation WHERE id=a.reservation_id FOR UPDATE;
 SELECT * INTO a FROM promotion_model.attempt WHERE id=aid FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM promotion_model.readable WHERE id=aid) OR inside IS DISTINCT FROM a.internal OR NOT(u=a.owner_id OR public.is_feedback_staff(u)) OR (inside AND NOT public.is_feedback_staff(u)) THEN RAISE EXCEPTION 'unattested_or_forbidden'; END IF;
 SELECT * INTO previous FROM promotion_model.publication WHERE id=mid;
 IF FOUND THEN
  IF previous.attempt_id IS DISTINCT FROM aid OR previous.author_id IS DISTINCT FROM u OR previous.body IS DISTINCT FROM body OR previous.internal IS DISTINCT FROM inside THEN RAISE EXCEPTION 'message_conflict'; END IF;
  RETURN mid;
 END IF;
 INSERT INTO promotion_model.publication VALUES(mid,aid,u,body,inside);
 RETURN mid;
END $$;
CREATE FUNCTION public.fixture_canonical_read(key text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=promotion_model,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM promotion_model.readable a JOIN promotion_model.publication p ON p.attempt_id=a.id WHERE a.object_key=key AND auth.uid() IS NOT NULL AND (a.owner_id=auth.uid() OR public.is_feedback_staff(auth.uid())) AND (NOT a.internal OR public.is_feedback_staff(auth.uid())))
$$;
REVOKE ALL ON SCHEMA promotion_model FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA promotion_model FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA promotion_model FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fixture_worker(text,jsonb),public.fixture_finalize(uuid,uuid,text,boolean),public.fixture_canonical_read(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fixture_worker(text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fixture_finalize(uuid,uuid,text,boolean),public.fixture_canonical_read(text) TO authenticated;
CREATE POLICY fixture_published_canonical_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='feedback-images-canonical' AND public.fixture_canonical_read(name));

REVOKE ALL ON FUNCTION public.fixture_quarantine_insert(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fixture_quarantine_insert(text) TO authenticated;

-- Actor-derived descriptor for the inactive v1 client contract, not a deployed RPC.
CREATE FUNCTION public.fixture_canonical_descriptor(mid uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=promotion_model,pg_temp AS $$
 SELECT jsonb_build_object('version',1,'id',a.id,'message_id',p.id,'key',a.object_key,'mime','image/jpeg','bytes',t.output_size,'sha256',a.output_digest)
 FROM promotion_model.readable a JOIN promotion_model.publication p ON p.attempt_id=a.id
 JOIN promotion_model.attempt t ON t.id=a.id
 WHERE p.id=mid AND auth.uid() IS NOT NULL AND (a.owner_id=auth.uid() OR public.is_feedback_staff(auth.uid())) AND (NOT a.internal OR public.is_feedback_staff(auth.uid()))
$$;
REVOKE ALL ON FUNCTION public.fixture_canonical_descriptor(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fixture_canonical_descriptor(uuid) TO authenticated;
