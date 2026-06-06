import { test as base, expect } from "@playwright/test";
import { authenticateAdminForSmoke } from "./_auth";

/**
 * Custom fixture: gives every test a freshly-authenticated browser context.
 *
 * Why per-test login: Convex Auth refresh tokens are single-use with rotation.
 * A shared storage state (the default Playwright pattern) only works for the
 * first test — subsequent tests load an already-rotated token and land on the
 * login screen. We bypass that by hitting /auth/login directly per test, then
 * letting the page's normal refresh-on-mount flow do its thing.
 *
 * The shared auth helper signs in through the same auth gate users see. For an
 * explicit fresh-setup smoke, it can create the first admin once and let
 * parallel workers sign in with those same credentials.
 */
export const test = base.extend<{ authedPage: import("@playwright/test").Page }>({
	authedPage: async ({ browser }, use) => {
		const convexSiteUrl = process.env.VITE_CONVEX_SITE_URL;
		if (!convexSiteUrl) {
			throw new Error(
				"Admin smoke tests require VITE_CONVEX_SITE_URL env var (loaded from apps/web/.env).",
			);
		}

		const context = await browser.newContext();
		const page = await context.newPage();

		await authenticateAdminForSmoke(page);
		await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

		await use(page);

		await context.close();
	},
});

export { expect };
