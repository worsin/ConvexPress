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
		const page = await context.newPage();

		await page.goto("/", { waitUntil: "domcontentloaded" });
		const loginHeading = page.getByRole("heading", {
			name: /convexpress admin/i,
		});
		const adminContent = page.locator("#admin-content");

		const alreadyAuthed = await adminContent
			.waitFor({ state: "visible", timeout: 5_000 })
			.then(() => true)
			.catch(() => false);

		if (!alreadyAuthed) {
			await expect(loginHeading).toBeVisible({ timeout: 45_000 });
			await page.getByLabel("Email or Username").fill(username);
			await page.getByLabel("Password").fill(password);
			await page.getByRole("button", { name: /^sign in$/i }).click();
		}

		await expect(adminContent).toBeVisible({ timeout: 45_000 });
		await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

		await use(page);

		await context.close();
	},
});

export { expect };
