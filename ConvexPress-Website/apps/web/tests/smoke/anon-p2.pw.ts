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
	await smokeRoute(page, "/bundles", { allowNotFound: true });
});

test("checkout-payment [P2]", async ({ page }) => {
	await smokeRoute(page, "/checkout/payment", { allowNotFound: true });
});

test("checkout-review [P2]", async ({ page }) => {
	await smokeRoute(page, "/checkout/review", { allowNotFound: true });
});

test("checkout-shipping [P2]", async ({ page }) => {
	await smokeRoute(page, "/checkout/shipping", { allowNotFound: true });
});

test("forgot-password [P2]", async ({ page }) => {
	await smokeRoute(page, "/forgot-password");
});

test("help [P2]", async ({ page }) => {
	await smokeRoute(page, "/help", { allowNotFound: true });
});

test("help-search [P2]", async ({ page }) => {
	await smokeRoute(page, "/help/search", { allowNotFound: true });
});

test("logout [P2]", async ({ page }) => {
	await smokeRoute(page, "/logout");
});

test("pricing [P2]", async ({ page }) => {
	await smokeRoute(page, "/pricing", { allowNotFound: true });
});

test("reset-password [P2]", async ({ page }) => {
	await smokeRoute(page, "/reset-password");
});

test("search [P2]", async ({ page }) => {
	await smokeRoute(page, "/search");
});

test("support [P2]", async ({ page }) => {
	await smokeRoute(page, "/support", { allowNotFound: true });
});

test("support-new [P2]", async ({ page }) => {
	await smokeRoute(page, "/support/new", { allowNotFound: true });
});

test("support-tickets [P2]", async ({ page }) => {
	await smokeRoute(page, "/support/tickets", { allowNotFound: true });
});

test("verify-email [P2]", async ({ page }) => {
	await smokeRoute(page, "/verify-email");
});
