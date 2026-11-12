-- ISOLATED COUNTERFACTUAL ONLY. Production gameplay eligibility issuer UNKNOWN.
DO $$ BEGIN
 IF current_database()<>'v18_investigation_fixture' OR NOT EXISTS(
 SELECT 1 FROM fixture_boundary.marker WHERE marker='v18-investigation-provenance-only-v1') THEN
 RAISE EXCEPTION 'guarded:wrong-fixture'; END IF;
END $$;
CREATE ROLE investigation_executor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE SCHEMA investigation_guard;
REVOKE ALL ON SCHEMA investigation_guard FROM PUBLIC,authenticated,service_role;
CREATE EXTENSION pgcrypto WITH SCHEMA investigation_guard;
-- Admin-only synthetic catalog approval: no user-created approval path.
CREATE TABLE investigation_guard.approvals(
 owner uuid NOT NULL, investigation uuid NOT NULL, catalog_version integer NOT NULL CHECK(catalog_version>0),
 xp integer NOT NULL CHECK(xp BETWEEN 0 AND 150), dinars integer NOT NULL CHECK(dinars BETWEEN 0 AND 50),
 hearts integer NOT NULL CHECK(hearts BETWEEN 0 AND 5), artifact text,
 PRIMARY KEY(owner,investigation));
CREATE TABLE investigation_guard.issuance(
 owner uuid NOT NULL, investigation uuid NOT NULL, delta_id uuid NOT NULL UNIQUE,
 approval jsonb NOT NULL, receipt jsonb NOT NULL, PRIMARY KEY(owner,investigation));
ALTER TABLE investigation_guard.issuance OWNER TO investigation_executor;
CREATE FUNCTION investigation_guard.immutable() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'guarded:immutable'; END $$;
CREATE TRIGGER immutable_approval BEFORE UPDATE OR DELETE ON investigation_guard.approvals
FOR EACH ROW EXECUTE FUNCTION investigation_guard.immutable();
CREATE TRIGGER immutable_issuance BEFORE UPDATE OR DELETE ON investigation_guard.issuance
FOR EACH ROW EXECUTE FUNCTION investigation_guard.immutable();
CREATE FUNCTION investigation_guard.delta_id(owner_id uuid,investigation_id uuid) RETURNS uuid
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $$
 SELECT substr(encode(investigation_guard.digest(convert_to(jsonb_build_array(
 'isolated-investigation-once-v1',owner_id::text,investigation_id::text)::text,'UTF8'),'sha256'),'hex'),1,32)::uuid;
$$;
CREATE FUNCTION investigation_guard.complete(p_investigation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=auth.uid(); a investigation_guard.approvals; prior investigation_guard.issuance;
 d uuid; source_name text; snapshot jsonb; result jsonb; x bigint; n bigint; h integer;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'guarded:unauthenticated'; END IF;
 -- Serialize account mutation and same-identity admission across real sessions.
 SELECT xp,dinars,hearts INTO x,n,h FROM public.profiles WHERE id=u FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'guarded:profile-missing'; END IF;
 SELECT * INTO prior FROM investigation_guard.issuance WHERE owner=u AND investigation=p_investigation;
 IF FOUND THEN RETURN prior.receipt; END IF;
 SELECT * INTO a FROM investigation_guard.approvals WHERE owner=u AND investigation=p_investigation;
 IF NOT FOUND THEN RAISE EXCEPTION 'guarded:approval-missing'; END IF;
 d:=investigation_guard.delta_id(u,p_investigation);
 source_name:='isolated-investigation-once-v1:'||p_investigation::text;
 -- Existing client-writable records, including exact-looking ones, aren't proof.
 IF EXISTS(SELECT 1 FROM public.user_investigation_progress WHERE user_id=u AND investigation_id=p_investigation) THEN
 RAISE EXCEPTION 'guarded:unverified-completion'; END IF;
 IF EXISTS(SELECT 1 FROM public.applied_profile_deltas WHERE delta_id=d) THEN
 RAISE EXCEPTION 'guarded:unverified-ledger'; END IF;
 IF x<0 OR n<0 OR x+a.xp>2147483647 OR n+a.dinars>2147483647 THEN
 RAISE EXCEPTION 'guarded:invalid-result'; END IF;
 snapshot:=jsonb_build_object('v',1,'catalog_version',a.catalog_version,'xp',a.xp,'dinars',a.dinars,'hearts',a.hearts,'artifact',a.artifact);
 INSERT INTO public.applied_profile_deltas(delta_id,user_id,xp,dinars,hearts,source)
 VALUES(d,u,a.xp,a.dinars,a.hearts,source_name);
 INSERT INTO public.user_investigation_progress(user_id,investigation_id,status,xp_earned,dinars_earned,hearts_earned,reward_snapshot,artifact_awarded,completed_at)
 VALUES(u,p_investigation,'completed',a.xp,a.dinars,a.hearts,snapshot,a.artifact,now());
 UPDATE public.profiles SET xp=(x+a.xp)::integer,dinars=(n+a.dinars)::integer,
 hearts=LEAST(5,GREATEST(0,h+a.hearts)),last_active=now() WHERE id=u;
 IF a.artifact IS NOT NULL THEN
 INSERT INTO public.user_collection VALUES(u,a.artifact,'artifact') ON CONFLICT(user_id,item_id) DO NOTHING;
 END IF;
 result:=jsonb_build_object('ok',true,'owner',u,'investigation',p_investigation,'delta_id',d,
 'approval',snapshot,'xp_total',x+a.xp,'dinar_total',n+a.dinars);
 INSERT INTO investigation_guard.issuance VALUES(u,p_investigation,d,snapshot,result);
 RETURN result;
END $$;
ALTER FUNCTION investigation_guard.complete(uuid) OWNER TO investigation_executor;
-- Exclusion is limited to objects/producers loaded into this disposable fixture.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.profiles,public.user_investigation_progress,public.applied_profile_deltas,public.user_collection FROM PUBLIC,authenticated,service_role;
REVOKE ALL ON FUNCTION public.complete_investigation_v2(uuid,uuid,integer,integer),public.apply_profile_delta(uuid,integer,integer,integer,text) FROM PUBLIC,authenticated,service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA investigation_guard FROM PUBLIC,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA investigation_guard FROM PUBLIC,authenticated,service_role;
GRANT USAGE ON SCHEMA public,auth,investigation_guard TO investigation_executor;
GRANT EXECUTE ON FUNCTION auth.uid(),investigation_guard.delta_id(uuid,uuid),investigation_guard.digest(bytea,text) TO investigation_executor;
GRANT SELECT ON investigation_guard.approvals TO investigation_executor;
GRANT SELECT,INSERT,UPDATE ON public.profiles,public.user_investigation_progress,public.applied_profile_deltas,public.user_collection TO investigation_executor;
-- RLS remains enabled; executor-only policies supply the narrow definer path.
CREATE POLICY guarded_progress ON public.user_investigation_progress TO investigation_executor USING(true) WITH CHECK(true);
CREATE POLICY guarded_delta ON public.applied_profile_deltas TO investigation_executor USING(true) WITH CHECK(true);
GRANT USAGE ON SCHEMA investigation_guard TO authenticated;
GRANT EXECUTE ON FUNCTION investigation_guard.complete(uuid) TO authenticated;
