import { build } from "vite";
import tailwind from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export function validateOutput(output) {
  if (
    !output ||
    !path.isAbsolute(output) ||
    !/^\/tmp\/irth-profile-quota-[A-Za-z0-9_-]+\/assets$/.test(output) ||
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
  for (const key of Object.keys(process.env)) if (key.startsWith("VITE_")) delete process.env[key];
  validateOutput(output);
  const root = process.cwd();
  const stubs = new Map();
  const add = (id, body) => stubs.set(id.startsWith("src/") ? path.resolve(id) : id, body);
  add("@tanstack/react-router", `import React from 'react';export const Link=({children})=>React.createElement('a',{},children);export const useRouterState=()=>'/synthetic';`);
  add("src/integrations/supabase/client.ts", "export const supabase={auth:{getSession:async()=>({data:{session:null}})},rpc:async()=>{throw Error('RPC forbidden')}};");
  add("src/lib/identity/reset.ts", "export const resetForIdentityChange=async()=>{throw Error('reset forbidden')};");
  add("src/lib/streak-activity.ts", "export const recordStreakActivity=async()=>{throw Error('streak forbidden')};");
  add("src/lib/emblems/avatar-persistence.ts", "export const persistAvatarSelection=async()=>{throw Error('avatar forbidden')};");
  add("src/lib/diag-trace.ts", "export const recordTrace=()=>{};");
  add("src/lib/androidFreezeDiagnostics.ts", "export const androidMeasure=()=>{},recordAndroidAction=()=>{},androidMark=()=>{},isAndroidUltraStableMode=()=>true;");
  add("src/lib/androidQuietMode.ts", "export const isSectionEnabled=()=>false;");
  for(const name of ["HUD","FriendNotificationsPoller","UiLanguageChooser"])
    add(`src/components/${name}.tsx`, `export const ${name}=()=>null;`);
  const expected=["src/lib/profile.tsx","src/lib/profile-writer.ts","src/components/AppShell.tsx","src/components/ProfileStorageWarning.tsx","src/lib/identity/owner.ts","src/lib/ui-language/store.ts","src/styles.css"];
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
        input: path.resolve("tests/offline/browser/profile-quota-fixture.tsx"),
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
