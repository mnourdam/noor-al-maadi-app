# Neutral disclosure for recorded article sources

Public-compatible local base `c97b106bb1c42ff654c0f2b65efa3e55feddd1ee`, tree `95d9a5c28bbcb1b0212f10ee4547eb2c418bf655`. No production deployment or authored content changes.

Exact Arabic UI text, reviewed before implementation:

> هذه المراجع مسجّلة مع المقال؛ إدراجها هنا لا يعني التحقق من دقة نسبتها أو مطابقتها لكل ما ورد فيه.

A shared subordinate paragraph appears below each existing citation-section heading and before entries. Sources retains `المراجع`; original references uses `المراجع الأصلية`. This describes what inclusion alone establishes, not a factual claim that a source is fabricated, inaccurate, never reviewed or not externally verified. The two distinct sections each carry their disclosure when both occur; entries and dedup remain unchanged.

## Source inspection

Actual packaged Duraid record `9991b145-622f-480b-aa59-93c50c01d0fe` has six body.sources title/author pairs and no body.references. Its metadata `canonical:true` identifies the entity, not citation verification. ArticleSource/parser/Sources expose no supported verification authority contract. Across packaged body/metadata source entries, keys observed are title4520/author4509/section873/note5, with no verification/status/evidence keys. This does not prove no outside verification has ever happened.

The admin import quality classifier separately calls entries strong when an author, valid URL or note exists, and labels two strong entries `verified`. That heuristic is not a historical source audit or a player-facing verification credential. It is untouched here. Unsupported synthetic `verified:true` metadata is inert in the route and neither creates a badge nor suppresses neutral disclosure.

## Local checks

Actual public entity route tests include Duraid six exact source names/authors/order, real dinar six original references, Arabic/English UI changes with canonical content retained, unchanged identity/input bytes, both sections together, preserved source notes and href bytes, and inert metadata. Existing malformed/dedup/safe-reference-link controls remain. No parser, source values, source URL behavior, snapshot, catalog or approval change.

JSDOM tests are not visual/browser/native verification. Actual visual review remains separately pending parent-owned permitted tooling; no local Chromium, emulator or CI is launched in this slice. Commands: dedicated reference-route suite, both TypeScript no-emit configurations, diffcheck.

Static receipts: final actual route suite 5/5 PASS, both TypeScript no-emit checks PASS, diffcheck clean. Independent static review and tiny test-only TypeScript correction cleared. Two unsupported `exact` query options were removed; literal accessible-name matching is unchanged. Actual visual acceptance remains pending separately and is not implied by this commit.
