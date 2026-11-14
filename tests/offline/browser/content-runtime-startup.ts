/** Test-fixture guard only: cold hydration may never manufacture missing data. */
export function requirePersistedForOfflineBoot(pathname: string, persisted: unknown): boolean {
  const offline = pathname === '/offline-reopen.html';
  if (offline && !persisted) throw new Error('offline reopen requires persisted snapshot');
  return offline;
}
