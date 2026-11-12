-- DISPOSABLE ENGINE PROTOTYPE ONLY. Never a production migration.
-- request.jwt.claim.sub below is a forgeable SQL fixture, NOT JWT verification.
DO $$ BEGIN
  IF current_database() <> 'v18_authority_fixture' OR to_regclass('fixture_boundary.marker') IS NULL THEN
    RAISE EXCEPTION 'prototype:wrong-disposable-database';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM fixture_boundary.marker WHERE marker = 'v18-authority-disposable-fixture-only-v1') THEN
    RAISE EXCEPTION 'prototype:missing-fixture-marker';
  END IF;
END $$;
CREATE ROLE v18_proto_issuer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE v18_proto_executor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE v18_proto_authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE v18_proto_anon NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE v18_proto_service NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
CREATE SCHEMA v18_proto_private AUTHORIZATION v18_proto_issuer;
CREATE SCHEMA v18_proto_api AUTHORIZATION v18_proto_executor;
REVOKE ALL ON SCHEMA v18_proto_private, v18_proto_api FROM PUBLIC;
GRANT USAGE ON SCHEMA v18_proto_private TO v18_proto_executor;
GRANT USAGE ON SCHEMA v18_proto_api TO v18_proto_authenticated;
CREATE EXTENSION pgcrypto WITH SCHEMA v18_proto_private;

CREATE TABLE v18_proto_private.catalog (
  term text PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('genesis','reward','purchase')),
  xp_delta bigint NOT NULL, dinars_delta bigint NOT NULL
);
ALTER TABLE v18_proto_private.catalog OWNER TO v18_proto_issuer;
-- Explicit test-issued terms, not inferred production balances or real prices.
INSERT INTO v18_proto_private.catalog VALUES
  ('genesis-v1','genesis',100,50), ('reward-v1','reward',10,3), ('purchase-v1','purchase',0,-7);
CREATE TABLE v18_proto_private.sources (
  source_id uuid PRIMARY KEY, owner uuid NOT NULL,
  issuer text NOT NULL DEFAULT 'synthetic-issuer-v1' CHECK(issuer='synthetic-issuer-v1'),
  purpose text NOT NULL CHECK(purpose IN ('genesis','facts')), sealed boolean NOT NULL DEFAULT false
);
CREATE TABLE v18_proto_private.facts (
  fact_id uuid PRIMARY KEY, source_id uuid NOT NULL REFERENCES v18_proto_private.sources,
  owner uuid NOT NULL, issuer text NOT NULL, seq bigint NOT NULL CHECK(seq>0),
  subject text NOT NULL CHECK(length(subject)>0), term text NOT NULL, kind text NOT NULL,
  xp_delta bigint NOT NULL, dinars_delta bigint NOT NULL,
  previous_hash text NOT NULL, event_hash text NOT NULL,
  UNIQUE(source_id,seq), UNIQUE(owner,issuer,kind,subject,term)
);
CREATE TABLE v18_proto_private.seals (
  seal_id uuid PRIMARY KEY, source_id uuid NOT NULL UNIQUE REFERENCES v18_proto_private.sources,
  owner uuid NOT NULL, issuer text NOT NULL, entry_count bigint NOT NULL CHECK(entry_count>0),
  through_seq bigint NOT NULL CHECK(through_seq>0), root_hash text NOT NULL,
  protocol integer NOT NULL DEFAULT 1 CHECK(protocol=1)
);
ALTER TABLE v18_proto_private.sources OWNER TO v18_proto_issuer;
ALTER TABLE v18_proto_private.facts OWNER TO v18_proto_issuer;
ALTER TABLE v18_proto_private.seals OWNER TO v18_proto_issuer;
CREATE TABLE v18_proto_private.accounts (
  owner uuid PRIMARY KEY, issuer text NOT NULL, baseline_seal uuid NOT NULL,
  baseline_source uuid NOT NULL, revision bigint NOT NULL CHECK(revision>=0),
  xp bigint NOT NULL CHECK(xp>=0), dinars bigint NOT NULL CHECK(dinars>=0),
  bootstrap_receipt jsonb NOT NULL
);
CREATE TABLE v18_proto_private.operations (
  owner uuid NOT NULL REFERENCES v18_proto_private.accounts, request_id uuid NOT NULL,
  fact_id uuid NOT NULL, expected_revision bigint NOT NULL CHECK(expected_revision>=0),
  protocol integer NOT NULL CHECK(protocol=1), issuer text NOT NULL,
  kind text NOT NULL, subject text NOT NULL, term text NOT NULL, receipt jsonb NOT NULL,
  PRIMARY KEY(owner,request_id)
);
CREATE TABLE v18_proto_private.consumption (
  owner uuid NOT NULL REFERENCES v18_proto_private.accounts, issuer text NOT NULL,
  kind text NOT NULL, subject text NOT NULL, term text NOT NULL, fact_id uuid NOT NULL,
  baseline_seal uuid, request_id uuid,
  CHECK ((baseline_seal IS NOT NULL) <> (request_id IS NOT NULL)),
  PRIMARY KEY(owner,issuer,kind,subject,term)
);
ALTER TABLE v18_proto_private.accounts OWNER TO v18_proto_executor;
ALTER TABLE v18_proto_private.operations OWNER TO v18_proto_executor;
ALTER TABLE v18_proto_private.consumption OWNER TO v18_proto_executor;

CREATE FUNCTION v18_proto_private.immutable_row() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog AS $$ BEGIN
  RAISE EXCEPTION 'prototype:immutable-row';
END $$;
ALTER FUNCTION v18_proto_private.immutable_row() OWNER TO v18_proto_issuer;
CREATE TRIGGER immutable_catalog BEFORE UPDATE OR DELETE ON v18_proto_private.catalog
FOR EACH ROW EXECUTE FUNCTION v18_proto_private.immutable_row();
CREATE TRIGGER immutable_seals BEFORE UPDATE OR DELETE ON v18_proto_private.seals
FOR EACH ROW EXECUTE FUNCTION v18_proto_private.immutable_row();
CREATE TRIGGER immutable_operations BEFORE UPDATE OR DELETE ON v18_proto_private.operations
FOR EACH ROW EXECUTE FUNCTION v18_proto_private.immutable_row();
CREATE TRIGGER immutable_consumption BEFORE UPDATE OR DELETE ON v18_proto_private.consumption
FOR EACH ROW EXECUTE FUNCTION v18_proto_private.immutable_row();

CREATE FUNCTION v18_proto_private.source_write_guard() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog AS $$ BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(OLD.source_id::text,1818));
  IF TG_OP='DELETE' OR OLD.sealed OR NEW.source_id IS DISTINCT FROM OLD.source_id
     OR NEW.owner IS DISTINCT FROM OLD.owner OR NEW.issuer IS DISTINCT FROM OLD.issuer
     OR NEW.purpose IS DISTINCT FROM OLD.purpose OR NEW.sealed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'prototype:immutable-source';
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION v18_proto_private.source_write_guard() OWNER TO v18_proto_issuer;
CREATE TRIGGER guard_source BEFORE UPDATE OR DELETE ON v18_proto_private.sources
FOR EACH ROW EXECUTE FUNCTION v18_proto_private.source_write_guard();
CREATE FUNCTION v18_proto_private.fact_write_guard() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog AS $$
DECLARE is_sealed boolean;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'prototype:immutable-fact'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.source_id::text,1818));
  SELECT sealed INTO is_sealed FROM v18_proto_private.sources WHERE source_id=NEW.source_id;
  IF is_sealed IS DISTINCT FROM false THEN RAISE EXCEPTION 'prototype:source-closed'; END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION v18_proto_private.fact_write_guard() OWNER TO v18_proto_issuer;
CREATE TRIGGER guard_fact BEFORE INSERT OR UPDATE OR DELETE ON v18_proto_private.facts
FOR EACH ROW EXECUTE FUNCTION v18_proto_private.fact_write_guard();
CREATE FUNCTION v18_proto_private.fact_digest(f v18_proto_private.facts) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT encode(v18_proto_private.digest(convert_to(jsonb_build_array(
  1,f.owner::text,f.issuer,f.source_id::text,f.seq,f.fact_id::text,
  f.kind,f.subject,f.term,f.xp_delta,f.dinars_delta,f.previous_hash)::text,'UTF8'),'sha256'),'hex');
$$;
ALTER FUNCTION v18_proto_private.fact_digest(v18_proto_private.facts) OWNER TO v18_proto_issuer;

-- Admin-only issuance helpers. No application role may call these.
CREATE FUNCTION v18_proto_private.seed_source(p_owner uuid,p_source uuid,p_purpose text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 INSERT INTO v18_proto_private.sources(source_id,owner,purpose) VALUES(p_source,p_owner,p_purpose);
$$;
ALTER FUNCTION v18_proto_private.seed_source(uuid,uuid,text) OWNER TO v18_proto_issuer;
CREATE FUNCTION v18_proto_private.seed_fact(p_source uuid,p_fact uuid,p_subject text,p_term text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s v18_proto_private.sources; c v18_proto_private.catalog; f v18_proto_private.facts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_source::text,1818));
  SELECT * INTO s FROM v18_proto_private.sources WHERE source_id=p_source;
  IF NOT FOUND OR s.sealed THEN RAISE EXCEPTION 'prototype:source-closed'; END IF;
  SELECT * INTO c FROM v18_proto_private.catalog WHERE term=p_term;
  IF NOT FOUND THEN RAISE EXCEPTION 'prototype:unknown-terms'; END IF;
  SELECT COALESCE(max(seq),0)+1 INTO f.seq FROM v18_proto_private.facts WHERE source_id=p_source;
  SELECT event_hash INTO f.previous_hash FROM v18_proto_private.facts WHERE source_id=p_source ORDER BY seq DESC LIMIT 1;
  f.previous_hash:=COALESCE(f.previous_hash,repeat('0',64));
  f.fact_id:=p_fact; f.source_id:=p_source; f.owner:=s.owner; f.issuer:=s.issuer;
  f.subject:=p_subject; f.term:=c.term; f.kind:=c.kind; f.xp_delta:=c.xp_delta; f.dinars_delta:=c.dinars_delta;
  f.event_hash:=v18_proto_private.fact_digest(f);
  INSERT INTO v18_proto_private.facts SELECT (f).*;
END $$;
ALTER FUNCTION v18_proto_private.seed_fact(uuid,uuid,text,text) OWNER TO v18_proto_issuer;
CREATE FUNCTION v18_proto_private.seal_source(p_source uuid,p_seal uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s v18_proto_private.sources; n bigint; last_seq bigint; root text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_source::text,1818));
  SELECT * INTO s FROM v18_proto_private.sources WHERE source_id=p_source;
  IF NOT FOUND OR s.sealed THEN RAISE EXCEPTION 'prototype:source-closed'; END IF;
  SELECT count(*),max(seq) INTO n,last_seq FROM v18_proto_private.facts WHERE source_id=p_source;
  IF n=0 THEN RAISE EXCEPTION 'prototype:empty-source'; END IF;
  SELECT event_hash INTO root FROM v18_proto_private.facts WHERE source_id=p_source ORDER BY seq DESC LIMIT 1;
  INSERT INTO v18_proto_private.seals VALUES(p_seal,p_source,s.owner,s.issuer,n,last_seq,root,1);
  UPDATE v18_proto_private.sources SET sealed=true WHERE source_id=p_source;
END $$;
ALTER FUNCTION v18_proto_private.seal_source(uuid,uuid) OWNER TO v18_proto_issuer;

CREATE FUNCTION v18_proto_private.verify_source(p_seal uuid,p_genesis boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE z v18_proto_private.seals; s v18_proto_private.sources; f v18_proto_private.facts;
 c v18_proto_private.catalog; n bigint:=0; prior text:=repeat('0',64);
 x numeric:=0; d numeric:=0; genesis_count integer:=0; max_i constant numeric:=9223372036854775807;
BEGIN
  SELECT * INTO z FROM v18_proto_private.seals WHERE seal_id=p_seal;
  IF NOT FOUND THEN RAISE EXCEPTION 'prototype:unknown-seal'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(z.source_id::text,1818));
  SELECT * INTO s FROM v18_proto_private.sources WHERE source_id=z.source_id;
  IF NOT FOUND OR NOT s.sealed OR z.owner<>s.owner OR z.issuer<>s.issuer OR z.protocol<>1
     OR (p_genesis AND s.purpose<>'genesis') THEN RAISE EXCEPTION 'prototype:invalid-seal'; END IF;
  FOR f IN SELECT * FROM v18_proto_private.facts WHERE source_id=s.source_id ORDER BY seq LOOP
    n:=n+1;
    SELECT * INTO c FROM v18_proto_private.catalog WHERE term=f.term;
    IF NOT FOUND THEN RAISE EXCEPTION 'prototype:unknown-terms'; END IF;
    IF f.owner<>s.owner OR f.issuer<>s.issuer OR f.seq<>n OR f.previous_hash<>prior
       OR f.event_hash<>v18_proto_private.fact_digest(f) OR f.kind<>c.kind
       OR f.xp_delta<>c.xp_delta OR f.dinars_delta<>c.dinars_delta THEN
      RAISE EXCEPTION 'prototype:invalid-journal';
    END IF;
    IF f.kind='genesis' THEN
      genesis_count:=genesis_count+1;
      IF s.purpose<>'genesis' OR n<>1 THEN RAISE EXCEPTION 'prototype:invalid-genesis'; END IF;
    END IF;
    x:=x+f.xp_delta::numeric; d:=d+f.dinars_delta::numeric;
    IF abs(x)>max_i OR abs(d)>max_i OR (s.purpose='genesis' AND (x<0 OR d<0)) THEN
      RAISE EXCEPTION 'prototype:invalid-prefix-balance';
    END IF;
    prior:=f.event_hash;
  END LOOP;
  IF n<>z.entry_count OR n<>z.through_seq OR prior<>z.root_hash OR n=0 THEN
    RAISE EXCEPTION 'prototype:incomplete-journal';
  END IF;
  IF s.purpose='genesis' AND genesis_count<>1 THEN RAISE EXCEPTION 'prototype:invalid-genesis'; END IF;
  RETURN jsonb_build_object('owner',s.owner,'issuer',s.issuer,'source',s.source_id,'xp',x,'dinars',d,'count',n);
END $$;
ALTER FUNCTION v18_proto_private.verify_source(uuid,boolean) OWNER TO v18_proto_issuer;

CREATE FUNCTION v18_proto_private.fixture_subject() RETURNS uuid LANGUAGE plpgsql
SET search_path=pg_catalog AS $$
DECLARE subject text:=current_setting('request.jwt.claim.sub',true);
BEGIN
 IF subject IS NULL OR subject='' THEN RAISE EXCEPTION 'prototype:unauthenticated'; END IF;
 RETURN subject::uuid;
END $$;
ALTER FUNCTION v18_proto_private.fixture_subject() OWNER TO v18_proto_executor;
CREATE FUNCTION v18_proto_api.bootstrap(p_seal uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=v18_proto_private.fixture_subject(); v jsonb; a v18_proto_private.accounts; result jsonb; inserted integer; evidence_owner uuid;
BEGIN
  SELECT owner INTO evidence_owner FROM v18_proto_private.seals WHERE seal_id=p_seal;
  IF NOT FOUND THEN RAISE EXCEPTION 'prototype:unknown-seal'; END IF;
  IF evidence_owner<>u THEN RAISE EXCEPTION 'prototype:foreign-evidence'; END IF;
  v:=v18_proto_private.verify_source(p_seal,true);
  IF (v->>'owner')::uuid<>u THEN RAISE EXCEPTION 'prototype:foreign-evidence'; END IF;
  result:=jsonb_build_object('protocol',1,'operation','bootstrap','owner',u,'seal_id',p_seal,
    'revision','0','xp',v->>'xp','dinars',v->>'dinars','included_count',v->>'count');
  INSERT INTO v18_proto_private.accounts VALUES(u,v->>'issuer',p_seal,(v->>'source')::uuid,0,
    (v->>'xp')::bigint,(v->>'dinars')::bigint,result) ON CONFLICT(owner) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  SELECT * INTO a FROM v18_proto_private.accounts WHERE owner=u FOR UPDATE;
  IF a.baseline_seal<>p_seal THEN RAISE EXCEPTION 'prototype:baseline-conflict'; END IF;
  -- Existing exact replay returns its ORIGINAL bootstrap result, not current balances.
  IF inserted=0 THEN
    IF a.baseline_source<>(v->>'source')::uuid OR a.issuer<>(v->>'issuer') OR
      (SELECT count(*) FROM v18_proto_private.consumption WHERE owner=u AND baseline_seal=p_seal)<>(v->>'count')::bigint OR
      EXISTS(SELECT 1 FROM v18_proto_private.facts f WHERE f.source_id=a.baseline_source AND NOT EXISTS(
        SELECT 1 FROM v18_proto_private.consumption c WHERE c.owner=u AND c.issuer=f.issuer
        AND c.kind=f.kind AND c.subject=f.subject AND c.term=f.term AND c.fact_id=f.fact_id AND c.baseline_seal=p_seal)) THEN
      RAISE EXCEPTION 'prototype:inconsistent-baseline-inclusion';
    END IF;
    RETURN a.bootstrap_receipt;
  END IF;
  INSERT INTO v18_proto_private.consumption(owner,issuer,kind,subject,term,fact_id,baseline_seal)
    SELECT owner,issuer,kind,subject,term,fact_id,p_seal FROM v18_proto_private.facts WHERE source_id=a.baseline_source;
  RETURN a.bootstrap_receipt;
END $$;
ALTER FUNCTION v18_proto_api.bootstrap(uuid) OWNER TO v18_proto_executor;
CREATE FUNCTION v18_proto_api.apply_fact(p_fact uuid,p_request uuid,p_expected_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=v18_proto_private.fixture_subject(); f v18_proto_private.facts; z uuid;
 a v18_proto_private.accounts; prior v18_proto_private.operations; x numeric; d numeric; result jsonb;
 max_i constant numeric:=9223372036854775807;
BEGIN
  IF p_request IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 THEN RAISE EXCEPTION 'prototype:invalid-request'; END IF;
  SELECT * INTO f FROM v18_proto_private.facts WHERE fact_id=p_fact;
  IF NOT FOUND THEN RAISE EXCEPTION 'prototype:unknown-fact'; END IF;
  IF f.owner<>u THEN RAISE EXCEPTION 'prototype:foreign-evidence'; END IF;
  SELECT seal_id INTO z FROM v18_proto_private.seals WHERE source_id=f.source_id;
  PERFORM v18_proto_private.verify_source(z,false);
  IF f.kind='genesis' THEN RAISE EXCEPTION 'prototype:genesis-not-operation'; END IF;
  IF NOT EXISTS(SELECT 1 FROM v18_proto_private.sources WHERE source_id=f.source_id AND purpose='facts') THEN
    RAISE EXCEPTION 'prototype:source-not-operation';
  END IF;
  SELECT * INTO a FROM v18_proto_private.accounts WHERE owner=u FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'prototype:not-admitted'; END IF;
  SELECT * INTO prior FROM v18_proto_private.operations WHERE owner=u AND request_id=p_request;
  IF FOUND THEN
    IF prior.fact_id<>p_fact OR prior.expected_revision<>p_expected_revision OR prior.protocol<>1
       OR prior.issuer<>f.issuer OR prior.kind<>f.kind OR prior.subject<>f.subject OR prior.term<>f.term THEN
      RAISE EXCEPTION 'prototype:request-conflict';
    END IF;
    RETURN prior.receipt;
  END IF;
  IF a.issuer<>f.issuer THEN RAISE EXCEPTION 'prototype:issuer-conflict'; END IF;
  IF EXISTS(SELECT 1 FROM v18_proto_private.consumption WHERE owner=u AND issuer=f.issuer
    AND kind=f.kind AND subject=f.subject AND term=f.term) THEN RAISE EXCEPTION 'prototype:entitlement-consumed'; END IF;
  IF a.revision<>p_expected_revision THEN RAISE EXCEPTION 'prototype:stale-revision'; END IF;
  x:=a.xp::numeric+f.xp_delta::numeric; d:=a.dinars::numeric+f.dinars_delta::numeric;
  IF x<0 OR d<0 OR x>max_i OR d>max_i OR a.revision=max_i THEN RAISE EXCEPTION 'prototype:invalid-result-balance'; END IF;
  result:=jsonb_build_object('protocol',1,'operation','apply_fact','owner',u,'request_id',p_request,
    'fact_id',p_fact,'issuer',f.issuer,'subject',f.subject,'term',f.term,'expected_revision',p_expected_revision::text,
    'revision',(a.revision+1)::text,'xp',x::text,'dinars',d::text);
  UPDATE v18_proto_private.accounts SET xp=x::bigint,dinars=d::bigint,revision=revision+1 WHERE owner=u;
  INSERT INTO v18_proto_private.operations VALUES(u,p_request,p_fact,p_expected_revision,1,f.issuer,f.kind,f.subject,f.term,result);
  INSERT INTO v18_proto_private.consumption(owner,issuer,kind,subject,term,fact_id,request_id)
    VALUES(u,f.issuer,f.kind,f.subject,f.term,p_fact,p_request);
  RETURN result;
END $$;
ALTER FUNCTION v18_proto_api.apply_fact(uuid,uuid,bigint) OWNER TO v18_proto_executor;

-- Explicit ACLs; service BYPASSRLS cannot bypass denied table/schema privileges.
REVOKE ALL ON ALL TABLES IN SCHEMA v18_proto_private FROM PUBLIC,v18_proto_authenticated,v18_proto_anon,v18_proto_service;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA v18_proto_private,v18_proto_api FROM PUBLIC,v18_proto_authenticated,v18_proto_anon,v18_proto_service;
GRANT SELECT ON v18_proto_private.sources,v18_proto_private.facts,v18_proto_private.seals,v18_proto_private.catalog TO v18_proto_executor;
GRANT EXECUTE ON FUNCTION v18_proto_private.verify_source(uuid,boolean) TO v18_proto_executor;
GRANT EXECUTE ON FUNCTION v18_proto_private.digest(bytea,text) TO v18_proto_issuer;
GRANT EXECUTE ON FUNCTION v18_proto_api.bootstrap(uuid),v18_proto_api.apply_fact(uuid,uuid,bigint) TO v18_proto_authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE v18_proto_issuer REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE v18_proto_executor REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- No protected source write path is granted to executor or any application role.
