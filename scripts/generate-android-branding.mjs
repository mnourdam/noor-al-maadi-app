#!/usr/bin/env node
/**
 * Generates the full Android branding asset set from a small number of master
 * inputs the designer keeps under `branding/android/`:
 *
 *   - launcher.png    (1024x1024 RGBA — Play Store / listing icon only)
 *   - foreground.svg  (transparent — canonical app/splash/launcher mark)
 *   - monochrome.svg  (transparent, single-color — Android 13+ themed icon)
 *   - notification.svg(transparent, white — FCM/status-bar icon)
 *
 * Outputs (all overwritten on every run):
 *
 *   res/mipmap-{m,h,x,xx,xxx}hdpi/ic_launcher.png         (legacy square)
 *   res/mipmap-{m,h,x,xx,xxx}hdpi/ic_launcher_round.png   (legacy round)
 *   res/drawable/ic_launcher_foreground.xml               (vector adaptive fg)
 *   res/drawable/ic_launcher_monochrome.xml               (themed icon)
 *   res/drawable/ic_stat_notify.xml                       (notification icon)
 *   res/drawable/ic_splash_icon.xml                       (Android 12 splash)
 *   res/mipmap-anydpi-v26/ic_launcher.xml                 (adaptive + mono)
 *   res/mipmap-anydpi-v26/ic_launcher_round.xml           (adaptive + mono)
 *   res/values/ic_launcher_background.xml                 (brand navy)
 *   res/values/colors.xml                                 (notify + splash)
 *   branding/play-store/icon-512.png                      (Play listing)
 *
 * Run with: `node scripts/generate-android-branding.mjs`.
 * Wired into `npm run sync:android` so APK builds always see fresh assets.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = dirname(fileURLToPath(import.meta.url)) + "/..";
const SRC_DIR = join(ROOT, "branding", "android");
const RES = join(ROOT, "android", "app", "src", "main", "res");
const PLAY_DIR = join(ROOT, "branding", "play-store");

const LAUNCHER = join(SRC_DIR, "launcher.png");
const FOREGROUND_SVG = join(SRC_DIR, "foreground.svg");
const MONOCHROME_SVG = join(SRC_DIR, "monochrome.svg");
const NOTIFICATION_SVG = join(SRC_DIR, "notification.svg");

for (const f of [LAUNCHER, FOREGROUND_SVG, MONOCHROME_SVG, NOTIFICATION_SVG]) {
  if (!existsSync(f)) {
    console.error(`[android-branding] missing master asset: ${f}`);
    process.exit(1);
  }
}

// Brand tokens — sampled from launcher.png + foreground.svg.
const BRAND_GOLD = "#E1BA59";
const BRAND_NAVY = "#02111E";

// dp targets for mipmap density buckets. Legacy icon = 48dp, adaptive
// foreground/background must be rendered at 108dp.
const DENSITIES = [
  { name: "mdpi", scale: 1 },
  { name: "hdpi", scale: 1.5 },
  { name: "xhdpi", scale: 2 },
  { name: "xxhdpi", scale: 3 },
  { name: "xxxhdpi", scale: 4 },
];

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function write(p, data) {
  ensureDir(dirname(p));
  writeFileSync(p, data);
  console.log(`[android-branding] wrote ${p}`);
}

// ---------------------------------------------------------------------------
// Raster outputs (launcher PNGs)
// ---------------------------------------------------------------------------
async function makeRasterIcons() {
  const foregroundBuf = readFileSync(FOREGROUND_SVG);
  for (const { name, scale } of DENSITIES) {
    const legacy = Math.round(48 * scale);
    const dir = join(RES, `mipmap-${name}`);
    ensureDir(dir);

    // Legacy launcher fallback: render the SAME transparent gold foreground
    // used by the adaptive icon. Android 12+ and some OEM launchers can fall
    // back to `applicationInfo.icon` during the system pre-splash; if these
    // PNGs contain a baked navy/black plate, that plate appears as the cold-
    // start square even when `windowSplashScreenAnimatedIcon` is transparent.
    await sharp(foregroundBuf)
      .resize(legacy, legacy, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(join(dir, "ic_launcher.png"));

    // Round fallback also stays transparent; the launcher/system owns any
    // mask/background. Do not bake a plate into this bitmap.
    await sharp(foregroundBuf)
      .resize(legacy, legacy, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(join(dir, "ic_launcher_round.png"));

    // Adaptive icons are handled entirely via the vector drawable
    // `@drawable/ic_launcher_foreground` referenced from mipmap-anydpi-v26;
    // there is no raster fallback file to write here.
  }
  console.log("[android-branding] rasterized launcher icons");
}

async function makePlayStoreIcon() {
  ensureDir(PLAY_DIR);
  await sharp(readFileSync(LAUNCHER))
    .resize(512, 512, { fit: "cover" })
    .flatten({ background: BRAND_NAVY })
    .png({ compressionLevel: 9 })
    .toFile(join(PLAY_DIR, "icon-512.png"));
  console.log("[android-branding] wrote Play Store icon-512.png");
}

// ---------------------------------------------------------------------------
// SVG → Android Vector Drawable converter (paths, polygons, rects)
// ---------------------------------------------------------------------------
function parseViewBox(svg) {
  const m = svg.match(/viewBox="([\d.\s-]+)"/);
  if (!m) throw new Error("viewBox missing");
  const [, , w, h] = m[1].trim().split(/\s+/).map(Number);
  return { w, h };
}

function polygonToPath(points) {
  // SVG polygon points may use commas, spaces, or both as separators.
  // Flatten to a numeric stream and rebuild as (x,y) pairs so the output
  // path is always a valid Android `pathData` string.
  const nums = points.trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (nums.length < 4) return "";
  let d = `M${nums[0]},${nums[1]}`;
  for (let i = 2; i < nums.length; i += 2) d += `L${nums[i]},${nums[i + 1]}`;
  return d + "Z";
}

function rectToPath(attrs) {
  const x = Number(attrs.x ?? 0);
  const y = Number(attrs.y ?? 0);
  const w = Number(attrs.width ?? 0);
  const h = Number(attrs.height ?? 0);
  return `M${x},${y}h${w}v${h}h${-w}Z`;
}

function parseAttrs(tag) {
  const attrs = {};
  for (const m of tag.matchAll(/(\w[\w:-]*)="([^"]*)"/g)) attrs[m[1]] = m[2];
  return attrs;
}

function classFill(cls, svg) {
  // Very small CSS lookup: find `.cls { fill: X }` inside <style>.
  const styleBlock = svg.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!styleBlock) return null;
  const re = new RegExp(`\\.${cls}\\s*\\{[^}]*fill:\\s*([^;\\}]+)`);
  const m = styleBlock[1].match(re);
  return m ? m[1].trim() : null;
}

function svgToVector(svg, { widthDp, heightDp, fillOverride }) {
  const { w, h } = parseViewBox(svg);
  const parts = [];
  // <path d="..." class="stX"/>
  for (const m of svg.matchAll(/<path\b([^/>]*)\/>/g)) {
    const a = parseAttrs(m[0]);
    if (!a.d) continue;
    const cls = a.class;
    let fill = a.fill ?? (cls ? classFill(cls, svg) : null);
    if (!fill || fill === "none") continue;
    if (fillOverride) fill = fillOverride;
    parts.push(`    <path android:fillColor="${fill}" android:pathData="${a.d}"/>`);
  }
  for (const m of svg.matchAll(/<polygon\b([^/>]*)\/>/g)) {
    const a = parseAttrs(m[0]);
    if (!a.points) continue;
    const cls = a.class;
    let fill = a.fill ?? (cls ? classFill(cls, svg) : null);
    if (!fill || fill === "none") continue;
    if (fillOverride) fill = fillOverride;
    parts.push(`    <path android:fillColor="${fill}" android:pathData="${polygonToPath(a.points)}"/>`);
  }
  for (const m of svg.matchAll(/<rect\b([^/>]*)\/>/g)) {
    const a = parseAttrs(m[0]);
    if (a.transform) continue; // rotated decorative speckles — skip safely.
    const cls = a.class;
    let fill = a.fill ?? (cls ? classFill(cls, svg) : null);
    if (!fill || fill === "none") continue;
    if (fillOverride) fill = fillOverride;
    parts.push(`    <path android:fillColor="${fill}" android:pathData="${rectToPath(a)}"/>`);
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<!-- AUTO-GENERATED by scripts/generate-android-branding.mjs — do not edit. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="${widthDp}dp"
    android:height="${heightDp}dp"
    android:viewportWidth="${w}"
    android:viewportHeight="${h}">
${parts.join("\n")}
</vector>
`;
}

// Inline the brand mark inside a 108x108 viewport so the adaptive system mask
// keeps a generous safe area around the foreground glyph.
function svgToAdaptiveForeground(svg) {
  const { w, h } = parseViewBox(svg);
  const safe = 72; // dp inside the 108dp adaptive canvas
  const scale = safe / Math.max(w, h);
  const drawW = w * scale;
  const drawH = h * scale;
  const tx = (108 - drawW) / 2;
  const ty = (108 - drawH) / 2;

  const inner = [];
  for (const m of svg.matchAll(/<path\b([^/>]*)\/>/g)) {
    const a = parseAttrs(m[0]);
    if (!a.d) continue;
    let fill = a.fill ?? (a.class ? classFill(a.class, svg) : null);
    if (!fill || fill === "none") continue;
    inner.push(`        <path android:fillColor="${fill}" android:pathData="${a.d}"/>`);
  }
  for (const m of svg.matchAll(/<polygon\b([^/>]*)\/>/g)) {
    const a = parseAttrs(m[0]);
    if (!a.points) continue;
    let fill = a.fill ?? (a.class ? classFill(a.class, svg) : null);
    if (!fill || fill === "none") continue;
    inner.push(`        <path android:fillColor="${fill}" android:pathData="${polygonToPath(a.points)}"/>`);
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<!-- AUTO-GENERATED by scripts/generate-android-branding.mjs — do not edit. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <group
        android:translateX="${tx.toFixed(3)}"
        android:translateY="${ty.toFixed(3)}"
        android:scaleX="${scale.toFixed(6)}"
        android:scaleY="${scale.toFixed(6)}">
${inner.join("\n")}
    </group>
</vector>
`;
}

// Splash-only foreground for the Android 12+ SplashScreen API.
// Per Google's launch-screen spec, the animated icon drawable is a 108dp
// canvas scaled into a 288dp system icon window with only the inner ~192dp
// visible (2/3 of the canvas). Content must fit inside a ~72dp centered
// box in the 108dp viewport — otherwise OEM circular masks clip the mark
// and the frame reads as a boxed plate. Keep as plain <vector> (NOT an
// <adaptive-icon>) so the system does not draw a launcher-style plate.
function svgToSplashIcon(svg) {
  const { w, h } = parseViewBox(svg);
  const fill = 72; // dp — matches Google's "no icon background" visible zone
  const scale = fill / Math.max(w, h);
  const drawW = w * scale;
  const drawH = h * scale;
  const tx = (108 - drawW) / 2;
  const ty = (108 - drawH) / 2;

  const inner = [];
  for (const m of svg.matchAll(/<path\b([^/>]*)\/>/g)) {
    const a = parseAttrs(m[0]);
    if (!a.d) continue;
    let f = a.fill ?? (a.class ? classFill(a.class, svg) : null);
    if (!f || f === "none") continue;
    inner.push(`        <path android:fillColor="${f}" android:pathData="${a.d}"/>`);
  }
  for (const m of svg.matchAll(/<polygon\b([^/>]*)\/>/g)) {
    const a = parseAttrs(m[0]);
    if (!a.points) continue;
    let f = a.fill ?? (a.class ? classFill(a.class, svg) : null);
    if (!f || f === "none") continue;
    inner.push(`        <path android:fillColor="${f}" android:pathData="${polygonToPath(a.points)}"/>`);
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<!-- AUTO-GENERATED by scripts/generate-android-branding.mjs — do not edit.
     Splash-only vector: content fills ~72dp of the 108dp canvas so the
     Android 12+ SplashScreen API renders the mark cleanly inside its inner
     192dp visible zone without OEM masks clipping to a plate. Do NOT
     reference this drawable from any adaptive-icon XML. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <group
        android:translateX="${tx.toFixed(3)}"
        android:translateY="${ty.toFixed(3)}"
        android:scaleX="${scale.toFixed(6)}"
        android:scaleY="${scale.toFixed(6)}">
${inner.join("\n")}
    </group>
</vector>
`;
}

// ---------------------------------------------------------------------------
// XML resources
// ---------------------------------------------------------------------------
function writeVectors() {
  const fgSvg = readFileSync(FOREGROUND_SVG, "utf8");
  const monoSvg = readFileSync(MONOCHROME_SVG, "utf8");
  const notifSvg = readFileSync(NOTIFICATION_SVG, "utf8");

  const fgVector = svgToAdaptiveForeground(fgSvg);
  const splashVector = svgToSplashIcon(fgSvg);
  const monoVector = svgToVector(monoSvg, {
    widthDp: 108,
    heightDp: 108,
    fillOverride: "#FFFFFF",
  });

  // Adaptive foreground vector. We write the same drawable into BOTH the
  // unqualified `drawable/` bucket AND `drawable-anydpi-v24/`. The v24
  // bucket is what the resource merger picks when an adaptive-icon
  // (mipmap-anydpi-v26) references `@drawable/ic_launcher_foreground`
  // on certain AGP / AAPT2 versions; without it the link step fails with
  // "resource drawable/ic_launcher_foreground not found" even though the
  // unqualified file exists. Duplicating the vector is the standard fix
  // and matches the Android Studio Asset Studio output.
  write(join(RES, "drawable", "ic_launcher_foreground.xml"), fgVector);
  write(join(RES, "drawable-anydpi-v24", "ic_launcher_foreground.xml"), fgVector);

  // Themed (Android 13+) monochrome icon — same dual-bucket strategy.
  write(join(RES, "drawable", "ic_launcher_monochrome.xml"), monoVector);
  write(join(RES, "drawable-anydpi-v24", "ic_launcher_monochrome.xml"), monoVector);

  // Notification icon — small, single-color, fully transparent background so
  // the system can tint it for light/dark mode automatically.
  write(
    join(RES, "drawable", "ic_stat_notify.xml"),
    svgToVector(notifSvg, { widthDp: 24, heightDp: 24, fillOverride: "#FFFFFF" }),
  );

  // Splash icon for the Android 12+ SplashScreen API. Distinct from the
  // adaptive-icon foreground: fills ~96dp of the canvas (no safe-zone
  // padding) so the SplashScreen window shows the transparent gold mark
  // edge-to-edge instead of a small boxed launcher plate. The launch
  // theme supplies the navy background separately.
  write(join(RES, "drawable-anydpi-v26", "ic_splash_icon.xml"), splashVector);
  write(join(RES, "drawable", "ic_splash_icon.xml"), splashVector);
}

// Post-generation assertion: every drawable referenced by the adaptive icon
// XML must exist on disk before Gradle starts. Failing loudly here turns a
// silent CI link error ("resource drawable/ic_launcher_foreground not found")
// into an immediate, actionable script failure.
function verifyOutputs() {
  const required = [
    join(RES, "drawable", "ic_launcher_foreground.xml"),
    join(RES, "drawable-anydpi-v24", "ic_launcher_foreground.xml"),
    join(RES, "drawable", "ic_launcher_monochrome.xml"),
    join(RES, "drawable-anydpi-v24", "ic_launcher_monochrome.xml"),
    join(RES, "drawable", "ic_stat_notify.xml"),
    join(RES, "drawable", "ic_splash_icon.xml"),
    join(RES, "drawable-anydpi-v26", "ic_splash_icon.xml"),
    join(RES, "mipmap-anydpi-v26", "ic_launcher.xml"),
    join(RES, "mipmap-anydpi-v26", "ic_launcher_round.xml"),
    join(RES, "values", "ic_launcher_background.xml"),
    join(RES, "values", "colors.xml"),
  ];
  const missing = required.filter((p) => !existsSync(p));
  if (missing.length > 0) {
    console.error("[android-branding] FATAL: expected outputs missing:\n  - " + missing.join("\n  - "));
    process.exit(1);
  }
  console.log(`[android-branding] verified ${required.length} resource outputs`);
}

function writeXmlResources() {
  write(
    join(RES, "values", "ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BRAND_NAVY}</color>
</resources>
`,
  );

  write(
    join(RES, "values", "colors.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="colorPrimary">${BRAND_NAVY}</color>
    <color name="colorPrimaryDark">${BRAND_NAVY}</color>
    <color name="colorAccent">${BRAND_GOLD}</color>
    <color name="notification_accent">${BRAND_GOLD}</color>
    <color name="splash_background">${BRAND_NAVY}</color>
</resources>
`,
  );

  // Adaptive icon XML (square + round) with monochrome layer for themed icons.
  const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
    <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>
</adaptive-icon>
`;
  write(join(RES, "mipmap-anydpi-v26", "ic_launcher.xml"), adaptiveXml);
  write(join(RES, "mipmap-anydpi-v26", "ic_launcher_round.xml"), adaptiveXml);
}

// ---------------------------------------------------------------------------
// Cleanup: remove obsolete legacy assets the new pipeline replaces.
// ---------------------------------------------------------------------------
function cleanup() {
  const toRemove = [
    join(RES, "drawable", "splash.png"),
    join(RES, "drawable-v24", "ic_launcher_foreground.xml"),
    ...["land", "port"].flatMap((o) =>
      ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"].map((d) =>
        join(RES, `drawable-${o}-${d}`, "splash.png"),
      ),
    ),
  ];
  for (const f of toRemove) {
    if (existsSync(f)) {
      rmSync(f);
      console.log(`[android-branding] removed obsolete ${f}`);
    }
  }
}

// ---------------------------------------------------------------------------
async function main() {
  await makeRasterIcons();
  writeVectors();
  writeXmlResources();
  await makePlayStoreIcon();
  cleanup();
  verifyOutputs();
  console.log("[android-branding] done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
