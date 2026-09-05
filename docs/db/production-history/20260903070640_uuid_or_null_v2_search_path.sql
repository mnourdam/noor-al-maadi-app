-- HISTORICAL RECORD — NOT DEPLOYABLE, DO NOT EXECUTE.
-- Production migration version: 20260903070640
-- md5(statement) = 9aab94c7461781d43d9c5d109fe03245  length = 353
-- Copied verbatim from supabase_migrations.schema_migrations on 2026-09-05.

CREATE OR REPLACE FUNCTION public._uuid_or_null_v2(p_text text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
 PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
           WHEN p_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             THEN p_text::uuid
           ELSE NULL
         END;
$function$;
