#!/usr/bin/env bash
# Disposable p105b03 only, after run.sql. Each failed session rolls back its mutation.
set -euo pipefail
cd "$(dirname "$0")/../../.."
task_logs=$(mktemp -d)
trap 'rm -rf "$task_logs"' EXIT
control() {
  local label="$1" mutation="$2" expected="$3"
  if psql -X --set=ON_ERROR_STOP=1 \
      --command="BEGIN; $mutation" \
      --file=tests/sql/p1-05b-02-gate-acceptance.sql >"$task_logs/$label.log" 2>&1; then
    cat "$task_logs/$label.log"
    echo "FAIL: permissive mutation escaped detection: $label" >&2
    exit 1
  fi
  if ! grep -Fq "$expected" "$task_logs/$label.log"; then
    cat "$task_logs/$label.log"
    echo "FAIL: unrelated failure for $label" >&2
    exit 1
  fi
  echo "PASS negative control: $label rejected with $expected"
}
control auth-write 'GRANT UPDATE ON public.economic_protocol_candidates TO authenticated;' 'unexpected write/execute privilege'
control cross-owner 'CREATE POLICY unsafe_fixture_read ON public.economic_protocol_candidates FOR SELECT TO authenticated USING (true);' 'Alice can read Bob or has lost her own row'
control uid-overload 'CREATE FUNCTION public.get_economic_protocol_gate_v1(uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT public.get_economic_protocol_gate_v1() $$; GRANT EXECUTE ON FUNCTION public.get_economic_protocol_gate_v1(uuid) TO authenticated;' 'RPC accepted a destination UID'
