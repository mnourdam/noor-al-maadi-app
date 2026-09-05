-- HISTORICAL RECORD — NOT DEPLOYABLE, DO NOT EXECUTE.
-- Production migration version: 20260903081052
-- md5(statement) = b99f2e2e21d6ab9036fcac1ef221883d  length = 53
-- Copied verbatim from supabase_migrations.schema_migrations on 2026-09-05.
-- This is the CURRENT production state for public.profiles. It supersedes the
-- repository file supabase/migrations/20260627035645_*.sql
-- (ALTER TABLE public.profiles REPLICA IDENTITY FULL).

ALTER TABLE public.profiles REPLICA IDENTITY DEFAULT;
