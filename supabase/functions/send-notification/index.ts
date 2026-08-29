// Send notifications via Firebase Cloud Messaging HTTP v1.
//
// Body shape (any of):
//   { notification_id: "<uuid>" }                                   -> load + send a stored notification
//   { title, body, type?, target_type?, target_user_id?,
//     deep_link?, image_url? }                                       -> ad-hoc send (also creates a row)
//
// Requires the following Supabase Edge Function secrets:
//   FIREBASE_PROJECT_ID            e.g. "irth-9d7a8"
//   FIREBASE_CLIENT_EMAIL          from the service-account JSON (client_email)
//   FIREBASE_PRIVATE_KEY           from the service-account JSON (private_key, \n escapes ok)
//
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are auto-injected by Supabase.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { resolveTokenScope, assertNoSegmentWidening } from "./audience-guard.ts";
import { resolveRequestAction } from "./external-url.ts";
import {
  extractBearer, isServiceRoleBearer, authorizeUserEnvelope, rolesGrantAdmin,
  type CallerKind,
} from "./authorize.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

// ---------- Google OAuth (service account → access token) ----------

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function base64UrlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getGoogleAccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const claimB64 = base64UrlEncode(JSON.stringify(claim));
  const signingInput = `${headerB64}.${claimB64}`;

  const keyBuf = pemToArrayBuffer(privateKeyPem.replace(/\\n/g, "\n"));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyBuf,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${base64UrlEncode(new Uint8Array(sig))}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${tokenRes.status} ${text}`);
  }
  const tokenJson = await tokenRes.json();
  return tokenJson.access_token as string;
}

// ---------- FCM send ----------

async function sendFcm(
  projectId: string,
  accessToken: string,
  token: string,
  payload: {
    title: string;
    body: string;
    deep_link?: string | null;
    external_url?: string | null;
    image_url?: string | null;
    type?: string | null;
    notification_id?: string | null;
  },
) {
  const message: any = {
    message: {
      token,
      notification: {
        title: payload.title,
        body: payload.body,
        ...(payload.image_url ? { image: payload.image_url } : {}),
      },
      data: {
        type: payload.type ?? "manual",
        ...(payload.deep_link ? { deep_link: payload.deep_link } : {}),
        ...(payload.external_url ? { external_url: payload.external_url } : {}),
        ...(payload.notification_id ? { notification_id: payload.notification_id } : {}),
      },
      android: {
        priority: "HIGH",
        notification: {
          // Versioned channel with the custom Irth sound. Must match the
          // channel created in `IrthApp.java`. Referenced without file
          // extension — Android resolves it against `res/raw/`.
          channel_id: "irth_notifications_v2",
          sound: "irth_notification",
          default_sound: false,
          ...(payload.image_url ? { image: payload.image_url } : {}),
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "irth_notification.caf",
          },
        },
      },
    },
  };

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    },
  );

  const text = await res.text();
  if (!res.ok) {
    return { ok: false as const, error: `${res.status} ${text}` };
  }
  return { ok: true as const, response: text };
}

// ---------- Handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const projectId = Deno.env.get("FIREBASE_PROJECT_ID");
    const clientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL");
    const privateKey = Deno.env.get("FIREBASE_PRIVATE_KEY");
    if (!projectId || !clientEmail || !privateKey) {
      console.error("[send-notification] missing Firebase secrets");
      return jsonResponse(
        { error: "Firebase service account secrets are not configured" },
        { status: 500 },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));

    // ── V16 AUTHORSHIP AUTHORIZATION ──────────────────────────────────
    // Authentication alone is NOT authorization. Only the service role
    // (cron/system producers) and verified IRTH admins may author arbitrary
    // notifications; every other authenticated user is restricted to the
    // app's own peer envelope. Client-supplied role/admin flags are ignored.
    const bearer = extractBearer(req.headers.get("authorization"));
    if (!bearer) {
      return jsonResponse({ error: "Unauthorized" }, { status: 401 });
    }

    let callerKind: CallerKind;
    if (isServiceRoleBearer(bearer, serviceKey)) {
      callerKind = "service";
    } else {
      const { data: userData, error: userErr } = await admin.auth.getUser(bearer);
      const caller = userData?.user ?? null;
      if (userErr || !caller) {
        return jsonResponse({ error: "Unauthorized" }, { status: 401 });
      }

      const { data: roleRows } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", caller.id);
      const roles = (roleRows ?? []).map((r: any) => String(r.role));
      const bootstrapOwner =
        (caller.email ?? "").trim().toLowerCase() === "mnourdam@gmail.com";

      if (rolesGrantAdmin(roles) || bootstrapOwner) {
        callerKind = "admin";
      } else {
        const decision = authorizeUserEnvelope(caller.id, body);
        if (!decision.ok) {
          console.warn("[send-notification] authorship denied", caller.id, decision.error);
          return jsonResponse({ error: decision.error }, { status: decision.status });
        }
        if (decision.requiresFriendship) {
          const [a, b] = [caller.id, decision.targetUserId].sort();
          const { data: friendship } = await admin
            .from("friendships")
            .select("id")
            .eq("user_a", a)
            .eq("user_b", b)
            .maybeSingle();
          if (!friendship) {
            return jsonResponse(
              { error: "forbidden: no friendship relation with the target user" },
              { status: 403 },
            );
          }
        }
        callerKind = "user";
      }
    }
    console.log(`[send-notification] caller kind=${callerKind}`);
    let notificationId: string | undefined = body.notification_id;

    // Resolve or create notification row.
    let notif: any;
    if (notificationId) {
      const { data, error } = await admin
        .from("notifications")
        .select("*")
        .eq("id", notificationId)
        .single();
      if (error || !data) {
        return jsonResponse({ error: "notification not found" }, { status: 404 });
      }
      notif = data;
    } else {
      if (!body.title || !body.body) {
        return jsonResponse({ error: "title and body are required" }, { status: 400 });
      }

      // V16: validate the audience BEFORE creating a row, so a malformed or
      // unverifiable segment request fails closed and never reaches send.
      const preScope = resolveTokenScope(body);
      if (!preScope.ok) {
        console.error("[send-notification] audience rejected (pre-insert)", preScope.error);
        return jsonResponse({ error: preScope.error, sent: 0, failed: 0, total: 0 }, { status: preScope.status });
      }


      // ── Stable-ID dedupe ────────────────────────────────────────
      // `dedupe_key` is the caller-supplied identity of the LOGICAL
      // notification (e.g. "today_in_history:2026-07-28:slot=1").
      // It is protected by a unique index, so a retried cron trigger,
      // a concurrent invocation, a reconnect-driven resync or an app
      // restart can never create a second row for the same event.
      const dedupeKey: string | null = typeof body.dedupe_key === "string" && body.dedupe_key
        ? body.dedupe_key
        : null;

      if (dedupeKey) {
        const { data: existing } = await admin
          .from("notifications")
          .select("*")
          .eq("dedupe_key", dedupeKey)
          .maybeSingle();
        if (existing) {
          console.log("[send-notification] deduped by key", dedupeKey);
          return jsonResponse({
            ok: true,
            deduped: true,
            notification_id: existing.id,
            dedupe_key: dedupeKey,
          });
        }
      }

      const insert = {
        title: body.title,
        body: body.body,
        type: body.type ?? "manual",
        target_type: body.target_type ?? "all",
        target_user_id: body.target_user_id ?? null,
        // V16: the audience MUST be persisted. Dropping these fields is what
        // silently turned a segment send into a full broadcast.
        target_user_ids: Array.isArray(body.target_user_ids) ? body.target_user_ids : null,
        target_segment_id: typeof body.target_segment_id === "string" ? body.target_segment_id : null,
        deep_link: body.deep_link ?? null,
        image_url: body.image_url ?? null,
        dedupe_key: dedupeKey,

        // Mark as sent immediately. Push delivery is best-effort; in-app
        // visibility (banner, bell badge, notification center, realtime
        // listeners) MUST work even when the user has no FCM token or the
        // token is stale, otherwise the notification is silently dropped.
        status: "sent",
        sent_at: new Date().toISOString(),
      };
      const { data, error } = await admin
        .from("notifications")
        .insert(insert)
        .select("*")
        .single();
      if (error) {
        // 23505 = unique violation on dedupe_key: another concurrent
        // invocation won the race. Treat as success, not as an error.
        if (error.code === "23505" && dedupeKey) {
          const { data: winner } = await admin
            .from("notifications")
            .select("id")
            .eq("dedupe_key", dedupeKey)
            .maybeSingle();
          console.log("[send-notification] lost dedupe race, skipping", dedupeKey);
          return jsonResponse({
            ok: true,
            deduped: true,
            notification_id: winner?.id ?? null,
            dedupe_key: dedupeKey,
          });
        }
        console.error("[send-notification] insert failed", error);
        return jsonResponse({ error: error.message }, { status: 500 });
      }
      notif = data;
      notificationId = notif.id;
    }

    // Ensure the notification is marked as sent before attempting push so
    // realtime listeners can surface it regardless of FCM outcome.
    if (notif.status !== "sent") {
      await admin
        .from("notifications")
        .update({ status: "sent", sent_at: notif.sent_at ?? new Date().toISOString() })
        .eq("id", notif.id);
      notif.status = "sent";
    }

    // ── V16 audience scoping + hard anti-broadcast guard ───────────────
    // `resolveTokenScope` fails closed for any segment send whose audience
    // is missing, malformed or unverifiable. Only an explicit all-users
    // target may reach `broadcast`.
    const scope = resolveTokenScope(notif);
    if (!scope.ok) {
      await admin.from("notifications").update({ status: "failed" }).eq("id", notif.id);
      console.error("[send-notification] audience rejected", scope.error);
      return jsonResponse({ error: scope.error, sent: 0, failed: 0, total: 0 }, { status: scope.status });
    }
    try {
      assertNoSegmentWidening(notif, scope);
    } catch (guardErr) {
      await admin.from("notifications").update({ status: "failed" }).eq("id", notif.id);
      console.error("[send-notification]", (guardErr as Error).message);
      return jsonResponse({ error: (guardErr as Error).message, sent: 0, failed: 0, total: 0 }, { status: 500 });
    }

    // Legitimate zero audience: the notification row stays (in-app value),
    // but zero pushes are attempted. This must never become a broadcast.
    if (scope.scope === "list" && scope.userIds.length === 0) {
      console.log(`[send-notification] zero-audience segment (notif=${notif.id})`);
      return jsonResponse({
        ok: true,
        zero_audience: true,
        notification_id: notif.id,
        sent: 0,
        failed: 0,
        total: 0,
      });
    }

    let tokensQuery = admin
      .from("device_tokens")
      .select("token, user_id")
      .eq("enabled", true);
    if (scope.scope === "user" || scope.scope === "list") {
      tokensQuery = tokensQuery.in("user_id", scope.userIds);
    }

    const { data: tokens, error: tokensErr } = await tokensQuery;
    if (tokensErr) {
      await admin.from("notifications").update({ status: "failed" }).eq("id", notif.id);
      return jsonResponse({ error: tokensErr.message }, { status: 500 });
    }

    console.log(`[send-notification] scope=${scope.scope} sending to ${tokens?.length ?? 0} tokens (notif=${notif.id})`);


    const accessToken = await getGoogleAccessToken(clientEmail, privateKey);

    let sent = 0;
    let failed = 0;
    for (const row of tokens ?? []) {
      const result = await sendFcm(projectId, accessToken, row.token, {
        title: notif.title,
        body: notif.body,
        deep_link: notif.deep_link,
        image_url: notif.image_url,
        type: notif.type,
        notification_id: notif.id,
      });

      const deliveryRow = {
        notification_id: notif.id,
        user_id: row.user_id,
        token: row.token,
        status: result.ok ? "sent" : "failed",
        error: result.ok ? null : result.error,
        sent_at: result.ok ? new Date().toISOString() : null,
      };
      // One delivery row per (notification, user). Multiple device tokens must
      // NOT create multiple rows — the Notification Center joins on this pair
      // and duplicate rows surfaced the same notification several times.
      await admin
        .from("notification_deliveries")
        .upsert(deliveryRow, { onConflict: "notification_id,user_id" });

      if (result.ok) {
        sent++;
      } else {
        failed++;
        console.warn(`[send-notification] token failed: ${result.error}`);
        // Auto-disable permanently-invalid tokens so they don't keep failing.
        if (
          result.error &&
          (result.error.includes("UNREGISTERED") ||
            result.error.includes("INVALID_ARGUMENT") ||
            result.error.includes("registration-token-not-registered"))
        ) {
          await admin.from("device_tokens").update({ enabled: false }).eq("token", row.token);
        }
      }
    }

    // notification.status was already set to 'sent' on insert — push is
    // best-effort and must not flip the row back to 'failed', otherwise the
    // recipient loses the in-app banner / bell badge / center entry.


    console.log(`[send-notification][v2] done notif=${notif.id} sent=${sent} failed=${failed} status=${notif.status}`);

    return jsonResponse({
      ok: true,
      notification_id: notif.id,
      total: (tokens ?? []).length,
      sent,
      failed,
    });
  } catch (err) {
    console.error("[send-notification] error", err);
    return jsonResponse({ error: String((err as Error).message ?? err) }, { status: 500 });
  }
});
