/** Internal schema access only. Opening this database activates no economic authority. */
export const SETTLEMENT_DB = "irth-reward-settlement-v1";
export const SETTLEMENT_VERSION = 2;
export const SETTLEMENT_STORES = [
  "entitlements",
  "economy",
  "appliedGrants",
  "migrationState",
] as const;

export function openSettlementDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let abandoned = false;
    let upgradeError: unknown;
    const request = indexedDB.open(SETTLEMENT_DB, SETTLEMENT_VERSION);
    request.onblocked = () => {
      abandoned = true;
      reject(new Error("settlement:database-blocked"));
    };
    request.onupgradeneeded = (event) => {
      const db = request.result;
      try {
        if (abandoned) throw new Error("settlement:abandoned-upgrade");
        if (event.oldVersion === 0) db.createObjectStore("entitlements");
        // A damaged v1 is not an empty installation. Never recreate its old store.
        if (!db.objectStoreNames.contains("entitlements"))
          throw new Error("settlement:invalid-schema");
        for (const name of SETTLEMENT_STORES.slice(1)) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        }
        for (const name of SETTLEMENT_STORES) {
          const store = request.transaction!.objectStore(name);
          if (store.keyPath !== null || store.autoIncrement)
            throw new Error("settlement:invalid-schema");
        }
      } catch (error) {
        upgradeError = error;
        request.transaction!.abort();
      }
    };
    request.onerror = () => reject(upgradeError ?? request.error);
    request.onsuccess = () => {
      const db = request.result;
      // Release idle connections for upgrades; active transactions finish before close.
      db.onversionchange = () => db.close();
      if (abandoned) {
        db.close();
        return;
      }
      try {
        const tx = db.transaction([...SETTLEMENT_STORES], "readonly");
        for (const name of SETTLEMENT_STORES) {
          const store = tx.objectStore(name);
          if (store.keyPath !== null || store.autoIncrement)
            throw new Error("settlement:invalid-schema");
        }
        tx.oncomplete = () => resolve(db);
        tx.onabort = () => {
          db.close();
          reject(tx.error ?? new Error("settlement:invalid-schema"));
        };
      } catch (error) {
        db.close();
        reject(error);
      }
    };
  });
}
