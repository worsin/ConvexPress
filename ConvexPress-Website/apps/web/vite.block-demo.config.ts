import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { canonicalBlockWatch } from "./block-demo/dev-watch.mjs";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
/** Separate internal harness. Never part of the storefront route/build graph. */
export default defineConfig({
	root: fileURLToPath(new URL("./block-demo", import.meta.url)),
	resolve: {
		alias: {
			react: fileURLToPath(new URL("./node_modules/react", import.meta.url)),
			"react-dom": fileURLToPath(
				new URL("./node_modules/react-dom", import.meta.url),
			),
			zod: fileURLToPath(new URL("./node_modules/zod", import.meta.url)),
		},
		dedupe: ["react", "react-dom", "zod"],
	},
	plugins: [
		tailwindcss(),
		canonicalBlockWatch({
			root: fileURLToPath(new URL("../../../blocks", import.meta.url)),
			discoveryId: fileURLToPath(
				new URL(
					"./src/templates/sdk/block-renderer/discovery.ts",
					import.meta.url,
				),
			),
		}),
		tsconfigPaths({
			projects: [fileURLToPath(new URL("./tsconfig.json", import.meta.url))],
		}),
		react(),
	],
	server: {
		host: "127.0.0.1",
		port: Number(process.env.BLOCK_DEMO_PORT ?? 4318),
		strictPort: true,
		fs: { allow: [fileURLToPath(new URL("../../../", import.meta.url))] },
	},
	build: {
		outDir: ".dist",
		emptyOutDir: true,
		rollupOptions: {
			input: {
				library: fileURLToPath(new URL("./block-demo/index.html", import.meta.url)),
				wishlists: fileURLToPath(new URL("./block-demo/wishlist-surfaces.html", import.meta.url)),
			},
			output: {
				manualChunks(id) {
					if (id.includes("/node_modules/")) return "runtime-vendor";
				},
			},
		},
	},
});
