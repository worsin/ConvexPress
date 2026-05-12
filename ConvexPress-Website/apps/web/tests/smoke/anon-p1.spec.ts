import { test } from "@playwright/test";
import { smokeRoute } from "./_helpers";

test.describe.configure({ mode: "parallel" });

// WEBSITE ANON P1 — content
test("categories [P1]", async ({ page }) => {
	await smokeRoute(page, "/categories");
});

test("gallery [P1]", async ({ page }) => {
	await smokeRoute(page, "/gallery");
});

test("recipes [P1]", async ({ page }) => {
	await smokeRoute(page, "/recipes");
});
