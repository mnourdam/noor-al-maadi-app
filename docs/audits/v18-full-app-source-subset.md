# V18 full-app candidate source subset

Exact public parent: ea871f4be1efb5c40c88e703a446140c78a0f09f, tree 892ed4f2c0741d548d2f21e465a0bf6c27b1a43e. The local assembly parent ea6e8280 has that exact tree; it is not the remote commit identity.

Overlay source is reviewed private checkpoint bfcb4789909e01f898fb4506ebe5fc2a1dc81b3f. Exactly 19 production src paths, 19 associated offline regression paths, and four existing reread-shell lane compatibility paths are copied byte-for-byte. This audit is the only newly authored path. No package/lock/Android/Capacitor/Vite/config/public-content/Supabase migration differences are introduced. Private decoder/promotion experiments and compiler research are not included.

The existing browser lane includes its reviewed related-note and bilingual reread controls; prior public six-group evidence does not establish these eight current groups. Fresh exact-source CI remains required. The native lane is a separate test-only addition, not included in this initial source slice.

Source retains all reviewed image-identity and bounded campaign read/refresh fixes plus generated English presentation/authored metadata selection. It does not translate Arabic narratives/answers, enable private-image picker, apply SQL proposals, change reward rules or constitute release acceptance. Genuine emulator/full-app and release-like minified/shrunk artifact checks remain mandatory. Synthetic backend boundaries cannot establish hosted auth/Storage/FCM/Play acceptance.

## Provenance

Image identity: 20fc05cb/72d23ba8/1b4a1186. Collection cover version: e691c779/9cb7eaac. Campaign refresh/artwork/direct lookup: e24f51d8/9125349e/4f3d29fd. Encyclopedia: 8ad900d8/35e41508. Reread generated controls: b7beb1b6/66d3add7. HUD: db6f7c62. Existing authored metadata: 045eeadd/b8c44fbf/c835ee1b. Empty collection: 52e711c2. Catalog/story generated chrome: 2b296588/607db206/8b8f3f45. These historical reviews establish provenance, not a fresh subset test result.

## Exact copied blobs

- `.github/workflows/v18-reread-shell-browser.yml`: `210759a4e1d029bd66ae1360dc0bdb8da00686f7`
- `src/components/HUD.tsx`: `0135ed291e4aae1d645737dbaef77f05a5ad8a49`
- `src/components/HUDStatPopovers.tsx`: `0236a5d45e5763fea54de91cc7892d00202c21ca`
- `src/components/encyclopedia/EncyclopediaRelatedEntities.tsx`: `5ec02d7da94d5e7b5be8a71028aadb1cce13cf3e`
- `src/components/encyclopedia/EncyclopediaUnavailable.tsx`: `0e28d5cc4d7e659a27bdd9289abe5fd11a4d41eb`
- `src/components/imported-campaign/ChapterReadingReview.tsx`: `761cbe3a111cac4ffb75fdbbe9e0f7594fa845a1`
- `src/components/stories/CollectionCard.tsx`: `1a1eaf9d89654eac1b2a911b8e1dcab6df6b276a`
- `src/components/stories/LockedStoryDialog.tsx`: `9e951381e17343635392c43d4cf1b26238de4a60`
- `src/components/stories/StoryCard.tsx`: `ec21fa775a0da8c4977f4746fa83b845a5413b68`
- `src/components/ui/dialog.tsx`: `8f9e80d0fb198387df95696599c8ec3d49fd64aa`
- `src/lib/campaignKeyArtOverlay.ts`: `169db75bf239e3b66eb5b43bc75ca0cc161ea78e`
- `src/lib/image-cache.ts`: `225822766c7403bf413319e352fb69202f105d05`
- `src/lib/stories/covers/resolve.ts`: `d768c70da049a29ba49c5c8f9ada21daa1cabe03`
- `src/lib/stories/display-metadata.ts`: `88ec51de78154f7a6d9887bfb09b5b3e57c11467`
- `src/lib/stories/duration.ts`: `7365564160e1a049c3844210a99f3b3d8c58d56d`
- `src/lib/stories/media/url.ts`: `2fff4ce5ad47ae450ee58429576eab0105f4cca0`
- `src/lib/supabaseCampaigns.ts`: `75127785419664f5d70cdf29b4f001f422411471`
- `src/lib/ui-language/messages.ts`: `668f69bf213e4c4b92e5f55fd3cde22481c52015`
- `src/routes/campaigns.imported.$id.chapter.$chapter.tsx`: `8c1f8bcaef444af9cd559012f36f04898123e3d3`
- `src/routes/stories.index.tsx`: `4a286a86bc66db98bab716ec2e45de80b08c5051`
- `tests/offline/browser/build-reread-shell.mjs`: `7c387b3e627fa7849402c48ce0f68359e9dedaaf`
- `tests/offline/browser/reread-shell-browser.py`: `fcd69f06433ea97e05b9409c34696f40e50cecf0`
- `tests/offline/browser/reread-shell-fixture.tsx`: `bb2a84e963f7453a23a32ad6916ee06b878ccdea`
- `tests/offline/outbox-cached-image-identity.test.tsx`: `6714ce8b9f6ec9dc2518c9591830844753af1395`
- `tests/offline/outbox-campaign-direct-lookup.test.ts`: `b53b3c0eb662d5d4cb5838c520617853e3e20c84`
- `tests/offline/outbox-campaign-reader-flight-integration.test.ts`: `2ed7b0597aa39c9d4e706731df36e7be9208960b`
- `tests/offline/outbox-campaign-refresh-flight.test.ts`: `ddd57117f90479005960043127c6adf05f2416ea`
- `tests/offline/outbox-chapter-reread.test.tsx`: `fee46a0e853c2fd9ba85f816d6768902ad9e5c87`
- `tests/offline/outbox-collection-cover-version.test.tsx`: `cc9a20311d6f093114427e5d161cfa5264b743c0`
- `tests/offline/outbox-collection-hero-metadata.test.tsx`: `813b8a1b1995e8b97cc9bde2b8bbf432c02bb5ec`
- `tests/offline/outbox-collection-metadata.test.tsx`: `78a6c431a99e24b84cb9f63c5def050f136cbcd6`
- `tests/offline/outbox-completed-chapter-reread.test.tsx`: `22400c84ed0d9f157bf054e6a13539359a4af68f`
- `tests/offline/outbox-encyclopedia-related-notes.test.tsx`: `1aae5353874a9b5c69375a85077843960cdf6f9c`
- `tests/offline/outbox-encyclopedia-retry-language.test.tsx`: `3351d1daa302463b7864bee5cba82386fc442b6d`
- `tests/offline/outbox-hud-popover-language.test.tsx`: `622dd9d1cf7119d59f78c63aceda9028159478ff`
- `tests/offline/outbox-key-art-overlay-flight.test.ts`: `006aa23749e27c185311eb812652f2286cae47c6`
- `tests/offline/outbox-story-cover-identity.test.tsx`: `4b1932bf6e70950b1d7d61a508f9182213744524`
- `tests/offline/outbox-story-dialog-chrome.test.tsx`: `1ee679b54d973a932d5e54537b8c7c9f2a2446be`
- `tests/offline/outbox-story-media-request-identity.test.tsx`: `c8b84db0434068f240fa7f53f3ff67c5294598a7`
- `tests/offline/outbox-storycard-metadata.test.tsx`: `cacfa8da566b17b8f4adc7d963f32d0d32484f5b`
- `tests/offline/outbox-ui-language-hud.test.tsx`: `60d58782873b696b448872aa60099080fa475a33`
- `tests/offline/outbox-ui-language.test.tsx`: `283db9274629c257728aec3b2b311235d828dad0`

## Current subset gates

Independent assembly review, focused/full aggregate, both TypeScript projects and current-lane build/guards are pending at initial freeze. No public push, emulator run or production change is claimed by this local assembly.

## Reviewed native diagnostic lane addition

Thirteen new test/workflow/audit paths copied exactly from independently reviewed 8cac98078245fe9ef40d947810448f535a48eb44. They preserve actual app source and build only a fresh isolated copy. Current journey contract explicitly retains five BLOCKED groups where synthetic prerequisites are absent; the English/native lifecycle attempt is narrowly scoped. Overall blocked/failed groups remain nonzero and release_ready=false. This is a first diagnostic emulator route, not six-feature acceptance. Existing SDK licenses only, no host permission changes, Intel macOS existing HVF only. Final actual web build and emulator execution remain pending.

- `.github/workflows/v18-android-full-app.yml`: `c7478b974b4e99c9eb4dd9f5aeb7df009bb84b87`
- `docs/audits/v18-android-full-app-contract.md`: `4d8832c16246564f0494d317d73e419e7dab0c4d`
- `docs/audits/v18-intel-native-runner.md`: `37d2ec3acc06e1688843fcb34bd3ee5667e13810`
- `tests/native-app/build-full-app.py`: `5204db0da7299de08647ae92732aab4454818231`
- `tests/native-app/journeys.py`: `d5368cfc3aca60608373523c93e2c895303a1738`
- `tests/native-app/loader.mjs`: `967208e17c0ceaba6680385994077ddb65eafa09`
- `tests/native-app/prepare-full-app.py`: `38f0cfba7cf8d1ee73814e93763580c7c2a75360`
- `tests/native-app/runner.py`: `bd3431373ea399a3f6572cfaba7e19268c186a18`
- `tests/native-app/test-transport.mjs`: `26d32f79a52e2ef4aaa0cc4502e6d97324a16174`
- `tests/native-app/test_full_app.py`: `eb93579bf306d5a9d7acd6553a160e0675aa11a5`
- `tests/native-app/test_journeys.py`: `0ead01a647a4ba998681757f370a9ca5ed441bd6`
- `tests/native-app/test_runner.py`: `d8450ed2cc2be4e0ba5a9913aa8f77b0d6e4566c`
- `tests/native-app/transport.js`: `371c0cd83e75c900b3fe0f45000616aef02875b7`

Source-only subset ba15962f passes fresh 2,104 tests / 123 files and both TypeScript projects under the existing npm graph. No production-source/dependency delta is introduced by the native lane. Full combined static guards and final web build remain coordinator gates.

## Final local assembly evidence

Independent source assembly review verified all 42 copied blobs and entire production src equality with bfcb4789. Independent combined review verified all 13 native blobs equal 8cac9807 and 31 Python + 6 JavaScript guards. Coordinator fresh combined d397908c validation: actual offline Android Vite web graph built in 4.22 seconds from a fresh scrubbed copy, no generators/server/native execution; 31 Python + 6 JavaScript native guards and four existing reread build guards passed. Current reread fixture static bundle and Python AST passed. Source-only subset ba15962f full aggregate 2,104/2,104 across 123 files and both TypeScript projects passed; subsequent combined addition changes only test/workflow/audit paths. No APK, emulator or full six-journey result exists yet. All per-group blocked/failed results remain nonzero; release readiness remains false.
