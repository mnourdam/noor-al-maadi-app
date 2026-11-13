-- UNAPPLIED PROPOSAL, intentionally outside automatic migrations.
-- Private feedback images; requires isolated storage/RLS and byte-deletion acceptance.
BEGIN;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('feedback-images','feedback-images',false,2097152,ARRAY['image/jpeg','image/png','image/webp']) ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='feedback-images' AND NOT public AND file_size_limit=2097152 AND allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp']) THEN RAISE EXCEPTION 'bucket_configuration_mismatch'; END IF; END $$;
-- Random reservation IDs are never reused, even after content/account deletion.
-- Tombstones contain no owner, thread, path, or content; this prevents delayed
-- duplicate cleanup from deleting a later upload under a recycled path.
CREATE TABLE public.feedback_image_ids(id uuid PRIMARY KEY);
ALTER TABLE public.feedback_image_ids ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feedback_image_ids FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.feedback_image_ids TO service_role;
CREATE TABLE public.feedback_image_delete_queue(
 id uuid PRIMARY KEY, object_path text UNIQUE NOT NULL,
 queued_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.feedback_image_delete_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feedback_image_delete_queue FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.feedback_image_delete_queue TO service_role;
CREATE TABLE public.feedback_image_uploads(id uuid PRIMARY KEY REFERENCES public.feedback_image_ids(id),issue_id uuid NOT NULL REFERENCES public.feedback_issues(id) ON DELETE CASCADE,uploader_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,is_internal boolean NOT NULL,object_path text UNIQUE NOT NULL,mime_type text NOT NULL CHECK(mime_type IN('image/jpeg','image/png','image/webp')),byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 2097152),message_id uuid REFERENCES public.feedback_messages(id) ON DELETE CASCADE,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.feedback_image_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feedback_image_uploads FROM anon,authenticated;
GRANT ALL ON public.feedback_image_uploads TO service_role;
-- Metadata cascades preserve the established account-purge order. They revoke
-- reads immediately but DO NOT delete object bytes. A privileged Storage API
-- worker must drain this durable queue; activation remains blocked until tested.
CREATE FUNCTION public.queue_feedback_image_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.feedback_image_delete_queue(id,object_path)
 VALUES(OLD.id,OLD.object_path) ON CONFLICT(id) DO NOTHING;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.queue_feedback_image_delete() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER feedback_image_retirement BEFORE DELETE ON public.feedback_image_uploads
 FOR EACH ROW EXECUTE FUNCTION public.queue_feedback_image_delete();
CREATE FUNCTION public.expire_feedback_image_reservations() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n bigint;
BEGIN
 DELETE FROM public.feedback_image_uploads
 WHERE message_id IS NULL AND created_at < now()-interval '1 hour';
 GET DIAGNOSTICS n = ROW_COUNT;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.expire_feedback_image_reservations() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.expire_feedback_image_reservations() TO service_role;
CREATE FUNCTION public.reserve_feedback_image(p_id uuid,p_issue_id uuid,p_internal boolean,p_mime text,p_bytes integer) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); own boolean; staff boolean:=public.is_feedback_staff(auth.uid()); r public.feedback_image_uploads;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
 SELECT reporter_id=u INTO own FROM public.feedback_issues WHERE id=p_issue_id;
 IF own IS NULL OR NOT(own OR staff) OR(COALESCE(p_internal,false) AND NOT staff) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_id IS NULL OR p_mime IS NULL OR p_mime NOT IN('image/jpeg','image/png','image/webp') OR p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 2097152 THEN RAISE EXCEPTION 'invalid_image'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,0));
 SELECT * INTO r FROM public.feedback_image_uploads WHERE id=p_id;
 IF FOUND THEN
  IF r.uploader_id<>u OR r.issue_id<>p_issue_id OR r.is_internal<>COALESCE(p_internal,false) OR r.mime_type<>p_mime OR r.byte_size<>p_bytes OR r.message_id IS NOT NULL OR r.created_at<now()-interval '1 hour' THEN RAISE EXCEPTION 'reservation_conflict'; END IF;
  RETURN r.object_path;
 END IF;
 IF(SELECT count(*) FROM public.feedback_image_uploads WHERE uploader_id=u AND created_at>now()-interval '1 hour')>=12 THEN RAISE EXCEPTION 'rate_limited'; END IF;
 INSERT INTO public.feedback_image_ids(id) VALUES(p_id) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RAISE EXCEPTION 'retired_image_id'; END IF;
 INSERT INTO public.feedback_image_uploads(id,issue_id,uploader_id,is_internal,object_path,mime_type,byte_size) VALUES(p_id,p_issue_id,u,COALESCE(p_internal,false),u::text||'/'||p_issue_id::text||'/'||p_id::text,p_mime,p_bytes) RETURNING * INTO r;
 RETURN r.object_path;
END $$;
CREATE FUNCTION public.feedback_image_object_access(p_name text,p_write boolean) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.feedback_image_uploads a JOIN public.feedback_issues i ON i.id=a.issue_id LEFT JOIN public.feedback_messages m ON m.id=a.message_id WHERE a.object_path=p_name AND CASE WHEN p_write THEN a.message_id IS NULL AND a.uploader_id=auth.uid() AND a.created_at>now()-interval '1 hour' AND(i.reporter_id=auth.uid() OR public.is_feedback_staff(auth.uid())) AND(NOT a.is_internal OR public.is_feedback_staff(auth.uid())) ELSE a.message_id IS NOT NULL AND m.issue_id=a.issue_id AND m.is_internal=a.is_internal AND(public.is_feedback_staff(auth.uid()) OR(i.reporter_id=auth.uid() AND NOT m.is_internal)) END);
$$;
CREATE POLICY feedback_image_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='feedback-images' AND public.feedback_image_object_access(name,true));
CREATE POLICY feedback_image_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='feedback-images' AND public.feedback_image_object_access(name,false));
-- Deliberately no public access, replacement, or client deletion of acknowledged images.
CREATE FUNCTION public.reply_with_feedback_images(p_message_id uuid,p_issue_id uuid,p_body text,p_internal boolean,p_image_ids uuid[]) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); own boolean; staff boolean:=public.is_feedback_staff(auth.uid()); aid uuid; a public.feedback_image_uploads; obj storage.objects; items jsonb:='[]'; prior public.feedback_messages; body text:=COALESCE(NULLIF(btrim(p_body),''),'صورة مرفقة');
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
 IF p_message_id IS NULL OR p_image_ids IS NULL OR cardinality(p_image_ids) NOT BETWEEN 1 AND 3 OR length(body)>5000 THEN RAISE EXCEPTION 'invalid_message'; END IF;
 IF(SELECT count(DISTINCT x) FROM unnest(p_image_ids)x)<>cardinality(p_image_ids) THEN RAISE EXCEPTION 'invalid_images'; END IF;
 SELECT reporter_id=u INTO own FROM public.feedback_issues WHERE id=p_issue_id;
 IF own IS NULL OR NOT(own OR staff) OR(COALESCE(p_internal,false) AND NOT staff) THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_message_id::text,1));
 SELECT * INTO prior FROM public.feedback_messages WHERE id=p_message_id;
 IF FOUND THEN
  IF prior.author_id IS DISTINCT FROM u OR prior.issue_id<>p_issue_id OR prior.body<>body OR prior.is_internal<>COALESCE(p_internal,false) OR(SELECT array_agg(value->>'id' ORDER BY ord) FROM jsonb_array_elements(prior.attachments) WITH ORDINALITY t(value,ord)) IS DISTINCT FROM ARRAY(SELECT x::text FROM unnest(p_image_ids)x) THEN RAISE EXCEPTION 'message_conflict'; END IF;
  RETURN prior.id;
 END IF;
 FOREACH aid IN ARRAY p_image_ids LOOP
  SELECT * INTO a FROM public.feedback_image_uploads WHERE id=aid FOR UPDATE;
  IF NOT FOUND OR a.uploader_id<>u OR a.issue_id<>p_issue_id OR a.is_internal<>COALESCE(p_internal,false) OR a.message_id IS NOT NULL OR a.created_at<now()-interval '1 hour' THEN RAISE EXCEPTION 'invalid_attachment'; END IF;
  SELECT * INTO obj FROM storage.objects WHERE bucket_id='feedback-images' AND name=a.object_path;
  IF NOT FOUND OR obj.metadata->>'mimetype' IS DISTINCT FROM a.mime_type OR(obj.metadata->>'size')::bigint IS DISTINCT FROM a.byte_size THEN RAISE EXCEPTION 'upload_incomplete'; END IF;
  items:=items||jsonb_build_array(jsonb_build_object('id',a.id,'path',a.object_path,'mime',a.mime_type,'bytes',a.byte_size));
 END LOOP;
 INSERT INTO public.feedback_messages(id,issue_id,author_id,author_role,body,is_internal,attachments) VALUES(p_message_id,p_issue_id,u,CASE WHEN own AND NOT COALESCE(p_internal,false) THEN 'player' ELSE 'admin' END,body,COALESCE(p_internal,false),items);
 UPDATE public.feedback_image_uploads SET message_id=p_message_id WHERE id=ANY(p_image_ids);
 RETURN p_message_id;
END $$;
REVOKE ALL ON FUNCTION public.reserve_feedback_image(uuid,uuid,boolean,text,integer),public.feedback_image_object_access(text,boolean),public.reply_with_feedback_images(uuid,uuid,text,boolean,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_feedback_image(uuid,uuid,boolean,text,integer),public.feedback_image_object_access(text,boolean),public.reply_with_feedback_images(uuid,uuid,text,boolean,uuid[]) TO authenticated;
COMMIT;
