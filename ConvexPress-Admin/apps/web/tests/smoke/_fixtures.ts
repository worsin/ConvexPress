import { test as base, expect } from "@playwright/test";

/**
 * Custom fixture: gives every test a freshly-authenticated browser context.
 *
 * Why per-test login: Convex Auth refresh tokens are single-use with rotation.
 * A shared storage state (the default Playwright pattern) only works for the
 * first test — subsequent tests load an already-rotated token and land on the
 * login screen. We bypass that by hitting /auth/login directly per test, then
 * letting the page's normal refresh-on-mount flow do its thing.
 *
 * Use:
 *   import { test } from "./_fixtures";
 *   test("…", async ({ authedPage }) => { … });
 */
export const test = base.extend<{ authedPage: import("@playwright/test").Page }>({
	authedPage: async ({ browser }, use) => {
		const username = process.env.ADMIN_SMOKE_USER ?? process.env.ADMIN_SMOKE_EMAIL;
		const password = process.env.ADMIN_SMOKE_PASSWORD;
		const convexSiteUrl = process.env.VITE_CONVEX_SITE_URL;

		if (!username || !password) {
			throw new Error(
				"Admin smoke tests require ADMIN_SMOKE_USER and ADMIN_SMOKE_PASSWORD env vars.",
			);
		}
		if (!convexSiteUrl) {
			throw new Error(
				"Admin smoke tests require VITE_CONVEX_SITE_URL env var (loaded from apps/web/.env).",
			);
		}

		const context = await browser.newContext();

		const isEmail = username.includes("@");
		const body = isEmail
			? { email: username, password }
			: { username, password };

		const response = await context.request.post(`${convexSiteUrl}/auth/login`, {
			data: body,
			headers: { "Content-Type": "application/json" },
		});

		expect(response.ok(), `login request failed: ${response.status()}`).toBe(true);

		const page = await context.newPage();

		await use(page);

		await context.close();
	},
});

export { expect };
