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
import { execSync } from "node:child_process";
import pkg from "./package.json" with { type: "json" };

function readSha(): string {
  try {
    return (
      process.env.GITHUB_SHA ||
      process.env.LOVABLE_COMMIT_SHA ||
      execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim()
    );
  } catch {
    return "unknown";
  }
}
const BUILD_SHA = readSha();
const BUILD_TIME = new Date().toISOString();
const BUILD_TYPE = process.env.ANDROID_BUILD_TYPE || "debug";
const APP_VERSION = (pkg as { version?: string }).version ?? "1.0";

export default defineConfig({
  root: path.resolve(__dirname, "android-web"),
  appType: "spa",
  base: "./",
  publicDir: path.resolve(__dirname, "public"),
  // Load .env / .env.local from the project root, not from `android-web/`.
  // Capacitor APK builds need VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
  // at build time — there is no Lovable Cloud env injection inside the APK.
  envDir: path.resolve(__dirname, "."),
  resolve: {
    alias: {
      "@tanstack/react-start/server": path.resolve(
        __dirname,
        "./src/shims/tanstack-react-start-server.android.ts",
      ),
      "@tanstack/react-start": path.resolve(
        __dirname,
        "./src/shims/tanstack-react-start.android.ts",
      ),
      "@/lib/teamUsers.functions": path.resolve(
        __dirname,
        "./src/shims/teamUsers.functions.android.ts",
      ),
      "@lovable.dev/webhooks-js": path.resolve(
        __dirname,
        "./src/shims/lovable-server-pkgs.android.ts",
      ),
      "@lovable.dev/email-js": path.resolve(
        __dirname,
        "./src/shims/lovable-server-pkgs.android.ts",
      ),
      "@": path.resolve(__dirname, "./src"),
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
    __BUILD_SHA__: JSON.stringify(BUILD_SHA),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
    __BUILD_TYPE__: JSON.stringify(BUILD_TYPE),
    __BUILD_TARGET__: JSON.stringify("android"),
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __ANDROID_TARGET_SDK__: JSON.stringify("36"),
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
    // Stub out server-only Lovable email/webhook route modules. These TanStack
    // server route handlers run only on Lovable Cloud (web deployment) and
    // import server-only packages like `@lovable.dev/webhooks-js` and
    // `@lovable.dev/email-js`. They are referenced by the generated route
    // tree, so the Android SPA bundle pulls them in even though their
    // handlers never execute inside the Capacitor WebView. Replace each one
    // with an inert createFileRoute() at resolve time so Rolldown never has
    // to load the original source (and therefore never sees those imports).
    {
      name: "irth-android-stub-server-routes",
      enforce: "pre" as const,
      resolveId(source, importer) {
        if (!importer) return null;
        const normalized = source.replace(/\\/g, "/");
        if (
          normalized.includes("/routes/lovable/email/suppression") ||
          normalized.includes("/routes/lovable/email/auth/webhook") ||
          normalized.includes("/routes/lovable/email/queue/process") ||
          normalized.includes("/routes/lovable/email/transactional/send") ||
          normalized.includes("/routes/lovable/email/transactional/preview") ||
          normalized.includes("/routes/lovable/email/auth/preview")
        ) {
          // Derive the route path from the source specifier so each stub
          // registers a unique TanStack file route id.
          const match = normalized.match(/\/routes(\/lovable\/email\/[^?]+)/);
          const routePath = match ? match[1].replace(/\.(t|j)sx?$/, "") : "/lovable/email/_stub";
          return `\0irth-android-stub:${routePath}`;
        }
        return null;
      },
      load(id) {
        if (!id.startsWith("\0irth-android-stub:")) return null;
        const routePath = id.slice("\0irth-android-stub:".length);
        return `import { createFileRoute } from "@tanstack/react-router";\n` +
          `export const Route = createFileRoute(${JSON.stringify(routePath)})({});\n`;
      },
    },
    {
      name: "irth-android-forbid-node-server-runtime",
      enforce: "pre" as const,
      resolveId(source) {
        if (
          source === "node:async_hooks" ||
          source === "async_hooks" ||
          source === "@tanstack/start-storage-context" ||
          source.startsWith("@tanstack/start-server-core") ||
          source.startsWith("@tanstack/react-start-server")
        ) {
          throw new Error(`Android client bundle attempted to import server-only module: ${source}`);
        }
        return null;
      },
    },
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