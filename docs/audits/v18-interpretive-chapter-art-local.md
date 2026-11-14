# Three interpretive chapter illustrations: local test-branch binding

Status: new AI-generated interpretive illustrations, not recovered originals or authenticated reconstructions. This change is isolated on the local `v18-chapter-art-local` branch based on `ab33171`; no public push, hosted content change or production deployment is authorized by this audit. No story cover is replaced.

## Exact mapping and authority

- `cordoba-golden-age` / `ch5` / مدينة الكتب: anonymous copying and circulation of books, not a reconstructed royal library or exact book count.
- `ottoman-golden-age` / `ch10` / قمة الإمبراطورية: learning, civic architecture and waqf institutions, not a named Sinan building or an assertion of untroubled imperial supremacy.
- `rise-of-the-ottoman-state` / `ch2` / قبيلة قايي: anonymous frontier settlement and community contact, not Ertuğrul, Osman, a documented Kayı event or a precise Söğüt view.

The exact composite campaign/chapter map supplies an image only for null/undefined authored fields. Every authored string, including empty/whitespace, wins. Unknown campaign/chapter IDs have no fallback. The route consumes this display value without mutating the campaign document, text, activities or progress. The existing compressed snapshot and generated remote chapter inventory remain byte-unchanged. A separate manifest and explicit local-path inventory prevent the remote pack generator from silently owning these illustrations; these are local application assets, not remotely uploaded storage objects. A future deliberate removal of this local default requires editing the explicit map, not treating null as a removal instruction.

## Technical export and provenance

Preserved candidate PNG bytes were preserved and verified against the private manifest. All three are RGB 1672×941. A deterministic technical crop removes 4 pixels from each horizontal edge, 2 from top and 3 from bottom, producing exact16:9 1664×936; Lanczos3 resizes to1600×900. No repainting, object replacement, text or creative change was introduced. Sharp0.35.5/libwebp1.6.0, quality74/effort6, metadata stripped by default. Full raw decode succeeds for all derivatives.

| Chapter | WebP bytes | SHA-256 |
|---|---:|---|
| Córdoba ch5 |167780|b8f991c4adb80ae6f3b02d44d23ca7805def2d74e89d36738707def1b36f696c|
| Ottoman golden ch10 |201540|4e1221e90c6cf9d1fb2972421f9869277dbbb3b235499dc8d5a1865b1ad698b6|
| Ottoman frontier ch2 |313360|9e5575223f5eba541d53f1234f7b3cb3465c4d8cea5fed1512a911b81cb79159|

Total682680bytes versus9286001bytes originals (~92.6% smaller); every output <320KiB. The chapter upload helper's180KiB is a soft processing target, not a hard rejection (`image-processor.ts` returns its best attempt with `degraded`, and chapter upload does not reject that flag). A bounded compression comparison found frontier still207238bytes at quality42; uniformquality74 was selected rather than sacrificing detail to chase180KiB. This is an explicit local-pack size allowance, not a change to the upload helper.

`public/campaign-key-art/interpretive-chapters.manifest.json` records original hashes, derivative hashes/bytes, exact crop, encoder versions/settings and exact source chapter JSON hashes. Original PNGs and private previews are not copied into the repository. Independent source/pixel review found no blocking thematic mismatch for these qualified uses. Full-size derivatives and390px technical gradient/title previews were inspected. The previews approximate route navy/color/font in SVG; they are not browser screenshots, exact font/layout acceptance or archaeological verification.

## Local acceptance and remaining limits

Actual imported route + actual CachedImage/resolver tests cover all three in-memory null-image bindings offline, authored existing image and absent-image branches. They assert exact DOM source, zero network/cache access, and repeated reading review preserves the exact unsent input node/value, question, post-setup storage/progress/RPC/reward/heart baselines. Existing ActivityRenderer remains a controlled input stub; JSDOM does not decode pixels or establish full activity behavior. Separate Sharp tests fully decode actual files and verify exact manifest/hash/dimensions/sourcechapter correspondence. Negative tests reject unknown IDs/path lookalikes and preserve authored URLs/empty strings.

No browser or Android runtime, visual navigation, historical authenticity, missing-original recovery, or production publication is claimed. Packaged Vite/static assets are present in this branch, but native offline acceptance remains a separate gate.
