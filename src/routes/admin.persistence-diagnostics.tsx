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
  const { user } = useAccount();
  const uid = user?.id ?? null;
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [dead, setDead] = useState<DeadLetter[]>([]);
  const [lastFlush, setLastFlush] = useState<number>(0);
  const [flushing, setFlushing] = useState(false);
  const [flushResult, setFlushResult] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!uid) { setItems([]); setDead([]); return; }
    try { setItems(await peekAll(uid)); } catch { setItems([]); }
    setDead(listDeadLetters(uid));
    setLastFlush(getLastFlushAt());
  }, [uid]);

  useEffect(() => {
    void refresh();
    const onChange = () => { void refresh(); };
    window.addEventListener("irth:outbox:flushed", onChange);
    window.addEventListener("irth:dead-letter:changed", onChange);
    const t = setInterval(refresh, 5000);
    return () => {
      window.removeEventListener("irth:outbox:flushed", onChange);
      window.removeEventListener("irth:dead-letter:changed", onChange);
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

  if (!uid) {
    return <div className="p-6 text-sm">Sign in to inspect persistence state.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">تشخيصات الاستمرارية</h1>
        <p className="text-xs text-muted-foreground">
          user_id: <code>{uid}</code> · last flush:{" "}
          {lastFlush ? new Date(lastFlush).toLocaleString() : "never"}
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Outbox <Badge variant="secondary">{items.length}</Badge>
          </CardTitle>
          <Button size="sm" onClick={doFlush} disabled={flushing}>
            {flushing ? "Flushing…" : "Flush now"}
          </Button>
        </CardHeader>
        <CardContent>
          {flushResult && (
            <p className="text-xs text-muted-foreground mb-2">{flushResult}</p>
          )}
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Queue empty ✓</p>
          ) : (
            <ul className="text-xs font-mono space-y-1 max-h-96 overflow-auto">
              {items.map((it) => (
                <li key={it.id} className="border-b py-1">
                  <div><b>{it.kind}</b> — attempts: {it.attempts}</div>
                  <div className="text-muted-foreground truncate">{it.id}</div>
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
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
