// ============================================================
// Central Navigation Registry
// ------------------------------------------------------------
// THE single source of truth for parent/fallback declarations.
//
// Rules:
//   - Every navigable route in `src/routes/` MUST have exactly one
//     entry here. The validator (`validate.ts`) fails the build /
//     provider mount when an entry is missing or malformed.
//   - Do NOT hardcode parent routes inside components. Consume the
//     registry via `useBack()` and `resolveDeclaration()`.
//   - `parentRoute` uses raw path strings that match
//     `createFileRoute("...")` ids exactly.
//   - Params in a parent path (e.g. `$type`) are filled from the
//     child's params at back-time. If the child doesn't carry the
//     param, an origin override or explicit search should supply it.
// ============================================================

import type { RouteDeclaration, RouteId } from "./types";

// -----------------------------
// Player routes
// -----------------------------
const PLAYER_ROUTES: RouteDeclaration[] = [
  { id: "/", parentRoute: null, isRoot: true, kind: "player", label: "الرئيسية" },

  // Top-level tabs and hubs (all resolve to "/")
  { id: "/campaigns", parentRoute: "/", kind: "player", label: "الحملات" },
  { id: "/encyclopedia", parentRoute: "/", kind: "player", label: "الموسوعة" },
  { id: "/map", parentRoute: "/", kind: "player", label: "الخريطة" },
  { id: "/collection", parentRoute: "/", kind: "player", label: "المتحف" },
  { id: "/profile", parentRoute: "/", kind: "player", label: "الملف الشخصي" },
  { id: "/worlds", parentRoute: "/", kind: "player", label: "العوالم" },
  { id: "/investigations", parentRoute: "/", kind: "player", label: "التحقيقات" },
  { id: "/games", parentRoute: "/", kind: "player", label: "الألعاب" },
  { id: "/adventure", parentRoute: "/", kind: "player", label: "المغامرة" },
  { id: "/timeline", parentRoute: "/", kind: "player", label: "الخط الزمني" },
  { id: "/history-calendar", parentRoute: "/", kind: "player", label: "التقويم التاريخي" },
  { id: "/on-this-day", parentRoute: "/", kind: "player", label: "في مثل هذا اليوم" },
  // `/seasons` retired in Phase 3B — redirects to `/profile`; no registry entry.
  // `/achievements` was retired — the canonical trophy hall is Profile → Achievements
  // (`/profile?tab=achievements`). The route file now issues a permanent redirect;
  // no registry entry needed since the destination (`/profile`) is already registered.
  { id: "/notifications", parentRoute: "/", kind: "player", label: "الإشعارات" },
  { id: "/friends", parentRoute: "/profile", kind: "player", label: "الأصدقاء" },
  // `/referrals` was retired in Phase 2 (Referrals removal). The route file
  // now issues a permanent redirect to `/profile`; no registry entry needed.
  { id: "/security", parentRoute: "/profile", kind: "player", label: "الأمان" },
  { id: "/about", parentRoute: "/", kind: "player", label: "حول" },
  { id: "/privacy", parentRoute: "/", kind: "player", label: "الخصوصية" },
  { id: "/terms", parentRoute: "/", kind: "player", label: "الشروط" },
  { id: "/content-audit", parentRoute: "/", kind: "player", label: "مراجعة المحتوى" },

  // Auth surface
  { id: "/auth", parentRoute: "/", kind: "player", label: "الدخول" },
  {
    id: "/auth/callback",
    parentRoute: "/",
    kind: "player",
    label: "استكمال الدخول",
    // OAuth token exchange is in flight; Back must not interrupt it.
    // Once the callback resolves it navigates itself.
    backPolicy: "blocked_while_pending",
    supportsOriginOverride: false,
  },
  {
    id: "/reset-password",
    parentRoute: "/",
    kind: "player",
    label: "تغيير كلمة المرور",
    // RecoveryModeGuard owns navigation until the password reset finishes.
    backPolicy: "blocked_while_pending",
    supportsOriginOverride: false,
  },
  {
    id: "/unsubscribe",
    parentRoute: "/",
    kind: "player",
    label: "إلغاء الاشتراك",
    // One-shot email flow: always return safely to Home.
    backPolicy: "force_target",
    backPolicyTarget: "/",
    supportsOriginOverride: false,
  },

  // Campaigns hierarchy
  { id: "/campaigns/imported/$id", parentRoute: "/campaigns", kind: "player", label: "الحملة" },
  {
    id: "/campaigns/imported/$id/chapter/$chapter",
    parentRoute: "/campaigns/imported/$id",
    kind: "player",
    label: "فصل الحملة",
  },
  // Play sub-screens — used mid-chapter; return to campaigns hub if no origin.
  { id: "/play/chapter", parentRoute: "/campaigns", kind: "player", label: "قراءة الفصل" },
  { id: "/play/decisions", parentRoute: "/campaigns", kind: "player", label: "القرارات" },
  { id: "/play/investigate", parentRoute: "/campaigns", kind: "player", label: "التحقيق" },
  { id: "/play/timeline", parentRoute: "/campaigns", kind: "player", label: "الخط الزمني" },

  // Encyclopedia hierarchy
  { id: "/encyclopedia/type/$type", parentRoute: "/encyclopedia", kind: "player", label: "نوع" },
  { id: "/encyclopedia/entity/$id", parentRoute: "/encyclopedia", kind: "player", label: "بطاقة" },
  { id: "/encyclopedia/state/$id", parentRoute: "/encyclopedia", kind: "player", label: "دولة" },
  { id: "/encyclopedia/path/$id", parentRoute: "/encyclopedia", kind: "player", label: "مسار" },

  // Legacy entity detail routes
  { id: "/figure/$id", parentRoute: "/encyclopedia", kind: "player", label: "شخصية" },
  { id: "/city/$id", parentRoute: "/encyclopedia", kind: "player", label: "مدينة" },
  { id: "/battle/$id", parentRoute: "/encyclopedia", kind: "player", label: "معركة" },
  { id: "/story/$id", parentRoute: "/encyclopedia", kind: "player", label: "قصة" },

  // Investigations
  { id: "/investigation/$id", parentRoute: "/investigations", kind: "player", label: "التحقيق" },

  // Worlds
  { id: "/worlds/$slug", parentRoute: "/worlds", kind: "player", label: "العالم" },

  // Games
  { id: "/games/$mode/$slug", parentRoute: "/games", kind: "player", label: "لعبة" },

  // Feedback
  { id: "/feedback", parentRoute: "/profile", kind: "player", label: "الملاحظات" },
  { id: "/feedback/new", parentRoute: "/feedback", kind: "player", label: "ملاحظة جديدة" },
  { id: "/feedback/$id", parentRoute: "/feedback", kind: "player", label: "ملاحظة" },

  // Public user profile
  { id: "/u/$username", parentRoute: "/friends", kind: "player", label: "ملف مستخدم" },

  // Comparison / share
  { id: "/compare/$id", parentRoute: "/", kind: "player", label: "مقارنة" },
  {
    id: "/share-card",
    parentRoute: "/",
    kind: "player",
    label: "بطاقة مشاركة",
    // Off-screen renderer used to generate share images. Never
    // participates in Back — no origin tracking, no parent resolution.
    backPolicy: "non_navigable",
    supportsOriginOverride: false,
  },
];

// -----------------------------
// Admin routes
// -----------------------------
// Admin uses a flat model: every admin page's parent is `/admin`,
// except `/admin` itself which returns to `/` (player root).
// Admin routes DO NOT support origin override; back is deterministic.
const ADMIN_INDEX: RouteDeclaration = {
  id: "/admin",
  parentRoute: "/",
  kind: "admin",
  supportsOriginOverride: false,
  label: "لوحة الإدارة",
};

const ADMIN_SUBPAGES: RouteId[] = [
  "/admin/analytics",
  "/admin/atlas-calibration",
  "/admin/atlas-entities",
  "/admin/atlas-import",
  "/admin/atlas-repair",
  "/admin/atlas-review",
  "/admin/campaign-order",
  "/admin/campaign-relationships",
  "/admin/campaigns",
  "/admin/campaigns/$id/edit",
  "/admin/canonical-duplicates",
  "/admin/community",
  "/admin/content",
  "/admin/content-auto-heal",
  "/admin/content-cleanup",
  "/admin/content-foundation",
  "/admin/content-integrity",
  "/admin/content-integrity-repair",
  "/admin/content-inventory",
  "/admin/cross-hub-links",
  "/admin/encyclopedia",
  "/admin/encyclopedia-audit",
  "/admin/encyclopedia-cleanup",
  "/admin/encyclopedia-cleanup/data-hygiene",
  "/admin/encyclopedia-cleanup/import-preview",
  "/admin/encyclopedia-cleanup/integrity",
  "/admin/encyclopedia-cleanup/redirects",
  "/admin/encyclopedia-cleanup/review",
  "/admin/encyclopedia-report",
  "/admin/era-assignment",
  "/admin/era-normalization",
  "/admin/exploration-path-repair",
  "/admin/games",
  "/admin/games/$mode",
  "/admin/games/crossword-generator",
  "/admin/historical-hubs-audit",
  "/admin/hub-builder",
  "/admin/import",
  "/admin/import-history",
  "/admin/import-history/$id",
  "/admin/investigations",
  "/admin/investigations/$id/edit",
  "/admin/investigation-rewards",
  "/admin/map",

  "/admin/migration",
  "/admin/museum-provenance",
  "/admin/native-auth-diagnostics",
  "/admin/newsletter",
  "/admin/notifications",
  "/admin/offline",
  "/admin/offline-diagnostics",
  "/admin/taxonomy",
  "/admin/unlock-integrity",
  "/admin/users",
  "/admin/world-membership-review",
];

// Overrides for admin routes whose structural parent would resolve to a
// non-existent intermediate page. Keep this list short and explicit.
const ADMIN_PARENT_OVERRIDES: Readonly<Record<RouteId, RouteId>> = {
  "/admin/campaigns/$id/edit": "/admin/campaigns",
  "/admin/investigations/$id/edit": "/admin/investigations",
  "/admin/import-history/$id": "/admin/import-history",
  "/admin/games/$mode": "/admin/games",
  "/admin/games/crossword-generator": "/admin/games",
  "/admin/encyclopedia-cleanup/data-hygiene": "/admin/encyclopedia-cleanup",
  "/admin/encyclopedia-cleanup/import-preview": "/admin/encyclopedia-cleanup",
  "/admin/encyclopedia-cleanup/integrity": "/admin/encyclopedia-cleanup",
  "/admin/encyclopedia-cleanup/redirects": "/admin/encyclopedia-cleanup",
  "/admin/encyclopedia-cleanup/review": "/admin/encyclopedia-cleanup",
};

const ADMIN_ROUTES: RouteDeclaration[] = [
  ADMIN_INDEX,
  ...ADMIN_SUBPAGES.map<RouteDeclaration>((id) => ({
    id,
    parentRoute: ADMIN_PARENT_OVERRIDES[id] ?? computeAdminParent(id),
    kind: "admin",
    supportsOriginOverride: false,
  })),
];

function computeAdminParent(id: RouteId): RouteId {
  const parts = id.split("/").filter(Boolean);
  if (parts.length <= 1) return "/";
  const parent = "/" + parts.slice(0, -1).join("/");
  return parent === "" ? "/admin" : parent;
}

// -----------------------------
// Final registry
// -----------------------------

export const NAVIGATION_REGISTRY: readonly RouteDeclaration[] = Object.freeze([
  ...PLAYER_ROUTES,
  ...ADMIN_ROUTES,
]);

const REGISTRY_INDEX = (() => {
  const map = new Map<RouteId, RouteDeclaration>();
  for (const decl of NAVIGATION_REGISTRY) {
    // The validator will report duplicates; here we take the first.
    if (!map.has(decl.id)) map.set(decl.id, decl);
  }
  return map;
})();

/** Lookup a declaration by exact route id. Returns null if unregistered. */
export function resolveDeclaration(id: RouteId): RouteDeclaration | null {
  return REGISTRY_INDEX.get(id) ?? null;
}

/** Every registered route id, in insertion order. */
export function allRegisteredRouteIds(): RouteId[] {
  return NAVIGATION_REGISTRY.map((d) => d.id);
}
