import { useState, useEffect } from "react";
import { readTrace, clearTrace } from "@/lib/diag-trace";
import { Copy, Trash2, ChevronDown, Activity, Database, AlertCircle, Clock, Zap } from "lucide-react";
import { getActiveOwner, getIdentityEpoch } from "@/lib/identity/owner";
import { getReconciliationState } from "@/lib/boot/reconciliation";

export function AccountDiagPanel() {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open]);

  if (!open) {
    return (
      <button 
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-[9999] rounded-full bg-zinc-900/80 p-3 text-gold/60 shadow-xl backdrop-blur-md border border-white/10"
      >
        <Activity className="size-5" />
      </button>
    );
  }

  const logs = readTrace("sync-forensics");
  const all = [...logs].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  const copy = () => {
    const switchEvents = all.filter(e => e.stage.includes("SWITCH") || e.stage.includes("SYNC") || e.stage.includes("HOME"));
    const switchStartTime = all.find(e => e.stage === "ACCOUNT_SWITCH_REQUESTED")?.ts;
    
    let summary = "=== ACCOUNT SYNC FORENSICS ===\n\n";
    summary += `Owner: ${owner}\n`;
    summary += `Reconciliation: ${reco}\n\n`;
    summary += JSON.stringify(all, null, 2);

    navigator.clipboard.writeText(summary);
  };

  const owner = getActiveOwner();
  const reco = getReconciliationState();

  return (
    <div className="fixed inset-x-4 bottom-4 top-20 z-[9999] flex flex-col rounded-3xl bg-zinc-950/95 p-4 text-xs text-zinc-400 shadow-2xl backdrop-blur-xl border border-white/10 ring-1 ring-white/5">
      <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
        <div className="flex items-center gap-2 text-gold">
          <Activity className="size-4" />
          <span className="font-bold tracking-tight">V13 — POST-OPTIMIZATION RESIDUAL PERFORMANCE AUDIT</span>
        </div>
        <div className="flex gap-2">
          <button onClick={copy} className="flex items-center gap-1 rounded-full bg-white/5 px-3 py-1.5 hover:bg-white/10 transition-colors border border-white/5">
            <Copy className="size-3" /> نسخ
          </button>
          <button onClick={() => clearTrace("sync-forensics")} className="flex items-center gap-1 rounded-full bg-red-500/10 px-3 py-1.5 text-red-400 hover:bg-red-500/20 transition-colors border border-red-500/20">
            <Trash2 className="size-3" /> مسح
          </button>
          <button onClick={() => setOpen(false)} className="rounded-full bg-white/5 p-1.5 hover:bg-white/10 transition-colors border border-white/5">
            <ChevronDown className="size-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <StatItem label="المالك" value={owner} icon={<Database className="size-3" />} />
        <StatItem label="حالة المزامنة" value={reco} icon={<Activity className="size-3" />} />
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2">
        {all.map((entry, i) => (
          <div key={i} className="rounded-lg border border-white/5 bg-white/5 p-2 font-mono text-[9px]">
            <div className="flex justify-between opacity-50 mb-1">
              <span>{entry.ts.split('T')[1].slice(0, 8)}</span>
              <span className="uppercase">{entry.stage}</span>
            </div>
            <div className="break-all">{entry.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatItem({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/5 p-2 border border-white/5">
      <div className="flex items-center gap-1.5 text-zinc-500 mb-0.5">
        {icon}
        <span className="text-[9px] uppercase tracking-wider font-bold">{label}</span>
      </div>
      <div className="font-mono text-zinc-200 truncate">{value}</div>
    </div>
  );
}
