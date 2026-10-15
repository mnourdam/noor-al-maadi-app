// Durable, per-revision archive. The V17 array remains readable until each
// snapshot has been copied to its own key and its write has been confirmed.
import { remove, type OutboxItem } from "./outbox";

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

function readLegacy(): DeadLetter[] {
  const raw = storage().getItem(LS_KEY);
  if (raw === null) return [];
  const rows: unknown = JSON.parse(raw);
  if (!Array.isArray(rows)) throw new DeadLetterStorageError("invalid-dead-letter-legacy");
  for (const row of rows) validateLetter(row);
  return rows as DeadLetter[];
}

function readEntry(key: string): ArchiveEntry {
  const raw = storage().getItem(key);
  if (raw === null) throw new DeadLetterStorageError("dead-letter-read-incomplete");
  const entry = JSON.parse(raw) as ArchiveEntry;
  if (!entry || entry.version !== 1) throw new DeadLetterStorageError("invalid-dead-letter-entry");
  validateLetter(entry.letter);
  if (entry.source && canonical(letterFor(entry.source, entry.letter.reason, entry.letter.createdAt)) !== canonical(entry.letter)) {
    throw new DeadLetterStorageError("dead-letter-source-mismatch");
  }
  if (keyFor(entry) !== key) throw new DeadLetterStorageError("dead-letter-key-mismatch");
  return entry;
}

function readArchive(): Map<string, ArchiveEntry> {
  const entries = new Map<string, ArchiveEntry>();
  for (const letter of readLegacy()) {
    const entry: ArchiveEntry = { version: 1, letter };
    entries.set(keyFor(entry), entry);
  }
  const store = storage();
  const size = store.length;
  const keys: string[] = [];
  for (let i = 0; i < size; i++) {
    const key = store.key(i);
    if (key === null) throw new DeadLetterStorageError("dead-letter-read-incomplete");
    if (key.startsWith(ENTRY_PREFIX)) keys.push(key);
  }
  for (const key of keys) entries.set(key, readEntry(key));
  return entries;
}

function persist(key: string, entry: ArchiveEntry): void {
  const store = storage();
  const serialized = JSON.stringify(entry);
  store.setItem(key, serialized);
  if (store.getItem(key) !== serialized) throw new DeadLetterStorageError("dead-letter-write-unconfirmed");
}

async function exclusive<T>(action: () => Promise<T> | T): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) throw new DeadLetterStorageError("dead-letter-requires-web-locks");
  return locks.request(LS_KEY, { mode: "exclusive" }, action);
}

function changed(): void {
  try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("irth:dead-letter:changed")); } catch { /* observer only */ }
}

function migrateUnlocked(): void {
  const legacy = readLegacy();
  // Validate every existing entry before any write/cleanup, not just the array.
  const existing = readArchive();
  for (const letter of legacy) {
    const entry: ArchiveEntry = { version: 1, letter };
    const key = keyFor(entry);
    if (!existing.has(key) || storage().getItem(key) === null) persist(key, entry);
  }
  if (legacy.length) {
    // Crash before this line leaves readable duplicates, never missing records.
    const current = readLegacy();
    const copied = new Set(legacy.map((letter) => keyFor({ version: 1, letter })));
    storage().setItem(LS_KEY, JSON.stringify(current.filter((letter) => !copied.has(keyFor({ version: 1, letter })))));
  }
}

export async function migrateDeadLetters(): Promise<void> {
  return exclusive(() => { migrateUnlocked(); changed(); });
}

function archiveUnlocked(source: OutboxItem, reason: string): ArchiveReceipt {
  migrateUnlocked();
  const entries = readArchive();
  const entry: ArchiveEntry = { version: 1, source, letter: letterFor(source, reason, Date.now()) };
  validateLetter(entry.letter);
  const key = keyFor(entry);
  const existing = entries.get(key);
  if (existing) return { key, letter: existing.letter };
  if (entries.size >= MAX_ENTRIES) throw new DeadLetterStorageError("dead-letter-full");
  persist(key, entry);
  changed();
  return { key, letter: entry.letter };
}

export async function recordDeadLetter(item: OutboxItem, reason: string): Promise<ArchiveReceipt> {
  const snapshot = JSON.parse(JSON.stringify(item)) as OutboxItem;
  return exclusive(() => archiveUnlocked(snapshot, reason));
}

/** Hold the archive lock through conditional dequeue, so clear cannot race it. */
export async function archiveRejected(item: OutboxItem, reason: string): Promise<boolean> {
  const snapshot = JSON.parse(JSON.stringify(item)) as OutboxItem;
  return exclusive(async () => {
    archiveUnlocked(snapshot, reason);
    return remove(snapshot.id, snapshot);
  });
}

export function listDeadLetters(userId: string | null): DeadLetter[] {
  if (!userId) return [];
  return [...readArchive().values()].map((entry) => entry.letter)
    .filter((letter) => letter.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
}

export async function clearDeadLetters(userId: string): Promise<void> {
  return exclusive(() => {
    migrateUnlocked();
    // A complete read is required before deleting even one account-owned entry.
    const entries = readArchive();
    for (const [key, entry] of entries) {
      if (entry.letter.userId !== userId) continue;
      storage().removeItem(key);
      if (storage().getItem(key) !== null) throw new DeadLetterStorageError("dead-letter-clear-unconfirmed");
    }
    // Preserve any new V17 snapshots observed after migration.
    const legacy = readLegacy();
    if (legacy.some((letter) => letter.userId === userId)) {
      storage().setItem(LS_KEY, JSON.stringify(legacy.filter((letter) => letter.userId !== userId)));
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
