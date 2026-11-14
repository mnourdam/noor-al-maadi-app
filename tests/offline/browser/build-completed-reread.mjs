import { build } from "vite";
import tailwind from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
export function validateOutput(output) {
  if (
    !output ||
    !path.isAbsolute(output) ||
    !/^\/tmp\/irth-completed-reread-[A-Za-z0-9_-]+\/assets$/.test(output) ||
    path.resolve(output) !== output
  )
    throw Error("isolated temporary output required");
  for (let p = output; p !== "/"; p = path.dirname(p))
    if (fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink())
      throw Error("symlink output prohibited");
  if (fs.existsSync(output) && fs.readdirSync(output).length) throw Error("empty output required");
  return output;
}

export const ART_PATH = "campaign-key-art/chapters/cordoba-golden-age/ch5/interpretive-v1.webp";
export const ART_SHA = "b8f991c4adb80ae6f3b02d44d23ca7805def2d74e89d36738707def1b36f696c";
export function verifiedArt(root) {
  const file = path.join(root, "public", ART_PATH);
  for (let p=file;p!==path.dirname(root);p=path.dirname(p)) {
    if (fs.lstatSync(p).isSymbolicLink()) throw Error("symlink art prohibited");
    if (p===root) break;
  }
  const bytes=fs.readFileSync(file);
  if(bytes.toString("ascii",0,4)!=="RIFF"||bytes.toString("ascii",8,12)!=="WEBP")throw Error("WebP required");
  if(createHash("sha256").update(bytes).digest("hex")!==ART_SHA)throw Error("art bytes changed");
  return bytes;
}

export async function buildFixture(output) {
  validateOutput(output);
  const root=process.cwd();
  const art=verifiedArt(root);
  const fixture=path.resolve("tests/offline/browser/completed-reread-boundary.ts");
  const pre=`import React from 'react';import {campaign,profile,metrics,count,unexpected,supabase} from ${JSON.stringify(fixture)};`;
  const stubs=new Map();
  const add=(id,body)=>stubs.set(id.startsWith("src/")?path.resolve(id):id,pre+body);
  add("src/lib/profile.tsx", "export const useProfile=()=>({profile,addPoints:()=>count('points'),addDinars:()=>count('coins'),loseHeartOnce:()=>count('heart'),recordStreakActivity:async()=>count('streak')});");
  add("src/integrations/supabase/client.ts","export {supabase};");
  add("src/lib/progressSync.ts","export const upsertChapterProgress=async()=>{count('save');return {acknowledged:true,queued:false}};export const addCollectionItems=unexpected;");
  add("src/lib/supabaseCampaigns.ts","export const fetchCampaignByIdOrSlug=unexpected;export const fetchPublishedFeed=unexpected;export const onCampaignPublished=()=>()=>{};");
  add("src/lib/memory/index.ts","export const ensurePlan=()=>{count('plan');return null};export const harvestCampaignIntoBank=()=>count('harvest');export const refreshMemoryBank=async()=>count('refresh');export const isReviewMarker=()=>false;export const clearPlan=()=>count('clearPlan');export const buildRuntimeActivities=unexpected;export const markReviewCompleted=unexpected;export const findItem=unexpected;export const grantReviewXp=unexpected;export const upsertEntry=unexpected;export const getEntry=unexpected;export const bumpDaily=unexpected;export const nextAfterCorrect=unexpected;export const nextAfterWrong=unexpected;");
  add("src/components/memory/ReviewActivity.tsx","export const ReviewActivity=()=>null;");
  add("src/lib/campaigns/completions.ts","export const recordCampaignCompletion=async()=>count('completion');");
  add("src/lib/campaigns/useCampaignProgression.ts","export const useCampaignLockStatus=()=>({locked:false});");
  add("src/components/campaigns/CampaignIntroGate.tsx","export const CampaignIntroGate=({children})=>children;");
  add("src/components/campaigns/CampaignIntroPlayer.tsx","export const CampaignIntroPlayer=()=>null;");
  add("src/lib/campaigns/intro/resolve.ts","export const resolveCampaignIntro=()=>null;");
  add("src/lib/campaignArtwork.tsx","export const CampaignArtwork=()=>null;export const hasCampaignKeyArt=()=>false;");
  add("src/components/KeyArtDissolve.tsx","export const KeyArtDissolve=()=>null;");
  add("src/components/AppShell.tsx","export const AppShell=({children})=>React.createElement('main',null,children);");
  add("src/components/ReadingScale.tsx","export const ReadingScale=({children})=>children;");
  add("src/components/feedback/FeedbackCTA.tsx","export const FeedbackCTA=()=>null;");
  add("src/components/imported-campaign/UnlockList.tsx","export const UnlockList=()=>null;");
  add("src/components/imported-campaign/OutOfHeartsModal.tsx","export const OutOfHeartsModal=({open})=>open?React.createElement('div',{'data-testid':'hearts-modal'},'hearts'):null;");
  add("src/components/imported-campaign/CampaignCompleteModal.tsx","export const CampaignCompleteModal=({open})=>open?React.createElement('div',{'data-testid':'completion-modal'},'completion'):null;");
  add("src/lib/audioManager.ts","export const audioManager={playSfx:()=>{}};");
  add("src/components/games/sfx.ts","export const sfx=()=>{};");
  add("src/lib/diag-trace.ts","export const recordTrace=()=>{};");
  add("src/lib/navigation/engine.ts","export const useOverlayDismiss=()=>{};");
  add("src/lib/navigation/overlay-registration.tsx","export const OverlayDismissRegistration=()=>null;");
  add("src/lib/display-names.ts","export const displayBadgeName=x=>x;export const displayArtifactName=x=>x;");
  const expected=["src/routes/campaigns.imported.$id.index.tsx","src/routes/campaigns.imported.$id.chapter.$chapter.tsx","src/lib/identity/owner.ts","src/lib/identity/partition.ts","src/lib/importedCampaignProgress.ts","src/lib/campaignLedger.ts","src/lib/campaignRewardsGranted.ts","src/components/imported-campaign/ActivityRenderer.tsx","src/components/imported-campaign/ActivityReviewCard.tsx","src/components/imported-campaign/ChapterReadingReview.tsx","src/components/imported-campaign/RichReadingText.tsx","src/styles.css","src/components/CachedImage.tsx","src/lib/image-cache.ts","src/lib/campaign-art/interpretive-chapters.ts"];
  const seen = new Set();
  const boundary = {
    name: "synthetic-completed-reread-boundary",
    enforce: "pre",
    resolveId(id, importer) {
      const candidates = [id];
      if (id.startsWith("@/")) candidates.push(path.resolve("src", id.slice(2)));
      if (importer && id.startsWith(".")) candidates.push(path.resolve(path.dirname(importer), id));
      for (const c of candidates)
        for (const ext of ["", ".ts", ".tsx"])
          if (stubs.has(c + ext)) return "\0completed-reread-stub:" + c + ext;
      if (id.includes("supabase") || id.includes("/integrations/"))
        throw Error("backend module prohibited");
    },
    load(id) {
      if (id.startsWith("\0completed-reread-stub:")) return stubs.get(id.slice("\0completed-reread-stub:".length));
    },
    transform(_code, id) {
      if (id.startsWith("\0completed-reread-stub:")) return;
      if (id.includes("/src/integrations/") || id.includes("/node_modules/@supabase/"))
        throw Error("backend module prohibited");
      for (const item of expected) if (id === path.join(root, item)) seen.add(item);
    },
    generateBundle() {
      if (expected.some((x) => !seen.has(x))) throw Error("real reread dependency missing");
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
        input: path.resolve("tests/offline/browser/completed-reread-fixture.tsx"),
        output: { entryFileNames: "fixture.js", assetFileNames: "assets/[name]-[hash][extname]" },
      },
    },
  });
  const artTarget=path.join(output,ART_PATH);fs.mkdirSync(path.dirname(artTarget),{recursive:true});fs.writeFileSync(artTarget,art);
  if(!fs.readFileSync(artTarget).equals(art))throw Error("copied art mismatch");
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
