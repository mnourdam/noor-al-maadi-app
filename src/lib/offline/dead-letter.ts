// Durable, per-revision archive. The V17 array remains readable until each
// snapshot has been copied to its own key and its write has been confirmed.
import { remove, type OutboxItem } from "./outbox";
import { getActiveOwner, getIdentityEpoch } from "../identity/owner";
import { logicalKeyOf, ownerOfPhysicalKey, physicalKey } from "../identity/partition";

const LS_KEY = "irth.outbox.dead-letter.v1";
const ENTRY_PREFIX = `${LS_KEY}:entry:`;
const MAX_ENTRIES = 500;

export interface DeadLetter {
  id: string;
  userId: string;
  kind: string;
  payload: Record<string, unknown>;
  reason: string;
  createdAt: number;
  originalCreatedAt: number;
  attempts: number;
  revision?: string;
}

interface ArchiveEntry { version: 1; letter: DeadLetter; source?: OutboxItem }
export interface ArchiveReceipt { key: string; letter: DeadLetter }

export class DeadLetterStorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DeadLetterStorageError";
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).filter((key) => object[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function validateLetter(value: unknown): asserts value is DeadLetter {
  const row = value as DeadLetter | null;
  if (!row || typeof row !== "object" || typeof row.id !== "string" ||
    typeof row.userId !== "string" || typeof row.kind !== "string" ||
    typeof row.reason !== "string" || !Number.isFinite(row.createdAt) ||
    !Number.isFinite(row.originalCreatedAt) || !Number.isFinite(row.attempts) ||
    !row.payload || typeof row.payload !== "object" || Array.isArray(row.payload) ||
    (row.revision !== undefined && typeof row.revision !== "string")) {
    throw new DeadLetterStorageError("invalid-dead-letter-data");
  }
}

function letterFor(source: OutboxItem, reason: string, createdAt: number): DeadLetter {
  return {
    id: source.id, userId: source.userId, kind: source.kind, payload: source.payload,
    reason, createdAt, originalCreatedAt: source.createdAt, attempts: source.attempts,
    ...(source.revision === undefined ? {} : { revision: source.revision }),
  };
}

function keyFor(entry: ArchiveEntry): string {
  // The complete snapshot avoids hash collisions and keeps account/revision
  // identities distinct. Larger keys are subject to the same explicit quota errors.
  const identity = entry.source ? { source: entry.source, reason: entry.letter.reason } : entry.letter;
  return `${ENTRY_PREFIX}${entry.source ? "item:" : "legacy:"}${encodeURIComponent(canonical(identity))}`;
}

function storage(): Storage {
  if (typeof localStorage === "undefined") throw new DeadLetterStorageError("no-local-storage");
  return localStorage;
}

interface ArchiveScope {
  store: Storage;
  owner: string | null;
  userId?: string;
  key(logical: string): string;
  assertCurrent(): void;
}

/** Freeze the namespace before waiting for a lock; never follow a new owner.
 * The partition exposes its original getter for existing diagnostic adapters.
 * Read that marker only: no prototype or global partition changes here.
 * Unpartitioned runtimes retain the original V17 shared-archive behavior.
 */
function captureScope(userId?: string): ArchiveScope {
  const store = storage();
  const prototype = Object.getPrototypeOf(store) as { __originalGetItem?: Storage["getItem"] } | null;
  const partitioned = typeof prototype?.__originalGetItem === "function" && store.getItem !== prototype.__originalGetItem;
  const owner = partitioned ? getActiveOwner() : null;
  const epoch = partitioned ? getIdentityEpoch() : null;
  const expectedOwner = userId === undefined ? owner : `user:${userId}`;
  const scope: ArchiveScope = {
    store, owner,
    userId: owner?.startsWith("user:") ? owner.slice(5) : undefined,
    key: (logical) => owner === null ? logical : physicalKey(logical, owner),
    assertCurrent() {
      if (owner !== null && (owner !== expectedOwner || getActiveOwner() !== owner || getIdentityEpoch() !== epoch)) {
        throw new DeadLetterStorageError("dead-letter-owner-changed-or-mismatched");
      }
    },
  };
  scope.assertCurrent();
  return scope;
}

function readLegacy(scope: ArchiveScope): DeadLetter[] {
  scope.assertCurrent();
  const raw = scope.store.getItem(scope.key(LS_KEY));
  if (raw === null) return [];
  const rows: unknown = JSON.parse(raw);
  if (!Array.isArray(rows)) throw new DeadLetterStorageError("invalid-dead-letter-legacy");
  for (const row of rows) validateLetter(row);
  return rows as DeadLetter[];
}

function belongsToScope(scope: ArchiveScope, letter: DeadLetter): boolean {
  return scope.owner === null || letter.userId === scope.userId;
}

function readEntry(scope: ArchiveScope, key: string): ArchiveEntry {
  const raw = scope.store.getItem(key);
  if (raw === null) throw new DeadLetterStorageError("dead-letter-read-incomplete");
  const entry = JSON.parse(raw) as ArchiveEntry;
  if (!entry || entry.version !== 1) throw new DeadLetterStorageError("invalid-dead-letter-entry");
  validateLetter(entry.letter);
  if (!belongsToScope(scope, entry.letter)) throw new DeadLetterStorageError("dead-letter-owner-mismatch");
  if (entry.source && canonical(letterFor(entry.source, entry.letter.reason, entry.letter.createdAt)) !== canonical(entry.letter)) {
    throw new DeadLetterStorageError("dead-letter-source-mismatch");
  }
  // Validate the complete expected PHYSICAL key, including its owner suffix.
  if (scope.key(keyFor(entry)) !== key) throw new DeadLetterStorageError("dead-letter-key-mismatch");
  return entry;
}

function readArchive(scope: ArchiveScope): Map<string, ArchiveEntry> {
  const entries = new Map<string, ArchiveEntry>();
  for (const letter of readLegacy(scope)) {
    if (!belongsToScope(scope, letter)) continue;
    const entry: ArchiveEntry = { version: 1, letter };
    entries.set(scope.key(keyFor(entry)), entry);
  }
  const store = scope.store;
  const size = store.length;
  const keys: string[] = [];
  for (let i = 0; i < size; i++) {
    const key = store.key(i);
    if (key === null) throw new DeadLetterStorageError("dead-letter-read-incomplete");
    // Filter physical namespaces BEFORE reading/parsing a foreign value.
    if (ownerOfPhysicalKey(key) !== scope.owner) continue;
    if (logicalKeyOf(key).startsWith(ENTRY_PREFIX)) keys.push(key);
  }
  for (const key of keys) entries.set(key, readEntry(scope, key));
  scope.assertCurrent();
  return entries;
}

function persist(scope: ArchiveScope, key: string, entry: ArchiveEntry): void {
  scope.assertCurrent();
  const serialized = JSON.stringify(entry);
  scope.store.setItem(key, serialized);
  if (scope.store.getItem(key) !== serialized) throw new DeadLetterStorageError("dead-letter-write-unconfirmed");
  scope.assertCurrent();
}

async function exclusive<T>(scope: ArchiveScope, action: () => Promise<T> | T): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) throw new DeadLetterStorageError("dead-letter-requires-web-locks");
  return locks.request(LS_KEY, { mode: "exclusive" }, () => { scope.assertCurrent(); return action(); });
}

function changed(): void {
  try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("irth:dead-letter:changed")); } catch { /* observer only */ }
}

function migrateUnlocked(scope: ArchiveScope): void {
  const legacy = readLegacy(scope).filter((letter) => belongsToScope(scope, letter));
  // Validate every existing entry before any write/cleanup, not just the array.
  const existing = readArchive(scope);
  for (const letter of legacy) {
    const entry: ArchiveEntry = { version: 1, letter };
    const key = scope.key(keyFor(entry));
    if (!existing.has(key) || scope.store.getItem(key) === null) persist(scope, key, entry);
  }
  if (legacy.length) {
    // Crash before this line leaves readable duplicates, never missing records.
    const current = readLegacy(scope);
    const copied = new Set(legacy.map((letter) => scope.key(keyFor({ version: 1, letter }))));
    scope.assertCurrent();
    scope.store.setItem(scope.key(LS_KEY), JSON.stringify(current.filter((letter) => !copied.has(scope.key(keyFor({ version: 1, letter }))))));
  }
}

export async function migrateDeadLetters(): Promise<void> {
  const scope = captureScope();
  return exclusive(scope, () => { migrateUnlocked(scope); changed(); });
}

function archiveUnlocked(scope: ArchiveScope, source: OutboxItem, reason: string): ArchiveReceipt {
  migrateUnlocked(scope);
  const entries = readArchive(scope);
  const entry: ArchiveEntry = { version: 1, source, letter: letterFor(source, reason, Date.now()) };
  validateLetter(entry.letter);
  const key = scope.key(keyFor(entry));
  const existing = entries.get(key);
  if (existing) return { key, letter: existing.letter };
  if (entries.size >= MAX_ENTRIES) throw new DeadLetterStorageError("dead-letter-full");
  persist(scope, key, entry);
  changed();
  return { key, letter: entry.letter };
}

export async function recordDeadLetter(item: OutboxItem, reason: string): Promise<ArchiveReceipt> {
  const snapshot = JSON.parse(JSON.stringify(item)) as OutboxItem;
  const scope = captureScope(snapshot.userId);
  return exclusive(scope, () => archiveUnlocked(scope, snapshot, reason));
}

/** Hold the archive lock through conditional dequeue, so clear cannot race it. */
export async function archiveRejected(item: OutboxItem, reason: string): Promise<boolean> {
  const snapshot = JSON.parse(JSON.stringify(item)) as OutboxItem;
  const scope = captureScope(snapshot.userId);
  return exclusive(scope, async () => {
    archiveUnlocked(scope, snapshot, reason);
    scope.assertCurrent();
    return remove(snapshot.id, snapshot);
  });
}

export function listDeadLetters(userId: string | null): DeadLetter[] {
  if (!userId) return [];
  const scope = captureScope(userId);
  return [...readArchive(scope).values()].map((entry) => entry.letter)
    .filter((letter) => letter.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
}

export async function clearDeadLetters(userId: string): Promise<void> {
  const scope = captureScope(userId);
  return exclusive(scope, () => {
    migrateUnlocked(scope);
    // A complete read is required before deleting even one account-owned entry.
    const entries = readArchive(scope);
    for (const [key, entry] of entries) {
      if (entry.letter.userId !== userId) continue;
      scope.assertCurrent();
      scope.store.removeItem(key);
      if (scope.store.getItem(key) !== null) throw new DeadLetterStorageError("dead-letter-clear-unconfirmed");
    }
    // Preserve any new V17 snapshots observed after migration.
    const legacy = readLegacy(scope);
    if (legacy.some((letter) => letter.userId === userId)) {
      scope.assertCurrent();
      scope.store.setItem(scope.key(LS_KEY), JSON.stringify(legacy.filter((letter) => letter.userId !== userId)));
    }
    changed();
  });
}

/** Reasons that classify a failure as PERMANENT (dead-letter, no retry). */
export const PERMANENT_REASONS = new Set<string>([
  "invalid_campaign_id",
  "invalid_chapter_id",
  "campaign_not_found",
  "chapter_not_in_campaign",
  "invalid_tutorial_id",
  "invalid_version",
  "investigation_not_found",
  "invalid_story_id",
  "invalid_scene_index",
  "story_not_found",
  "not_published",
]);

export function isPermanentReason(reason: string | null | undefined): boolean {
  return !!reason && PERMANENT_REASONS.has(reason);
}
