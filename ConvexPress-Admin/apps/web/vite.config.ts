import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(__dirname, "../..");
const devHost = process.env.HOST ?? process.env.PLAYWRIGHT_HOST ?? "127.0.0.1";
const devPort = Number(process.env.PORT ?? process.env.PLAYWRIGHT_PORT ?? 4105);

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
    realpathIfPresent(path.join(__dirname, "node_modules")),
    realpathIfPresent(path.join(workspaceDir, "node_modules")),
  ]),
);

function manualChunks(id: string) {
  if (!id.includes("/node_modules/")) {
    return;
  }

  if (
    id.includes("/react/") ||
    id.includes("/react-dom/") ||
    id.includes("/scheduler/")
  ) {
    return "react-vendor";
  }

  if (id.includes("/convex/") || id.includes("/convex-helpers/")) {
    return "convex";
  }
}

export default defineConfig({
  // Use relative paths for Electron (file:// protocol requires "./" base)
  base: process.env.ELECTRON_BUILD === "true" ? "./" : "/",
  plugins: [
    tailwindcss(),
    tanstackRouter({
      autoCodeSplitting: true,
      codeSplittingOptions: {
        defaultBehavior: [["component"]],
      },
    }),
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@backend": path.resolve(__dirname, "../../packages/backend"),
      "@convexpress/backend": path.resolve(__dirname, "../../packages/backend"),
    },
  },
  server: {
    host: devHost,
    port: devPort,
    strictPort: true,
    fs: {
      allow: fsAllow,
    },
  },
  preview: {
    host: devHost,
    port: devPort,
    strictPort: true,
  },
  build: {
    target: "esnext",
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
});
