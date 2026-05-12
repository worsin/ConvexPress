import { expect, test as setup } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_STATE = path.resolve(__dirname, ".auth/user.json");

setup("authenticate as website user", async ({ page }) => {
	const email = process.env.WEBSITE_SMOKE_EMAIL;
	const password = process.env.WEBSITE_SMOKE_PASSWORD;

	if (!email || !password) {
		throw new Error(
			"Website smoke tests require WEBSITE_SMOKE_EMAIL and WEBSITE_SMOKE_PASSWORD env vars. Use a Clerk test-mode user (email like name+clerk_test@example.com).",
		);
	}

	await page.goto("/login");

	const emailInput = page.locator("#login-email");
	await expect(emailInput).toBeVisible({ timeout: 20_000 });

	await emailInput.fill(email);
	await page.locator("#login-password").fill(password);
	await page.getByRole("button", { name: /^sign in$/i }).click();

	await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

	await page.context().storageState({ path: USER_STATE });
});
