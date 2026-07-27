import { Link } from "@tanstack/react-router";
import { Coins, Heart, Star, Stamp } from "lucide-react";

/**
 * The closing report: an official-looking end-of-file record rather than
 * a one-line "solved" note. Correct answers, verdict line, then whatever
 * the SERVER actually granted — never authored reward values.
 */
export function CaseClosedCard({
  caseNumber,
  correct,
  total,
  grant,
  heartGain,
}: {
  caseNumber: string;
  correct: number;
  total: number;
  grant: null | {
    status: "granted" | "already" | "queued" | "refused";
    xp: number;
    dinars: number;
    hearts: number;
  };
  heartGain: number;
}) {
  const perfect = total > 0 && correct >= total;
  const hearts = Math.max(grant?.hearts ?? 0, heartGain);

  return (
    <section className="animate-fade-in overflow-hidden rounded-3xl border border-gold/30 shadow-elegant">
      <div className="case-tab flex items-center gap-2 px-4 py-1.5">
        <span className="font-display text-[10px] font-bold tracking-[0.18em] text-gold" dir="ltr">
          #{caseNumber}
        </span>
        <span className="case-stamp animate-stamp ms-auto inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold">
          <Stamp className="size-3" /> تم الإغلاق
        </span>
      </div>

      <div className="case-sheet p-5">
        <p className="font-display text-center text-lg font-bold text-gold">✓ القضية أُغلقت</p>

        <dl className="mt-4 divide-y divide-white/8 rounded-2xl border border-white/10 bg-background/40">
          <div className="flex items-center justify-between px-4 py-2.5">
            <dt className="text-[11px] text-muted-foreground">الإجابات الصحيحة</dt>
            <dd className="font-display text-[13px] font-bold text-foreground" dir="ltr">
              {correct} / {total}
            </dd>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <dt className="text-[11px] text-muted-foreground">النتيجة</dt>
            <dd className="text-[12px] font-bold text-emerald-300">
              {perfect ? "تم حل القضية بنجاح" : "أُغلقت القضية بنتيجة جزئية"}
            </dd>
          </div>
        </dl>

        {grant?.status === "granted" && (grant.xp || grant.dinars || hearts) ? (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {grant.xp ? (
              <Reward icon={<Star className="size-3.5" />} value={grant.xp} label="نقطة خبرة" />
            ) : null}
            {grant.dinars ? (
              <Reward icon={<Coins className="size-3.5" />} value={grant.dinars} label="دينار" />
            ) : null}
            {hearts ? (
              <Reward icon={<Heart className="size-3.5 text-rose-300" />} value={hearts} label="قلب" />
            ) : null}
          </div>
        ) : null}

        {grant?.status === "already" && (
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            سُجِّل هذا الملف سابقًا — لا مكافآت مكرّرة.
          </p>
        )}
        {grant?.status === "queued" && (
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            تم حفظ الإنجاز — ستُضاف المكافأة عند عودة الاتصال.
          </p>
        )}

        <div className="mt-5 flex flex-col items-center gap-2">
          <Link to="/investigations" className="text-sm font-bold text-gold">قضية أخرى</Link>
          <Link to="/campaigns" className="text-xs text-muted-foreground">العودة للحملات</Link>
        </div>
      </div>
    </section>
  );
}

function Reward({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/8 px-3 py-1 text-[11px] text-gold">
      {icon}
      <span dir="ltr">+{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
