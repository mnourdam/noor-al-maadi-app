CREATE OR REPLACE FUNCTION public.admin_system_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '5s'
AS $function$
DECLARE
  v_started timestamptz := clock_timestamp();
  v_connections int;
  v_max_connections int;
  v_waiting int;
  v_waiting_lock int;
  v_idle_clients int;
  v_longest_query numeric;
  v_db_size bigint;
  v_deadlocks bigint;
  v_xact_rollback bigint;
  v_xact_commit bigint;
  v_stats_reset timestamptz;
  v_ss_available boolean := false;
  v_slow jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_user_manager() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- waiting_backends: only genuinely ACTIVE client-backend queries waiting on a
  -- resource. Idle clients parked on ClientRead, PostgreSQL background workers,
  -- walsender (Realtime replication), pg_cron and pg_net are excluded.
  -- longest_active_query_seconds: same client-backend + active filter, so the
  -- permanent Realtime replication stream can never appear as a user query.
  SELECT count(*)::int,
         count(*) FILTER (WHERE a.state = 'active'
                            AND a.backend_type = 'client backend'
                            AND a.wait_event IS NOT NULL)::int,
         count(*) FILTER (WHERE a.wait_event_type = 'Lock')::int,
         count(*) FILTER (WHERE a.backend_type = 'client backend'
                            AND a.state = 'idle')::int,
         COALESCE(max(EXTRACT(EPOCH FROM (now() - a.query_start)))
                  FILTER (WHERE a.state = 'active'
                            AND a.backend_type = 'client backend'
                            AND a.pid <> pg_backend_pid()), 0)::numeric
    INTO v_connections, v_waiting, v_waiting_lock, v_idle_clients, v_longest_query
    FROM pg_stat_activity a
   WHERE a.datname = current_database();

  SELECT s.setting::int INTO v_max_connections
    FROM pg_settings s WHERE s.name = 'max_connections';

  SELECT pg_database_size(current_database()) INTO v_db_size;

  SELECT d.deadlocks, d.xact_rollback, d.xact_commit, d.stats_reset
    INTO v_deadlocks, v_xact_rollback, v_xact_commit, v_stats_reset
    FROM pg_stat_database d
   WHERE d.datname = current_database();

  BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') THEN
      EXECUTE $q$
        SELECT COALESCE(jsonb_agg(t ORDER BY t.mean_ms DESC), '[]'::jsonb)
          FROM (
            SELECT round(mean_exec_time::numeric, 2) AS mean_ms,
                   calls,
                   left(regexp_replace(query, '\s+', ' ', 'g'), 140) AS query
              FROM pg_stat_statements
             WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
             ORDER BY mean_exec_time DESC
             LIMIT 5
          ) t
      $q$ INTO v_slow;
      v_ss_available := true;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_ss_available := false;
    v_slow := '[]'::jsonb;
  END;

  RETURN jsonb_build_object(
    'connections', v_connections,
    'max_connections', v_max_connections,
    'waiting_backends', v_waiting,
    'lock_waiting_backends', v_waiting_lock,
    'idle_clients', v_idle_clients,
    'longest_active_query_seconds', round(COALESCE(v_longest_query, 0), 2),
    'db_size_bytes', v_db_size,
    'deadlocks', v_deadlocks,
    'xact_rollback', v_xact_rollback,
    'xact_commit', v_xact_commit,
    'stats_reset_at', v_stats_reset,
    'pg_stat_statements_available', v_ss_available,
    'slowest_queries', v_slow,
    'snapshot_ms', round((EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::numeric, 1),
    'server_time', now()
  );
END;
$function$;