import { test } from "@playwright/test";
import { smokeRoute } from "./_helpers";

test.describe.configure({ mode: "parallel" });

// WEBSITE ANON P0 — landing/auth/critical
test("root [P0]", async ({ page }) => {
	await smokeRoute(page, "/");
});

test("cart [P0]", async ({ page }) => {
	await smokeRoute(page, "/cart");
});

test("checkout [P0]", async ({ page }) => {
	await smokeRoute(page, "/checkout");
});

test("login [P0]", async ({ page }) => {
	await smokeRoute(page, "/login");
});

test("products [P0]", async ({ page }) => {
	await smokeRoute(page, "/products");
});

test("register [P0]", async ({ page }) => {
	await smokeRoute(page, "/register");
});

test("shop [P0]", async ({ page }) => {
	await smokeRoute(page, "/shop");
});
