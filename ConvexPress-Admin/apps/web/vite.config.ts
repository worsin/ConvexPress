import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Use relative paths for Electron (file:// protocol requires "./" base)
  base: process.env.ELECTRON_BUILD === "true" ? "./" : "/",
  plugins: [
    tailwindcss(),
    tanstackRouter({}),
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
    port: 4105,
    strictPort: true,
  },
  preview: {
    port: 4105,
    strictPort: true,
  },
  build: {
    target: "esnext",
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          convex: ["convex", "convex/react"],
        },
      },
    },
  },
});
