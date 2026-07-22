// ============================================================
// Admin: Persistence Diagnostics (Priority-Zero §7)
// ------------------------------------------------------------
// Read-only surface into the durable write pipeline:
//   • Outbox (queued + failed items with attempt counts)
//   • Dead-letter store (permanent rejections)
//   • Last flush timestamp
//
// Actions:
//   • Force a flush
//   • Clear the dead-letter store for the current user
//
// Non-destructive by default. Admin-gated.
// ============================================================

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AdminGate } from "@/lib/admin-guard";
import { useAccount } from "@/lib/account";
import { peekAll, type OutboxItem } from "@/lib/offline/outbox";
import { flushOutbox, getLastFlushAt } from "@/lib/offline/flush";
import {
  listDeadLetters, clearDeadLetters, type DeadLetter,
} from "@/lib/offline/dead-letter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ANDROID_TARGET_SDK,
  APP_VERSION,
  BACKEND_CONFIG_FINGERPRINT,
  BUILD_SHA,
  BUILD_TARGET,
  BUILD_TIME,
  BUILD_TYPE,
  CAMPAIGN_PROGRESS_RPC_CONTRACT,
  COMPILED_BACKEND_HOST,
  PERSISTENCE_SCHEMA_VERSION,
  TUTORIAL_ONBOARDING_RPC_CONTRACT,
} from "@/lib/build-info";
import { clearTrace, readTrace, type TraceEntry } from "@/lib/diag-trace";
import {
  getReconciliationError,
  getReconciliationState,
  getReconciliationStartedAt,
  getReconciliationTerminalAt,
} from "@/lib/boot/reconciliation";
import {
  readStartupMarks,
  readStartupSummary,
  readOnboardingCounters,
  type StartupMark,
} from "@/lib/boot/startup-timeline";

import { IRTH_FIRST_TIME_TUTORIAL } from "@/lib/tutorial/data";
import { fetchServerCompletion, readCompletionRecord } from "@/lib/tutorial/persistence";
import { getAllEligibilityFlags } from "@/lib/tutorial/eligibility";
import { fetchServerCompletedIds, localCompletedIds } from "@/lib/campaigns/completions";

export const Route = createFileRoute("/admin/persistence-diagnostics")({
  head: () => ({
    meta: [
      { title: "تشخيصات الاستمرارية — إدارة" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <PersistenceDiagnostics />
    </AdminGate>
  ),
});

function PersistenceDiagnostics() {
  const { user, loadingSession } = useAccount();
  const uid = user?.id ?? null;
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [dead, setDead] = useState<DeadLetter[]>([]);
  const [lastFlush, setLastFlush] = useState<number>(0);
  const [flushing, setFlushing] = useState(false);
  const [flushResult, setFlushResult] = useState<string | null>(null);
  const [copyResult, setCopyResult] = useState<string | null>(null);
  const [campaignTrace, setCampaignTrace] = useState<TraceEntry[]>([]);
  const [tutorialTrace, setTutorialTrace] = useState<TraceEntry[]>([]);
  const [localCampaignCompletionCount, setLocalCampaignCompletionCount] = useState(0);
  const [serverCampaignCompletionCount, setServerCampaignCompletionCount] = useState<number | null>(null);
  const [tutorialLocalVersion, setTutorialLocalVersion] = useState<number | null>(null);
  const [tutorialServerVersion, setTutorialServerVersion] = useState<number | null>(null);
  const [tutorialServerError, setTutorialServerError] = useState<string | null>(null);
  const [reconciliation, setReconciliation] = useState(() => ({
    state: getReconciliationState(),
    error: getReconciliationError(),
    startedAt: getReconciliationStartedAt(),
    terminalAt: getReconciliationTerminalAt(),
  }));
  const [startupMarks, setStartupMarks] = useState<StartupMark[]>(() => readStartupMarks());
  const startupSummary = readStartupSummary();
  const onboardingCounters = readOnboardingCounters();


  const refresh = useCallback(async () => {
    setLocalCampaignCompletionCount(localCompletedIds().size);
    setTutorialLocalVersion(readCompletionRecord()?.version ?? null);
    if (!uid) {
      setItems([]);
      setDead([]);
      setServerCampaignCompletionCount(null);
      setTutorialServerVersion(null);
      setTutorialServerError(null);
    } else {
      try { setItems(await peekAll(uid)); } catch { setItems([]); }
      setDead(listDeadLetters(uid));
      try { setServerCampaignCompletionCount((await fetchServerCompletedIds()).size); }
      catch { setServerCampaignCompletionCount(null); }
      try {
        const server = await fetchServerCompletion(IRTH_FIRST_TIME_TUTORIAL.id);
        setTutorialServerVersion(server?.version ?? null);
        setTutorialServerError(null);
      } catch (e) {
        setTutorialServerVersion(null);
        setTutorialServerError(e instanceof Error ? e.message : String(e));
      }
    }
    setLastFlush(getLastFlushAt());
    setCampaignTrace(readTrace("campaign-persistence"));
    setTutorialTrace(readTrace("tutorial"));
    setReconciliation({
      state: getReconciliationState(),
      error: getReconciliationError(),
      startedAt: getReconciliationStartedAt(),
      terminalAt: getReconciliationTerminalAt(),
    });
    setStartupMarks(readStartupMarks());
  }, [uid]);


  useEffect(() => {
    void refresh();
    const onChange = () => { void refresh(); };
    window.addEventListener("irth:outbox:flushed", onChange);
    window.addEventListener("irth:outbox:changed", onChange);
    window.addEventListener("irth:dead-letter:changed", onChange);
    window.addEventListener("irth:reconciliation:changed", onChange);
    window.addEventListener("irth:onboarding:changed", onChange);
    window.addEventListener("irth:campaign-completions:changed", onChange);
    window.addEventListener("irth:campaign-progress:changed", onChange);
    window.addEventListener("irth:startup-timeline:changed", onChange);

    // Gentle poll — 30s. Server RPCs (tutorial completion) are deduped
    // and session-cached, so this only re-reads local state on the tick.
    const t = setInterval(refresh, 30000);

    return () => {
      window.removeEventListener("irth:outbox:flushed", onChange);
      window.removeEventListener("irth:outbox:changed", onChange);
      window.removeEventListener("irth:dead-letter:changed", onChange);
      window.removeEventListener("irth:reconciliation:changed", onChange);
      window.removeEventListener("irth:onboarding:changed", onChange);
      window.removeEventListener("irth:campaign-completions:changed", onChange);
      window.removeEventListener("irth:campaign-progress:changed", onChange);
      clearInterval(t);
    };
  }, [refresh]);

  const doFlush = async () => {
    if (!uid) return;
    setFlushing(true);
    setFlushResult(null);
    try {
      const res = await flushOutbox(uid);
      setFlushResult(`flushed=${res.flushed}, failed=${res.failed}`);
    } catch (e: any) {
      setFlushResult(`error: ${e?.message ?? String(e)}`);
    } finally {
      setFlushing(false);
      await refresh();
    }
  };

  const doClearDeadLetters = () => {
    if (!uid) return;
    clearDeadLetters(uid);
    void refresh();
  };

  const doClearTraces = () => {
    clearTrace("campaign-persistence");
    clearTrace("tutorial");
    setCopyResult(null);
    void refresh();
  };

  const diagnosticPayload = () => {
    const auth = {
      uid,
      providers: providerIdentities(user),
      sessionReady: !loadingSession,
    };
    const tutorialSummary = summarizeTutorialTrace(tutorialTrace);
    return {
      build: buildFields(),
      auth,
      reconciliation: {
        ...reconciliation,
        startedAtIso: reconciliation.startedAt ? new Date(reconciliation.startedAt).toISOString() : null,
        completedAtIso: reconciliation.terminalAt ? new Date(reconciliation.terminalAt).toISOString() : null,
        localCampaignCompletionCount,
        serverCampaignCompletionCount,
      },
      tutorial: {
        requiredVersion: IRTH_FIRST_TIME_TUTORIAL.version,
        localCompletedVersion: tutorialLocalVersion,
        serverCompletedVersion: tutorialServerVersion,
        hydrationState: reconciliation.state,
        hydrationRpcStarted: tutorialSummary.hydrationRpcStarted,
        hydrationRpcResult: tutorialSummary.hydrationRpcResult,
        hydrationRpcError: tutorialServerError,
        autoStartEligibilityEvaluationTime: tutorialSummary.autoStartEligibilityEvaluationTime,
        finalDecision: tutorialSummary.finalDecision,
        eligibilityFlags: getAllEligibilityFlags(),
      },
      outbox: items,
      deadLetter: dead,
      campaignTrace,
      tutorialTrace,
    };
  };

  const doCopyDiagnostics = async () => {
    const text = JSON.stringify(diagnosticPayload(), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopyResult("copied");
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
        setCopyResult("copied");
      } catch (e) {
        setCopyResult(`copy failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  };

  if (!uid) {
    return <div className="p-6 text-sm">Sign in to inspect persistence state.</div>;
  }

  const tutorialSummary = summarizeTutorialTrace(tutorialTrace);
  const authProviders = providerIdentities(user).join(", ") || "none";

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold">تشخيصات الاستمرارية</h1>
        <p className="text-xs text-muted-foreground">
          user_id: <code>{uid}</code> · last flush:{" "}
          {lastFlush ? new Date(lastFlush).toLocaleString() : "never"}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void refresh()}>Refresh</Button>
          <Button size="sm" variant="outline" onClick={doCopyDiagnostics}>Copy diagnostics</Button>
          <Button size="sm" variant="outline" onClick={doClearTraces}>Clear diagnostic logs</Button>
          {copyResult && <span className="self-center text-xs text-muted-foreground">{copyResult}</span>}
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Build</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            <Fact label="Git commit SHA" value={BUILD_SHA} />
            <Fact label="build timestamp" value={BUILD_TIME} />
            <Fact label="app version" value={APP_VERSION} />
            <Fact label="Android target" value={ANDROID_TARGET_SDK} />
            <Fact label="build target" value={BUILD_TARGET} />
            <Fact label="build type" value={BUILD_TYPE} />
            <Fact label="persistence schema version" value={PERSISTENCE_SCHEMA_VERSION} />
            <Fact label="compiled backend host" value={COMPILED_BACKEND_HOST} />
            <Fact label="backend config fingerprint" value={BACKEND_CONFIG_FINGERPRINT} />
            <Fact label="V2 campaign RPC cutover enabled" value={CAMPAIGN_PROGRESS_RPC_CONTRACT === "record_campaign_progress_v2" ? "yes" : "no"} />
            <Fact label="onboarding hydration gate enabled" value="yes" />
            <Fact label="tutorial RPC contract" value={TUTORIAL_ONBOARDING_RPC_CONTRACT} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Auth</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            <Fact label="current auth UID" value={uid} />
            <Fact label="provider identities" value={authProviders} />
            <Fact label="session ready state" value={!loadingSession ? "ready" : "loading"} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Reconciliation</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            <Fact label="current reconciliation state" value={reconciliation.state} />
            <Fact label="reconciliation started_at" value={reconciliation.startedAt ? new Date(reconciliation.startedAt).toLocaleString() : "never"} />
            <Fact label="reconciliation completed_at" value={reconciliation.terminalAt ? new Date(reconciliation.terminalAt).toLocaleString() : "not terminal"} />
            <Fact label="reconciliation error" value={reconciliation.error ?? "none"} />
            <Fact label="local campaign completion count" value={String(localCampaignCompletionCount)} />
            <Fact label="server campaign completion count" value={serverCampaignCompletionCount == null ? "unknown" : String(serverCampaignCompletionCount)} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Tutorial</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            <Fact label="required tutorial version" value={String(IRTH_FIRST_TIME_TUTORIAL.version)} />
            <Fact label="local completed version" value={tutorialLocalVersion == null ? "none" : String(tutorialLocalVersion)} />
            <Fact label="server completed version" value={tutorialServerVersion == null ? "none" : String(tutorialServerVersion)} />
            <Fact label="hydration state" value={reconciliation.state} />
            <Fact label="hydration RPC started" value={tutorialSummary.hydrationRpcStarted ?? "not observed"} />
            <Fact label="hydration RPC result" value={tutorialSummary.hydrationRpcResult ?? tutorialServerError ?? "not observed"} />
            <Fact label="auto-start eligibility evaluation time" value={tutorialSummary.autoStartEligibilityEvaluationTime ?? "not evaluated"} />
            <Fact label="final decision" value={tutorialSummary.finalDecision ?? "wait"} />
          </dl>
          <pre dir="ltr" className="mt-3 max-h-56 overflow-auto rounded border bg-muted/10 p-2 text-left text-[10px]">
            {JSON.stringify(getAllEligibilityFlags(), null, 2)}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Outbox / Dead Letter <Badge variant="secondary">{items.length}</Badge>
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void refresh()}>Refresh</Button>
            <Button size="sm" onClick={doFlush} disabled={flushing}>
              {flushing ? "Retrying…" : "Retry"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {flushResult && (
            <p className="text-xs text-muted-foreground mb-2">{flushResult}</p>
          )}
          <div className="mb-3 grid gap-2 text-xs sm:grid-cols-2">
            <Fact label="pending operations" value={String(items.length)} />
            <Fact label="failed operations" value={String(items.filter((it) => it.attempts >= 3).length + dead.length)} />
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Queue empty ✓</p>
          ) : (
            <ul className="text-xs font-mono space-y-1 max-h-96 overflow-auto">
              {items.map((it) => (
                <li key={it.id} className="border-b py-1">
                  <div><b>{it.kind}</b> — attempts: {it.attempts}</div>
                  <div className="text-muted-foreground truncate">{it.id}</div>
                  <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-muted/10 p-1 text-[10px]">
                    {JSON.stringify(it.payload, null, 2)}
                  </pre>
                  {it.lastError && (
                    <div className="text-destructive truncate">
                      last: {it.lastError}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Dead-letter <Badge variant="destructive">{dead.length}</Badge>
          </CardTitle>
          <Button
            size="sm" variant="outline"
            onClick={doClearDeadLetters}
            disabled={dead.length === 0}
          >
            Clear
          </Button>
        </CardHeader>
        <CardContent>
          {dead.length === 0 ? (
            <p className="text-sm text-muted-foreground">No permanent failures ✓</p>
          ) : (
            <ul className="text-xs font-mono space-y-1 max-h-96 overflow-auto">
              {dead.map((d) => (
                <li key={d.id + d.createdAt} className="border-b py-1">
                  <div><b>{d.kind}</b> — reason: <code>{d.reason}</code></div>
                  <div className="text-muted-foreground truncate">{d.id}</div>
                  <div className="text-muted-foreground">
                    {new Date(d.createdAt).toLocaleString()}
                  </div>
                  <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-muted/10 p-1 text-[10px]">
                    {JSON.stringify(d.payload, null, 2)}
                  </pre>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Campaign Write Trace <Badge variant="secondary">{campaignTrace.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CampaignTraceList entries={campaignTrace} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Runtime Traces <Badge variant="secondary">{campaignTrace.length + tutorialTrace.length}</Badge>
          </CardTitle>
          <Button size="sm" variant="outline" onClick={doClearTraces}>Clear traces</Button>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <TraceList title="Campaign persistence" entries={campaignTrace} />
          <TraceList title="Tutorial decisions" entries={tutorialTrace} />
        </CardContent>
      </Card>
    </div>
  );
}

function buildFields() {
  return {
    gitCommitSha: BUILD_SHA,
    buildTimestamp: BUILD_TIME,
    appVersion: APP_VERSION,
    androidTarget: ANDROID_TARGET_SDK,
    buildTarget: BUILD_TARGET,
    buildType: BUILD_TYPE,
    persistenceSchemaVersion: PERSISTENCE_SCHEMA_VERSION,
    compiledBackendHost: COMPILED_BACKEND_HOST,
    backendConfigFingerprint: BACKEND_CONFIG_FINGERPRINT,
    v2CampaignRpcCutoverEnabled: CAMPAIGN_PROGRESS_RPC_CONTRACT === "record_campaign_progress_v2",
    onboardingHydrationGateEnabled: true,
  };
}

function providerIdentities(user: { app_metadata?: any; identities?: Array<{ provider?: string | null }> } | null): string[] {
  const out = new Set<string>();
  for (const identity of user?.identities ?? []) {
    if (identity?.provider) out.add(identity.provider);
  }
  const provider = user?.app_metadata?.provider;
  if (typeof provider === "string" && provider) out.add(provider);
  return [...out];
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-muted/20 p-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd dir="ltr" className="mt-1 break-all font-mono text-[11px]">{value}</dd>
    </div>
  );
}

function latest(entries: TraceEntry[], predicate: (entry: TraceEntry) => boolean): TraceEntry | null {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (predicate(entries[i]!)) return entries[i]!;
  }
  return null;
}

function summarizeTutorialTrace(entries: TraceEntry[]) {
  const hydrationStart = latest(entries, (e) => e.stage === "get_tutorial_completion-start");
  const hydrationResult = latest(entries, (e) =>
    e.stage === "get_tutorial_completion-result" ||
    e.stage === "get_tutorial_completion-error" ||
    e.stage === "get_tutorial_completion-exception",
  );
  const evaluation = latest(entries, (e) => e.stage === "auto-start-evaluation");
  let finalDecision: string | null = null;
  if (evaluation?.detail) {
    try { finalDecision = JSON.parse(evaluation.detail).decision ?? null; }
    catch { finalDecision = evaluation.detail; }
  }
  return {
    hydrationRpcStarted: hydrationStart?.ts ?? null,
    hydrationRpcResult: hydrationResult ? `${hydrationResult.stage}:${hydrationResult.detail ?? ""}` : null,
    autoStartEligibilityEvaluationTime: evaluation?.ts ?? null,
    finalDecision,
  };
}

function parseDetail(detail?: string): Record<string, unknown> {
  if (!detail) return {};
  try {
    const parsed = JSON.parse(detail);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : { value: detail };
  } catch {
    return { value: detail };
  }
}

function CampaignTraceList({ entries }: { entries: TraceEntry[] }) {
  const rows = entries
    .map((entry, index) => ({ entry, detail: parseDetail(entry.detail), index }))
    .filter((row) => row.detail.campaignId || row.detail.campaign_id || row.entry.detail?.includes("campaignId"))
    .slice()
    .reverse();
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No campaign write trace entries.</p>;
  }
  return (
    <ul dir="ltr" className="max-h-[34rem] space-y-2 overflow-auto text-left font-mono text-[10px]">
      {rows.map(({ entry, detail, index }) => (
        <li key={`${entry.ts}-${entry.stage}-${index}`} className="rounded border bg-muted/10 p-2">
          <div className="text-muted-foreground">{entry.ts}</div>
          <div className="font-semibold">{entry.stage}</div>
          <dl className="mt-2 grid gap-1 sm:grid-cols-2">
            <TraceFact label="campaign id" value={String(detail.campaignId ?? detail.campaign_id ?? "—")} />
            <TraceFact label="chapter id" value={String(detail.chapterId ?? detail.chapter_id ?? "—")} />
            <TraceFact label="operation id" value={String(detail.operationId ?? "—")} />
            <TraceFact label="completed flag sent" value={String(detail.completed ?? (detail.payload as any)?.p_completed ?? "—")} />
            <TraceFact label="score/xp/coins sent" value={traceScore(detail)} />
            <TraceFact label="local optimistic write result" value={formatTraceValue(detail.localOptimisticWriteResult ?? "see local mirror")} />
            <TraceFact label="outbox enqueue result" value={entry.stage.includes("enqueued") ? "ok" : String(detail.outboxEnqueueResult ?? "—")} />
            <TraceFact label="RPC name" value={String(typeof detail.rpc === "string" ? detail.rpc : entry.stage.includes("record_campaign_progress_v2") ? "record_campaign_progress_v2" : "—")} />
            <TraceFact label="RPC start time" value={String(detail.rpcStartedAt ?? (entry.stage.endsWith("start") ? entry.ts : "—"))} />
            <TraceFact label="RPC response" value={formatTraceValue(detail.rpcResponse ?? (typeof detail.rpc === "object" ? detail.rpc : "—"))} />
            <TraceFact label="acknowledged" value={String(detail.acknowledged ?? "—")} />
            <TraceFact label="normalized error" value={String(detail.normalizedError ?? detail.reason ?? "none")} />
            <TraceFact label="local mirror update result" value={String(detail.localMirrorUpdateResult ?? "—")} />
            <TraceFact label="outbox acknowledgement/removal result" value={String(detail.outboxAcknowledgement ?? "—")} />
          </dl>
          <pre className="mt-2 whitespace-pre-wrap break-all rounded bg-background/40 p-2">
            {JSON.stringify(detail, null, 2)}
          </pre>
        </li>
      ))}
    </ul>
  );
}

function formatTraceValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); }
  catch { return String(value); }
}

function traceScore(detail: Record<string, unknown>): string {
  const payload = detail.payload as Record<string, unknown> | undefined;
  const score = detail.score ?? payload?.p_score ?? "—";
  const xp = detail.xpEarned ?? payload?.p_xp_earned ?? "—";
  const coins = detail.coinsEarned ?? payload?.p_coins_earned ?? "—";
  return `score=${score}; xp=${xp}; coins=${coins}`;
}

function TraceFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="break-all">
      <span className="text-muted-foreground">{label}: </span>{value}
    </div>
  );
}

function TraceList({ title, entries }: { title: string; entries: TraceEntry[] }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No trace entries.</p>
      ) : (
        <ul dir="ltr" className="max-h-96 space-y-1 overflow-auto rounded border bg-muted/10 p-2 text-left font-mono text-[10px]">
          {entries.slice().reverse().map((entry, index) => (
            <li key={`${entry.ts}-${entry.stage}-${index}`} className="border-b border-border/50 pb-1 last:border-b-0">
              <div className="text-muted-foreground">{entry.ts}</div>
              <div className="font-semibold">{entry.stage}</div>
              {entry.detail && <div className="break-all text-muted-foreground">{entry.detail}</div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
