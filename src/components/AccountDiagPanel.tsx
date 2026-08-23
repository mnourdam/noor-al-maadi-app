import { useState } from "react";
import { readTrace, clearTrace } from "@/lib/diag-trace";
import { Copy, Trash2, ChevronDown, ChevronRight, Activity, Database, ShieldAlert } from "lucide-react";

export function AccountDiagPanel() {
  const [open, setOpen] = useState(false);
  
  if (!open) {
    return (
      <button 
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-[9999] rounded-full bg-black/80 p-3 text-gold/50 shadow-xl backdrop-blur-md border border-white/10"
      >
        <Activity className="size-5" />
      </button>
    );
  }

  const logs = readTrace("logout-audit");
  const authLogs = readTrace("native-auth");
  const pkceLogs = readTrace("pkce-audit");
  
  const all = [...logs, ...authLogs, ...pkceLogs].sort((a, b) => 
    new Date(b.ts).getTime() - new Date(a.ts).getTime()
  );

  const copy = () => {
    navigator.clipboard.writeText(JSON.stringify(all, null, 2));
  };

  return (
    <div className="fixed inset-x-4 bottom-4 top-20 z-[9999] flex flex-col rounded-3xl bg-zinc-950/95 p-4 text-xs text-zinc-400 shadow-2xl backdrop-blur-xl border border-white/10 ring-1 ring-white/5">
      <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
        <div className="flex items-center gap-2 text-gold">
          <ShieldAlert className="size-4" />
          <span className="font-bold tracking-tight">IDENTITY FORENSICS V13</span>
        </div>
        <div className="flex gap-2">
          <button onClick={copy} className="flex items-center gap-1 rounded-full bg-white/5 px-3 py-1.5 hover:bg-white/10 transition-colors border border-white/5">
            <Copy className="size-3" /> نسخ السجل
          </button>
          <button onClick={() => clearTrace("logout-audit")} className="flex items-center gap-1 rounded-full bg-red-500/10 px-3 py-1.5 text-red-400 hover:bg-red-500/20 transition-colors border border-red-500/20">
            <Trash2 className="size-3" /> مسح
          </button>
          <button onClick={() => setOpen(false)} className="rounded-full bg-white/5 p-1.5 hover:bg-white/10 transition-colors border border-white/5">
            <ChevronDown className="size-4" />
          </button>
        </div>
      </div>
      
      <div className="mb-4 rounded-xl border border-gold/30 bg-gold/5 p-3 text-[10px] text-gold/90 leading-relaxed whitespace-pre-wrap">
        {`V13 — FINAL REMAINING ACCOUNT ISOLATION BUG: 5 GUEST ACHIEVEMENTS

Physical Android verification:
CAMPAIGNS: PASS
INVESTIGATIONS: PASS
PKCE: PASS

ONLY REMAINING BUG — 5 GUEST ACHIEVEMENTS
Status: IMPLEMENTED Source-level fix in achievements/v2/engine.ts (resetCanonicalInputs)
Reconciliation Reason: doCycle:historical_reconciliation satisfied IDs ach_campaign_1, 3, 5, 10, 20 due to stale module-level inputs.`}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2">

        {all.map((entry, i) => {
          const isPollution = entry.stage.includes("POLLUTION") || entry.stage.includes("QUARANTINED") || entry.stage.includes("SANITIZED");
          const isWrite = entry.stage.includes("WRITE");
          const isRead = entry.stage.includes("READ") || entry.stage.includes("HYDRATION") || entry.stage.includes("SOURCE");
          
          return (
            <div key={i} className={`rounded-xl border p-3 transition-colors ${
              isPollution ? "border-red-500/30 bg-red-500/5 text-red-200" : 
              isWrite ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-200" :
              isRead ? "border-blue-500/30 bg-blue-500/5 text-blue-200" :
              "border-white/5 bg-white/5"
            }`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[10px] opacity-50">{entry.ts.split('T')[1].split('.')[0]}</span>
                <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                  isPollution ? "bg-red-500/20" : isWrite ? "bg-emerald-500/20" : isRead ? "bg-blue-500/20" : "bg-white/10"
                }`}>
                  {entry.stage}
                </span>
              </div>
              {entry.detail && (
                <div className="mt-1 font-mono text-[10px] leading-relaxed break-all opacity-90 whitespace-pre-wrap">
                  {entry.detail}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
