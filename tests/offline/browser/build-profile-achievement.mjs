import { build } from "vite";
import tailwind from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export function validateOutput(output) {
  if (
    !output ||
    !path.isAbsolute(output) ||
    !/^\/tmp\/irth-profile-achievement-[A-Za-z0-9_-]+\/assets$/.test(output) ||
    path.resolve(output) !== output
  )
    throw Error("isolated temporary output required");
  for (let p = output; p !== "/"; p = path.dirname(p))
    if (fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink())
      throw Error("symlink output prohibited");
  if (fs.existsSync(output) && fs.readdirSync(output).length) throw Error("empty output required");
  return output;
}
export async function buildFixture(output) {
  validateOutput(output);
  const root = process.cwd(),
    fixture = path.resolve("tests/offline/browser/profile-achievement-boundary.ts");
  const boundaryImport = `import {state,unexpected,useProfile,useAccount,supabase,fetchUserAchievements} from ${JSON.stringify(fixture)};`;
  const stubs = new Map();
  const add = (id, body) => stubs.set(id.startsWith("src/") ? path.resolve(id) : id, body);
  add(
    "@tanstack/react-router",
    `import React from 'react'; export const createFileRoute=()=>options=>({options,useSearch:()=>({tab:'achievements'}),useNavigate:()=>()=>{}});export const useNavigate=()=>()=>{};export const Link=({to,children,...props})=>React.createElement('a',{...props,href:to},children);export const useRouterState=({select})=>select({location:{pathname:'/profile'}});`,
  );
  add("src/integrations/supabase/client.ts", boundaryImport + "export {supabase};");
  add("src/lib/profile.tsx", boundaryImport + "export {useProfile};");
  add("src/lib/account.tsx", boundaryImport + "export {useAccount};");
  add(
    "src/lib/achievements/v2/claim.functions.ts",
    boundaryImport +
      "export {fetchUserAchievements};export const claimAchievements=unexpected,repairHistoricalAchievements=unexpected,markAchievementsPresented=unexpected;",
  );
  const modules = {
    "src/lib/emblems/useEmblemUnlockContext.ts": "export const useEmblemUnlockContext=()=>({});",
    "src/lib/investigations/progress.ts":
      "export const useCanonicalInvestigationProgress=()=>({completedIds:[],count:0});",
    "src/lib/campaigns/completions.ts":
      "export const localCompletedIds=()=>[];export const fetchServerCompletedIds=async()=>({ids:[],userId:null});",
    "src/lib/diag-trace.ts": "export const recordTrace=()=>{},readTrace=()=>[],clearTrace=()=>{};",
    "src/lib/androidFreezeDiagnostics.ts":
      "export const isAndroidNativeApp=()=>false,isAndroidUltraStableMode=()=>false,androidMark=()=>{};",
    "src/lib/androidQuietMode.ts": "export const isSectionEnabled=()=>false;",
    "src/lib/navigation/overlay-registration.tsx":
      "export const OverlayDismissRegistration=()=>null;",
  };
  for (const [id, body] of Object.entries(modules)) add(id, body);
  for (const name of [
    "HUD",
    "FriendNotificationsPoller",
    "Avatar",
    "AvatarPicker",
    "CinematicPageBackdrop",
    "AccountSection",
    "CommunityHubSection",
    "DeleteAccountSection",
  ])
    add(`src/components/${name}.tsx`, `export const ${name}=()=>null;`);
  // Imported by unrelated Profile tabs; not mounted in this selected route state.
  const unrelated = {
    "src/lib/resetProgress.ts": ["clearLocalPlayerProgress"],
    "src/lib/newsletter.ts": ["fetchMyNewsletterSubscription", "setMyNewsletterSubscription"],
    "src/lib/feedback/api.ts": ["countMyUnreadFeedback"],
    "src/lib/worlds-progress.ts": ["useAllWorldsProgress"],
    "src/lib/campaignRecommendationService.ts": ["useCampaignRecommendation"],
    "src/lib/playerDiscoveries.ts": ["useUnifiedDiscoveryFeed"],
    "src/hooks/useAudioSettings.ts": ["useAudioSettings"],
  };
  for (const [id, names] of Object.entries(unrelated))
    add(id, boundaryImport + names.map((n) => `export const ${n}=unexpected;`).join(""));
  const expected = [
    "src/routes/profile.tsx",
    "src/components/AppShell.tsx",
    "src/components/ModalPortal.tsx",
    "src/lib/achievements/v2/driver.tsx",
    "src/lib/achievements/v2/engine.ts",
    "src/lib/achievements/v2/viewModel.ts",
    "src/lib/achievements/v2/registry.ts",
    "src/lib/achievements/v2/museum-presentation.ts",
    "src/lib/ui-language/store.ts",
    "src/styles.css",
  ];
  const seen = new Set();
  const boundary = {
    name: "synthetic-profile-boundary",
    enforce: "pre",
    resolveId(id, importer) {
      const candidates = [id];
      if (id.startsWith("@/")) candidates.push(path.resolve("src", id.slice(2)));
      if (importer && id.startsWith(".")) candidates.push(path.resolve(path.dirname(importer), id));
      for (const c of candidates)
        for (const ext of ["", ".ts", ".tsx"])
          if (stubs.has(c + ext)) return "\0profile-stub:" + c + ext;
      if (id.includes("supabase") || id.includes("/integrations/"))
        throw Error("backend module prohibited");
    },
    load(id) {
      if (id.startsWith("\0profile-stub:")) return stubs.get(id.slice("\0profile-stub:".length));
    },
    transform(_code, id) {
      if (id.startsWith("\0profile-stub:")) return;
      if (id.includes("/src/integrations/") || id.includes("/node_modules/@supabase/"))
        throw Error("backend module prohibited");
      for (const item of expected) if (id === path.join(root, item)) seen.add(item);
    },
    generateBundle() {
      if (expected.some((x) => !seen.has(x))) throw Error("real Profile dependency missing");
    },
  };
  await build({
    configFile: false,
    envDir: false,
    publicDir: false,
    plugins: [boundary, tailwind()],
    logLevel: "silent",
    resolve: { alias: { "@": path.resolve("src") } },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      outDir: output,
      emptyOutDir: false,
      minify: false,
      rolldownOptions: {
        input: path.resolve("tests/offline/browser/profile-achievement-fixture.tsx"),
        output: { entryFileNames: "fixture.js", assetFileNames: "assets/[name]-[hash][extname]" },
      },
    },
  });
  const css = fs.readdirSync(path.join(output, "assets")).filter((x) => x.endsWith(".css"));
  if (!css.length) throw Error("production CSS absent");
  fs.writeFileSync(
    path.join(output, "index.html"),
    '<!doctype html><html lang="ar" dir="rtl" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      css.map((x) => `<link rel="stylesheet" href="/assets/${x}">`).join("") +
      '</head><body><div id="app"></div><script type="module" src="/fixture.js"></script></body></html>',
  );
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await buildFixture(process.argv[2]);
