// ============================================================
// Navigation types — single source of truth for the Back engine.
//
// Every route in the app is described by one RouteDeclaration in
// `registry.ts`. The navigation engine reads from that registry;
// no component may hardcode its own parent.
// ============================================================

/**
 * A route path as declared in `createFileRoute("/...")`.
 * We use the raw ID strings so the registry stays framework-agnostic.
 */
export type RouteId = string;

export type RouteKind = "player" | "admin";

export interface RouteDeclaration {
  /**
   * Canonical route id — MUST match the `createFileRoute("...")` path
   * for that route (or the root "/" for `__root`).
   */
  id: RouteId;

  /**
   * Logical parent route id. `null` only for root-class routes.
   * Params in the parent path (e.g. "/encyclopedia/type/$type") are
   * resolved at back-time from the current route's params.
   */
  parentRoute: RouteId | null;

  /**
   * Route to navigate to on a cold-start deep-link Back press when no
   * navigation origin has been recorded. Defaults to `parentRoute` if
   * omitted. Must not be null for non-root routes.
   */
  fallbackRoute?: RouteId | null;

  /**
   * If true, a page opened via `navigateWithOrigin({ origin })` returns
   * to that origin on Back instead of `parentRoute`. Defaults to `true`
   * for player routes and `false` for admin.
   */
  supportsOriginOverride?: boolean;

  /**
   * Root-class route. Only `/` should set this. Root routes trigger the
   * exit-confirm dialog on Back instead of navigating.
   */
  isRoot?: boolean;

  /** Player vs admin classification. Required. */
  kind: RouteKind;

  /**
   * Free-form label used in validator error messages only. Not shown to
   * end users.
   */
  label?: string;
}

export interface NavigationOrigin {
  /** Route id to return to (must exist in the registry). */
  route: RouteId;
  /** Optional params for the origin route. */
  params?: Record<string, string>;
  /** Optional search params. */
  search?: Record<string, unknown>;
}

export interface ValidationIssue {
  code:
    | "missing_parent"
    | "invalid_parent_ref"
    | "parent_loop"
    | "unreachable_fallback"
    | "duplicate_registration"
    | "cross_kind_parent"
    | "unregistered_route"
    | "extra_registration"
    | "non_root_without_parent"
    | "root_with_parent";
  routeId?: RouteId;
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  issues: ValidationIssue[];
}
