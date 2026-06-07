import { test } from "@playwright/test";
import { smokeRoute } from "./_helpers";

test.describe.configure({ mode: "parallel" });

// WEBSITE ANON P2 — edge
test("archive [P2]", async ({ page }) => {
	await smokeRoute(page, "/archive");
});

test("blog [P2]", async ({ page }) => {
	await smokeRoute(page, "/blog");
});

test("bundles [P2]", async ({ page }) => {
	await smokeRoute(page, "/bundles");
});

test("checkout-payment [P2]", async ({ page }) => {
	await smokeRoute(page, "/checkout/payment");
});

test("checkout-review [P2]", async ({ page }) => {
	await smokeRoute(page, "/checkout/review");
});

test("checkout-shipping [P2]", async ({ page }) => {
	await smokeRoute(page, "/checkout/shipping");
});

test("forgot-password [P2]", async ({ page }) => {
	await smokeRoute(page, "/forgot-password");
});

test("help [P2]", async ({ page }) => {
	await smokeRoute(page, "/help");
});

test("help-search [P2]", async ({ page }) => {
	await smokeRoute(page, "/help/search");
});

test("logout [P2]", async ({ page }) => {
	await smokeRoute(page, "/logout");
});

test("pricing [P2]", async ({ page }) => {
	await smokeRoute(page, "/pricing");
});

test("reset-password [P2]", async ({ page }) => {
	await smokeRoute(page, "/reset-password");
});

test("search [P2]", async ({ page }) => {
	await smokeRoute(page, "/search");
});

test("support [P2]", async ({ page }) => {
	await smokeRoute(page, "/support");
});

test("support-new [P2]", async ({ page }) => {
	await smokeRoute(page, "/support/new");
});

test("support-tickets [P2]", async ({ page }) => {
	await smokeRoute(page, "/support/tickets");
});

test("verify-email [P2]", async ({ page }) => {
	await smokeRoute(page, "/verify-email");
});
