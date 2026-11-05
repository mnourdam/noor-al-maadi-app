// Build the actual coordinator and adapter and its real storage/identity dependencies; no app plugins.
import { build } from "vite";
import path from "node:path";
import fs from "node:fs";
const root = process.cwd(),
  output = process.argv[2];
if (!output) throw Error("temporary output path required");
const plugin = {
  name: "transition-test-boundaries",
  enforce: "pre",
  resolveId(id) {
    if (id === "../diag-trace" || /(?:^@|\/src)\/lib\/diag-trace(?:\.ts)?$/.test(id))
      return "\0test-diag";
    if (/(?:^@|\/src)\/lib\/offline\/record(?:\.ts)?$/.test(id)) return "\0test-record";
  },
  load(id) {
    if (id === "\0test-diag") return "export const recordTrace=()=>{};";
    if (id === "\0test-record")
      return "export async function recordChapterProgress(){throw Error('RPC forbidden');}";
  },
};
await build({
  root,
  publicDir: false,
  configFile: false,
  logLevel: "warn",
  plugins: [plugin],
  resolve: { alias: { "@": path.join(root, "src") } },
  build: {
    outDir: output,
    emptyOutDir: false,
    minify: false,
    rolldownOptions: {
      input: path.join(root, "tests/offline/browser/guest-transition-fixture.ts"),
      output: { entryFileNames: "fixture.js" },
    },
  },
});
fs.writeFileSync(
  path.join(output, "index.html"),
  '<meta charset="utf-8"><script type="module" src="/fixture.js"></script>',
);
