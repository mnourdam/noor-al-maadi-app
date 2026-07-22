// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
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
const APP_VERSION = (pkg as { version?: string }).version ?? "1.0";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    define: {
      __BUILD_SHA__: JSON.stringify(BUILD_SHA),
      __BUILD_TIME__: JSON.stringify(BUILD_TIME),
      __BUILD_TYPE__: JSON.stringify(process.env.NODE_ENV || "production"),
      __BUILD_TARGET__: JSON.stringify("web"),
      __APP_VERSION__: JSON.stringify(APP_VERSION),
      __ANDROID_TARGET_SDK__: JSON.stringify("n/a"),
    },
  },
});
