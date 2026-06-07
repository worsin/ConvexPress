import { test } from "@playwright/test";
import { smokeRoute } from "./_helpers";

test.describe.configure({ mode: "parallel" });

// WEBSITE ANON P1 — content
test("categories [P1]", async ({ page }) => {
	await smokeRoute(page, "/categories", { allowNotFound: true });
});

test("gallery [P1]", async ({ page }) => {
	await smokeRoute(page, "/gallery", { allowNotFound: true });
});

test("recipes [P1]", async ({ page }) => {
	await smokeRoute(page, "/recipes", { allowNotFound: true });
});
