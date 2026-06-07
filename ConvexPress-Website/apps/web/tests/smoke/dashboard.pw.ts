import { test } from "@playwright/test";
import { smokeRoute } from "./_helpers";

test.describe.configure({ mode: "parallel" });

// WEBSITE AUTHED — /dashboard/*
test("dashboard [P0]", async ({ page }) => {
	await smokeRoute(page, "/dashboard");
});

test("dashboard-orders [P0]", async ({ page }) => {
	await smokeRoute(page, "/dashboard/orders");
});

test("dashboard-addresses [P1]", async ({ page }) => {
	await smokeRoute(page, "/dashboard/addresses");
});

test("dashboard-comments [P1]", async ({ page }) => {
	await smokeRoute(page, "/dashboard/comments");
});

test("dashboard-downloads [P1]", async ({ page }) => {
	await smokeRoute(page, "/dashboard/downloads");
});

test("dashboard-membership [P1]", async ({ page }) => {
	await smokeRoute(page, "/dashboard/membership");
});

test("dashboard-notifications [P1]", async ({ page }) => {
	await smokeRoute(page, "/dashboard/notifications");
});

test("dashboard-posts [P1]", async ({ page }) => {
	await smokeRoute(page, "/dashboard/posts");
});

test("dashboard-profile [P1]", async ({ page }) => {
	await smokeRoute(page, "/dashboard/profile");
});

test("dashboard-returns [P1]", async ({ page }) => {
	await smokeRoute(page, "/dashboard/returns");
});

test("dashboard-reviews [P1]", async ({ page }) => {
	await smokeRoute(page, "/dashboard/reviews");
});

test("dashboard-security [P1]", async ({ page }) => {
	await smokeRoute(page, "/dashboard/security");
});

test("dashboard-settings [P1]", async ({ page }) => {
	await smokeRoute(page, "/dashboard/settings");
});

test("dashboard-subscriptions [P1]", async ({ page }) => {
	await smokeRoute(page, "/dashboard/subscriptions");
});

test("dashboard-wishlist [P1]", async ({ page }) => {
	await smokeRoute(page, "/dashboard/wishlist");
});
