/** Only synthetic account/session/collection reads; every unexpected call fails. */
export const state = {
  uid: "synthetic-profile-alice",
  owned: 9,
  claimed: false,
  reads: 0,
  mutations: 0,
};
export function unexpected(): never {
  state.mutations++;
  throw new Error("unexpected synthetic boundary call");
}
export function readCollection(table: string, columns: string, field: string, uid: string) {
  if (
    table !== "user_collection" ||
    columns !== "item_id,item_type" ||
    field !== "user_id" ||
    uid !== state.uid
  )
    return unexpected();
  state.reads++;
  return Promise.resolve({
    data: Array.from({ length: state.owned }, (_, i) => ({
      item_id: `synthetic-${i}`,
      item_type: "artifact",
    })),
    error: null,
  });
}
const strict = <T extends object>(target: T): T =>
  new Proxy(target, {
    get(object, key, receiver) {
      return Reflect.has(object, key) ? Reflect.get(object, key, receiver) : unexpected;
    },
  });
export const supabase = strict({
  auth: strict({
    getSession: async () => ({ data: { session: { user: { id: state.uid } } } }),
    getUser: async () => ({ data: { user: { id: state.uid } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  }),
  from: (table: string) =>
    strict({
      select: (columns: string) =>
        strict({
          eq: (field: string, uid: string) =>
            strict({ abortSignal: () => readCollection(table, columns, field, uid) }),
        }),
      insert: unexpected,
      update: unexpected,
      delete: unexpected,
      upsert: unexpected,
    }),
  rpc: unexpected,
  functions: { invoke: unexpected },
  channel: unexpected,
  removeChannel: unexpected,
});
export const fetchUserAchievements = async () =>
  state.claimed
    ? [
        {
          achievement_id: "ach_artifact_10",
          unlocked_at: "2026-01-01T00:00:00Z",
          rewards_granted_at: "2026-01-02T00:00:00Z",
          engine_version: 2,
          definition_version: 1,
        },
      ]
    : [];
export function useProfile() {
  return {
    hydrated: true,
    userId: state.uid,
    profile: {
      points: 0,
      dinars: 0,
      streak: 0,
      longestStreak: 0,
      titlesEarned: [],
      campaignsCompleted: [],
      loggedIn: true,
      hearts: 5,
      settings: {},
      name: "Synthetic player",
    },
    updateSettings: unexpected,
  };
}
export function useAccount() {
  return { user: { id: state.uid }, account: {}, displayName: "Synthetic player" };
}
