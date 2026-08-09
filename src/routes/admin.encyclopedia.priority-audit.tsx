import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { 
  ChevronRight, 
  BarChart3, 
  AlertCircle, 
  CheckCircle2, 
  ExternalLink,
  Search,
  LayoutGrid,
  Info,
  BadgeAlert,
  ImageOff,
  Star
} from "lucide-react";
import { getPriorityAudit } from "@/lib/encyclopedia/priority/engine.functions";
import { AdminGate } from "@/lib/admin-guard";
import { useState, useMemo } from "react";
import { EntityType, ProductionStatus } from "@/lib/encyclopedia/priority/types";

export const Route = createFileRoute("/admin/encyclopedia/priority-audit")({
  head: () => ({
    meta: [
      { title: "تدقيق أولويات الإنتاج البصري — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData({
    queryKey: ["encyclopedia-priority-audit"],
    queryFn: () => getPriorityAudit()
  }),
  component: () => <AdminGate><PriorityAuditPage /></AdminGate>,
});

function PriorityAuditPage() {
  const { data: audit, error, isLoading } = useSuspenseQuery({
    queryKey: ["encyclopedia-priority-audit"],
    queryFn: () => getPriorityAudit()
  });

  // Development Diagnostic
  if (process.env.NODE_ENV === "development") {
    console.log("[PriorityAudit] Raw Result:", audit);
    if (audit) {
      console.log("[PriorityAudit] Distribution:", audit.distribution);
    }
  }

  const [activeTab, setActiveTab] = useState<EntityType | "OVERALL">("OVERALL");
  const [search, setSearch] = useState("");

  const currentList = useMemo(() => {
    if (!audit) return [];
    if (activeTab === "OVERALL") {
      return audit.top25Overall || [];
    }
    return (audit.shortlists && audit.shortlists[activeTab]) || [];
  }, [activeTab, audit]);

  const filteredList = useMemo(() => {
    let list = currentList;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(e => 
        e.titleAr?.toLowerCase().includes(q) || 
        e.slug?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [currentList, search]);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-red-400 p-8 flex flex-col items-center justify-center gap-4">
        <AlertCircle className="size-12" />
        <h2 className="text-xl font-bold">حدث خطأ أثناء تحميل البيانات</h2>
        <pre className="bg-black/50 p-4 rounded text-xs max-w-full overflow-auto">
          {error.message || String(error)}
        </pre>
      </div>
    );
  }

  if (!audit) return null;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-amber-500/20 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-amber-400 text-sm font-medium">
              <Link to="/admin" className="hover:text-amber-300">الإدارة</Link>
              <ChevronRight className="size-3" />
              <span>الموسوعة</span>
            </div>
            <h1 className="text-3xl font-bold text-amber-100 font-display">محرك الأولويات V1</h1>
            <p className="text-slate-400 text-sm max-w-2xl">
              تحليل وتصنيف تلقائي لمدخلات الموسوعة بناءً على أهميتها في مسار اللاعب (Gameplay Critical) والتغطية التاريخية.
            </p>
          </div>
          
          <div className="flex flex-wrap gap-3">
             <div className="bg-slate-900/80 border border-slate-800 rounded-lg px-4 py-2 flex items-center gap-3">
                <BarChart3 className="size-4 text-amber-400" />
                <div className="text-xs">
                   <div className="text-slate-500">منطق التقييم</div>
                   <div className="text-amber-200 font-mono">Additive Deterministic</div>
                </div>
             </div>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
           <StatCard label="شخصيات" value={audit.distribution?.Figure || 0} />
           <StatCard label="أحداث" value={audit.distribution?.Event || 0} />
           <StatCard label="مدن" value={audit.distribution?.City || 0} />
           <StatCard label="معارك" value={audit.distribution?.Battle || 0} />
           <StatCard label="معالم" value={audit.distribution?.Landmark || 0} />
           <StatCard label="دول" value={audit.distribution?.State || 0} />
           <StatCard label="آثار" value={audit.distribution?.Artifact || 0} />
           <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex flex-col justify-center items-center text-center">
              <div className="text-[10px] text-amber-300/70 font-bold uppercase tracking-wider">الإجمالي</div>
              <div className="text-xl font-bold text-amber-400">
                {audit.distribution ? Object.values(audit.distribution).reduce((a, b) => a + (b || 0), 0) : 0}
              </div>
           </div>
        </div>

        {/* Main Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* Sidebar Filters */}
          <aside className="space-y-6">
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest px-2">قوائم الإنتاج</h3>
              <nav className="flex flex-col gap-1">
                <TabButton 
                  active={activeTab === "OVERALL"} 
                  onClick={() => setActiveTab("OVERALL")}
                  icon={<Star className="size-4" />}
                  label="أهم 25 (عام)"
                />
                <div className="h-px bg-slate-800/50 my-1 mx-2" />
                {(["Figure", "Event", "City", "Battle", "Landmark", "State", "Artifact"] as EntityType[]).map(type => (
                  <TabButton 
                    key={type}
                    active={activeTab === type} 
                    onClick={() => setActiveTab(type)}
                    label={getTypeLabel(type)}
                    count={audit.shortlists ? audit.shortlists[type]?.length : 0}
                  />
                ))}
              </nav>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-3">
               <h3 className="flex items-center gap-2 text-sm font-bold text-amber-200">
                  <Info className="size-4" />
                  عن هذا التحليل
               </h3>
               <p className="text-xs text-slate-400 leading-relaxed">
                  يتم احتساب النقاط بناءً على:
               </p>
               <ul className="text-[11px] text-slate-500 space-y-2 list-disc list-inside">
                  <li>متطلب فتح قصة (Mandatory): +50</li>
                  <li>عنصر أساسي في حملة (Core): +40</li>
                  <li>علاقة بقصة (Story): +25</li>
                  <li>علاقة بتحقيق (Inv): +15</li>
                  <li>أهمية منسقة (Curated): +30</li>
               </ul>
               <div className="pt-2 border-t border-slate-800 mt-2">
                  <p className="text-[10px] text-amber-500/70 font-mono">
                    {audit.assessment}
                  </p>
               </div>
            </div>
          </aside>

          {/* List Content */}
          <main className="lg:col-span-3 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
                <input 
                  type="text"
                  placeholder="بحث في القائمة الحالية..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 pr-10 pl-4 text-sm focus:outline-none focus:border-amber-500/50 transition-colors"
                />
              </div>
              <div className="text-xs text-slate-500 whitespace-nowrap">
                عرض {filteredList.length} عنصر
              </div>
            </div>

            <div className="space-y-3">
              {filteredList.map((entity) => (
                <div 
                  key={entity.id}
                  className="group bg-slate-900/40 border border-slate-800/60 rounded-xl p-4 hover:border-amber-500/30 hover:bg-slate-900/60 transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
                          #{entity.rankWithinType} {getTypeLabel(entity.type)}
                        </span>
                        {entity.hasImage && (
                          <span className="bg-emerald-500/10 text-emerald-400 text-[9px] px-1.5 py-0.5 rounded border border-emerald-500/20">
                            يوجد صورة
                          </span>
                        )}
                      </div>
                      <h4 className="text-lg font-bold text-amber-100">{entity.titleAr}</h4>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                        <span className="opacity-60">{entity.slug}</span>
                        {entity.era && <span className="text-amber-500/70">{entity.era}</span>}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-amber-400">{entity.finalScore}</span>
                        <span className="text-[10px] text-slate-500 font-bold uppercase">Points</span>
                      </div>
                      <StatusBadge status={entity.productionStatus} />
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-800/50 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <ScoreStat label="حملات" value={entity.campaignCount} />
                    <ScoreStat label="قصص" value={entity.storyCount} />
                    <ScoreStat label="تحقيقات" value={entity.investigationCount} />
                    <ScoreStat label="متطلبات فتح" value={entity.unlockDependencyCount} />
                  </div>

                  <div className="mt-4 flex items-center justify-between text-[10px]">
                    <div className="flex flex-wrap gap-2">
                       {entity.scoreBreakdown.mandatoryUnlock > 0 && <PointTag label="Gameplay Critical" points={entity.scoreBreakdown.mandatoryUnlock} color="red" />}
                       {entity.scoreBreakdown.coreCampaign > 0 && <PointTag label="Campaign Core" points={entity.scoreBreakdown.coreCampaign} color="amber" />}
                       {entity.scoreBreakdown.curatedImportance > 0 && <PointTag label="Historical Importance" points={entity.scoreBreakdown.curatedImportance} color="blue" />}
                       {entity.scoreBreakdown.crossSystemBonus > 0 && <PointTag label="System Multiplier" points={entity.scoreBreakdown.crossSystemBonus} color="emerald" />}
                    </div>
                    <Link 
                      to="/admin/encyclopedia" 
                      search={{ search: entity.slug } as any}
                      className="text-slate-500 hover:text-amber-400 transition-colors flex items-center gap-1"
                    >
                      تعديل <ExternalLink className="size-3" />
                    </Link>
                  </div>
                </div>
              ))}

              {filteredList.length === 0 && (
                <div className="py-20 text-center space-y-4">
                  <BadgeAlert className="size-12 text-slate-800 mx-auto" />
                  <div className="space-y-1">
                    <h5 className="text-slate-400 font-bold">لا يوجد نتائج</h5>
                    <p className="text-slate-600 text-sm">جرب تغيير معايير البحث أو الفئة.</p>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string, value: number }) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 flex flex-col items-center justify-center text-center">
      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{label}</div>
      <div className="text-xl font-bold text-slate-200">{value}</div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label, count }: { active: boolean, onClick: () => void, icon?: React.ReactNode, label: string, count?: number }) {
  return (
    <button 
      onClick={onClick}
      className={`
        flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all
        ${active 
          ? "bg-amber-500/10 text-amber-200 border border-amber-500/20" 
          : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
        }
      `}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span>{label}</span>
      </div>
      {count !== undefined && <span className="text-[10px] opacity-60">{count}</span>}
    </button>
  );
}

function ScoreStat({ label, value }: { label: string, value: number }) {
  return (
    <div>
      <div className="text-[9px] text-slate-500 uppercase font-bold tracking-tight">{label}</div>
      <div className="text-sm font-bold text-slate-300">{value}</div>
    </div>
  );
}

function PointTag({ label, points, color }: { label: string, points: number, color: "red" | "amber" | "blue" | "emerald" }) {
  const colors = {
    red: "text-red-400 bg-red-400/10 border-red-400/20",
    amber: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    blue: "text-blue-400 bg-blue-400/10 border-blue-400/20",
    emerald: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
  };
  return (
    <span className={`px-2 py-0.5 rounded border text-[9px] font-bold ${colors[color]}`}>
      {label} +{points}
    </span>
  );
}

function StatusBadge({ status }: { status: ProductionStatus }) {
  switch (status) {
    case "READY_FOR_VISUAL_PRODUCTION":
      return (
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400">
          <LayoutGrid className="size-3" /> جاهز للإنتاج
        </span>
      );
    case "HAS_EXISTING_IMAGE":
      return (
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
          <CheckCircle2 className="size-3" /> تم التنفيذ
        </span>
      );
    case "LOW_SIGNAL":
      return (
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 italic">
          <ImageOff className="size-3" /> إشارة ضعيفة
        </span>
      );
    case "NEEDS_MANUAL_PRIORITY_REVIEW":
      return (
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-500">
          <AlertCircle className="size-3" /> مراجعة يدوية
        </span>
      );
    default:
      return null;
  }
}

function getTypeLabel(type: EntityType): string {
  const labels: Record<EntityType, string> = {
    Figure: "شخصية",
    Event: "حدث",
    City: "مدينة",
    Battle: "معركة",
    Landmark: "معلم",
    State: "دولة",
    Artifact: "أثر"
  };
  return labels[type];
}
