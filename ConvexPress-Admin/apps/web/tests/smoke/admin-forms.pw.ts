import { expect, type Page } from "@playwright/test";
import { test } from "./_fixtures";
import { smokeRoute } from "./_helpers";

test.describe.configure({ mode: "parallel", timeout: 90_000 });

const HAS_ADMIN_SMOKE_ENV = Boolean(
	(process.env.ADMIN_SMOKE_USER || process.env.ADMIN_SMOKE_EMAIL) &&
		process.env.ADMIN_SMOKE_PASSWORD &&
		process.env.VITE_CONVEX_SITE_URL,
);

test.skip(
	!HAS_ADMIN_SMOKE_ENV,
	"Admin Forms smoke tests require ADMIN_SMOKE_USER/EMAIL, ADMIN_SMOKE_PASSWORD, and VITE_CONVEX_SITE_URL.",
);

const FORM_ROUTES = [
	"/forms",
	"/forms/new",
	"/forms/settings",
] as const;

const FORM_DYNAMIC_SUFFIXES = [
	"/edit",
	"/notifications",
	"/confirmations",
	"/settings",
	"/entries",
	"/actions",
	"/analytics",
] as const;

async function assertNamedFormControls(page: Page) {
	const unnamed = await page.locator("input, textarea, select").evaluateAll((els) =>
		(els as HTMLElement[])
			.filter((el) => {
				const input = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
				if (input.type === "hidden") return false;
				if (input.hasAttribute("aria-hidden")) return false;
				if (input.closest("[hidden]")) return false;
				return true;
			})
			.filter((el) => {
				const id = el.getAttribute("id");
				const hasLabel = id
					? Boolean(document.querySelector(`label[for="${CSS.escape(id)}"]`))
					: false;
				return !(
					hasLabel ||
					el.getAttribute("aria-label") ||
					el.getAttribute("aria-labelledby") ||
					el.getAttribute("title")
				);
			})
			.map((el) => el.outerHTML.slice(0, 160)),
	);
	expect(unnamed, "all visible form controls should have an accessible name").toEqual([]);
}

async function findFirstFormId(page: Page): Promise<string | null> {
	await page.goto("/forms", { waitUntil: "domcontentloaded" });
	await expect(page.locator("#admin-content")).toBeVisible({ timeout: 20_000 });
	await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

	const links = await page.locator("a[href]").evaluateAll((els) =>
		(els as HTMLAnchorElement[]).map((el) => el.getAttribute("href") ?? ""),
	);
	const href = links.find((candidate) =>
		/^\/forms\/(?!new\b|settings\b)[a-z0-9]{16,}\/edit$/i.test(candidate),
	);
	return href?.match(/^\/forms\/([a-z0-9]{16,})\/edit$/i)?.[1] ?? null;
}

for (const route of FORM_ROUTES) {
	test(`forms route smoke: ${route}`, async ({ authedPage }) => {
		await smokeRoute(authedPage, route, { expectSelector: "#admin-content" });
	});
}

test("forms/new has labelled controls and keyboard-reachable primary action", async ({
	authedPage,
}) => {
	await smokeRoute(authedPage, "/forms/new", {
		expectHeading: /add new form/i,
	});
	await assertNamedFormControls(authedPage);

	await authedPage.getByLabel("Title").focus();
	await authedPage.keyboard.press("Tab");
	await expect(authedPage.getByLabel("Slug")).toBeFocused();
});

for (const suffix of FORM_DYNAMIC_SUFFIXES) {
	test(`forms dynamic route smoke: ${suffix}`, async ({ authedPage }) => {
		const formId = await findFirstFormId(authedPage);
		test.skip(!formId, "no existing Forms fixture to discover dynamic routes");
		await smokeRoute(authedPage, `/forms/${formId}${suffix}`, {
			expectSelector: "#admin-content",
		});
	});
}

test("forms builder exposes the multi-step page break field type", async ({
	authedPage,
}) => {
	const formId = await findFirstFormId(authedPage);
	test.skip(!formId, "no existing Forms fixture to inspect the field builder");

	await smokeRoute(authedPage, `/forms/${formId}/edit`, {
		expectSelector: "#admin-content",
	});
	await authedPage.getByRole("button", { name: /add field/i }).click();
	await expect(
		authedPage.getByRole("button", { name: /page break/i }),
	).toBeVisible();
});
