import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

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
    },
    preview: {
      port: 4106,
      strictPort: true,
    },
    build: {
      target: "esnext",
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("/node_modules/")) {
              return undefined;
            }
            if (id.includes("/@tanstack/")) {
              return "vendor-tanstack";
            }
            if (id.includes("/@clerk/")) {
              return "vendor-clerk";
            }
            if (id.includes("/convex/") || id.includes("/@convex-dev/")) {
              return "vendor-convex";
            }
            if (id.includes("/@base-ui/")) {
              return "vendor-base-ui";
            }
            if (id.includes("/lucide-react/") || id.includes("/@icons-pack/")) {
              return "vendor-icons";
            }
            if (id.includes("/react/") || id.includes("/react-dom/")) {
              return "vendor-react";
            }
            return "vendor";
          },
        },
      },
    },
  };
});
