# Home continuation chapter-art parity

## Bounded source correction

Home's existing `ContinueJourneyCard` read raw `nextChapter.imageUrl`. Consequently all three reviewed null-image interpretive bindings used campaign artwork on Home while the actual chapter route used the explicit chapter illustration. The card now calls the same `chapterImageForDisplay(campaign.id, nextChapter.id, authored)` helper before its existing trim/campaign fallback. Authored URLs remain preferred; empty and whitespace authored strings still select campaign art, never the interpretive fallback. Unknown chapter/campaign and absent chapter preserve campaign art.

Only Home's card is changed. A named export allows mounting that existing implementation without executing the entire Home dashboard. No Worlds, campaign selection, progress/reward, snapshot, image bytes, generated inventory, or navigation behavior changes.

## Local regression evidence

`npx vitest run --config vitest.outbox.config.ts tests/offline/outbox-home-chapter-art.test.tsx`

Five cases mount the actual exported card with real CachedImage/image-cache/resolver. Campaign artwork and navigation dependencies are mocked, not the chapter helper or image renderer. The three mapped-null cases fail against the old raw-image selection and pass with the helper. Unknown/absent chapter and authored/empty/whitespace controls retain existing behavior. Assertions check exact DOM image source, campaign link, progress label, unchanged input selection object/localStorage and no navigation callback. Mapped local images cause zero fetch/CacheStorage calls; ordinary mocked campaign/authored paths may inspect the image cache. Initial test drafting incorrectly required no cache lookup for these ordinary paths; that assertion was narrowed before the final counterfactual.

This is JSDOM card behavior, not browser pixel decoding or complete Home dashboard/recommendation acceptance. The separate reviewed six-scene chapter-browser extension remains pending remote runtime. No production release or Android acceptance is implied.

Final local receipts: corrected old-selection counterfactual produced exactly 3 failures (the mapped null chapters) and 2 passing controls; restored implementation passed 5/5. Combined Home, interpretive-art and chapter-reread suites passed 13/13. Both `tsc --noEmit -p tsconfig.outbox.json` and `tsc --noEmit` completed with exit 0. Independent source/test review passed 5/5 and diffcheck. These are local receipts, not a remote CI result.
