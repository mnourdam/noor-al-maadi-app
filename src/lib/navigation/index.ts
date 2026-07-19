// Barrel export for the navigation engine. Consumers should import
// from `@/lib/navigation` — never reach into internal files.

export type {
  NavigationOrigin,
  RouteDeclaration,
  RouteId,
  RouteKind,
  ValidationIssue,
  ValidationReport,
} from "./types";

export {
  NAVIGATION_REGISTRY,
  allRegisteredRouteIds,
  resolveDeclaration,
} from "./registry";

export {
  formatValidationReport,
  validateNavigationRegistry,
} from "./validate";

export {
  NavigationProvider,
  navigateWithOrigin,
  useBack,
  useNavigateWithOrigin,
  useNavigationOrigin,
  useOverlayDismiss,
} from "./engine";
