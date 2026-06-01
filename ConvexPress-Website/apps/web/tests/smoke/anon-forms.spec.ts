import { expect, test, type Page } from "@playwright/test";
import { smokeRoute } from "./_helpers";

test.describe.configure({ mode: "parallel" });

const FORM_SLUG = process.env.FORMS_SMOKE_SLUG;
const MULTI_STEP_SLUG = process.env.FORMS_SMOKE_MULTI_STEP_SLUG;
const STEP_ONE_LABEL = process.env.FORMS_SMOKE_STEP_ONE_LABEL ?? "First Name";
const MIN_FORM_FILL_WAIT_MS = 2_200;

async function assertNamedPublicControls(page: Page) {
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
	expect(unnamed, "all visible public form controls should have an accessible name").toEqual([]);
}

test("public Forms route renders a paid-tester fixture without console or network failures", async ({
	page,
}) => {
	test.skip(!FORM_SLUG, "set FORMS_SMOKE_SLUG to run the public Forms fixture smoke");

	await smokeRoute(page, `/forms/${FORM_SLUG}`, {
		expectSelector: "[data-slot='form-wizard']",
	});
	await assertNamedPublicControls(page);
});

test("public multi-step Forms fixture supports keyboard-friendly step navigation", async ({
	page,
}) => {
	test.skip(
		!MULTI_STEP_SLUG,
		"set FORMS_SMOKE_MULTI_STEP_SLUG to run the multi-step fixture smoke",
	);

	await smokeRoute(page, `/forms/${MULTI_STEP_SLUG}`, {
		expectSelector: "[data-slot='form-wizard']",
	});
	const wizard = page.locator("[data-slot='form-wizard']");
	const nextButton = wizard.getByRole("button", { name: /^next$/i });
	test.skip(!(await nextButton.isVisible()), "fixture is not currently multi-step");

	const firstStepInput = wizard.getByLabel(STEP_ONE_LABEL);
	test.skip(
		(await firstStepInput.count()) === 0,
		`fixture does not expose a first-step field labelled "${STEP_ONE_LABEL}"`,
	);

	await firstStepInput.fill("Forms Smoke Tester");
	await nextButton.focus();
	await expect(nextButton).toBeFocused();
	await nextButton.press("Enter");

	await expect(wizard.getByRole("button", { name: /^back$/i })).toBeVisible();
	await expect(wizard.getByRole("button", { name: /^submit$/i })).toBeVisible();
	await assertNamedPublicControls(page);
});

test("public multi-step Forms fixture accepts a complete anonymous submission", async ({
	page,
}) => {
	test.skip(
		!MULTI_STEP_SLUG,
		"set FORMS_SMOKE_MULTI_STEP_SLUG to run the multi-step fixture smoke",
	);

	await smokeRoute(page, `/forms/${MULTI_STEP_SLUG}`, {
		expectSelector: "[data-slot='form-wizard']",
	});
	const wizard = page.locator("[data-slot='form-wizard']");
	const nextButton = wizard.getByRole("button", { name: /^next$/i });
	test.skip(!(await nextButton.isVisible()), "fixture is not currently multi-step");

	await wizard
		.getByRole("textbox", { name: STEP_ONE_LABEL, exact: true })
		.fill("Forms Smoke Tester");
	await nextButton.click();

	await wizard
		.getByRole("textbox", { name: "Email", exact: true })
		.fill(`forms-smoke-${Date.now()}@example.test`);
	await wizard
		.getByRole("combobox", { name: "Package", exact: true })
		.selectOption("pro");
	await wizard.getByRole("spinbutton", { name: "Quantity", exact: true }).fill("2");

	await page.waitForTimeout(MIN_FORM_FILL_WAIT_MS);
	await wizard.getByRole("button", { name: /^submit$/i }).click();

	const success = page.locator("[data-slot='form-success']");
	await expect(success).toBeVisible({ timeout: 20_000 });
	await expect(success).toContainText(/thank you/i);
});
