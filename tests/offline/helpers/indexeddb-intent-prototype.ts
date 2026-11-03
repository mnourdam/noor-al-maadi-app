/** Test-only IndexedDB contract. No production storage, profile, economy or fence authority. */
export const TEST_PREFIX = "irth-test-durable-intent-";
export const STORES = ["durableIntents", "syntheticEconomy", "appliedOperations"] as const;
export interface Session {
  owner: string;
  epoch: number;
  generation: number;
  instanceId: string;
}
export interface Command {
  kind: "increment";
  by: number;
}
export type IntentState = "pending" | "applied" | "rejected" | "cancelled" | "unresolved";
export interface Intent {
  schema: 1;
  owner: string;
  id: string;
  command: Command;
  fingerprint: string;
  admittedBy: Session;
  state: IntentState;
  disposition?: { reason: string; transactionId: string; by: Session };
}
export interface Economy {
  schema: 1;
  owner: string;
  value: number;
  revision: number;
}
export interface Applied {
  schema: 1;
  owner: string;
  id: string;
  fingerprint: string;
  revision: number;
  before: number;
  after: number;
  transactionId: string;
  by: Session;
}
export interface Outcome {
  state: IntentState;
  intent: Intent;
  applied?: Applied;
}
export type Checkpoint =
  | "intent_put_success"
  | "calculation"
  | "economy_put_success"
  | "applied_put_success"
  | "intent_applied_put_success"
  | "transaction_complete";
function fail(why: string): never {
  throw new Error(`intent-prototype:${why}`);
}
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const integer = (v: unknown): v is number => Number.isSafeInteger(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function session(v: Session): boolean {
  return (
    !!v &&
    /^user:.+/.test(v.owner) &&
    integer(v.epoch) &&
    v.epoch >= 0 &&
    integer(v.generation) &&
    v.generation > 0 &&
    text(v.instanceId)
  );
}
function command(v: Command): Command {
  if (
    !v ||
    v.kind !== "increment" ||
    !integer(v.by) ||
    !same(Object.keys(v).sort(), ["by", "kind"])
  )
    fail("invalid-command");
  return { kind: "increment", by: v.by };
}
function fingerprint(owner: string, id: string, cmd: Command) {
  return JSON.stringify([1, owner, id, command(cmd)]);
}
function validIntent(v: Intent, owner: string, id: string) {
  if (
    !v ||
    v.schema !== 1 ||
    v.owner !== owner ||
    v.id !== id ||
    !text(id) ||
    !session(v.admittedBy) ||
    v.admittedBy.owner !== owner ||
    !["pending", "applied", "rejected", "cancelled", "unresolved"].includes(v.state) ||
    v.fingerprint !== fingerprint(owner, id, v.command)
  )
    fail("corrupt-intent");
  if (
    v.state === "pending"
      ? v.disposition !== undefined
      : !v.disposition ||
        !text(v.disposition.reason) ||
        !text(v.disposition.transactionId) ||
        !session(v.disposition.by) ||
        v.disposition.by.owner !== owner
  )
    fail("corrupt-intent");
}
function validEconomy(v: Economy, owner: string) {
  if (
    !v ||
    v.schema !== 1 ||
    v.owner !== owner ||
    !integer(v.value) ||
    !integer(v.revision) ||
    v.revision < 0
  )
    fail("corrupt-or-missing-economy");
}
function validApplied(v: Applied, i: Intent, e: Economy) {
  if (
    !v ||
    v.schema !== 1 ||
    v.owner !== i.owner ||
    v.id !== i.id ||
    v.fingerprint !== i.fingerprint ||
    !integer(v.revision) ||
    v.revision < 1 ||
    v.revision > e.revision ||
    !integer(v.before) ||
    !integer(v.after) ||
    v.after !== v.before + i.command.by ||
    !text(v.transactionId) ||
    !session(v.by) ||
    v.by.owner !== i.owner ||
    i.state !== "applied" ||
    i.disposition?.transactionId !== v.transactionId ||
    !same(i.disposition.by, v.by) ||
    (v.revision === e.revision && v.after !== e.value)
  )
    fail("corrupt-applied");
}
function synchronous(run: () => unknown) {
  const result = run();
  if (result && typeof (result as PromiseLike<unknown>).then === "function") {
    void Promise.resolve(result).catch(() => {});
    fail("async-hook-forbidden");
  }
}
export async function openIntentPrototype(factory: IDBFactory, name: string) {
  if (!name.startsWith(TEST_PREFIX) || name.length <= TEST_PREFIX.length) fail("test-db-only");
  return new Promise<IDBDatabase>((resolve, reject) => {
    let abandoned = false;
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => {
      for (const store of STORES) request.result.createObjectStore(store);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      abandoned = true;
      reject(new Error("intent-prototype:open-blocked"));
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      if (abandoned) {
        db.close();
        return;
      }
      if (STORES.some((s) => !db.objectStoreNames.contains(s))) {
        db.close();
        reject(new Error("intent-prototype:invalid-schema"));
        return;
      }
      const tx = db.transaction([...STORES]);
      for (const s of STORES)
        if (tx.objectStore(s).keyPath !== null || tx.objectStore(s).autoIncrement) {
          db.close();
          reject(new Error("intent-prototype:invalid-schema"));
          return;
        }
      tx.oncomplete = () => resolve(db);
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}
export function createIntentPrototype(p: {
  db: IDBDatabase;
  session: Session;
  readSession(): Session;
  subscribe?(changed: () => void): () => void;
  checkpoint?(point: Checkpoint, transaction: IDBTransaction): unknown;
}) {
  const binding = structuredClone(p.session);
  if (!session(binding)) fail("invalid-session");
  const guard = () => {
    if (!same(p.readSession(), binding)) fail("identity-changed");
  };
  guard();
  const key = (id: string): IDBValidKey => {
    if (!text(id)) fail("invalid-id");
    return [binding.owner, id];
  };
  function run<T>(
    mode: IDBTransactionMode,
    work: (
      tx: IDBTransaction,
      finish: (value: T) => void,
      caught: (run: () => void) => void,
      put: (
        store: (typeof STORES)[number],
        value: unknown,
        key: IDBValidKey,
        at: Checkpoint,
      ) => void,
    ) => void,
  ): Promise<T> {
    guard();
    return new Promise<T>((resolve, reject) => {
      const tx = p.db.transaction([...STORES], mode);
      let result: T,
        finished = false,
        error: unknown;
      const abort = (cause: unknown) => {
        error ??= cause;
        try {
          tx.abort();
        } catch {
          /* commit cannot be undone */
        }
      };
      const caught = (f: () => void) => {
        try {
          guard();
          synchronous(f);
        } catch (cause) {
          abort(cause);
        }
      };
      const unsubscribe = p.subscribe?.(() => {
        try {
          guard();
        } catch (cause) {
          abort(cause);
        }
      });
      const checkpoint = (point: Checkpoint) => synchronous(() => p.checkpoint?.(point, tx));
      tx.onabort = () => {
        unsubscribe?.();
        reject(error ?? tx.error ?? new Error("intent-prototype:aborted"));
      };
      tx.onerror = () => {
        /* request failures abort by default; onabort is the result */
      };
      tx.oncomplete = () => {
        unsubscribe?.();
        try {
          checkpoint("transaction_complete");
          guard();
          if (!finished) fail("missing-result");
          resolve(structuredClone(result!));
        } catch (cause) {
          reject(cause);
        } // commit may have succeeded: caller must reconcile, not assume failure
      };
      const put = (
        store: (typeof STORES)[number],
        value: unknown,
        address: IDBValidKey,
        at: Checkpoint,
      ) => {
        guard();
        const req = tx.objectStore(store).put(value, address);
        req.onsuccess = () => caught(() => checkpoint(at)); // request success is NOT transaction completion
      };
      caught(() =>
        work(
          tx,
          (value) => {
            result = value;
            finished = true;
          },
          caught,
          put,
        ),
      );
    });
  }
  function load(
    tx: IDBTransaction,
    id: string,
    caught: (f: () => void) => void,
    receive: (i: Intent | undefined, e: Economy | undefined, a: Applied | undefined) => void,
  ) {
    const requests = [
      tx.objectStore(STORES[0]).get(key(id)),
      tx.objectStore(STORES[1]).get(binding.owner),
      tx.objectStore(STORES[2]).get(key(id)),
    ];
    let left = requests.length;
    for (const req of requests)
      req.onsuccess = () =>
        caught(() => {
          if (--left === 0) receive(requests[0].result, requests[1].result, requests[2].result);
        });
  }
  function checkRows(
    i: Intent | undefined,
    e: Economy | undefined,
    a: Applied | undefined,
    id: string,
  ): asserts i is Intent {
    if (!i) fail("missing-intent");
    validIntent(i, binding.owner, id);
    validEconomy(e!, binding.owner);
    if (i.state === "applied") validApplied(a!, i, e!);
    else if (a !== undefined) fail("inconsistent-applied-intent");
  }
  const transactionId = () => `${binding.instanceId}:${crypto.randomUUID()}`;
  return {
    async admit(id: string, supplied: Command): Promise<Intent> {
      const cmd = command(structuredClone(supplied)),
        fp = fingerprint(binding.owner, id, cmd);
      return run("readwrite", (tx, finish, caught, put) => {
        const req = tx.objectStore(STORES[0]).get(key(id));
        req.onsuccess = () =>
          caught(() => {
            const current: Intent | undefined = req.result;
            if (current !== undefined) {
              validIntent(current, binding.owner, id);
              if (current.fingerprint !== fp) fail("operation-conflict");
              finish(current);
              return;
            }
            // Absence of intent does not authorize overwriting an orphan applied key.
            const applied = tx.objectStore(STORES[2]).get(key(id));
            applied.onsuccess = () =>
              caught(() => {
                if (applied.result !== undefined) fail("orphan-applied");
                const intent: Intent = {
                  schema: 1,
                  owner: binding.owner,
                  id,
                  command: cmd,
                  fingerprint: fp,
                  admittedBy: binding,
                  state: "pending",
                };
                put(STORES[0], intent, key(id), "intent_put_success");
                finish(intent);
              });
          });
      });
    },
    async apply(id: string, expectedRevision?: number): Promise<Outcome> {
      if (expectedRevision !== undefined && (!integer(expectedRevision) || expectedRevision < 0))
        fail("invalid-revision");
      return run("readwrite", (tx, finish, caught, put) =>
        load(tx, id, caught, (i, e, a) => {
          checkRows(i, e, a, id);
          if (i.state !== "pending") {
            finish({ state: i.state, intent: i, applied: a });
            return;
          }
          const tid = transactionId();
          if (expectedRevision !== undefined && e!.revision !== expectedRevision) {
            const next: Intent = {
              ...i,
              state: "unresolved",
              disposition: { reason: "revision-conflict", transactionId: tid, by: binding },
            };
            put(STORES[0], next, key(id), "intent_put_success");
            finish({ state: next.state, intent: next });
            return;
          }
          synchronous(() => p.checkpoint?.("calculation", tx));
          guard();
          const after = e!.value + i.command.by;
          if (!integer(after) || !integer(e!.revision + 1)) fail("arithmetic-overflow");
          if (after === e!.value) {
            const next: Intent = {
              ...i,
              state: "cancelled",
              disposition: { reason: "no-effect", transactionId: tid, by: binding },
            };
            put(STORES[0], next, key(id), "intent_put_success");
            finish({ state: next.state, intent: next });
            return;
          }
          const applied: Applied = {
            schema: 1,
            owner: binding.owner,
            id,
            fingerprint: i.fingerprint,
            revision: e!.revision + 1,
            before: e!.value,
            after,
            transactionId: tid,
            by: binding,
          };
          const next: Intent = {
            ...i,
            state: "applied",
            disposition: { reason: "effect-committed", transactionId: tid, by: binding },
          };
          put(
            STORES[1],
            { ...e!, value: after, revision: applied.revision },
            binding.owner,
            "economy_put_success",
          );
          put(STORES[2], applied, key(id), "applied_put_success");
          put(STORES[0], next, key(id), "intent_applied_put_success");
          finish({ state: next.state, intent: next, applied });
        }),
      );
    },
    async disposition(
      id: string,
      state: "rejected" | "cancelled" | "unresolved",
      reason: string,
    ): Promise<Outcome> {
      if (!["rejected", "cancelled", "unresolved"].includes(state) || !text(reason))
        fail("invalid-disposition");
      return run("readwrite", (tx, finish, caught, put) =>
        load(tx, id, caught, (i, e, a) => {
          checkRows(i, e, a, id);
          if (i.state !== "pending") {
            if (i.state !== state || i.disposition?.reason !== reason) fail("terminal-conflict");
            finish({ state: i.state, intent: i });
            return;
          }
          const next: Intent = {
            ...i,
            state,
            disposition: { reason, transactionId: transactionId(), by: binding },
          };
          put(STORES[0], next, key(id), "intent_put_success");
          finish({ state, intent: next });
        }),
      );
    },
    async discover(): Promise<
      Array<{ id: string; state: IntentState; reason?: string; intent?: Intent }>
    > {
      return run("readonly", (tx, finish, caught) => {
        const store = tx.objectStore(STORES[0]),
          keys = store.getAllKeys(),
          values = store.getAll(),
          appliedKeys = tx.objectStore(STORES[2]).getAllKeys();
        let left = 3;
        const receive = () =>
          caught(() => {
            if (--left) return;
            const result: Array<{
              id: string;
              state: IntentState;
              reason?: string;
              intent?: Intent;
            }> = [];
            const addressed = new Set<string>();
            const ownedKey = (address: IDBValidKey): address is [string, string] => {
              if (
                !Array.isArray(address) ||
                address.length !== 2 ||
                !text(address[0]) ||
                !text(address[1])
              )
                fail("corrupt-storage-key");
              return address[0] === binding.owner;
            };
            keys.result.forEach((address, index) => {
              if (!ownedKey(address)) return;
              addressed.add(address[1]);
              const id = address[1] as string,
                i = values.result[index] as Intent;
              try {
                validIntent(i, binding.owner, id);
              } catch {
                result.push({ id, state: "unresolved", reason: "corrupt-intent-preserved" });
                return;
              }
              load(tx, id, caught, (intent, economy, applied) => {
                try {
                  checkRows(intent, economy, applied, id);
                  result.push({ id, state: intent.state, intent });
                } catch {
                  result.push({
                    id,
                    state: "unresolved",
                    reason: "inconsistent-records-preserved",
                  });
                }
              });
            });
            for (const address of appliedKeys.result) {
              if (ownedKey(address) && !addressed.has(address[1]))
                result.push({
                  id: address[1],
                  state: "unresolved",
                  reason: "orphan-applied-preserved",
                });
            }
            finish(result); // populated by enqueued reads BEFORE transaction.oncomplete
          });
        keys.onsuccess = receive;
        values.onsuccess = receive;
        appliedKeys.onsuccess = receive;
      });
    },
  };
}
