import { type Page, expect } from "@playwright/test";

const FIRST_ADMIN_SETUP_HEADING = /finish convexpress setup/i;

function parseBooleanFlag(value: string | undefined) {
	if (!value) return false;
	return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

const allowFirstAdminSetup = parseBooleanFlag(
	process.env.ADMIN_SMOKE_ALLOW_FIRST_ADMIN_SETUP,
);

const firstAdminEmail =
	process.env.ADMIN_SMOKE_FIRST_ADMIN_EMAIL ??
	process.env.ADMIN_SMOKE_EMAIL ??
	(process.env.ADMIN_SMOKE_USER?.includes("@")
		? process.env.ADMIN_SMOKE_USER
		: undefined);
const firstAdminPassword =
	process.env.ADMIN_SMOKE_FIRST_ADMIN_PASSWORD ??
	process.env.ADMIN_SMOKE_PASSWORD;
const firstAdminDisplayName =
	process.env.ADMIN_SMOKE_FIRST_ADMIN_NAME ?? "Smoke Admin";
const firstAdminUsername = process.env.ADMIN_SMOKE_FIRST_ADMIN_USERNAME;

const loginUsername =
	process.env.ADMIN_SMOKE_USER ??
	process.env.ADMIN_SMOKE_EMAIL ??
	(allowFirstAdminSetup ? firstAdminEmail : undefined);
const loginPassword =
	process.env.ADMIN_SMOKE_PASSWORD ??
	(allowFirstAdminSetup ? firstAdminPassword : undefined);

export async function authenticateAdminForSmoke(page: Page) {
	await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

	const adminContent = page.locator("#admin-content");
	const setupForm = page.locator("#admin-display-name");
	const loginInput = page.locator("#identifier");

	await Promise.race([
		adminContent.waitFor({ state: "visible", timeout: 45_000 }).catch(() => null),
		setupForm.waitFor({ state: "visible", timeout: 45_000 }).catch(() => null),
		loginInput.waitFor({ state: "visible", timeout: 45_000 }).catch(() => null),
	]);

	if (await adminContent.isVisible().catch(() => false)) {
		return;
	}

	if (await setupForm.isVisible().catch(() => false)) {
		if (!allowFirstAdminSetup) {
			throw new Error(
				"Admin setup form is visible. Create the first admin before running smoke tests, or set ADMIN_SMOKE_ALLOW_FIRST_ADMIN_SETUP=1 with first-admin credentials for an explicit fresh-setup smoke.",
			);
		}

		await createFirstAdminFromSetupForm(page);
		return;
	}

	await signInExistingAdmin(page);
}

async function createFirstAdminFromSetupForm(page: Page) {
	if (!firstAdminEmail || !firstAdminPassword) {
		throw new Error(
			"First-admin smoke setup requires ADMIN_SMOKE_FIRST_ADMIN_EMAIL (or ADMIN_SMOKE_EMAIL/ADMIN_SMOKE_USER as an email) and ADMIN_SMOKE_FIRST_ADMIN_PASSWORD (or ADMIN_SMOKE_PASSWORD).",
		);
	}

	await page.locator("#admin-display-name").fill(firstAdminDisplayName);
	if (firstAdminUsername) {
		await page.locator("#admin-username").fill(firstAdminUsername);
	}
	await page.locator("#admin-email").fill(firstAdminEmail);
	await page.locator("#admin-password").fill(firstAdminPassword);
	await page.locator("#admin-confirm").fill(firstAdminPassword);
	await page.getByRole("button", { name: /create admin account/i }).click();

	const adminContent = page.locator("#admin-content");
	const alreadyExistsError = page.getByText(
		/administrator account already exists/i,
	);
	const outcome = await Promise.race([
		adminContent
			.waitFor({ state: "visible", timeout: 30_000 })
			.then(() => "created" as const)
			.catch(() => null),
		alreadyExistsError
			.waitFor({ state: "visible", timeout: 30_000 })
			.then(() => "already-exists" as const)
			.catch(() => null),
	]);

	if (outcome === "already-exists") {
		await signInExistingAdmin(page);
		return;
	}

	if (outcome !== "created") {
		const body = await page.locator("body").innerText().catch(() => "");
		throw new Error(
			`First-admin setup did not finish. Body: ${body.slice(0, 500)}`,
		);
	}

	await expect(page.getByRole("heading", { name: FIRST_ADMIN_SETUP_HEADING }))
		.toBeVisible({ timeout: 30_000 });
}

async function signInExistingAdmin(page: Page) {
	if (!loginUsername || !loginPassword) {
		throw new Error(
			"Admin smoke tests require ADMIN_SMOKE_USER (or ADMIN_SMOKE_EMAIL) and ADMIN_SMOKE_PASSWORD env vars.",
		);
	}

	for (let attempt = 0; attempt < 5; attempt += 1) {
		await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

		const adminContent = page.locator("#admin-content");
		if (await adminContent.isVisible().catch(() => false)) {
			return;
		}

		const setupForm = page.locator("#admin-display-name");
		if (await setupForm.isVisible().catch(() => false)) {
			await page.waitForTimeout(1_000);
			continue;
		}

		const loginInput = page.locator("#identifier");
		await expect(loginInput).toBeVisible({ timeout: 20_000 });
		await loginInput.fill(loginUsername);
		await page.locator("#password").fill(loginPassword);
		await page.getByRole("button", { name: /^sign in$/i }).click();
		await expect(adminContent).toBeVisible({ timeout: 45_000 });
		return;
	}

	throw new Error(
		"Admin setup form stayed visible after first-admin setup; could not reach login.",
	);
}
