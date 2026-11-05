/** Test-injected email call observations only. No runtime enable flag or persistent state. */
export type EmailAuthOperation = "sign_in" | "sign_up";
export type EmailAuthObservationEvent = Readonly<{
  operation: EmailAuthOperation;
  attemptId: number;
  phase: "invoked" | "resolved" | "rejected";
  /** Presence of a session in this call's return value, never identity-reset completion. */
  returned_session?: boolean;
}>;
export type EmailAuthObserver = (event: EmailAuthObservationEvent) => void | Promise<void>;
interface Observation {
  operation: EmailAuthOperation;
  attemptId: number;
  observer: EmailAuthObserver;
  finished: boolean;
}
let sequence = 0;
export function selectTestEmailObserver(
  observer?: EmailAuthObserver,
): EmailAuthObserver | undefined {
  return import.meta.env.MODE === "test" &&
    import.meta.env.PROD === false &&
    typeof observer === "function"
    ? observer
    : undefined;
}
function publish(
  attempt: Observation,
  phase: EmailAuthObservationEvent["phase"],
  returnedSession?: boolean,
) {
  try {
    const event: EmailAuthObservationEvent = Object.freeze({
      operation: attempt.operation,
      attemptId: attempt.attemptId,
      phase,
      ...(returnedSession === undefined ? {} : { returned_session: returnedSession }),
    });
    // An async observer is also optional: never await it or let rejection reach app error handlers.
    const work = attempt.observer(event);
    if (work) void Promise.resolve(work).catch(() => {});
  } catch {
    /* An observer must never replace the auth result or exception. */
  }
}
export function beginEmailObservation(
  observer: EmailAuthObserver | undefined,
  operation: EmailAuthOperation,
): Observation | undefined {
  // Direct build constants remove the entire emitter path from normal production bundles.
  if (import.meta.env.MODE !== "test" || import.meta.env.PROD !== false || !observer)
    return undefined;
  const sink = observer;
  const attempt: Observation = {
    operation,
    attemptId: ++sequence,
    observer: sink,
    finished: false,
  };
  publish(attempt, "invoked");
  return attempt;
}
export function endEmailObservation(
  attempt: Observation | undefined,
  rejected: boolean,
  returnedSession: boolean,
): void {
  if (
    import.meta.env.MODE !== "test" ||
    import.meta.env.PROD !== false ||
    !attempt ||
    attempt.finished
  )
    return;
  attempt.finished = true;
  publish(attempt, rejected ? "rejected" : "resolved", returnedSession);
}
export function failEmailObservation(attempt: Observation | undefined): void {
  if (
    import.meta.env.MODE !== "test" ||
    import.meta.env.PROD !== false ||
    !attempt ||
    attempt.finished
  )
    return;
  attempt.finished = true;
  // A thrown call does not prove the server/SDK created no session: leave presence unknown.
  publish(attempt, "rejected");
}
