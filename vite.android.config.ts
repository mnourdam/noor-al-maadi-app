// Capacitor/Android-only Vite config.
//
// This deliberately bypasses the Lovable/TanStack Start Vite wrapper. That
// wrapper always installs the TanStack Start plugin, which performs a
// multi-environment SSR build and emits `server/...` output that a Capacitor
// WebView cannot run. Android needs one plain static SPA at `dist/android`.
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import path from "node:path";

function androidHtmlPlugin(): Plugin {
  return {
    name: "irth-android-html",
    enforce: "pre",
    resolveId(id) {
      return id === "\0irth-android-index.html" ? id : null;
    },
    load(id) {
      if (id !== "\0irth-android-index.html") return null;
      return `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0b1424" />
    <title>إرث — رحلة عبر التاريخ الإسلامي</title>
    <script type="module" src="/src/android-client.tsx"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;
    },
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === "/" || req.url === "/index.html") {
          req.url = "/\0irth-android-index.html";
        }
        next();
      });
    },
  };
}

export default defineConfig({
  appType: "spa",
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@tanstack/react-start/server": path.resolve(
        __dirname,
        "./src/shims/tanstack-react-start-server.android.ts",
      ),
    },
    dedupe: ["react", "react-dom", "@tanstack/react-query", "@tanstack/query-core"],
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env.TSS_SERVER_FN_BASE": JSON.stringify("/_server"),
    "process.env.TSS_ROUTER_BASEPATH": JSON.stringify("/"),
    "process.env.TSS_DEV_SERVER": JSON.stringify("false"),
    "process.env.TSS_DEV_SSR_STYLES_ENABLED": JSON.stringify("false"),
    "process.env.TSS_DEV_SSR_STYLES_BASEPATH": JSON.stringify("/"),
    "process.env.TSS_INLINE_CSS_ENABLED": JSON.stringify("false"),
    "import.meta.env.TSS_SERVER_FN_BASE": JSON.stringify("/_server"),
    "import.meta.env.TSS_ROUTER_BASEPATH": JSON.stringify("/"),
    "import.meta.env.TSS_DEV_SERVER": JSON.stringify("false"),
    "import.meta.env.TSS_DEV_SSR_STYLES_ENABLED": JSON.stringify("false"),
    "import.meta.env.TSS_DEV_SSR_STYLES_BASEPATH": JSON.stringify("/"),
    "import.meta.env.TSS_INLINE_CSS_ENABLED": JSON.stringify("false"),
  },
  css: { transformer: "lightningcss" },
  build: {
    outDir: "dist/android",
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: path.resolve(__dirname, "index.html"),
    },
  },
  plugins: [
    androidHtmlPlugin(),
    tanstackRouter({ disableLogging: true }),
    tailwindcss(),
    react(),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
  ],
});