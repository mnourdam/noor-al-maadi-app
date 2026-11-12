// Bundle the actual dormant settlement primitive. No app plugins or backend.
import { build } from "vite";
import path from "node:path";
import fs from "node:fs";
const output = process.argv[2];
if (!output || !path.isAbsolute(output)) throw Error("absolute temporary output path required");
await build({
  root: process.cwd(), configFile: false, publicDir: false, logLevel: "warn",
  resolve: { alias: { "@": path.join(process.cwd(), "src") } },
  build: { outDir: output, emptyOutDir: false, minify: false,
    rolldownOptions: {
      input: path.join(process.cwd(), "tests/offline/browser/settlement-native-fixture.ts"),
      output: { entryFileNames: "fixture.js" },
    },
  },
});
fs.writeFileSync(path.join(output, "index.html"), '<meta charset="utf-8"><script type="module" src="/fixture.js"></script>');
