import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
const baseURL = process.env.BLOCK_DEMO_URL ?? "http://127.0.0.1:4318";
const parsed = new URL(baseURL);
if (
	parsed.protocol !== "http:" ||
	!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) ||
	parsed.username ||
	parsed.password
)
	throw new Error(
		"BlockDemo browser checks require an explicitly owned loopback HTTP server",
	);
export default defineConfig({
	testDir: "./block-demo/browser",
	testMatch: "*.pw.ts",
	workers: 1,
	fullyParallel: false,
	retries: 0,
	reporter: "list",
	outputDir: fileURLToPath(
		new URL("../../../output/block-demo/browser-results", import.meta.url),
	),
	use: {
		baseURL,
		browserName: "chromium",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	// Deliberately no webServer: the parent owns process start, port identity and cleanup.
});
