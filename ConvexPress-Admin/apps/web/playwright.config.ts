import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, ".env.local") });
loadEnv({ path: path.resolve(__dirname, ".env") });

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4105);
const HOST = process.env.PLAYWRIGHT_HOST ?? "127.0.0.1";
const BASE_URL = `http://${HOST}:${PORT}`;

export default defineConfig({
	testDir: "./tests/smoke",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? 4 : undefined,
	reporter: [["list"], ["html", { open: "never" }]],
	use: {
		baseURL: BASE_URL,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},
	projects: [
		{
			name: "chromium-authed",
			testMatch: /admin-.*\.spec\.ts/,
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "chromium-anon",
			testMatch: /anon-.*\.spec\.ts/,
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: {
		command: "bun run dev",
		url: BASE_URL,
		reuseExistingServer: !process.env.CI,
		timeout: 180 * 1000,
		stdout: "ignore",
		stderr: "pipe",
	},
});
