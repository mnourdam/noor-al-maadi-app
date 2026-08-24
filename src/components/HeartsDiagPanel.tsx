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
          <span className="font-bold tracking-tight">'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            Approved.\n\nImplement the minimal safe fix identified by the physical-device forensic trace.\n\nCRITICAL:\n\nThis is a surgical fix.\n\nDo NOT refactor the Hearts system.\n\nDo NOT redesign reconciliation.\n\nDo NOT modify unrelated account/profile logic.\n\n==================================================\n\nREQUIRED FIX\n\n==================================================\n\nIn `src/lib/profile.tsx`:\n\n`applyServerStats` must NO LONGER apply or overwrite Hearts.\n\nReason:\n\nThe `profiles` server-stats source contains raw `hearts`\n\nbut does NOT contain the corresponding `heartsAt`.\n\nTherefore it does not contain enough information to calculate\n\nthe player's effective regenerated Hearts safely.\n\nHearts reconciliation during login must remain owned by the\n\nCloud Save path / `mergeCloudSave`, which has BOTH:\n\n- hearts\n\n- heartsAt\n\nand can therefore correctly use the existing regeneration logic.\n\n==================================================\n\nCRITICAL SAFETY REQUIREMENTS\n\n==================================================\n\n1. Remove ONLY Hearts application from `applyServerStats`.\n\n2. Preserve server-stat application for all unrelated stats exactly\n\nas currently intended.\n\nDo not change behavior for:\n\n- XP / points\n\n- Dinars\n\n- Streak\n\n- other profile stats\n\n3. Do NOT modify:\n\n- `getEffectiveHearts`\n\n- `commitHearts`\n\n- regeneration intervals/formula\n\n- heart spending\n\n- game penalties\n\n- Dinar heart purchases\n\n- Story/Campaign/Investigation rewards\n\n- identity partitioning\n\n- account isolation\n\n- auto-push safety\n\n- reconciliation terminal states\n\n- Cloud Save architecture\n\n- database schema\n\n- RLS\n\n- offline architecture\n\n4. `mergeCloudSave` must remain responsible for applying the\n\nauthoritative Hearts state during authenticated reconciliation.\n\n5. Local regenerated Hearts must NOT be downgraded by raw\n\n`profiles.hearts` during login.\n\n6. Do NOT introduce `Math.max(raw hearts)` as a workaround.\n\nHearts are time-dependent state.\n\nThe correct comparison must continue to respect `heartsAt`\n\nthrough the existing effective-Hearts architecture.\n\n==================================================\n\nINTERRUPTED SYNC SAFETY\n\n==================================================\n\nAfter the fix, verify this exact scenario:\n\nLocal:\n\nhearts = 5 effective\n\nprofiles:\n\nraw hearts = 2\n\nNO heartsAt\n\nCloud Save:\n\nhearts = 2\n\nold heartsAt\n\neffective hearts = 5\n\nExpected:\n\n- `applyServerStats` does NOT change Hearts.\n\n- UI remains at 5.\n\n- persistence-effect does NOT write 5 → 2 because of server stats.\n\n- Cloud Save arrives and reconciles Hearts normally.\n\n- final effective Hearts = 5.\n\nNow repeat conceptually with network interruption BEFORE Cloud Save arrives:\n\nExpected:\n\n- Local Hearts remain 5 effective.\n\n- No fresh heartsAt is created from raw server stats.\n\n- User does NOT lose regenerated Hearts.\n\n==================================================\n\nDIAGNOSTIC TRACE\n\n==================================================\n\nKEEP the current Hearts diagnostic instrumentation temporarily.\n\nWe need it for one final physical Android verification.\n\nAfter implementation, the diagnostic trace should allow us to prove:\n\nNO event sequence exists like:\n\nHEARTS_RECONCILIATION\n\nlocalEffective: 5\n\nserverHearts: 2\n\n→\n\nHEARTS_PROFILE_APPLIED\n\nchosenHearts: 2\n\nsource: server-stats\n\n→\n\nHEARTS_WRITE\n\nbefore: 5\n\nafter: 2\n\nThat path must be gone.\n\nDo NOT remove the Hearts diagnostic panel yet.\n\n==================================================\n\nPOST-IMPLEMENTATION AUDIT\n\n==================================================\n\nReturn:\n\nFiles changed:\n\n...\n\n`applyServerStats` still applies Hearts:\n\nYES/NO\n\nCloud Save owns authenticated Hearts reconciliation:\n\nYES/NO\n\nCan raw profiles.hearts reset heartsAt:\n\nYES/NO\n\nCan Server Stats cause 5 → 2 anymore:\n\nYES/NO\n\nXP behavior changed:\n\nYES/NO\n\nDinars behavior changed:\n\nYES/NO\n\nStreak behavior changed:\n\nYES/NO\n\nHeart spending changed:\n\nYES/NO\n\nHeart regeneration changed:\n\nYES/NO\n\nAccount isolation changed:\n\nYES/NO\n\nAuto-push safety changed:\n\nYES/NO\n\nDatabase/schema changed:\n\nYES/NO\n\nDiagnostic panel retained:\n\nYES/NO\n\nTypecheck:\n\nPASS/FAIL\n\nProduction Android web build:\n\nPASS/FAIL\n\nDo not make any additional improvements beyond this fix.</span>
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
