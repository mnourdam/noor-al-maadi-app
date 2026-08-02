#!/usr/bin/env node
/**
 * Smoke test for every surface whose data source moved to `list_public_profiles`.
 *
 *   1. Player search by username           (searchPlayers → list_public_profiles p_search)
 *   2. Player search by display_name       (same RPC, Arabic term)
 *   3. Open another player's profile by id (fetchPublicProfileById)
 *   4. Open another player's profile by username
 *   5. Friend request send + list          (friendships + profile hydration)
 *   6. Friends list after accept
 *   7. Own profile read                    (base table, owner row)
 *   8. Realtime own-row subscription       (postgres_changes, id=eq.<uid>)
 *
 * Both throwaway accounts are deleted afterwards, pass or fail.
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const URL_BASE = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!URL_BASE || !SERVICE_KEY || !ANON_KEY) {
  console.error("Skipping: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / publishable key not set.");
  process.exit(0);
}

let failed = 0;
const check = (label, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

const admin = (path, init = {}) =>
  fetch(`${URL_BASE}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

async function createAccount(tag, username, displayName) {
  const email = `smoke-${tag}-${randomUUID()}@example.test`;
  const password = `Pw-${randomUUID()}`;
  const res = await admin("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { username } }),
  });
  const user = await res.json();
  if (!user?.id) throw new Error(`create user failed: ${JSON.stringify(user)}`);

  const client = createClient(URL_BASE, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: session, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !session?.session) throw new Error(`sign-in failed: ${error?.message}`);

  // Make sure the profile row exists with deterministic, searchable names.
  await admin(`/rest/v1/profiles?id=eq.${user.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ username, display_name: displayName }),
  });

  return { id: user.id, client };
}

const created = [];
try {
  const uA = `smokeA_${Date.now()}`;
  const uB = `smokeB_${Date.now()}`;
  const A = await createAccount("a", uA, "لاعب ألف");
  created.push(A.id);
  const B = await createAccount("b", uB, "لاعب باء");
  created.push(B.id);

  const rpc = (client, args) =>
    client.rpc("list_public_profiles", {
      p_ids: args.ids ?? null,
      p_username: args.username ?? null,
      p_search: args.search ?? null,
      p_exclude_id: args.excludeId ?? null,
      p_limit: args.limit ?? 20,
    });

  // 1. search by username
  const byUser = await rpc(A.client, { search: `%${uB}%`, excludeId: A.id });
  check(
    "player search by username finds B",
    !byUser.error && (byUser.data ?? []).some((r) => r.id === B.id),
    byUser.error?.message ?? `rows=${(byUser.data ?? []).length}`,
  );
  check(
    "player search excludes the caller",
    !(byUser.data ?? []).some((r) => r.id === A.id),
    "",
  );

  // 2. search by display_name (Arabic)
  const byName = await rpc(A.client, { search: "%لاعب باء%", excludeId: A.id });
  check(
    "player search by display_name (Arabic) finds B",
    !byName.error && (byName.data ?? []).some((r) => r.id === B.id),
    byName.error?.message ?? `rows=${(byName.data ?? []).length}`,
  );

  // 3. open other player's profile by id
  const byId = await rpc(A.client, { ids: [B.id], limit: 1 });
  const bRow = (byId.data ?? [])[0] ?? null;
  check("open B's profile by id", !!bRow && bRow.id === B.id, byId.error?.message ?? "");
  const PRIVATE = ["email", "referral_code", "marketing_opt_in", "hearts", "dinars", "streak"];
  const leaked = bRow ? PRIVATE.filter((c) => c in bRow) : [];
  check("public payload leaks no private columns", !!bRow && leaked.length === 0, leaked.join(",") || "clean");

  // 4. open other player's profile by exact username
  const byExact = await rpc(A.client, { username: uB, limit: 1 });
  check(
    "open B's profile by username",
    !byExact.error && (byExact.data ?? [])[0]?.id === B.id,
    byExact.error?.message ?? "",
  );

  // 5. friend request
  const [pa, pb] = A.id < B.id ? [A.id, B.id] : [B.id, A.id];
  const insert = await A.client
    .from("friendships")
    .insert({ user_a: pa, user_b: pb, requester: A.id, status: "pending" });
  check("A sends friend request to B", !insert.error, insert.error?.message ?? "");

  const incoming = await B.client.from("friendships").select("*").or(`user_a.eq.${B.id},user_b.eq.${B.id}`);
  const pending = (incoming.data ?? []).find((r) => r.requester === A.id);
  check("B sees the incoming request", !!pending, incoming.error?.message ?? "");

  if (pending) {
    // hydration of the requester's public profile — the path that used the view
    const hydrate = await rpc(B.client, { ids: [A.id], limit: 1 });
    check(
      "request list hydrates A's public profile",
      (hydrate.data ?? [])[0]?.username === uA,
      hydrate.error?.message ?? "",
    );

    const accept = await B.client.from("friendships").update({ status: "accepted" }).eq("id", pending.id);
    check("B accepts the request", !accept.error, accept.error?.message ?? "");

    const friends = await A.client.from("friendships").select("*").or(`user_a.eq.${A.id},user_b.eq.${A.id}`);
    const accepted = (friends.data ?? []).filter((r) => r.status === "accepted");
    check("friends list shows the accepted friendship", accepted.length === 1, `rows=${accepted.length}`);

    const hydrateFriends = await rpc(A.client, { ids: [B.id], limit: 100 });
    check(
      "friends list hydrates B's public profile",
      (hydrateFriends.data ?? [])[0]?.id === B.id,
      hydrateFriends.error?.message ?? "",
    );
  }

  // 6. own profile
  const own = await A.client.from("profiles").select("id,username,level,xp").eq("id", A.id).maybeSingle();
  check("owner reads own profile row", !own.error && own.data?.id === A.id, own.error?.message ?? "");
  const ownFull = await A.client.rpc("get_my_profile");
  check("get_my_profile returns the owner payload", !ownFull.error && !!ownFull.data, ownFull.error?.message ?? "");

  // 7. realtime own-row
  const realtimeOk = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 15000);
    const channel = A.client
      .channel(`smoke-profile-${A.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${A.id}` },
        () => {
          clearTimeout(timer);
          A.client.removeChannel(channel);
          resolve(true);
        },
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await admin(`/rest/v1/profiles?id=eq.${A.id}`, {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ bio: `smoke-${Date.now()}` }),
          });
        }
      });
  });
  check("realtime delivers the owner's own-row UPDATE", realtimeOk, realtimeOk ? "" : "timed out after 15s");
} finally {
  for (const id of created) {
    try {
      await admin(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
    } catch {
      /* best effort */
    }
  }
}

if (failed) {
  console.error(`\nSmoke test FAILED (${failed} check${failed > 1 ? "s" : ""}).`);
  process.exit(1);
}
console.log("\nPublic-profile smoke test OK.");
