import { expect, test as setup } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_STATE = path.resolve(__dirname, ".auth/admin.json");

setup("authenticate as admin", async ({ page }) => {
	const username = process.env.ADMIN_SMOKE_USER ?? process.env.ADMIN_SMOKE_EMAIL;
	const password = process.env.ADMIN_SMOKE_PASSWORD;

	if (!username || !password) {
		throw new Error(
			"Admin smoke tests require ADMIN_SMOKE_USER (or ADMIN_SMOKE_EMAIL) and ADMIN_SMOKE_PASSWORD env vars.",
		);
	}

	await page.goto("/dashboard");

	const identifier = page.locator("#identifier");
	await expect(identifier).toBeVisible({ timeout: 20_000 });

	await identifier.fill(username);
	await page.locator("#password").fill(password);
	await page.getByRole("button", { name: /sign in/i }).click();

	await expect(page.locator("#admin-content")).toBeVisible({ timeout: 30_000 });

	await page.context().storageState({ path: ADMIN_STATE });
});
