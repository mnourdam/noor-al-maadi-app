// Automatic notification engine for Irth.
//
// Runs the retention notification jobs (all reuse `send-notification` so FCM,
// in-app delivery, bell badge, and notification center stay one pipeline):
//   1) today_in_history     — one push per active event matching today's date
//   2) daily_fact           — rotates one enabled fact per day
//   3) comeback_24h         — inactive ≥24h, one reminder per inactivity period
//   4) hearts_full          — hearts regenerated from <5 to 5, one per cycle
//   5) streak_reminder      — streak alive, no activity today (cron near EoD)
//   6) daily_challenge      — published games + no game completed today
//   7) incomplete_campaign  — legacy reminder, kept for parity
//
// Body (optional):  { jobs?: string[], dry_run?: boolean }
//
// Dedup is enforced via the `automatic_notification_runs` table.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

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

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function invokeSendNotification(
  baseUrl: string,
  serviceKey: string,
  payload: Record<string, unknown>,
): Promise<any> {
  const res = await fetch(`${baseUrl}/functions/v1/send-notification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, body: json ?? text };
}

async function alreadyRan(admin: any, jobKey: string, runDate: string): Promise<boolean> {
  const { data } = await admin
    .from("automatic_notification_runs")
    .select("id")
    .eq("job_key", jobKey)
    .eq("run_date", runDate)
    .maybeSingle();
  return !!data;
}

async function recordRun(
  admin: any,
  jobKey: string,
  runDate: string,
  status: string,
  notificationId: string | null,
  details: any,
) {
  await admin.from("automatic_notification_runs").insert({
    job_key: jobKey,
    run_date: runDate,
    status,
    notification_id: notificationId,
    details,
  });
}

// ---------- Job 1: today in history ----------
// Multiple events on the same day are spread across up to 4 slots so
// users don't get every card at once:
//   slot 0 → 08:00 UTC (11:00 GMT+3)
//   slot 1 → 11:00 UTC (14:00 GMT+3)
//   slot 2 → 14:00 UTC (17:00 GMT+3)
//   slot 3 → 17:00 UTC (20:00 GMT+3)
// The slot is derived from the current UTC hour (or an explicit
// `today_in_history_slot` override in the request body — useful for
// tests / dry-runs). Dedup is per (date, slot) so each slot fires at
// most once per day even if the cron retries.
const TIH_SLOT_BY_UTC_HOUR: Record<number, number> = { 8: 0, 11: 1, 14: 2, 17: 3 };
const TIH_MAX_SLOTS = 4;

async function runTodayInHistory(
  admin: any,
  baseUrl: string,
  serviceKey: string,
  dryRun: boolean,
  slotOverride?: number | null,
) {
  const now = new Date();
  const slot = typeof slotOverride === "number"
    ? slotOverride
    : TIH_SLOT_BY_UTC_HOUR[now.getUTCHours()] ?? 0;

  const jobKey = `today_in_history:slot=${slot}`;
  const runDate = todayISODate();
  if (await alreadyRan(admin, jobKey, runDate)) {
    return { job: jobKey, skipped: "already_ran" };
  }

  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();

  // Deterministic order — must match src/lib/today-in-history.ts and the
  // Home carousel so notification slot N always maps to card index N.
  const { data: events, error } = await admin
    .from("today_in_history_events")
    .select("*")
    .eq("enabled", true)
    .eq("month", month)
    .eq("day", day)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) return { job: jobKey, error: error.message };
  if (!events || events.length === 0) return { job: jobKey, skipped: "no_event_for_today" };

  // Cap notifications per day at TIH_MAX_SLOTS. Extra events still appear
  // in the Home carousel — they just don't get their own notification.
  if (slot >= Math.min(events.length, TIH_MAX_SLOTS)) {
    return { job: jobKey, skipped: "no_event_for_slot", slot, total_events: events.length };
  }

  const event = events[slot];
  const summary = String(event.body ?? "").trim();
  const body = summary ? `${event.title} — ${summary}` : String(event.title);
  // Deep link carries the event id so the Home carousel opens on the
  // exact card the user tapped. Encyclopedia deep links are intentionally
  // skipped for now — routing is still being stabilised.
  const deepLink = `/?todayHistoryId=${encodeURIComponent(String(event.id))}#today-in-history`;

  if (dryRun) return { job: jobKey, slot, would_send: { event, deep_link: deepLink } };

  const send = await invokeSendNotification(baseUrl, serviceKey, {
    title: "في مثل هذا اليوم",
    body,
    type: "today_in_history",
    target_type: "all",
    deep_link: deepLink,
  });
  const sends = [{ event_id: event.id, ok: send.ok, notification_id: send.body?.notification_id ?? null }];

  await recordRun(
    admin, jobKey, runDate,
    send.ok ? "success" : "failed",
    send.body?.notification_id ?? null,
    { slot, event_id: event.id, total_events: events.length, send },
  );
  return { job: jobKey, sent: send.ok, slot, event_id: event.id, sends };
}

// ---------- Job 2: daily fact ----------
async function runDailyFact(admin: any, baseUrl: string, serviceKey: string, dryRun: boolean) {
  const jobKey = "daily_fact";
  const runDate = todayISODate();
  if (await alreadyRan(admin, jobKey, runDate)) {
    return { job: jobKey, skipped: "already_ran" };
  }

  // Pick the least-recently-sent enabled fact.
  const { data: facts, error } = await admin
    .from("daily_facts")
    .select("*")
    .eq("enabled", true)
    .order("last_sent_at", { ascending: true, nullsFirst: true })
    .limit(1);

  if (error) return { job: jobKey, error: error.message };
  const fact = facts?.[0];
  if (!fact) return { job: jobKey, skipped: "no_facts_available" };

  if (dryRun) return { job: jobKey, would_send: fact };

  const send = await invokeSendNotification(baseUrl, serviceKey, {
    title: fact.title,
    body: fact.body,
    type: "daily_fact",
    target_type: "all",
    deep_link: fact.deep_link ?? null,
  });

  if (send.ok) {
    await admin.from("daily_facts").update({ last_sent_at: new Date().toISOString() }).eq("id", fact.id);
  }

  await recordRun(
    admin, jobKey, runDate,
    send.ok ? "success" : "failed",
    send.body?.notification_id ?? null,
    { fact_id: fact.id, send },
  );
  return { job: jobKey, sent: send.ok, notification_id: send.body?.notification_id ?? null };
}

// ---------- Job 3: come-back reminder (24h inactivity) ----------
// Sends exactly one reminder per inactivity period. We dedup by storing the
// observed `last_active` in details — when the user returns, last_active
// changes, so a future inactivity period is eligible for a fresh reminder.
async function runComebackReminder(admin: any, baseUrl: string, serviceKey: string, dryRun: boolean) {
  const jobKey = "comeback_24h";
  const runDate = todayISODate();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: profiles, error: pErr } = await admin
    .from("profiles")
    .select("id, last_active")
    .lt("last_active", cutoff)
    .limit(2000);
  if (pErr) return { job: jobKey, error: pErr.message };

  const candidateIds = (profiles ?? []).map((p: any) => p.id);
  if (candidateIds.length === 0) return { job: jobKey, sent: 0, skipped: "no_inactive_users" };

  const { data: tokens } = await admin
    .from("device_tokens")
    .select("user_id")
    .eq("enabled", true)
    .in("user_id", candidateIds);
  const tokenSet = new Set((tokens ?? []).map((t: any) => t.user_id));

  let sent = 0, skipped = 0, failed = 0;
  const results: any[] = [];

  for (const p of profiles ?? []) {
    if (!tokenSet.has(p.id)) { skipped++; continue; }
    const perUserKey = `${jobKey}:${p.id}`;

    // Dedup: if any prior run recorded the same `last_active`, we already
    // notified for this inactivity period.
    const { data: prior } = await admin
      .from("automatic_notification_runs")
      .select("id, details")
      .eq("job_key", perUserKey)
      .order("created_at", { ascending: false })
      .limit(1);
    const lastSeen = prior?.[0]?.details?.last_active ?? null;
    if (lastSeen && lastSeen === p.last_active) { skipped++; continue; }

    if (dryRun) { results.push({ user_id: p.id, would_send: true }); continue; }

    const send = await invokeSendNotification(baseUrl, serviceKey, {
      title: "اشتقنا لعودتك",
      body: "رحلتك التاريخية بانتظارك… أكمل من حيث توقفت واكتشف المزيد.",
      type: "comeback_24h",
      target_type: "user",
      target_user_id: p.id,
      deep_link: "/",
    });

    await recordRun(
      admin, perUserKey, runDate,
      send.ok ? "success" : "failed",
      send.body?.notification_id ?? null,
      { last_active: p.last_active, send },
    );

    if (send.ok) sent++; else failed++;
    results.push({ user_id: p.id, ok: send.ok });
  }

  return { job: jobKey, sent, failed, skipped, total_candidates: profiles?.length ?? 0, results: dryRun ? results : undefined };
}

// ---------- Job 4: incomplete campaign reminder ----------
async function runIncompleteCampaignReminder(admin: any, baseUrl: string, serviceKey: string, dryRun: boolean) {
  const jobKey = "incomplete_campaign";
  const runDate = todayISODate();

  const { data: progress, error } = await admin
    .from("user_campaign_progress")
    .select("user_id, campaign_id, status")
    .in("status", ["unlocked", "in_progress"])
    .limit(2000);
  if (error) return { job: jobKey, error: error.message };

  // Group by user_id+campaign_id, dedup
  const pairs = new Map<string, { user_id: string; campaign_id: string }>();
  for (const row of progress ?? []) {
    const key = `${row.user_id}::${row.campaign_id}`;
    if (!pairs.has(key)) pairs.set(key, { user_id: row.user_id, campaign_id: row.campaign_id });
  }

  let sent = 0, skipped = 0, failed = 0;
  const results: any[] = [];

  for (const { user_id, campaign_id } of pairs.values()) {
    const perKey = `${jobKey}:${user_id}:${campaign_id}`;
    // Dedup within 2 days
    const { data: recentRun } = await admin
      .from("automatic_notification_runs")
      .select("id")
      .eq("job_key", perKey)
      .gte("created_at", new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString())
      .maybeSingle();
    if (recentRun) { skipped++; continue; }

    // Verify the user has at least one enabled token
    const { data: tk } = await admin
      .from("device_tokens")
      .select("token")
      .eq("enabled", true)
      .eq("user_id", user_id)
      .limit(1);
    if (!tk || tk.length === 0) { skipped++; continue; }

    if (dryRun) { results.push({ user_id, campaign_id, would_send: true }); continue; }

    const send = await invokeSendNotification(baseUrl, serviceKey, {
      title: "لم تكتمل رحلتك بعد",
      body: "بقيت خطوات قليلة لإكمال حملتك وفتح مكافآت جديدة.",
      type: "incomplete_campaign",
      target_type: "user",
      target_user_id: user_id,
      deep_link: `/campaigns/${campaign_id}`,
    });

    await recordRun(
      admin, perKey, runDate,
      send.ok ? "success" : "failed",
      send.body?.notification_id ?? null,
      { campaign_id, send },
    );

    if (send.ok) sent++; else failed++;
    results.push({ user_id, campaign_id, ok: send.ok });
  }

  return { job: jobKey, sent, failed, skipped, total_candidates: pairs.size, results: dryRun ? results : undefined };
}

// ---------- Job 5: streak about to break reminder ----------
// Sends a single reminder when:
//   - profile.streak > 0
//   - profile.last_active is before today's UTC date (i.e. no activity today)
//   - user has at least one enabled device token
//   - max one reminder per UTC day per user
async function runStreakReminder(admin: any, baseUrl: string, serviceKey: string, dryRun: boolean) {
  const jobKey = "streak_reminder";
  const runDate = todayISODate();
  const startOfToday = new Date(`${runDate}T00:00:00.000Z`).toISOString();

  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, streak, last_active")
    .gt("streak", 0)
    .lt("last_active", startOfToday)
    .limit(2000);
  if (error) return { job: jobKey, error: error.message };

  const candidateIds = (profiles ?? []).map((p: any) => p.id);
  if (candidateIds.length === 0) return { job: jobKey, sent: 0, skipped: "no_candidates" };

  const { data: tokens } = await admin
    .from("device_tokens")
    .select("user_id")
    .eq("enabled", true)
    .in("user_id", candidateIds);
  const tokenSet = new Set((tokens ?? []).map((t: any) => t.user_id));

  let sent = 0, skipped = 0, failed = 0;
  const results: any[] = [];

  for (const p of profiles ?? []) {
    if (!tokenSet.has(p.id)) { skipped++; continue; }
    const perKey = `${jobKey}:${p.id}`;
    // Hard dedup: not more than once per UTC day per user
    if (await alreadyRan(admin, perKey, runDate)) { skipped++; continue; }

    if (dryRun) { results.push({ user_id: p.id, streak: p.streak, would_send: true }); continue; }

    const send = await invokeSendNotification(baseUrl, serviceKey, {
      title: "لا تدع الحماسة تنطفئ",
      body: "أكمل أي فصل أو تحدٍ اليوم للحفاظ على سلسلة إنجازاتك.",
      type: "streak_reminder",
      target_type: "user",
      target_user_id: p.id,
      deep_link: "/",
    });

    await recordRun(
      admin, perKey, runDate,
      send.ok ? "success" : "failed",
      send.body?.notification_id ?? null,
      { streak: p.streak, send },
    );

    if (send.ok) sent++; else failed++;
    results.push({ user_id: p.id, ok: send.ok });
  }

  return { job: jobKey, sent, failed, skipped, total_candidates: profiles?.length ?? 0, results: dryRun ? results : undefined };
}

// ---------- Job 6: hearts fully regenerated ----------
// Sends AT MOST one notification per depletion→refill cycle, and NEVER on
// initial state (a fresh account that has never lost a heart must not be
// pinged with "قلوبك اكتملت" just because we saw them for the first time).
//
// Cycle bookkeeping is stored in `details.hearts` on the latest run row:
//   • First time we see the user with hearts=5 and no prior row →
//     record a silent watermark {hearts:5}. No notification (initial state).
//   • hearts=5 now AND last recorded value was <5 → cycle closed, SEND.
//   • hearts<5 now AND last recorded value was 5 → depletion begun,
//     record a silent watermark {hearts:<current>} so the next refill is
//     eligible to fire exactly once.
//   • Otherwise → nothing to do.
async function runHeartsFullReminder(admin: any, baseUrl: string, serviceKey: string, dryRun: boolean) {
  const jobKey = "hearts_full";
  const runDate = todayISODate();

  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, hearts")
    .limit(5000);
  if (error) return { job: jobKey, error: error.message };

  const candidateIds = (profiles ?? []).map((p: any) => p.id);
  if (candidateIds.length === 0) return { job: jobKey, sent: 0, skipped: "no_users" };

  const { data: tokens } = await admin
    .from("device_tokens")
    .select("user_id")
    .eq("enabled", true)
    .in("user_id", candidateIds);
  const tokenSet = new Set((tokens ?? []).map((t: any) => t.user_id));

  let sent = 0, skipped = 0, failed = 0, watermarks = 0;
  const results: any[] = [];

  for (const p of profiles ?? []) {
    if (!tokenSet.has(p.id)) { skipped++; continue; }
    const perKey = `${jobKey}:${p.id}`;
    const { data: prior } = await admin
      .from("automatic_notification_runs")
      .select("id, details")
      .eq("job_key", perKey)
      .order("created_at", { ascending: false })
      .limit(1);
    const lastHearts = prior?.[0]?.details?.hearts ?? null;
    const currentHearts = p.hearts ?? 5;
    const fullNow = currentHearts >= 5;

    if (!fullNow) {
      // Transitioning from full → not-full: lay down a watermark so the next
      // refill is eligible to fire exactly once. Also handles the case where
      // the last watermark was already <5: just refresh the value silently.
      if (!dryRun) {
        await recordRun(admin, perKey, runDate, "watermark", null, { hearts: currentHearts });
        watermarks++;
      } else {
        skipped++;
      }
      continue;
    }

    // hearts now full — only notify when we've observed a real depletion cycle.
    // Initial state (no prior row) or already-announced full state must NOT fire.
    if (lastHearts === null) {
      // Initial observation for this user: silent watermark, never notify.
      if (!dryRun) {
        await recordRun(admin, perKey, runDate, "watermark", null, { hearts: 5 });
        watermarks++;
      } else {
        skipped++;
      }
      continue;
    }
    if (lastHearts >= 5) { skipped++; continue; } // already announced this cycle
    if (dryRun) { results.push({ user_id: p.id, would_send: true }); continue; }

    const send = await invokeSendNotification(baseUrl, serviceKey, {
      title: "قلوبك اكتملت",
      body: "أصبحت مستعدًا لمواصلة رحلتك التاريخية.",
      type: "hearts_full",
      target_type: "user",
      target_user_id: p.id,
      deep_link: "/",
    });

    await recordRun(
      admin, perKey, runDate,
      send.ok ? "success" : "failed",
      send.body?.notification_id ?? null,
      { hearts: 5, send },
    );

    if (send.ok) sent++; else failed++;
    results.push({ user_id: p.id, ok: send.ok });
  }

  return { job: jobKey, sent, failed, skipped, watermarks, total_candidates: profiles?.length ?? 0, results: dryRun ? results : undefined };
}

// ---------- Job 7: daily challenge reminder ----------
// Sent at most once per day per user, only when:
//   - at least one published game exists today
//   - the user has NOT recorded any completed game progress today (UTC)
async function runDailyChallengeReminder(admin: any, baseUrl: string, serviceKey: string, dryRun: boolean) {
  const jobKey = "daily_challenge";
  const runDate = todayISODate();
  const startOfToday = new Date(`${runDate}T00:00:00.000Z`).toISOString();

  const { count: publishedGames } = await admin
    .from("games")
    .select("id", { count: "exact", head: true })
    .eq("status", "published");
  if (!publishedGames || publishedGames < 1) {
    return { job: jobKey, sent: 0, skipped: "no_published_games" };
  }

  // Users with at least one enabled token are the candidate pool.
  const { data: tokens } = await admin
    .from("device_tokens")
    .select("user_id")
    .eq("enabled", true);
  const userIds = Array.from(new Set((tokens ?? []).map((t: any) => t.user_id)));
  if (userIds.length === 0) return { job: jobKey, sent: 0, skipped: "no_token_users" };

  // Today's completed-game-progress per user (any completion counts).
  const { data: doneRows } = await admin
    .from("game_progress")
    .select("user_id")
    .eq("completed", true)
    .gte("last_played_at", startOfToday)
    .in("user_id", userIds);
  const finishedToday = new Set((doneRows ?? []).map((r: any) => r.user_id));

  let sent = 0, skipped = 0, failed = 0;
  const results: any[] = [];

  for (const userId of userIds) {
    if (finishedToday.has(userId)) { skipped++; continue; }
    const perKey = `${jobKey}:${userId}`;
    if (await alreadyRan(admin, perKey, runDate)) { skipped++; continue; }
    if (dryRun) { results.push({ user_id: userId, would_send: true }); continue; }

    const send = await invokeSendNotification(baseUrl, serviceKey, {
      title: "تحديات اليوم بانتظارك",
      body: "اكسب المزيد من الخبرة والدنانير بإكمال تحديات اليوم.",
      type: "daily_challenge",
      target_type: "user",
      target_user_id: userId,
      deep_link: "/adventure",
    });

    await recordRun(
      admin, perKey, runDate,
      send.ok ? "success" : "failed",
      send.body?.notification_id ?? null,
      { send },
    );

    if (send.ok) sent++; else failed++;
    results.push({ user_id: userId, ok: send.ok });
  }

  return { job: jobKey, sent, failed, skipped, total_candidates: userIds.length, results: dryRun ? results : undefined };
}

// ---------- Handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({} as any));
    const dryRun: boolean = !!body.dry_run;
    const jobs: string[] = Array.isArray(body.jobs) && body.jobs.length > 0
      ? body.jobs
      : [
          "today_in_history",
          "daily_fact",
          "comeback_24h",
          "hearts_full",
          "streak_reminder",
          "daily_challenge",
          "incomplete_campaign",
        ];

    const results: Record<string, any> = {};

    if (jobs.includes("today_in_history"))
      results.today_in_history = await runTodayInHistory(
        admin, supabaseUrl, serviceKey, dryRun,
        typeof body.today_in_history_slot === "number" ? body.today_in_history_slot : null,
      );
    if (jobs.includes("daily_fact"))
      results.daily_fact = await runDailyFact(admin, supabaseUrl, serviceKey, dryRun);
    if (jobs.includes("comeback_24h") || jobs.includes("inactive_user"))
      results.comeback_24h = await runComebackReminder(admin, supabaseUrl, serviceKey, dryRun);
    if (jobs.includes("hearts_full"))
      results.hearts_full = await runHeartsFullReminder(admin, supabaseUrl, serviceKey, dryRun);
    if (jobs.includes("streak_reminder"))
      results.streak_reminder = await runStreakReminder(admin, supabaseUrl, serviceKey, dryRun);
    if (jobs.includes("daily_challenge"))
      results.daily_challenge = await runDailyChallengeReminder(admin, supabaseUrl, serviceKey, dryRun);
    if (jobs.includes("incomplete_campaign"))
      results.incomplete_campaign = await runIncompleteCampaignReminder(admin, supabaseUrl, serviceKey, dryRun);

    console.log("[run-automatic-notifications] done", JSON.stringify(results));
    return jsonResponse({ ok: true, dry_run: dryRun, results });
  } catch (err) {
    console.error("[run-automatic-notifications] error", err);
    return jsonResponse({ error: String((err as Error).message ?? err) }, { status: 500 });
  }
});

/*
==========================================================================
  CRON SETUP (run once manually in the Supabase SQL editor)
==========================================================================
  Schedule daily at 09:00 UTC:

  select cron.schedule(
    'irth-automatic-notifications-daily',
    '0 9 * * *',
    $$
    select net.http_post(
      url := 'https://incqmwpchlygkzitbxlf.functions.supabase.co/run-automatic-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) as request_id;
    $$
  );

  Or call with the service role key inline (replace YOUR_SERVICE_ROLE_KEY):
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer YOUR_SERVICE_ROLE_KEY'
    )

  pg_cron + pg_net must be enabled (Database → Extensions).
==========================================================================
*/
