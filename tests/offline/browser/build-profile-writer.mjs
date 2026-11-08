import { build } from "vite";
import fs from "node:fs";
import path from "node:path";
const root = process.cwd(),
  output = process.argv[2];
if (!output) throw Error("temporary output required");
const mocks = new Map(
  [
    [
      "@/integrations/supabase/client",
      "export const supabase={auth:{getSession:async()=>({data:{session:null}})},rpc:async()=>{throw Error('network forbidden')}};",
    ],
    [
      "@/lib/identity/reset",
      "export const resetForIdentityChange=async()=>{throw Error('reset not part of fixture')};",
    ],
    [
      "@/lib/streak-activity",
      "export const recordStreakActivity=async()=>{throw Error('streak not part of fixture')};",
    ],
    [
      "@/lib/emblems/avatar-persistence",
      "export const persistAvatarSelection=async()=>{throw Error('avatar not part of fixture')};",
    ],
    ["@/lib/diag-trace", "export const recordTrace=()=>{};"],
    [
      "@/lib/androidFreezeDiagnostics",
      "export const androidMeasure=()=>{};export const recordAndroidAction=()=>{};",
    ],
  ].map(([id, value]) => [path.join(root, "src", id.slice(2)), value]),
);
const strip = (p) => p.replace(/\.(tsx?|jsx?)$/, "");
await build({
  root,
  publicDir: false,
  configFile: false,
  logLevel: "warn",
  resolve: { alias: { "@": path.join(root, "src") } },
  plugins: [
    {
      name: "profile-writer-isolation",
      enforce: "pre",
      resolveId(source, importer) {
        let key = source;
        if (source.startsWith("@/")) key = path.join(root, "src", source.slice(2));
        else if (source.startsWith(".") && importer && !importer.startsWith("\0"))
          key = path.resolve(path.dirname(importer), source);
        key = strip(key);
        if (mocks.has(key)) return "\0profile-writer:" + key;
      },
      load(id) {
        if (id.startsWith("\0profile-writer:"))
          return mocks.get(id.slice("\0profile-writer:".length));
      },
    },
  ],
  build: {
    outDir: output,
    emptyOutDir: false,
    minify: false,
    rolldownOptions: {
      input: path.join(root, "tests/offline/browser/profile-writer-fixture.tsx"),
      output: { entryFileNames: "fixture.js" },
    },
  },
});
fs.writeFileSync(
  path.join(output, "index.html"),
  '<meta charset="utf-8"><div id="app"></div><script type="module" src="/fixture.js"></script>',
);
