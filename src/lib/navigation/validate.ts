// ============================================================
// Navigation Registry Validator
// ------------------------------------------------------------
// Fails loud when the navigation graph is invalid:
//   - routes without parent (non-root)
//   - invalid parent references
//   - parent loops (A -> B -> A)
//   - unreachable fallback routes (fallback not in registry)
//   - duplicate registrations
//   - player routes pointing into admin, admin into player
//   - routes present in the router but forgotten in the registry
//   - registry entries with no matching route in the router
//
// This module is pure and framework-agnostic; it accepts an
// optional set of "known route ids" (from the generated route
// tree at runtime) to cross-check registration.
// ============================================================

import { NAVIGATION_REGISTRY, resolveDeclaration } from "./registry";
import type { RouteId, ValidationIssue, ValidationReport } from "./types";

export interface ValidateOptions {
  /**
   * Ids of every route the router actually knows about. When provided,
   * the validator additionally flags:
   *   - `unregistered_route`  — router has it, registry doesn't
   *   - `extra_registration`  — registry has it, router doesn't
   */
  knownRouteIds?: readonly RouteId[];
}

export function validateNavigationRegistry(
  options: ValidateOptions = {},
): ValidationReport {
  const issues: ValidationIssue[] = [];
  const seen = new Set<RouteId>();

  // Duplicate detection
  for (const decl of NAVIGATION_REGISTRY) {
    if (seen.has(decl.id)) {
      issues.push({
        code: "duplicate_registration",
        routeId: decl.id,
        message: `Route "${decl.id}" is registered more than once.`,
      });
    }
    seen.add(decl.id);
  }

  // Per-route structural checks
  for (const decl of NAVIGATION_REGISTRY) {
    // Root sanity
    if (decl.isRoot) {
      if (decl.parentRoute !== null) {
        issues.push({
          code: "root_with_parent",
          routeId: decl.id,
          message: `Root route "${decl.id}" must have parentRoute: null.`,
        });
      }
      continue;
    }

    // Non-root MUST have a parent
    if (decl.parentRoute == null) {
      issues.push({
        code: "non_root_without_parent",
        routeId: decl.id,
        message: `Route "${decl.id}" is not root but declares no parentRoute.`,
      });
      continue;
    }

    // Parent must resolve
    const parent = resolveDeclaration(decl.parentRoute);
    if (!parent) {
      issues.push({
        code: "invalid_parent_ref",
        routeId: decl.id,
        message: `Route "${decl.id}" points to unknown parent "${decl.parentRoute}".`,
      });
      continue;
    }

    // Cross-kind check — the ONE allowed exception is `/admin -> /`,
    // which is how the admin subtree returns to the player root.
    if (parent.kind !== decl.kind && decl.id !== "/admin") {
      issues.push({
        code: "cross_kind_parent",
        routeId: decl.id,
        message: `Route "${decl.id}" (${decl.kind}) has a ${parent.kind} parent "${parent.id}".`,
      });
    }

    // Fallback route reachability (fallback defaults to parent when omitted)
    if (decl.fallbackRoute !== undefined && decl.fallbackRoute !== null) {
      if (!resolveDeclaration(decl.fallbackRoute)) {
        issues.push({
          code: "unreachable_fallback",
          routeId: decl.id,
          message: `Route "${decl.id}" declares unknown fallbackRoute "${decl.fallbackRoute}".`,
        });
      }
    }

    // Back-policy sanity
    if (decl.backPolicy === "force_target") {
      if (!decl.backPolicyTarget) {
        issues.push({
          code: "missing_back_policy_target",
          routeId: decl.id,
          message: `Route "${decl.id}" declares backPolicy "force_target" but no backPolicyTarget.`,
        });
      } else if (!resolveDeclaration(decl.backPolicyTarget)) {
        issues.push({
          code: "invalid_back_policy_target",
          routeId: decl.id,
          message: `Route "${decl.id}" backPolicyTarget "${decl.backPolicyTarget}" is not registered.`,
        });
      }
    } else if (decl.backPolicyTarget) {
      issues.push({
        code: "invalid_back_policy_target",
        routeId: decl.id,
        message: `Route "${decl.id}" declares backPolicyTarget without backPolicy: "force_target".`,
      });
    }
  }

  // Parent-loop detection (Floyd-style walk with visited set)
  for (const decl of NAVIGATION_REGISTRY) {
    if (decl.isRoot) continue;
    const visited = new Set<RouteId>([decl.id]);
    let cursor: RouteId | null | undefined = decl.parentRoute;
    let hops = 0;
    while (cursor) {
      if (visited.has(cursor)) {
        issues.push({
          code: "parent_loop",
          routeId: decl.id,
          message: `Route "${decl.id}" is part of a parent loop through "${cursor}".`,
        });
        break;
      }
      visited.add(cursor);
      const next = resolveDeclaration(cursor);
      if (!next) break; // already reported as invalid_parent_ref
      if (next.isRoot) break;
      cursor = next.parentRoute;
      if (++hops > 32) {
        issues.push({
          code: "parent_loop",
          routeId: decl.id,
          message: `Route "${decl.id}" chain exceeds 32 hops (likely loop).`,
        });
        break;
      }
    }
  }

  // Cross-check against router-known routes when provided
  if (options.knownRouteIds) {
    // Normalize BOTH sides: the router reports index routes by fullPath
    // ("/stories") while the registry keys by raw route id ("/stories/").
    const registered = new Set(
      NAVIGATION_REGISTRY.map((d) => normalizeKnownRouteId(d.id)).filter(Boolean) as string[],
    );
    const known = new Set(
      options.knownRouteIds.map(normalizeKnownRouteId).filter(Boolean) as string[],
    );
    for (const id of known) {
      if (!registered.has(id) && !isIgnoredRouteId(id)) {
        issues.push({
          code: "unregistered_route",
          routeId: id,
          message: `Router has route "${id}" but it is missing from NAVIGATION_REGISTRY.`,
        });
      }
    }
    for (const id of registered) {
      if (!known.has(id)) {
        issues.push({
          code: "extra_registration",
          routeId: id,
          message: `Registry has "${id}" but the router does not.`,
        });
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Normalize a router route id into the form the registry uses:
 *   - trailing slashes stripped (`/admin/` -> `/admin`), except the root
 *   - layout-only ids (starting with `__`) dropped
 *   - server / API / email / lovable tooling ids dropped
 */
function normalizeKnownRouteId(id: RouteId): RouteId | null {
  if (!id) return null;
  if (id.startsWith("__")) return null;
  if (isIgnoredRouteId(id)) return null;
  if (id.length > 1 && id.endsWith("/")) return id.slice(0, -1);
  return id;
}

/**
 * Route ids the validator intentionally ignores when cross-checking
 * against the router:
 *   - server / API routes under `/api/`
 *   - internal `/lovable/*` and `/email/*` tooling routes
 *   - the `__root` id used by TanStack for the shell
 */
function isIgnoredRouteId(id: RouteId): boolean {
  if (id === "__root__" || id === "__root") return true;
  if (id.startsWith("/api/")) return true;
  if (id.startsWith("/lovable/")) return true;
  if (id.startsWith("/email/")) return true;
  return false;
}

/**
 * Formats a report for human consumption. Used by the CLI validator
 * and by the dev-time provider check.
 */
export function formatValidationReport(report: ValidationReport): string {
  if (report.ok) return "Navigation registry: OK";
  const lines = [`Navigation registry: ${report.issues.length} issue(s)`];
  for (const issue of report.issues) {
    lines.push(`  [${issue.code}] ${issue.message}`);
  }
  return lines.join("\n");
}
