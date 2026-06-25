// Capacitor/Android-only Vite config.
//
// This deliberately bypasses the Lovable/TanStack Start Vite wrapper. That
// wrapper always installs the TanStack Start plugin, which performs a
// multi-environment SSR build and emits `server/...` output that a Capacitor
// WebView cannot run. Android needs one plain static SPA at `dist/android`.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import path from "node:path";

export default defineConfig({
  root: path.resolve(__dirname, "android-web"),
  appType: "spa",
  base: "./",
  publicDir: path.resolve(__dirname, "public"),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@tanstack/react-start/server": path.resolve(
        __dirname,
        "./src/shims/tanstack-react-start-server.android.ts",
      ),
      "@/lib/teamUsers.functions": path.resolve(
        __dirname,
        "./src/shims/teamUsers.functions.android.ts",
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
    outDir: path.resolve(__dirname, "dist/android"),
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: path.resolve(__dirname, "android-web/index.html"),
    },
  },
  plugins: [
    tanstackRouter({
      target: "react",
      enableRouteGeneration: false,
      disableLogging: true,
    }),
    tailwindcss(),
    react(),
    tsconfigPaths({ projects: [path.resolve(__dirname, "tsconfig.json")] }),
  ],
});