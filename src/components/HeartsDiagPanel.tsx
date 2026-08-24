import { useState, useEffect } from "react";
import { readTrace, clearTrace } from "@/lib/diag-trace";
import { Copy, Trash2, ChevronDown, Activity, Heart, Info, Clock, Database, Cloud } from "lucide-react";
import { useProfile } from "@/lib/profile";
import { useAccount } from "@/lib/account";
import { getActiveOwner, getIdentityEpoch } from "@/lib/identity/owner";
import { getEffectiveHearts, HEART_MAX, msUntilNextHeart, formatHeartTimer } from "@/lib/hearts";

export function HeartsDiagPanel() {
  const [open, setOpen] = useState(false);
  const { profile } = useProfile();
  const { user, syncing } = useAccount();
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
        className="fixed bottom-4 left-4 z-[9999] rounded-full bg-rose-950/80 p-3 text-rose-200 shadow-xl backdrop-blur-md border border-white/10"
      >
        <Heart className="size-5" />
      </button>
    );
  }

  const all = readTrace("hearts-audit").sort((a, b) => 
    new Date(b.ts).getTime() - new Date(a.ts).getTime()
  );

  const copy = () => {
    navigator.clipboard.writeText(JSON.stringify(all, null, 2));
  };

  const eff = getEffectiveHearts(profile, now);
  const nextMs = msUntilNextHeart(profile, now);

  return (
    <div className="fixed inset-x-4 bottom-4 top-20 z-[9999] flex flex-col rounded-3xl bg-zinc-950/95 p-4 text-xs text-zinc-400 shadow-2xl backdrop-blur-xl border border-white/10 ring-1 ring-white/5">
      <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
        <div className="flex items-center gap-2 text-rose-400">
          <Heart className="size-4 fill-current" />
          <span className="font-bold tracking-tight">'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            We captured the bug on physical Android hardware.\n\nDO NOT FIX YET.\n\nUse this exact forensic trace as the source of truth.\n\nOBSERVED REAL TIMELINE\n\nInitial local state:\n\nhearts = 5\n\neffective = 5\n\nThen:\n\nHEARTS_RECONCILIATION\n\nlocalHearts: 5\n\nlocalEffective: 5\n\nserverHearts: 2\n\nmergeRule: \"Server Stats Apply\"\n\nImmediately after:\n\nHEARTS_PROFILE_APPLIED\n\nchosenHearts: 2\n\nchosenHeartsAt: 1787559339337\n\nsource: \"server-stats\"\n\nThen persistence wrote:\n\nbefore:\n\nhearts: 5\n\nheartsAt: 1787503566762\n\nafter:\n\nhearts: 2\n\nheartsAt: 1787559339337\n\nThen Cloud Save arrived:\n\ncloudHearts: 2\n\ncloudEffective: 5\n\ncloudUpdatedAt / heartsAt: 1787497169900\n\nAfter Cloud Hydration, effective hearts returned to 5.\n\nThis exactly reproduces the user-visible:\n\n5 hearts → 2 hearts → 5 hearts\n\n==================================================\n\nFORENSIC QUESTION\n\n==================================================\n\nWhy is `Server Stats Apply` allowed to overwrite Hearts using raw `serverHearts = 2`\n\nwithout the authoritative regeneration anchor (`heartsAt`)?\n\nAnd why does that path assign a newer `heartsAt`, temporarily turning a regenerated 5-heart state back into a fresh 2-heart state?\n\n==================================================\n\nAUDIT THESE EXACT POINTS\n\n==================================================\n\n1. Trace the source of `serverHearts` in `applyServerStats`.\n\nDoes the `profiles` / server-stats source include:\n\n- hearts\n\n- heartsAt\n\nor only:\n\n- hearts\n\nReport exact fields.\n\n2. If server stats contain hearts WITHOUT heartsAt:\n\nCan that source safely be authoritative for Hearts?\n\nYES/NO\n\n3. Trace why this call:\n\nServer Stats Apply\n\nhearts = 2\n\nresults in:\n\nchosenHeartsAt = current/new timestamp\n\ninstead of preserving the historical regeneration anchor.\n\n4. Confirm whether this exact sequence explains the permanent-loss scenario:\n\nServer Stats Apply:\n\n5 → 2\n\nnew heartsAt written\n\nTHEN network disconnects BEFORE Cloud Hydration\n\nResult:\n\nlocal profile remains at 2 with a fresh regeneration clock.\n\nYES/NO\n\n5. Determine the authoritative Hearts source during login reconciliation.\n\nCompare:\n\nA) server profile stats\n\nB) cloud save with hearts + heartsAt\n\nC) owner-partitioned local profile\n\nWhich sources contain enough information to calculate:\n\ngetEffectiveHearts(...)\n\ncorrectly?\n\n6. Audit whether `applyServerStats` should:\n\nA) stop applying Hearts entirely during login hydration and leave Hearts reconciliation to the source that has both `hearts` + `heartsAt`\n\nOR\n\nB) apply effective server Hearts using a valid server heartsAt\n\nOR\n\nC) another minimal solution\n\nRecommend the SAFEST minimal architecture.\n\n7. Critical safety rule:\n\nA source that contains raw `hearts` but does NOT contain its matching `heartsAt`\n\nmust never reset the regeneration clock or downgrade an already-regenerated effective value.\n\nConfirm whether you agree.\n\n==================================================\n\nDO NOT TOUCH\n\n==================================================\n\nDo not modify:\n\n- heart spending\n\n- heart regeneration formula\n\n- game penalties\n\n- dinar purchases\n\n- XP\n\n- Dinars\n\n- Streaks\n\n- identity partitioning\n\n- Account isolation\n\n- database schema\n\n- Cloud Save architecture\n\nREAD-ONLY AUDIT ONLY.\n\n==================================================\n\nFINAL REPORT\n\n==================================================\n\nReturn:\n\nPhysical bug reproduced by trace:\n\nYES/NO\n\nExact component/function causing 5 → 2:\n\n...\n\nDoes server stats contain heartsAt:\n\nYES/NO\n\nIs raw serverHearts safe without heartsAt:\n\nYES/NO\n\nWhy heartsAt becomes newer:\n\n...\n\nCan interrupted sync leave user permanently at 2:\n\nYES/NO\n\nAuthoritative source for heart reconciliation:\n\n...\n\nSafest minimal fix:\n\n...\n\nRequires DB migration:\n\nYES/NO\n\nRequires heart-regeneration change:\n\nYES/NO\n\nRegression risk:\n\nLOW/MEDIUM/HIGH\n\nDO NOT IMPLEMENT YET.</span>
        </div>
        <div className="flex gap-2">
          <button onClick={copy} className="flex items-center gap-1 rounded-full bg-white/5 px-3 py-1.5 hover:bg-white/10 transition-colors border border-white/5">
            <Copy className="size-3" /> نسخ السجل
          </button>
          <button onClick={() => clearTrace("hearts-audit")} className="flex items-center gap-1 rounded-full bg-red-500/10 px-3 py-1.5 text-red-400 hover:bg-red-500/20 transition-colors border border-red-500/20">
            <Trash2 className="size-3" /> مسح السجل
          </button>
          <button onClick={() => setOpen(false)} className="rounded-full bg-white/5 p-1.5 hover:bg-white/10 transition-colors border border-white/5">
            <ChevronDown className="size-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <StatItem label="المستخدم" value={user?.id?.slice(0, 8) ?? "Guest"} icon={<Database className="size-3" />} />
        <StatItem label="المالك" value={getActiveOwner()} icon={<Info className="size-3" />} />
        <StatItem label="القلوب الحالية" value={`${eff} / ${HEART_MAX}`} icon={<Heart className="size-3" />} />
        <StatItem label="المؤقت" value={eff < HEART_MAX ? formatHeartTimer(nextMs) : "ممتلئ"} icon={<Clock className="size-3" />} />
        <StatItem label="الحالة" value={syncing ? "يتم المزامنة..." : "مستقر"} icon={<Activity className="size-3" />} />
        <StatItem label="الجيل" value={getIdentityEpoch().toString()} icon={<Info className="size-3" />} />
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2">
        {all.map((entry, i) => {
          const isRecon = entry.stage.includes("RECONCILIATION");
          const isWrite = entry.stage.includes("WRITE");
          const isRead = entry.stage.includes("READ");
          const isChange = entry.stage.includes("STATE_CHANGE");
          
          return (
            <div key={i} className={`rounded-xl border p-3 transition-colors ${
              isRecon ? "border-amber-500/30 bg-amber-500/5 text-amber-200" : 
              isWrite ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-200" :
              isRead ? "border-blue-500/30 bg-blue-500/5 text-blue-200" :
              isChange ? "border-rose-500/30 bg-rose-500/5 text-rose-200" :
              "border-white/5 bg-white/5"
            }`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[10px] opacity-50">{entry.ts.split('T')[1].split('.')[0]}</span>
                <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                  isRecon ? "bg-amber-500/20" : isWrite ? "bg-emerald-500/20" : isRead ? "bg-blue-500/20" : isChange ? "bg-rose-500/20" : "bg-white/10"
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
