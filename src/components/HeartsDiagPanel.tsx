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
          <span className="font-bold tracking-tight">'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            STOP. DO NOT IMPLEMENT ANY FIX YET.\n\nWe reproduced the Hearts bug AGAIN on physical Android after removing Hearts from applyServerStats.\n\nThe previous fix DID successfully remove Server Stats as the cause.\n\nHowever, the new trace proves a SECOND independent bug inside Cloud Hydration / mergeCloudSave.\n\n==================================================\n\nNEW PHYSICAL DEVICE EVIDENCE\n\n==================================================\n\nBefore Cloud Hydration:\n\nlocalHearts = 5\n\nlocalEffective = 5\n\nCloud fetch returns:\n\ncloudHearts = 2\n\ncloudHeartsAt = 1787497169900\n\nThe reconciliation trace CORRECTLY calculates:\n\ncloudEffective = 5\n\nExact trace:\n\nHEARTS_RECONCILIATION:\n\nlocalHearts: 5\n\nlocalEffective: 5\n\ncloudHearts: 2\n\ncloudEffective: 5\n\nprofileHearts: 5\n\nmergeRule: \"Cloud Hydration\"\n\nThis means BOTH local and cloud represent 5 EFFECTIVE hearts.\n\nBut immediately afterward the application does:\n\nHEARTS_PROFILE_APPLIED:\n\nchosenHearts: 2\n\nchosenHeartsAt: 1787560029468\n\nsource: \"cloud\"\n\nThen persistence performs:\n\nHEARTS_WRITE:\n\nbefore:\n\n  hearts: 5\n\n  heartsAt: 1787559992262\n\nafter:\n\n  hearts: 2\n\n  heartsAt: 1787560029468\n\nResult on the physical device:\n\n5 hearts → 2 hearts\n\nAnd this time the UI remained at 2.\n\n==================================================\n\nCRITICAL FORENSIC QUESTION\n\n==================================================\n\nWhy does Cloud Hydration correctly calculate:\n\ncloudEffective = 5\n\nbut then apply:\n\nchosenHearts = 2\n\nwith a NEW heartsAt?\n\nThis appears to repeat the same conceptual bug we just removed from applyServerStats:\n\nA raw committed heart count is being reapplied with a fresh regeneration anchor.\n\n==================================================\n\nAUDIT mergeCloudSave EXACTLY\n\n==================================================\n\nTrace the complete Hearts branch inside:\n\nmergeCloudSave\n\nand any function it calls, including:\n\ncommitHearts\n\nReport exactly:\n\n1. How `cloudEffective` is calculated.\n\n2. Why `cloudEffective = 5` is NOT the value preserved/applied.\n\n3. Why raw `cloud.hearts = 2` becomes `chosenHearts = 2`.\n\n4. Why `chosenHeartsAt` becomes approximately Date.now()\n\n   instead of preserving cloud.heartsAt.\n\n5. Determine whether mergeCloudSave is calling something equivalent to:\n\ncommitHearts(profile, cloud.hearts, Date.now())\n\nafter already calculating cloudEffective.\n\n6. Determine the correct representation after hydration.\n\nIf Cloud Save contains:\n\nhearts = 2\n\nheartsAt = old timestamp\n\neffective = 5\n\nshould the hydrated profile be represented as:\n\nA)\n\nhearts = 2\n\nheartsAt = original cloud heartsAt\n\nOR\n\nB)\n\nhearts = 5\n\nheartsAt = now / normalized full-heart state\n\nOR another representation.\n\nExplain which representation is compatible with the EXISTING\n\ngetEffectiveHearts architecture and safest for persistence.\n\n7. CRITICAL:\n\nAfter hydration and persistence, re-reading the stored profile must\n\nstill evaluate to 5 effective hearts.\n\nIt must NEVER turn:\n\nraw 2 + old anchor = effective 5\n\ninto:\n\nraw 2 + new anchor = effective 2\n\n==================================================\n\nCHECK THE EARLIER TRACE TOO\n\n==================================================\n\nThe previous physical trace showed Cloud Hydration sometimes restored:\n\nchosenHearts = 2\n\nchosenHeartsAt = OLD cloud anchor\n\nwhich correctly evaluated back to 5.\n\nThe NEW trace instead shows:\n\nchosenHearts = 2\n\nchosenHeartsAt = NEW timestamp\n\nwhich permanently evaluates to 2.\n\nExplain WHY these two Cloud Hydration paths differ.\n\nFind the exact branch/condition responsible.\n\n==================================================\n\nSEPARATE UI BUG FOUND\n\n==================================================\n\nThere is also a serious diagnostic UI regression.\n\nThe physical Android screenshot shows the diagnostic panel rendering\n\na huge block of our implementation PROMPT / instructions directly\n\ninside the application UI.\n\nThis text begins with content similar to:\n\n\"Approved. Implement the minimal safe fix...\"\n\n\"CRITICAL: This is a surgical fix...\"\n\n\"REQUIRED FIX...\"\n\netc.\n\nThis must NEVER be user-visible.\n\nREAD-ONLY audit this separately.\n\nFind exactly:\n\n- where this prompt/instruction text is stored,\n\n- why HeartsDiagPanel renders it,\n\n- whether it was accidentally hardcoded into the component,\n\n- whether it exists in production source/bundle,\n\n- whether any other diagnostic panel or production screen can expose prompts/instructions.\n\nDO NOT FIX THIS YET.\n\n==================================================\n\nDO NOT MODIFY ANYTHING\n\n==================================================\n\nEspecially do not change:\n\n- heart spending\n\n- regeneration formula\n\n- penalties\n\n- purchases\n\n- XP\n\n- Dinars\n\n- Streak\n\n- account isolation\n\n- identity partitions\n\n- auto-push\n\n- database\n\n- Cloud Save schema\n\nREAD-ONLY FORENSIC AUDIT ONLY.\n\n==================================================\n\nFINAL REPORT\n\n==================================================\n\nReturn:\n\nPrevious applyServerStats fix working:\n\nYES/NO\n\nNew physical bug reproduced:\n\nYES/NO\n\nExact Cloud Hydration function/branch causing 5 → 2:\n\n...\n\nWhy cloudEffective=5 becomes chosenHearts=2:\n\n...\n\nWhy heartsAt is replaced with a fresh timestamp:\n\n...\n\nWhy previous Cloud Hydration preserved old heartsAt but this run did not:\n\n...\n\nCorrect safe hydrated representation:\n\n...\n\nCan current Cloud Hydration permanently destroy regenerated Hearts:\n\nYES/NO\n\nSafest minimal fix:\n\n...\n\nRequires DB migration:\n\nYES/NO\n\nRequires regeneration architecture change:\n\nYES/NO\n\n---------------------------------\n\nDIAGNOSTIC TRACE:\n\nPrompt/instruction text present in production UI:\n\nYES/NO\n\nExact source:\n\n...\n\nWhy it is rendered:\n\n...\n\nOther production surfaces affected:\n\n...\n\nSafest removal:\n\n...\n\nDO NOT IMPLEMENT ANYTHING.</span>
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
