/** Isolated synthetic native-browser acceptance. Never imported by the app. */
import { transactionsForOwner, type SettlementRecord, type Json } from "@/lib/rewards/transaction";
import { openSettlementDatabase } from "@/lib/rewards/database";
import { getActiveOwner, setActiveOwnerInternal } from "@/lib/identity/owner";

function owner(id: string) {
  setActiveOwnerInternal(id);
}
async function read(
  key = "synthetic",
  store: "economy" | "appliedGrants" | "migrationState" = "economy",
) {
  let value: SettlementRecord | undefined;
  await transactionsForOwner(getActiveOwner()).run((tx) =>
    tx.read(store, key, (row) => {
      value = row;
    }),
  );
  return value ?? null;
}
async function write(base: SettlementRecord | undefined, value: Json) {
  try {
    await transactionsForOwner(getActiveOwner()).run((tx) =>
      tx.compareWrite("economy", "synthetic", base, value),
    );
    return { status: "committed" };
  } catch (error) {
    return { status: "rejected", reason: error instanceof Error ? error.message : "unknown" };
  }
}
async function abortAfterNativePut(base: SettlementRecord) {
  const original = IDBObjectStore.prototype.put;
  const reached = new Set<string>();
  let abort: (() => void) | undefined;
  IDBObjectStore.prototype.put = function (
    this: IDBObjectStore,
    ...args: Parameters<IDBObjectStore["put"]>
  ) {
    const request = original.apply(this, args);
    const store = this.name;
    if (["economy", "appliedGrants", "migrationState"].includes(store))
      request.addEventListener(
        "success",
        () => {
          reached.add(store);
          if (reached.size === 3) abort!();
        },
        { once: true },
      );
    return request;
  };
  let reason = "";
  try {
    await transactionsForOwner(getActiveOwner()).run((tx) => {
      abort = () => tx.abort();
      tx.compareWrite("economy", "synthetic", base, { synthetic: "must-abort" });
      tx.compareWrite("appliedGrants", "abort-marker", undefined, { synthetic: true });
      tx.compareWrite("migrationState", "abort-marker", undefined, { synthetic: true });
    });
  } catch (error) {
    reason = error instanceof Error ? error.message : "unknown";
  } finally {
    IDBObjectStore.prototype.put = original;
  }
  return { reached: [...reached].sort(), reason };
}
async function rawOverwrite(row: SettlementRecord) {
  // Deliberately bypass the primitive. This demonstrates its limited boundary:
  // it cannot exclude uncooperative/old code with raw same-origin IDB access.
  const db = await openSettlementDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("economy", "readwrite");
      tx.objectStore("economy").put(row, JSON.stringify([row.owner, row.key]));
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
Object.assign(window, {
  settlementNative: { owner, read, write, abortAfterNativePut, rawOverwrite },
});

// New API remains dormant; these are synthetic confirmation records, not grants.
import { confirmationTransactionsForOwner } from "@/lib/rewards/transaction";
import { settlementForOwner, type Entitlement } from "@/lib/rewards/settlement";
const confirmationBinding = (key: string) => ({
  operationId: key,
  revision: "synthetic-r1",
  snapshot: "synthetic-scene",
});
async function prepareConfirmation(key: string) {
  return settlementForOwner(getActiveOwner()).prepare({
    key,
    source: "local",
    terms: "synthetic-no-economic-authority",
    binding: confirmationBinding(key),
    expected: null,
  });
}
async function confirmationState(key: string) {
  const state: Record<string, unknown> = {
    entitlement: await settlementForOwner(getActiveOwner()).read(key),
  };
  for (const store of ["economy", "appliedGrants", "migrationState"] as const)
    state[store] = await read(key, store);
  return state;
}
async function confirmAtomic(
  key: string,
  expected: Entitlement,
  evidence: string,
  companions = true,
  abortAll = false,
) {
  const original = IDBObjectStore.prototype.put;
  const reached = new Set<string>();
  let abort: (() => void) | undefined;
  if (abortAll)
    IDBObjectStore.prototype.put = function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      const req = original.apply(this, args);
      const store = this.name;
      req.addEventListener(
        "success",
        () => {
          reached.add(store);
          if (reached.size === 4) abort!();
        },
        { once: true },
      );
      return req;
    };
  try {
    await confirmationTransactionsForOwner(getActiveOwner()).run((tx) => {
      abort = () => tx.abort();
      tx.compareSettleEntitlement(key, expected, confirmationBinding(key), {
        state: "confirmed",
        rewardDue: true,
        evidence,
      });
      if (companions)
        for (const store of ["economy", "appliedGrants", "migrationState"] as const)
          tx.compareWrite(store, key, undefined, { synthetic: true });
    });
    return { status: "committed", reached: [...reached].sort() };
  } catch (error) {
    return {
      status: "rejected",
      reason: error instanceof Error ? error.message : "unknown",
      reached: [...reached].sort(),
    };
  } finally {
    IDBObjectStore.prototype.put = original;
  }
}
Object.assign(window, {
  confirmationNative: { prepareConfirmation, confirmationState, confirmAtomic },
});

// Pending-only journal API. Synthetic descriptions do not establish eligibility.
import { journalIntentsForOwner, type JournalCommandInput } from '@/lib/rewards/journal-intents';
function journalCommand(id: string, variant = 'a'): JournalCommandInput {
  return {commandId:id,commandType:'chapter-progress-attempt',protocol:1,
    campaignId:'synthetic-campaign',chapterId:'synthetic-chapter',activityId:'synthetic-activity',
    payload:{campaignId:'synthetic-campaign',chapterId:'synthetic-chapter',variant},
    targets:[{key:id+':activity',terms:'synthetic-v1',level:'activity'},
      {key:id+':chapter',terms:'synthetic-v1',level:'chapter'}]};
}
async function journalPrepare(id: string, variant = 'a', abortAll = false) {
  const original=IDBObjectStore.prototype.add;
  const reached:string[]=[];
  if(abortAll) IDBObjectStore.prototype.add=function(this:IDBObjectStore,...args:Parameters<IDBObjectStore['add']>) {
    const request=original.apply(this,args);
    if(['intents','entitlements'].includes(this.name)) {
      const tx=this.transaction, store=this.name;
      request.addEventListener('success',()=>{reached.push(store);if(reached.length===3)tx.abort();},{once:true});
    }
    return request;
  };
  try {return {status:'committed',row:await journalIntentsForOwner(getActiveOwner()).prepare(journalCommand(id,variant)),reached};}
  catch(error){return {status:'rejected',reason:error instanceof Error?error.message:'unknown',reached};}
  finally{IDBObjectStore.prototype.add=original;}
}
async function journalRead(id:string) {
  try{return {status:'read',row:await journalIntentsForOwner(getActiveOwner()).readCommitted(id)??null};}
  catch(error){return {status:'rejected',reason:error instanceof Error?error.message:'unknown'};}
}
async function journalRaw(id:string,remove=false) {
  const db=await openSettlementDatabase();
  const who=getActiveOwner();
  try{return await new Promise<Record<string,unknown>>((resolve,reject)=>{
    const tx=db.transaction(['intents','entitlements'],remove?'readwrite':'readonly');
    const result:Record<string,unknown>={};
    if(remove)tx.objectStore('entitlements').delete(JSON.stringify([who,id+':chapter']));
    for(const [label,store,key] of [['intent','intents',id],['activity','entitlements',id+':activity'],['chapter','entitlements',id+':chapter']]) {
      const req=tx.objectStore(store).get(JSON.stringify([who,key]));
      req.onsuccess=()=>{result[label]=req.result??null;};
    }
    tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}
Object.assign(window,{journalNative:{prepare:journalPrepare,read:journalRead,raw:journalRaw}});
