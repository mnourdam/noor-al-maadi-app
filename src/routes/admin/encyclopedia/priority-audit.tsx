import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getPriorityAudit } from "@/lib/encyclopedia/priority/engine.functions";
import { AppShell } from "@/components/AppShell";
import { 
  BarChart3, 
  FileSearch, 
  ShieldAlert, 
  CheckCircle2, 
  AlertCircle,
  TrendingUp,
  Box,
  Users,
  Calendar,
  MapPin,
  Swords,
  Landmark,
  Crown,
  History
} from "lucide-react";
import { EntityType } from "@/lib/encyclopedia/priority/types";

export const Route = createFileRoute("/admin/encyclopedia/priority-audit")({
  component: PriorityAuditPage,
});

function PriorityAuditPage() {
  const { data: audit, isLoading, error } = useQuery({
    queryKey: ["encyclopedia-priority-audit"],
    queryFn: () => getPriorityAudit(),
  });

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="text-center">
            <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-gold border-t-transparent mx-auto" />
            <p className="text-muted-foreground">Calculating Priority Engine V1 rankings...</p>
          </div>
        </div>
      </AppShell>
    );
  }

  if (error || !audit) {
    return (
      <AppShell>
        <div className="p-8 text-center text-destructive">
          <ShieldAlert className="mx-auto mb-4 size-12" />
          <h1 className="text-2xl font-bold">Audit Failed</h1>
          <p>{(error as Error)?.message || "Unknown error"}</p>
        </div>
      </AppShell>
    );
  }

  const typeIcons: Record<EntityType, any> = {
    Figure: Users,
    Event: Calendar,
    City: MapPin,
    Battle: Swords,
    Landmark: Landmark,
    State: Crown,
    Artifact: Box
  };

  return (
    <AppShell>
      <div className="container mx-auto p-6 pb-20 space-y-8 text-right" dir="rtl">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Priority Engine V1: Visual Audit</h1>
            <p className="text-muted-foreground mt-1">تقرير الشفافية وترتيب أولويات الإنتاج البصري للموسوعة</p>
          </div>
          <div className="flex items-center gap-3 bg-card border border-border/50 p-3 rounded-xl">
            <CheckCircle2 className="size-5 text-green-500" />
            <div className="text-xs">
              <div className="font-medium text-foreground">حالة المحرك: جاهز</div>
              <div className="text-muted-foreground">خوارزمية V1 مفعلة</div>
            </div>
          </div>
        </header>

        {/* Scoring Logic Explainer */}
        <section className="bg-card/50 border border-border/40 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <History className="size-5 text-gold" />
            <h2 className="text-lg font-bold">منطق توزيع الدرجات (Scoring Logic)</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            تعتمد الأولوية على أهمية الكيان في تجربة اللاعب (Gameplay) وتواجده في الأنظمة المختلفة. يتم احتساب النقاط بشكل تراكمي كالتالي:
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
            {[
              { label: "فتح قصة", score: "+50" },
              { label: "حملة (أساسي)", score: "+40" },
              { label: "حملة (ثانوي)", score: "+15" },
              { label: "قصة/اكتشاف", score: "+25" },
              { label: "تحقيق", score: "+15" },
              { label: "أهمية (أساسية)", score: "+30" },
              { label: "أهمية (كبرى)", score: "+15" },
              { label: "ركيزة تاريخية", score: "+20" }
            ].map((item, i) => (
              <div key={i} className="text-center p-2 rounded-lg bg-background border border-border/30">
                <div className="text-gold font-bold">{item.score}</div>
                <div className="text-[10px] text-muted-foreground whitespace-nowrap">{item.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Distribution Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {(Object.entries(audit.distribution) as [EntityType, number][]).map(([type, count]) => {
            const Icon = typeIcons[type];
            return (
              <div key={type} className="bg-card border border-border/40 p-4 rounded-xl flex flex-col items-center text-center">
                <Icon className="size-5 text-gold/60 mb-2" />
                <div className="text-2xl font-bold">{count}</div>
                <div className="text-xs text-muted-foreground">{type}</div>
              </div>
            );
          })}
        </div>

        {/* Top 25 Overall Missing Images */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-5 text-gold" />
              <h2 className="text-xl font-bold">أعلى 25 كيان بدون صور (Top 25 Production Queue)</h2>
            </div>
            <div className="text-xs text-muted-foreground">مرتبة حسب مجموع النقاط التراكمي</div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border/40 bg-card">
            <table className="w-full text-sm text-right">
              <thead>
                <tr className="bg-muted/50 border-b border-border/40">
                  <th className="p-3 font-bold">الترتيب</th>
                  <th className="p-3 font-bold">الكيان</th>
                  <th className="p-3 font-bold">النوع</th>
                  <th className="p-3 font-bold">الدرجة</th>
                  <th className="p-3 font-bold">تحليل النقاط (حملات | قصص | تحقيقات | أقفال)</th>
                  <th className="p-3 font-bold">الأنظمة</th>
                  <th className="p-3 font-bold">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {audit.top25Overall.map((entity, i) => (
                  <tr key={entity.id} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-mono text-gold/80">#{i + 1}</td>
                    <td className="p-3">
                      <div className="font-bold">{entity.titleAr}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{entity.slug}</div>
                    </td>
                    <td className="p-3 text-xs">{entity.type}</td>
                    <td className="p-3 font-bold text-lg">{entity.finalScore}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {entity.campaignCount} حملة | {entity.storyCount} قصة | {entity.investigationCount} تحقيق | {entity.unlockDependencyCount} قفل
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 justify-end">
                        {Array.from({ length: entity.distinctSystemsCount }).map((_, j) => (
                          <div key={j} className="size-2 rounded-full bg-gold/60" />
                        ))}
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gold/10 text-gold border border-gold/20">
                        {entity.productionStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Shortlists by Type */}
        {Object.entries(audit.shortlists).map(([type, list]) => (
          <section key={type} className="pt-8">
            <div className="flex items-center gap-2 mb-4 border-r-4 border-gold pr-3">
              <h2 className="text-xl font-bold">قائمة {type} (Top 100 بدون صور)</h2>
              <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{list.length} كيان</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {list.slice(0, 20).map((entity) => (
                <div key={entity.id} className="bg-card border border-border/40 p-4 rounded-xl relative overflow-hidden group">
                  <div className="absolute top-0 left-0 bg-gold/10 text-gold text-[10px] px-2 py-1 font-mono">
                    #{entity.rankWithinType}
                  </div>
                  <div className="mt-2 font-bold group-hover:text-gold transition-colors">{entity.titleAr}</div>
                  <div className="text-xs text-muted-foreground font-mono mb-3">{entity.slug}</div>
                  <div className="flex items-center justify-between mt-auto">
                    <div className="text-lg font-bold text-gold/90">{entity.finalScore} <span className="text-[10px] text-muted-foreground font-normal">نقطة</span></div>
                    <div className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                      {entity.distinctSystemsCount} أنظمة
                    </div>
                  </div>
                </div>
              ))}
              {list.length > 20 && (
                <div className="bg-muted/30 border border-dashed border-border/60 p-4 rounded-xl flex items-center justify-center text-muted-foreground italic text-sm">
                  + {list.length - 20} كيان آخر في القائمة...
                </div>
              )}
            </div>
          </section>
        ))}

        {/* Anomalies and Assessment */}
        <footer className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-12 border-t border-border/50">
          <div>
            <h3 className="font-bold mb-3 flex items-center gap-2">
              <AlertCircle className="size-4 text-gold" /> مراجعة خوارزمية V1
            </h3>
            <div className="bg-muted/40 p-4 rounded-xl text-sm leading-relaxed">
              {audit.assessment}
            </div>
          </div>
          <div>
            <h3 className="font-bold mb-3 flex items-center gap-2">
              <FileSearch className="size-4 text-gold" /> تنبيهات التدقيق
            </h3>
            <ul className="space-y-2 text-sm">
              {audit.anomalies.length > 0 ? (
                audit.anomalies.map((a, i) => <li key={i} className="flex gap-2 text-destructive"><span className="text-gold">•</span> {a}</li>)
              ) : (
                <li className="flex gap-2 text-muted-foreground"><CheckCircle2 className="size-4 text-green-500" /> لا توجد شذوذات مكتشفة في البيانات حالياً.</li>
              )}
            </ul>
          </div>
        </footer>
      </div>
    </AppShell>
  );
}
