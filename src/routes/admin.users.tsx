import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Users, Search, Download, RefreshCw, ShieldCheck, ShieldAlert, ShieldOff, X, Coins, Sparkles, UserPlus, BadgeCheck } from "lucide-react";
import { AdminGate, useAdminGuard } from "@/lib/admin-guard";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { createTeamUser } from "@/lib/teamUsers.functions";
import {
  adminListUsers,
  adminUserDetail,
  adminAdjustBalance,
  adminSetAccountStatus,
  adminAssignRole,
  adminRevokeRole,
  buildUsersCsv,
  downloadCsv,
  type AdminUserRow,
  type AdminUserDetail,
  type UserFilter,
  type AccountStatus,
  type AppRole,
} from "@/lib/adminUsers";


export const Route = createFileRoute("/admin/users")({
  head: () => ({
    meta: [
      { title: "إدارة المستخدمين — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <AdminUsers />
    </AdminGate>
  ),
});

const FILTERS: Array<{ key: UserFilter; label: string }> = [
  { key: "", label: "الكل" },
  { key: "active", label: "نشط" },
  { key: "suspended", label: "موقوف" },
  { key: "disabled", label: "معطّل" },
  { key: "guest", label: "ضيف" },
  { key: "registered", label: "مسجّل" },
  { key: "editor", label: "محرّر" },
  { key: "admin", label: "مشرف" },
  { key: "has_referrals", label: "لديه إحالات" },
  { key: "no_referrals", label: "بدون إحالات" },
];

const ROLE_LABEL: Record<AppRole, string> = {
  owner: "مالك", admin: "مشرف", editor: "محرّر", player: "لاعب",
};


const PAGE_SIZE = 50;

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleString("en-GB", { hour12: false });
  } catch {
    return s;
  }
}

function StatusBadge({ status }: { status: AccountStatus }) {
  const map: Record<AccountStatus, string> = {
    active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    suspended: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    disabled: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  };
  const labels: Record<AccountStatus, string> = {
    active: "نشط", suspended: "موقوف", disabled: "معطّل",
  };
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-[11px] ${map[status]}`}>
      {labels[status]}
    </span>
  );
}

function TypeBadge({ t }: { t: string }) {
  const map: Record<string, string> = {
    admin: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    editor: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    registered: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    guest: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  };
  const labels: Record<string, string> = { admin: "مشرف", editor: "محرّر", registered: "مسجّل", guest: "ضيف" };
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-[11px] ${map[t] || map.guest}`}>
      {labels[t] ?? t}
    </span>
  );
}

function RolesChips({ roles }: { roles: string[] | undefined }) {
  if (!roles || roles.length === 0) return <span className="text-[11px] text-slate-500">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <span key={r} className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-200">
          {ROLE_LABEL[r as AppRole] ?? r}
        </span>
      ))}
    </div>
  );
}


function AdminUsers() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<UserFilter>("");
  const [minLevel, setMinLevel] = useState<string>("");
  const [maxLevel, setMaxLevel] = useState<string>("");
  const [joinedAfter, setJoinedAfter] = useState("");
  const [joinedBefore, setJoinedBefore] = useState("");
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const { caps } = useAdminGuard();
  const isManager = caps.is_manager;


  const filters = useMemo(
    () => ({
      search: search.trim() || undefined,
      filter,
      minLevel: minLevel ? Number(minLevel) : null,
      maxLevel: maxLevel ? Number(maxLevel) : null,
      joinedAfter: joinedAfter ? new Date(joinedAfter).toISOString() : null,
      joinedBefore: joinedBefore ? new Date(joinedBefore).toISOString() : null,
      limit: PAGE_SIZE,
      offset,
    }),
    [search, filter, minLevel, maxLevel, joinedAfter, joinedBefore, offset],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    adminListUsers(filters)
      .then((r) => {
        if (!alive) return;
        setRows(r.rows);
        setTotal(r.total);
      })
      .catch((e: any) => { if (alive) setError(e?.message ?? String(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [filters, reloadKey]);

  // Reset offset whenever filters change.
  useEffect(() => { setOffset(0); }, [search, filter, minLevel, maxLevel, joinedAfter, joinedBefore]);

  async function handleExportCsv() {
    // Pull a bigger slice (capped at 500 server-side).
    const data = await adminListUsers({ ...filters, limit: 500, offset: 0 });
    downloadCsv(`irth-users-${new Date().toISOString().slice(0, 10)}.csv`, buildUsersCsv(data.rows));
  }

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + rows.length, total);

  return (
    <AdminLayout
      title="إدارة المستخدمين"
      subtitle="قائمة لاعبي إرث — بحث، تصفية، وإجراءات إدارية موثّقة."
      breadcrumbs={[{ label: "المستخدمون" }]}
      actions={
        <>
          <button onClick={() => setReloadKey((k) => k + 1)} className="inline-flex items-center gap-1 rounded border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800">
            <RefreshCw className="h-4 w-4" /> تحديث
          </button>
          {isManager && (
            <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-200 hover:bg-emerald-500/20">
              <UserPlus className="h-4 w-4" /> إضافة مستخدم
            </button>
          )}
          {isManager && (
            <button onClick={handleExportCsv} className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-500/20">
              <Download className="h-4 w-4" /> CSV
            </button>
          )}
        </>

      }
    >
      <div className="mx-auto max-w-7xl space-y-6">


        <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative grow min-w-[240px]">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو اسم المستخدم أو البريد"
                className="w-full rounded border border-slate-700 bg-slate-950/60 py-2 pr-10 pl-3 text-sm placeholder:text-slate-500 focus:border-amber-500/60 focus:outline-none"
              />
            </div>
            <input type="number" placeholder="مستوى ≥" value={minLevel} onChange={(e) => setMinLevel(e.target.value)} className="w-24 rounded border border-slate-700 bg-slate-950/60 px-2 py-2 text-sm" />
            <input type="number" placeholder="مستوى ≤" value={maxLevel} onChange={(e) => setMaxLevel(e.target.value)} className="w-24 rounded border border-slate-700 bg-slate-950/60 px-2 py-2 text-sm" />
            <input type="date" value={joinedAfter} onChange={(e) => setJoinedAfter(e.target.value)} className="rounded border border-slate-700 bg-slate-950/60 px-2 py-2 text-sm" title="انضم بعد" />
            <input type="date" value={joinedBefore} onChange={(e) => setJoinedBefore(e.target.value)} className="rounded border border-slate-700 bg-slate-950/60 px-2 py-2 text-sm" title="انضم قبل" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key || "all"}
                onClick={() => setFilter(f.key)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  filter === f.key
                    ? "border-amber-400/60 bg-amber-500/15 text-amber-200"
                    : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
          {error && (
            <div className="border-b border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">{error}</div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-right text-sm">
              <thead className="bg-slate-900/80 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2">الاسم</th>
                  <th className="px-3 py-2">المستخدم</th>
                  <th className="px-3 py-2">البريد</th>
                  <th className="px-3 py-2">النوع</th>
                  <th className="px-3 py-2">الأدوار</th>
                  <th className="px-3 py-2">الحالة</th>

                  <th className="px-3 py-2">المستوى</th>
                  <th className="px-3 py-2">XP</th>
                  <th className="px-3 py-2">الدنانير</th>
                  <th className="px-3 py-2">إحالات</th>
                  <th className="px-3 py-2">آخر نشاط</th>
                  <th className="px-3 py-2">انضم</th>
                </tr>
              </thead>
              <tbody>
                {loading && rows.length === 0 ? (
                  <tr><td colSpan={12} className="px-3 py-6 text-center text-slate-400">جاري التحميل…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={12} className="px-3 py-6 text-center text-slate-400">لا توجد نتائج.</td></tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} onClick={() => setSelectedId(r.id)} className="cursor-pointer border-t border-slate-800/70 hover:bg-slate-800/40">
                      <td className="px-3 py-2 font-medium text-slate-100">{r.display_name ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-300">@{r.username}</td>
                      <td className="px-3 py-2 text-xs text-slate-400" dir="ltr">{r.email ?? "—"}</td>
                      <td className="px-3 py-2"><TypeBadge t={r.account_type} /></td>
                      <td className="px-3 py-2"><RolesChips roles={r.roles} /></td>
                      <td className="px-3 py-2"><StatusBadge status={r.account_status} /></td>

                      <td className="px-3 py-2 text-amber-300">{r.level}</td>
                      <td className="px-3 py-2 text-slate-300">{r.xp.toLocaleString("en-US")}</td>
                      <td className="px-3 py-2 text-emerald-300">{r.dinars.toLocaleString("en-US")}</td>
                      <td className="px-3 py-2 text-slate-300">{r.referrals_count}</td>
                      <td className="px-3 py-2 text-xs text-slate-400" dir="ltr">{fmtDate(r.last_active)}</td>
                      <td className="px-3 py-2 text-xs text-slate-400" dir="ltr">{fmtDate(r.join_date)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-slate-800 bg-slate-900/60 px-4 py-2 text-xs text-slate-400">
            <div>{pageStart}–{pageEnd} من {total}</div>
            <div className="flex items-center gap-2">
              <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40">السابق</button>
              <button disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)} className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40">التالي</button>
            </div>
          </div>
        </section>
      </div>

      {selectedId && (
        <UserDetailDrawer
          userId={selectedId}
          isManager={isManager}
          onClose={() => setSelectedId(null)}
          onChanged={() => setReloadKey((k) => k + 1)}
        />
      )}

      {addOpen && isManager && (
        <AddUserModal
          onClose={() => setAddOpen(false)}
          onCreated={() => { setAddOpen(false); setReloadKey((k) => k + 1); }}
        />
      )}
    </AdminLayout>
  );
}


function UserDetailDrawer({ userId, isManager, onClose, onChanged }: { userId: string; isManager: boolean; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    adminUserDetail(userId)
      .then((d) => { if (alive) setDetail(d); })
      .catch((e: any) => { if (alive) setError(e?.message ?? String(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userId, reloadKey]);

  async function adjust(field: "xp" | "dinars") {
    const raw = window.prompt(`أدخل قيمة التعديل (موجبة للإضافة، سالبة للخصم) لـ ${field === "xp" ? "XP" : "الدنانير"}:`, "0");
    if (!raw) return;
    const delta = Number(raw);
    if (!Number.isFinite(delta) || delta === 0) return;
    const reason = window.prompt("سبب التعديل (يُحفظ في سجل التدقيق):", "") ?? "";
    setBusy(true);
    try {
      await adminAdjustBalance(userId, field, Math.trunc(delta), reason);
      setReloadKey((k) => k + 1);
      onChanged();
    } catch (e: any) {
      alert("فشل التعديل: " + (e?.message ?? String(e)));
    } finally { setBusy(false); }
  }

  async function changeStatus(next: AccountStatus) {
    const reason = window.prompt(`سبب تغيير الحالة إلى "${next}":`, "") ?? "";
    setBusy(true);
    try {
      await adminSetAccountStatus(userId, next, reason);
      setReloadKey((k) => k + 1);
      onChanged();
    } catch (e: any) {
      alert("فشل تغيير الحالة: " + (e?.message ?? String(e)));
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex" dir="rtl">
      <div className="flex-1 bg-black/60" onClick={onClose} />
      <aside className="flex h-full w-full max-w-2xl flex-col border-l border-amber-500/20 bg-slate-950 text-slate-100 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-base font-semibold text-amber-200">تفاصيل المستخدم</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 text-sm">
          {loading ? (
            <div className="py-10 text-center text-slate-400">جاري التحميل…</div>
          ) : error ? (
            <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3 text-rose-200">{error}</div>
          ) : !detail ? null : (
            <div className="space-y-5">
              {/* General */}
              <Section title="عام">
                <KV label="الاسم">{detail.profile.display_name ?? "—"}</KV>
                <KV label="اسم المستخدم">@{detail.profile.username}</KV>
                <KV label="البريد"><span dir="ltr">{detail.auth_email ?? detail.profile.email ?? "—"}</span></KV>
                <KV label="معرّف المستخدم"><span dir="ltr" className="text-xs">{detail.profile.id}</span></KV>
                <KV label="تاريخ التسجيل"><span dir="ltr">{fmtDate(detail.auth_created_at ?? (detail.profile.join_date as string))}</span></KV>
                <KV label="آخر دخول"><span dir="ltr">{fmtDate(detail.auth_last_sign_in_at)}</span></KV>
                <KV label="آخر نشاط"><span dir="ltr">{fmtDate(detail.profile.last_active as string)}</span></KV>
                <KV label="النوع"><TypeBadge t={(detail.profile as any).account_type ?? "registered"} /></KV>
                <KV label="الحالة"><StatusBadge status={detail.profile.account_status as AccountStatus} /></KV>
              </Section>

              {/* Progress */}
              <Section title="التقدم">
                <KV label="المستوى">{detail.profile.level}</KV>
                <KV label="XP">{(detail.profile.xp as number).toLocaleString("en-US")}</KV>
                <KV label="الدنانير">{(detail.profile.dinars as number).toLocaleString("en-US")}</KV>
                <KV label="القلوب (محلية)">{detail.profile.hearts ?? "—"}</KV>
                <KV label="السلسلة الحالية">{detail.profile.streak}</KV>
                <KV label="أطول سلسلة">{(detail.profile as any).longest_streak ?? 0}</KV>
                <KV label="حملات مكتملة">{detail.profile.campaigns_completed}</KV>
                <KV label="عناصر المتحف">{(detail.profile as any).museum_items_unlocked ?? 0}</KV>
                <KV label="تحقيقات مكتملة">{(detail.profile as any).investigations_completed ?? 0}</KV>
              </Section>

              {/* Roles (manager-only) */}
              {isManager && (
                <Section title="الأدوار">
                  <div className="col-span-2 mb-2">
                    <RolesChips roles={(detail as any).roles ?? []} />
                  </div>
                  <div className="col-span-2 flex flex-wrap gap-2">
                    {(["editor","admin","owner"] as AppRole[]).map((role) => {
                      const has = ((detail as any).roles ?? []).includes(role);
                      return (
                        <ActionButton
                          key={role}
                          disabled={busy}
                          icon={<BadgeCheck className="h-4 w-4" />}
                          label={has ? `إزالة ${ROLE_LABEL[role]}` : `منح ${ROLE_LABEL[role]}`}
                          tone={has ? "rose" : "emerald"}
                          onClick={async () => {
                            const reason = window.prompt(`سبب ${has ? "إزالة" : "منح"} دور "${ROLE_LABEL[role]}":`, "") ?? "";
                            setBusy(true);
                            try {
                              if (has) await adminRevokeRole(userId, role, reason);
                              else     await adminAssignRole(userId, role, reason);
                              setReloadKey((k) => k + 1);
                              onChanged();
                            } catch (e: any) {
                              alert("فشل: " + (e?.message ?? String(e)));
                            } finally { setBusy(false); }
                          }}
                        />
                      );
                    })}
                    <ActionButton
                      disabled={busy}
                      icon={<ShieldOff className="h-4 w-4" />}
                      label="إعادة إلى لاعب"
                      onClick={async () => {
                        if (!confirm("إزالة جميع الأدوار وإعادة المستخدم إلى لاعب عادي؟")) return;
                        setBusy(true);
                        try {
                          await adminAssignRole(userId, "player", "downgrade to player");
                          setReloadKey((k) => k + 1);
                          onChanged();
                        } catch (e: any) { alert("فشل: " + (e?.message ?? String(e))); }
                        finally { setBusy(false); }
                      }}
                    />
                  </div>
                </Section>
              )}

              {/* Admin actions (manager-only) */}
              {isManager && (
                <Section title="إجراءات إدارية">
                  <div className="col-span-2 flex flex-wrap gap-2">
                    <ActionButton disabled={busy} onClick={() => adjust("xp")} icon={<Sparkles className="h-4 w-4" />} label="تعديل XP" />
                    <ActionButton disabled={busy} onClick={() => adjust("dinars")} icon={<Coins className="h-4 w-4" />} label="تعديل الدنانير" />
                    <ActionButton disabled title="القلوب مخزّنة محلياً على الجهاز ولا يمكن تعديلها عن بُعد حالياً." icon={<Coins className="h-4 w-4" />} label="تعديل القلوب (قريباً)" />
                  </div>
                  <div className="col-span-2 mt-2 flex flex-wrap gap-2">
                    <ActionButton disabled={busy || detail.profile.account_status === "active"} onClick={() => changeStatus("active")} icon={<ShieldCheck className="h-4 w-4" />} label="تفعيل" tone="emerald" />
                    <ActionButton disabled={busy || detail.profile.account_status === "suspended"} onClick={() => changeStatus("suspended")} icon={<ShieldAlert className="h-4 w-4" />} label="إيقاف" tone="amber" />
                    <ActionButton disabled={busy || detail.profile.account_status === "disabled"} onClick={() => changeStatus("disabled")} icon={<ShieldOff className="h-4 w-4" />} label="تعطيل" tone="rose" />
                  </div>
                  <p className="col-span-2 mt-2 text-[11px] leading-5 text-slate-400">
                    جميع التعديلات تُسجّل في سجل التدقيق مع المسؤول والسبب. لا تجري تعديلات SQL مباشرة على الإنتاج.
                  </p>
                </Section>
              )}


              {/* Referrals */}
              <Section title="الإحالات">
                <KV label="رمز الإحالة"><span dir="ltr">{detail.profile.referral_code ?? "—"}</span></KV>
                <KV label="دُعي بواسطة">
                  {detail.referrer
                    ? <span>{detail.referrer.display_name ?? detail.referrer.username}</span>
                    : "—"}
                </KV>
                <div className="col-span-2">
                  <div className="mb-1 text-xs text-slate-400">دعا ({detail.referrals_out.length})</div>
                  {detail.referrals_out.length === 0 ? (
                    <div className="text-xs text-slate-500">لا توجد إحالات.</div>
                  ) : (
                    <ul className="space-y-1 text-xs">
                      {detail.referrals_out.map((r) => (
                        <li key={r.id} className="flex items-center justify-between rounded bg-slate-900/60 px-2 py-1">
                          <span>{r.display_name ?? r.username ?? r.referred_id} · مستوى {r.level ?? 0}</span>
                          <span className="text-slate-500" dir="ltr">stage {r.stage} · {fmtDate(r.created_at)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Section>

              {/* Notifications */}
              <Section title="الإشعارات الأخيرة">
                {detail.recent_notifications.length === 0 ? (
                  <div className="col-span-2 text-xs text-slate-500">لا إشعارات.</div>
                ) : (
                  <ul className="col-span-2 space-y-1 text-xs">
                    {detail.recent_notifications.map((n) => (
                      <li key={n.id} className="rounded bg-slate-900/60 px-2 py-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-200">{n.title}</span>
                          <span className="text-slate-500" dir="ltr">{fmtDate(n.created_at)}</span>
                        </div>
                        <div className="text-slate-400">{n.body}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {/* Devices */}
              <Section title="الأجهزة">
                <KV label="عدد الأجهزة المسجّلة">{detail.devices_count}</KV>
              </Section>

              {/* Audit */}
              <Section title="سجل التدقيق">
                {detail.audit_log.length === 0 ? (
                  <div className="col-span-2 text-xs text-slate-500">لا توجد إجراءات سابقة.</div>
                ) : (
                  <ul className="col-span-2 space-y-1 text-xs">
                    {detail.audit_log.map((a) => (
                      <li key={a.id} className="rounded bg-slate-900/60 px-2 py-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-amber-200">{a.action}</span>
                          <span className="text-slate-500" dir="ltr">{fmtDate(a.created_at)}</span>
                        </div>
                        <div className="text-slate-400" dir="ltr">{a.actor_email ?? "—"} · {JSON.stringify(a.detail)}</div>
                        {a.reason && <div className="text-slate-500">{a.reason}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-300/80">{title}</h3>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">{children}</dl>
    </section>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-200">{children}</dd>
    </>
  );
}

function ActionButton({
  icon, label, onClick, disabled, tone, title,
}: { icon: React.ReactNode; label: string; onClick?: () => void; disabled?: boolean; tone?: "amber" | "rose" | "emerald"; title?: string }) {
  const tones: Record<string, string> = {
    amber: "border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20",
    rose: "border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
    emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20",
  };
  const base = tone ? tones[tone] : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800";
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${base}`}
    >
      {icon} {label}
    </button>
  );
}

function AddUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const createFn = useServerFn(createTeamUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<AppRole>("player");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!email.trim() || !password || !displayName.trim()) {
      setError("الرجاء تعبئة كل الحقول.");
      return;
    }
    if (password.length < 8) { setError("كلمة المرور 8 محارف على الأقل."); return; }
    setBusy(true);
    try {
      await createFn({ data: { email: email.trim(), password, display_name: displayName.trim(), role } });
      onCreated();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" dir="rtl">
      <div className="w-full max-w-md rounded-xl border border-amber-500/30 bg-slate-950 p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-amber-200">
            <UserPlus className="h-5 w-5" /> إضافة مستخدم جديد
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          يُنشأ الحساب عبر وظيفة خادم آمنة. لا يُرسل المفتاح السرّي إلى المتصفح أبدًا.
        </p>

        <div className="mt-4 space-y-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs text-slate-400">الاسم الظاهر</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80}
              className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-amber-500/60" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-400">البريد</span>
            <input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255}
              className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-amber-500/60" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-400">كلمة المرور (8 محارف فأكثر)</span>
            <input dir="ltr" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} maxLength={72}
              className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-amber-500/60" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-400">الدور</span>
            <select value={role} onChange={(e) => setRole(e.target.value as AppRole)}
              className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-amber-500/60">
              <option value="player">لاعب</option>
              <option value="editor">محرّر (وصول إلى أدوات المحتوى فقط)</option>
              <option value="admin">مشرف (وصول كامل)</option>
              <option value="owner">مالك</option>
            </select>
          </label>
        </div>

        {error && (
          <div className="mt-3 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={busy}
            className="rounded border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-50">إلغاء</button>
          <button onClick={submit} disabled={busy}
            className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50">
            {busy ? "جارٍ الإنشاء…" : "إنشاء المستخدم"}
          </button>
        </div>
      </div>
    </div>
  );
}
