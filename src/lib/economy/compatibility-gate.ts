/** Inert protocol observation. This module cannot enable economic authority. */
import { supabase } from "@/integrations/supabase/client";
import { accountOperation } from "@/lib/account-operation";
import { isAuthReady } from "@/lib/identity/guard";

export const PROTOCOL_GATE_RPC = "get_economic_protocol_gate_v1";
export const PROTOCOL_GATE_TIMEOUT_MS = 3000;
const READINESS_POLL_MS = 25;

export interface ProtocolGateObservation {
  readonly protocolState: "legacy" | "unresolved";
  readonly economicAuthorityEnabled: false;
  readonly diagnosticState: "not_read" | "absent" | "candidate" | "incomplete" | "unavailable";
  readonly readState: "disabled" | "resolved" | "unresolved";
  readonly reason?: "timeout" | "rpc_error" | "invalid_response" | "session_mismatch";
}

export const DISABLED_PROTOCOL_GATE: ProtocolGateObservation = Object.freeze({
  protocolState: "legacy",
  economicAuthorityEnabled: false,
  diagnosticState: "not_read",
  readState: "disabled",
});

function unresolved(reason: ProtocolGateObservation["reason"]): ProtocolGateObservation {
  return Object.freeze({
    protocolState: "unresolved",
    economicAuthorityEnabled: false,
    diagnosticState: "unavailable",
    readState: "unresolved",
    reason,
  });
}

/** Construct a local whitelist DTO, never return/spread the server object. */
export function parseProtocolGate(data: unknown): ProtocolGateObservation {
  if (!data || typeof data !== "object" || Array.isArray(data))
    return unresolved("invalid_response");
  const row = data as Record<string, unknown>;
  const diagnostic = row.diagnostic_state;
  const expected = diagnostic === "incomplete" ? "unresolved" : "legacy";
  if (
    row.schema_version !== 1 ||
    row.economic_authority_enabled !== false ||
    !["absent", "candidate", "incomplete"].includes(String(diagnostic)) ||
    row.protocol_state !== expected
  )
    return unresolved("invalid_response");
  return Object.freeze({
    protocolState: expected,
    economicAuthorityEnabled: false,
    diagnosticState: diagnostic as "absent" | "candidate" | "incomplete",
    readState: "resolved",
  });
}

/**
 * Explicit diagnostic read only. AccountProvider never calls this in production.
 * Local UID fences the request; it is never sent as an RPC argument.
 * Deadline stops local follow-ups, not an already-started server read.
 */
export function readProtocolGate(
  userId: string,
  alive: () => boolean,
): Promise<ProtocolGateObservation | undefined> {
  let finished = false;
  const request = accountOperation(userId, () => !finished && alive());
  if (!userId || !request.current()) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    let poll: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout>;
    const finish = (value: ProtocolGateObservation | undefined) => {
      if (finished) return;
      finished = true;
      clearTimeout(poll);
      clearTimeout(deadline);
      resolve(value);
    };
    deadline = setTimeout(() => {
      finish(request.current() ? unresolved("timeout") : undefined);
    }, PROTOCOL_GATE_TIMEOUT_MS);
    const read = async () => {
      if (!request.current()) {
        finish(undefined);
        return;
      }
      // A bounded, cancellable poll avoids retaining an unbounded auth-ready
      // promise/listener after timeout or an identity switch.
      try {
        if (!isAuthReady()) {
          poll = setTimeout(() => {
            void read();
          }, READINESS_POLL_MS);
          return;
        }
        const session = await supabase.auth.getSession();
        if (!request.current()) {
          finish(undefined);
          return;
        }
        if (session.error || session.data.session?.user.id !== userId) {
          finish(unresolved("session_mismatch"));
          return;
        }
        // No generated DB type is claimed for an unapplied SQL proposal.
        const client = supabase as unknown as {
          rpc(name: string): PromiseLike<{ data: unknown; error: unknown }>;
        };
        const result = await client.rpc(PROTOCOL_GATE_RPC);
        if (!request.current()) {
          finish(undefined);
          return;
        }
        finish(result.error ? unresolved("rpc_error") : parseProtocolGate(result.data));
      } catch {
        finish(request.current() ? unresolved("rpc_error") : undefined);
      }
    };
    void read();
  });
}
