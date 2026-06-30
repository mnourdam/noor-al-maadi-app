/**
 * Delivery analytics panel — reads aggregated stats for one notification
 * via the admin_notification_stats RPC.
 */

import { useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface DeliveryStats {
  total_recipients: number;
  delivered: number;
  failed: number;
  opened: number;
  read: number;
  clicks: number;
  open_rate: number;
  click_through_rate: number;
  created_at: string | null;
  sent_at: string | null;
  scheduled_at: string | null;
  status: string;
}

export function DeliveryStatsPanel({ notificationId }: { notificationId: string }) {
  const [stats, setStats] = useState<DeliveryStats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data, error } = await supabase.rpc("admin_notification_stats" as never, {
        p_notification_id: notificationId,
      } as never);
      if (error) throw error;
      setStats(data as unknown as DeliveryStats);
    } catch (e) {
      setErr((e as Error).message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [notificationId]);

  if (loading && !stats) return <div className="p-4 text-xs text-muted-foreground">جارٍ التحميل…</div>;
  if (err) return <div className="p-4 text-xs text-destructive">{err}</div>;
  if (!stats) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="inline-flex items-center gap-2 text-sm font-semibold">
          <Activity className="size-4" /> إحصاءات التسليم
        </h4>
        <button
          onClick={load}
          className="inline-flex items-center gap-1 rounded border border-input px-2 py-1 text-[11px] hover:bg-accent"
        >
          <RefreshCw className="size-3" /> تحديث
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="المستلمون" value={stats.total_recipients} />
        <Stat label="تم التسليم" value={stats.delivered} accent="text-emerald-300" />
        <Stat label="فشل" value={stats.failed} accent="text-rose-300" />
        <Stat label="مفتوحة" value={stats.opened} accent="text-amber-300" />
        <Stat label="مقروءة" value={stats.read} />
        <Stat label="نقرات" value={stats.clicks} />
        <Stat label="نسبة الفتح" value={`${stats.open_rate}%`} />
        <Stat label="نسبة النقر" value={`${stats.click_through_rate}%`} />
      </div>
      <div className="space-y-0.5 text-[11px] text-muted-foreground">
        <div>أُنشئ: {fmt(stats.created_at)}</div>
        <div>أُرسل: {fmt(stats.sent_at)}</div>
        {stats.scheduled_at && <div>مجدول: {fmt(stats.scheduled_at)}</div>}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className={`font-mono text-base font-bold ${accent ?? ""}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("ar"); }
  catch { return iso; }
}
