import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

/** Offline SSR compilation only: no HTTP listener, backend connection or browser. */
export default defineConfig({
  plugins: [tsconfigPaths()],
  esbuild: { jsx: "automatic" },
  resolve: {
    // Root block contracts resolve through the same app-owned Zod as the storefront.
    alias: { zod: fileURLToPath(new URL("./node_modules/zod", import.meta.url)) },
    dedupe: ["react", "react-dom", "zod"],
  },
  build: {
    ssr: true,
    outDir: ".template-smoke",
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL("./scripts/template-ssr-entry.tsx", import.meta.url)),
      output: { entryFileNames: "template-smoke.mjs" },
    },
  },
});
