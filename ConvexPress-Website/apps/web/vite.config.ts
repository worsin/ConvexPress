import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const appDir = fileURLToPath(new URL(".", import.meta.url));
const workspaceDir = path.resolve(appDir, "../..");

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
  ]),
);

function hasUsableClerkKey(value: string | undefined) {
  return Boolean(value && /^pk_(test|live)_/.test(value) && !value.includes("PLACEHOLDER"));
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const clerkPublishableKey = env.VITE_CLERK_PUBLISHABLE_KEY;
  const useClerkShim = !hasUsableClerkKey(clerkPublishableKey);
  const alias: Record<string, string> = useClerkShim
    ? {
        "@clerk/clerk-react": new URL(
          "./src/lib/auth/clerk-shim.tsx",
          import.meta.url,
        ).pathname,
      }
    : {};

  return {
    plugins: [
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
    resolve: {
      alias,
    },
    server: {
      port: 4106,
      strictPort: true,
      fs: {
        allow: fsAllow,
      },
    },
    preview: {
      port: 4106,
      strictPort: true,
    },
    build: {
      target: "esnext",
      rollupOptions: {
        output: {
          manualChunks(rawId) {
            const id = rawId.replaceAll("\\", "/");
            if (!id.includes("/node_modules/")) {
              return undefined;
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
