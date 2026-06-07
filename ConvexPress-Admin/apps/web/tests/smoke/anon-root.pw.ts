import { test } from "@playwright/test";
import { smokeRoute } from "./_helpers";

test.describe.configure({ mode: "parallel" });

// ADMIN ANON — root redirect
test("root [P0]", async ({ page }) => {
	await smokeRoute(page, "/");
});

test("setup sign-in gate [P0]", async ({ page }) => {
	await smokeRoute(page, "/setup", {
		expectHeading: /convexpress admin/i,
	});
});
