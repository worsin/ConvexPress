import { test } from "./_fixtures";
import { smokeRoute } from "./_helpers";

test.describe.configure({ mode: "parallel" });

// ADMIN P0 — critical paths
test("commerce [P0]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce", { expectSelector: "#admin-content" });
});

test("commerce-customers [P0]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/customers", { expectSelector: "#admin-content" });
});

test("commerce-orders [P0]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/orders", { expectSelector: "#admin-content" });
});

test("commerce-orders-abandoned [P0]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/orders/abandoned", { expectSelector: "#admin-content" });
});

test("commerce-payments [P0]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/payments", { expectSelector: "#admin-content" });
});

test("commerce-products [P0]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/commerce/products", { expectSelector: "#admin-content" });
});

test("dashboard [P0]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/dashboard", { expectSelector: "#admin-content" });
});
