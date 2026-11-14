# Public-compatible original-reference preparation

Base local commit `695ea90d7e33959b2a8b1f3502e40a82d644b235`, tree `88d9ab15e6b867a4f0b6e7e68588a44e957ad7e7`, exact public `7decbaf` tree. This is local preparation, not publication authorization or production deployment.

Five-path scope: original reference parser extension; shared original-reference renderer; two-line import/render addition to the exact public ArticleBody; dedicated actual public route tests; this audit. No dormant English helper, catalog, experimental component or rich contract is included. The prior private seven-path implementation had separate rich-contract tests; those results are not presented as public-candidate tests here.

The exact packaged snapshot (`4733e21c6789140c31e9ef558e5d2a7479ab16fa48e7e6ec97cd29e49be35c72` decompressed SHA256) contains 525 encyclopedia entities with references: 2241 label/value objects and876 strings, no currently nonempty body.sources in those records. These were ignored by the existing parser.

Existing body.sources and metadata-source fallback remain unchanged and render first. Accepted original string references or label/value pairs render separately, verbatim and in order, under an Arabic original/unverified provenance heading. Display is not verification or new editorial approval. Optional explicit http/https URL strings become links only when syntactically safe and free of ASCII controls/whitespace and edge whitespace; unsafe strings remain visible without a link. Free-text citation values never become hrefs. Existing Sources behavior is unchanged.

Malformed/partial/unknown entries are ignored without dropping valid siblings. Exact tagged tuple dedup preserves first occurrence and distinguishes string/pair forms. Cross-source dedup only removes an identical title-only string when no nonempty author/note/URL exists, or an exact label/title + value/note pair with no nonempty author and identical URL value/presence. No fuzzy matching, trimming, URL normalization or label-only suppression. A pair's absent and empty URL remain distinct.

Dedicated JSDOM tests use the actual public entity route/parser/article components and real locale chooser while stubbing the existing query/router/auth/social boundaries. They assert all six real dinar references verbatim in Arabic/English UI without content-language change, canonical ID/source bytes, original sources-first order, safe URL exact href, unsafe text-only URLs, strict dedup, malformed siblings and preserved source precedence. No English translation approval, browser/native/auth/backend or citation-accuracy acceptance is implied.

Validation commands: `npx vitest run --config vitest.outbox.config.ts tests/offline/outbox-original-reference-route.test.tsx`; both existing TypeScript no-emit configurations; `git diff --check`. Full regression/publication is coordinator-owned. No snapshot/content/locks/workflows/migrations modified.

Candidate receipts: dedicated actual public route suite 3/3 PASS; both TypeScript no-emit configurations PASS; diffcheck clean. Parser and new renderer byte-equal the separately reviewed local implementation. Coordinator separately owns a full regression of this frozen candidate; no full-suite result is inferred here.
