// Centralized Arabic display labels for the ERA taxonomy.
// Delegates to the single-source-of-truth taxonomy-labels module so that
// Era / World / State labels can never drift or be confused with each other.
//
// Player-facing surfaces should use `eraLabel`. Admin/debug surfaces that
// need to see legacy/unapproved values should use `eraLabelAdmin`.

export {
  eraLabelAr as eraLabel,
  eraLabelAdmin,
  isApprovedEra,
  canonicalEraSlug,
} from "./taxonomy-labels";
