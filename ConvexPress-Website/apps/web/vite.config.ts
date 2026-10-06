import { typeScale } from "./type-scale.mjs";
import { canonicalBlockWatch } from "./canonical-block-watch.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const appDir = fileURLToPath(new URL(".", import.meta.url));
const workspaceDir = path.resolve(appDir, "../..");
const canonicalBlocksDir = path.resolve(workspaceDir, "../blocks");

function realpathIfPresent(target: string) {
  try {
    return fs.realpathSync(target);
  } catch {
    return target;
  }
}

const fsAllow = Array.from(
  new Set([
    workspaceDir,
    realpathIfPresent(workspaceDir),
    realpathIfPresent(path.join(appDir, "node_modules")),
    realpathIfPresent(path.join(workspaceDir, "node_modules")),
    realpathIfPresent(canonicalBlocksDir),
  ]),
);

/**
 * One checkout, many storefront processes: the site runner passes a port per
 * site (PORT) and a private Vite cache directory so concurrent dev servers do
 * not race on the shared dependency cache.
 */
const devPort = Number(process.env.PORT || process.env.CONVEXPRESS_PORT || 4106);
const cacheDir = process.env.CONVEXPRESS_VITE_CACHE_DIR || undefined;

export default defineConfig(() => {
  // Clerk is switched at runtime (src/lib/auth/clerk.tsx): the publishable key
  // comes from the site database, then process env, then VITE_ env. No
  // build-time alias, so one build serves every site.
  return {
    // Canonical renderer/schema sources live above this package's dependency
    // tree. Resolve their shared runtime from this installed storefront, rather
    // than relying on a root node_modules that is deliberately not installed.
    resolve: {
      alias: {
        zod: path.join(appDir, "node_modules/zod"),
      },
      // Keep React imports bare for SSR externalization. Absolute React aliases
      // bundle a second hook dispatcher beside external react-dom/server.
      dedupe: ["react", "react-dom", "zod"],
    },
    css: { postcss: { plugins: [typeScale()] } },
    plugins: [
      canonicalBlockWatch({root:canonicalBlocksDir,discoveryId:path.join(appDir,"src/templates/sdk/block-renderer/discovery.ts")}),
      tsconfigPaths(),
      tailwindcss(),
      tanstackStart({
        serverFns: {
          // Keep lowercase to avoid stale cached redirects from older canonical logic.
          base: "/_serverfn",
        },
      }),
      viteReact({
        babel: {
          plugins: ["babel-plugin-react-compiler"],
        },
      }),
    ],
    cacheDir,
    server: {
      port: devPort,
      strictPort: true,
      fs: {
        allow: fsAllow,
      },
    },
    preview: {
      port: devPort,
      strictPort: true,
    },
    build: {
      target: "esnext",
      rollupOptions: {
        output: {
          manualChunks(rawId) {
            const id = rawId.replaceAll("\\", "/");
            // Discovery expands every installed surface loader and its preload
            // table. Cache that stable registry separately from the app entry;
            // metadata stays synchronous and surface implementations stay lazy.
            if (id.endsWith("/src/templates/sdk/registry.ts")) {
              return "template-registry";
            }
            if (!id.includes("/node_modules/")) {
              return undefined;
            }

            // Cache routing/query libraries independently from frequently changed
            // site code. Start's app-entry integration stays with the application.
            if (/\/@tanstack\/(?:react-router|router-core|history|react-query|query-core|react-store|store)\//.test(id)) {
              return "vendor-tanstack";
            }
            if (id.includes("/@clerk/")) {
              return "vendor-clerk";
            }
            if (id.includes("/lucide-react/") || id.includes("/@icons-pack/")) {
              return "vendor-icons";
            }
            if (id.includes("/@stripe/")) {
              return "vendor-stripe";
            }
            if (
              id.includes("/zod/") ||
              id.includes("zod@") ||
              id.includes("/seroval/") ||
              id.includes("seroval@") ||
              id.includes("/seroval-plugins/") ||
              id.includes("seroval-plugins@") ||
              id.includes("/tailwind-merge/") ||
              id.includes("tailwind-merge@")
            ) {
              return "vendor-utils";
            }
            if (id.includes("/sonner/") || id.includes("sonner@")) {
              return "vendor-sonner";
            }
            if (
              id.includes("/react/") ||
              id.includes("/react-dom/") ||
              id.includes("/@base-ui/") ||
              id.includes("/scheduler/") ||
              id.includes("/use-sync-external-store/") ||
              id.includes("react-dom") ||
              id.includes("react_jsx") ||
              id.includes("react-jsx") ||
              id.endsWith("/react.js")
            ) {
              return "vendor-react";
            }
            return undefined;
          },
        },
      },
    },
  };
});
