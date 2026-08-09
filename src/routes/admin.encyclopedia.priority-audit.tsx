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
  Star,
  Zap,
  History,
  ShieldAlert,
  CalendarDays
} from "lucide-react";
import { getPriorityAudit, getBatch01Prompts } from "@/lib/encyclopedia/priority/engine.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminGate } from "@/lib/admin-guard";
import { useState, useMemo } from "react";
import { EntityType, ProductionStatus, EntityPriorityReport } from "@/lib/encyclopedia/priority/types";

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
  const { data: audit, error } = useSuspenseQuery({
    queryKey: ["encyclopedia-priority-audit"],
    queryFn: () => getPriorityAudit()
  });

  const [activeTab, setActiveTab] = useState<EntityType | "OVERALL" | "BATCH_01">("OVERALL");
  const [search, setSearch] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [batchResults, setBatchResults] = useState<any[] | null>(null);
  

  const { data: batchPrompts } = useSuspenseQuery({
    queryKey: ["encyclopedia-batch-01-prompts"],
    queryFn: () => getBatch01Prompts()
  });

  const currentList = useMemo(() => {
    if (!audit) return [];
    if (activeTab === "OVERALL") {
      return audit.top50Overall || [];
    }
    if (activeTab === "BATCH_01") return [];
    return (audit.shortlists && audit.shortlists[activeTab]) || [];
  }, [activeTab, audit]);

  const filteredList = useMemo(() => {
    let list = currentList as EntityPriorityReport[];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((e: EntityPriorityReport) => 
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
            <h1 className="text-3xl font-bold text-amber-100 font-display">محرك الأولويات V2</h1>
            <p className="text-slate-400 text-sm max-w-2xl">
              نظام التقييم التراكمي (CPS): Gameplay Gravity + Historical Visual Importance.
            </p>
          </div>
          
          <div className="flex flex-wrap gap-3">
             <div className="bg-slate-900/80 border border-slate-800 rounded-lg px-4 py-2 flex items-center gap-3">
                <BarChart3 className="size-4 text-amber-400" />
                <div className="text-xs text-left">
                   <div className="text-slate-500">منطق التقييم</div>
                   <div className="text-amber-200 font-mono">CPS Engine V2</div>
                </div>
             </div>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
           <StatCard label="شخصيات" value={audit.distribution?.Figure || 0} color="emerald" />
           <StatCard label="مدن ومعالم" value={(audit.distribution?.City || 0) + (audit.distribution?.Landmark || 0)} color="blue" />
           <StatCard label="أحداث ومعارك" value={(audit.distribution?.Event || 0) + (audit.distribution?.Battle || 0)} color="red" />
           <StatCard label="الكون المؤهل" value={audit.eligibleUniverseCount} color="amber" highlight />
           <StatCard label="المؤرشفة / التحويلات" value={audit.archivedOrRedirectedCount} color="slate" />
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
                  label="أهم 50 (CPS الأعلى)"
                />
                <TabButton 
                  active={activeTab === "BATCH_01"} 
                  onClick={() => setActiveTab("BATCH_01")}
                  icon={<Zap className="size-4 text-red-400" />}
                  label="Batch 01 (AWAITING)"
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
              {activeTab === "BATCH_01" ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-slate-900 border border-red-500/20 p-6 rounded-2xl shadow-xl mb-4">
                    <div className="space-y-1">
                      <h2 className="text-xl font-bold text-red-200 font-display flex items-center gap-2">
                        <AlertCircle className="size-5 text-red-400" />
                        Calibration Batch 01: FAILED
                      </h2>
                      <p className="text-sm text-slate-400">
                        تم إلغاء معايرة الدفعة الأولى بسبب عدم مطابقة الأصول البصرية للمعايير التاريخية المطلوبة.
                      </p>
                    </div>
                    <div className="px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-400 font-bold rounded-lg text-xs">
                      AWAITING_REAL_ASSETS
                    </div>
                  </div>

                  <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-8 text-center space-y-4">
                    <ImageOff className="size-12 text-slate-700 mx-auto opacity-20" />
                    <div className="space-y-2">
                      <h3 className="text-amber-100 font-bold">بانتظار الأصول البصرية الحقيقية</h3>
                      <p className="text-xs text-slate-500 max-w-md mx-auto">
                        تم تنظيف الملفات المؤقتة والبيانات غير الصحيحة. المحرك الآن بانتظار ربط أصول بصرية حقيقية مطابقة للـ Visual DNA المعتمد.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 mt-8">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest px-2">Prompts Checklist (Frozen)</h3>
                    {batchPrompts?.map((p) => (
                      <div key={p.slug} className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="text-sm font-bold text-amber-100">{p.titleAr}</div>
                          <div className="text-[10px] font-mono text-slate-500 uppercase">{p.slug}</div>
                        </div>
                        <div className="flex items-center gap-3">
                           <button 
                             onClick={() => alert(p.prompt)}
                             className="text-[10px] text-amber-500 hover:text-amber-400 font-bold underline"
                           >
                             View Prompt
                           </button>
                           <div className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">
                             PENDING
                           </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredList.map((entity: EntityPriorityReport) => (
                    <div 
                      key={entity.id}
                      className={`group border rounded-xl p-4 transition-all ${
                        entity.canonical.isEligible 
                        ? "bg-slate-900/40 border-slate-800/60 hover:border-amber-500/30 hover:bg-slate-900/60" 
                        : "bg-slate-950 border-red-900/20 opacity-60 grayscale"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <h4 className="text-lg font-bold text-amber-100">{entity.titleAr}</h4>
                          <span className="text-[10px] font-bold text-slate-500 uppercase">
                            #{entity.rankWithinType} {getTypeLabel(entity.type)}
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className="text-2xl font-black text-amber-400">{entity.finalScore}</span>
                          <StatusBadge status={entity.productionStatus} />
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredList.length === 0 && (
                    <div className="py-20 text-center">
                      <BadgeAlert className="size-12 text-slate-800 mx-auto mb-4" />
                      <h5 className="text-slate-400 font-bold">لا يوجد نتائج</h5>
                    </div>
                  )}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color = "amber", highlight = false }: { label: string, value: number, color?: string, highlight?: boolean }) {
  const colorMap: Record<string, string> = {
    amber: "border-amber-500/20 text-amber-400",
    emerald: "border-emerald-500/20 text-emerald-400",
    blue: "border-blue-500/20 text-blue-400",
    red: "border-red-500/20 text-red-400",
    slate: "border-slate-800 text-slate-400"
  };
  return (
    <div className={`bg-slate-900/50 border rounded-xl p-3 flex flex-col items-center justify-center text-center ${colorMap[color]} ${highlight ? 'bg-amber-500/5' : ''}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label, count }: { active: boolean, onClick: () => void, icon?: React.ReactNode, label: string, count?: number }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
        active 
        ? "bg-amber-500/10 text-amber-200 border border-amber-500/20" 
        : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
      }`}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span>{label}</span>
      </div>
      {count !== undefined && <span className="text-[10px] opacity-60">{count}</span>}
    </button>
  );
}

function StatusBadge({ status }: { status: ProductionStatus }) {
  switch (status) {
    case "READY_FOR_VISUAL_PRODUCTION":
      return <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1"><Zap className="size-3" /> جاهز</span>;
    case "HAS_EXISTING_IMAGE":
      return <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1"><CheckCircle2 className="size-3" /> منفذ</span>;
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
