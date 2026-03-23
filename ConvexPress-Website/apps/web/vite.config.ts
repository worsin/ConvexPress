import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
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
  },
});
